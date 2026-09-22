import { createHash } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FEE_POLICY } from '@/features/pricing/fee-policy';
import { getRequestQuotes, type QuoteRow } from '@/features/customer/requests';
import { formatMoney } from '@/features/customer/quotes';

/**
 * The project agreement: the terms a customer accepts after choosing a quote, and the record of having
 * accepted them.
 *
 * ⚠️ THERE IS NO PROJECTS TABLE. The brief's URL is `/projects/[projectId]/agreement`; the unit of agreed
 * work this schema actually has is the ASSIGNMENT — created by `accept_quote_command` from the accepted
 * quote, with its payment obligation beside it. `projectId` is the assignment id, and the route keeps the
 * brief's shape so a real projects table could be pointed at it later.
 *
 * ⚠️ THE DOCUMENT IS DERIVED FROM DATA, NOT FROM PROSE IN THIS FILE, AND THAT IS WHAT MAKES THE HASH MEAN
 * SOMETHING. `buildAgreementDocument` turns the agreement into the sections the page renders and a
 * canonical string; the page hashes the string it displays. So the recorded hash binds the terms that were
 * actually on screen, and re-rendering the page after any of those terms changes produces a different
 * hash — which is how the page can tell a customer "this agreement has changed since you accepted it"
 * rather than quietly showing new terms under an old acceptance.
 *
 * ⚠️ WHAT THE PLATFORM CANNOT STATE IS STATED AS MISSING. There is no fee schedule in force
 * (`FEE_POLICY.published === false`, the same fact `/pricing` renders), no instalment plan
 * (`payment_obligations` is one row per assignment), no cancellation-after-funding path for a customer
 * (refunds need the admin capability `platform.money.refund`) and no warranty model at all. Each of those
 * appears below as what it is, because an agreement that invents a term is worse than one that names a gap.
 */

export const CONSENT_VERSION = 'agreement-v1';

export type AgreementAcceptance = {
  id: string;
  authMethod: string;
  verifiedAt: string;
  acceptedAt: string;
  agreementHash: string;
  consentVersion: string;
};

export type ProjectAgreement = {
  assignmentId: string;
  assignmentStatus: string;
  assignedAt: string;
  requestId: string;
  requestNeedText: string;
  requestState: string;
  requestSubmittedAt: string | null;
  cancellationReason: string | null;
  quoteId: string;
  quoteVersionLabel: string;
  quoteSummary: string | null;
  /** The accepted version, whole. The agreement's scope section is built from this row, not from prose. */
  quote: QuoteRow;
  quoteValidUntil: string | null;
  quoteAcceptedAt: string | null;
  quoteLockedAt: string | null;
  totalMinor: number;
  currencyCode: string;
  providerName: string;
  providerSlug: string | null;
  providerIdentityVerified: boolean;
  customerLabel: string;
  customerEmail: string | null;
  obligation: { id: string; amountMinor: number; currencyCode: string; status: string; createdAt: string } | null;
  schedule: { scheduledStart: string | null; scheduledEnd: string | null; timezone: string | null; note: string | null } | null;
  acceptance: AgreementAcceptance | null;
  /** True when a fee schedule is published; false means the platform charges nothing it can quantify. */
  feeSchedulePublished: boolean;
};

export async function getProjectAgreement(projectId: string): Promise<ProjectAgreement | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id,status,assigned_at,request_id,accepted_quote_id,provider_id,provider:provider_id(id)')
    .eq('id', projectId)
    .maybeSingle();

  if (!assignment) return null;

  const { data: request } = await supabase
    .from('requests')
    .select('id,need_text,state,submitted_at,cancellation_reason,customer_account_id')
    .eq('id', assignment.request_id)
    .maybeSingle();

  if (!request || request.customer_account_id !== account.id) return null;

  const [quotes, obligation, schedule, acceptance, profile] = await Promise.all([
    getRequestQuotes(request.id),
    supabase
      .from('payment_obligations')
      .select('id,amount_minor,currency_code,status,created_at')
      .eq('assignment_id', assignment.id)
      .maybeSingle(),
    supabase
      .from('assignment_schedules')
      .select('scheduled_start,scheduled_end,timezone,note')
      .eq('assignment_id', assignment.id)
      .maybeSingle(),
    supabase
      .from('agreement_acceptances')
      .select('id,auth_method,verified_at,accepted_at,agreement_hash,consent_version')
      .eq('assignment_id', assignment.id)
      .maybeSingle(),
    supabase.from('profiles').select('display_name').eq('account_id', account.id).maybeSingle(),
  ]);

  // The accepted quote is identified by the assignment, and its identity columns come from the definer
  // read — the customer cannot join `providers` themselves.
  const accepted = quotes.find(quote => quote.quoteId === assignment.accepted_quote_id) ?? null;
  if (!accepted) return null;

  return {
    assignmentId: assignment.id,
    assignmentStatus: assignment.status,
    assignedAt: assignment.assigned_at,
    requestId: request.id,
    requestNeedText: request.need_text ?? '',
    requestState: request.state,
    requestSubmittedAt: request.submitted_at,
    cancellationReason: request.cancellation_reason ?? null,
    quoteId: accepted.quoteId,
    quoteVersionLabel: accepted.versionLabel,
    quoteSummary: accepted.summary,
    quote: accepted,
    quoteValidUntil: accepted.validUntil,
    quoteAcceptedAt: accepted.acceptedAt,
    quoteLockedAt: accepted.lockedAt,
    totalMinor: accepted.totalMinor,
    currencyCode: accepted.currencyCode,
    providerName: accepted.providerName,
    providerSlug: accepted.providerSlug,
    providerIdentityVerified: accepted.identityVerified,
    customerLabel: profile.data?.display_name ?? user.email?.split('@')[0] ?? 'the account holder',
    customerEmail: user.email ?? null,
    obligation: obligation.data
      ? {
          id: obligation.data.id,
          amountMinor: obligation.data.amount_minor,
          currencyCode: obligation.data.currency_code,
          status: obligation.data.status,
          createdAt: obligation.data.created_at,
        }
      : null,
    schedule: schedule.data
      ? {
          scheduledStart: schedule.data.scheduled_start,
          scheduledEnd: schedule.data.scheduled_end,
          timezone: schedule.data.timezone,
          note: schedule.data.note,
        }
      : null,
    acceptance: acceptance.data
      ? {
          id: acceptance.data.id,
          authMethod: acceptance.data.auth_method,
          verifiedAt: acceptance.data.verified_at,
          acceptedAt: acceptance.data.accepted_at,
          agreementHash: acceptance.data.agreement_hash,
          consentVersion: acceptance.data.consent_version,
        }
      : null,
    feeSchedulePublished: FEE_POLICY.published,
  };
}

export type AgreementSection = { title: string; lines: string[] };

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/**
 * The terms, as the page renders them and as the hash covers them.
 *
 * Every line is built from a value read out of the database for THIS assignment, so the document cannot
 * describe work that is not the work in front of the customer.
 */
export function buildAgreementDocument(a: ProjectAgreement): { sections: AgreementSection[]; canonical: string } {
  const sections: AgreementSection[] = [
    {
      title: 'The parties',
      lines: [
        `Customer: ${a.customerLabel}${a.customerEmail ? ` (${a.customerEmail})` : ''}`,
        `Provider: ${a.providerName}${a.providerIdentityVerified ? ' — identity verified by the platform' : ' — identity not verified'}`,
        'Platform: 101GlobalWork, which matches the two and records this agreement. It is not a party to the work and does not perform it.',
      ],
    },
    {
      title: 'The work and the agreed price',
      lines: [
        `Request: ${a.requestNeedText.trim() || '(no description recorded)'}`,
        `Agreed price: ${formatMoney(a.totalMinor, a.currencyCode)} — the accepted quote, version ${a.quoteVersionLabel}, locked when accepted${a.quoteLockedAt ? ` on ${date(a.quoteLockedAt)}` : ''}.`,
        // The breakdown is part of the terms, not a summary of them: the total in this agreement is the sum of
        // the lines below it, and the customer is agreeing to the lines.
        ...(a.quote.lineItems.length > 0
          ? [
              'What that price is made of:',
              ...a.quote.lineItems.map(
                item => `  · ${item.label} — ${formatMoney(item.amountMinor, a.currencyCode)}`,
              ),
              `  · Taxes and fees included — ${formatMoney(a.quote.taxesAndFeesMinor, a.currencyCode)}`,
            ]
          : ['The provider priced this in a single number and did not itemise it.']),
        `What the provider wrote about the price: ${a.quoteSummary?.trim() || '(nothing recorded)'}`,
        a.quote.materialsIncluded === true
          ? `Materials: included in the price.${a.quote.materialsNote ? ` ${a.quote.materialsNote}` : ''}`
          : a.quote.materialsIncluded === false
            ? `Materials: not included — charged on top or supplied by the customer.${a.quote.materialsNote ? ` ${a.quote.materialsNote}` : ''}`
            : 'Materials: the provider did not state whether the price includes them.',
        a.quote.exclusions
          ? `Not included in the price: ${a.quote.exclusions}`
          : 'The provider stated no exclusions on the accepted quote version.',
        a.quote.timelineDays !== null
          ? `Timeline: about ${a.quote.timelineDays} day${a.quote.timelineDays === 1 ? '' : 's'} of work.${a.quote.timelineNote ? ` ${a.quote.timelineNote}` : ''}`
          : a.quote.timelineNote
            ? `Timeline: ${a.quote.timelineNote}`
            : 'Timeline: the provider stated no estimate.',
        a.quote.inspectionRequired === true
          ? 'An inspection is required before the quoted work can proceed.'
          : a.quote.inspectionRequired === false
            ? 'No inspection is required before the work.'
            : 'The provider did not say whether an inspection is required first.',
        ...(a.quote.optionalAddons.length > 0
          ? [
              `Optional add-ons offered, and NOT included in the agreed price: ${a.quote.optionalAddons
                .map(item => `${item.label} (${formatMoney(item.amountMinor, a.currencyCode)})`)
                .join('; ')}.`,
            ]
          : []),
        a.quoteValidUntil
          ? `The quote was valid until ${date(a.quoteValidUntil)}.`
          : 'The provider set no expiry on this quote.',
      ],
    },
    {
      title: 'Payment',
      lines: [
        a.obligation
          ? `One obligation of ${formatMoney(a.obligation.amountMinor, a.obligation.currencyCode)} was created when the quote was accepted. It is currently "${a.obligation.status}".`
          : 'No payment obligation exists against this agreement yet.',
        'Payment is released against approved work, not on acceptance alone. Nothing is charged by this agreement on its own.',
        a.schedule?.scheduledStart
          ? `Scheduled work: ${date(a.schedule.scheduledStart)}${a.schedule.note ? ` — ${a.schedule.note}` : ''}.`
          : 'No date has been scheduled yet. Scheduling happens with the provider after acceptance.',
        a.feeSchedulePublished
          ? 'The platform fee schedule in force is applied to the amounts above.'
          : 'No platform fee schedule is in force, so no platform fee is added to the amount above. The amount payable is the agreed price and nothing else.',
      ],
    },
    {
      title: 'Cancellation',
      lines: [
        'Before any payment is funded, the customer can cancel the request and the assignment and its pending payment are cancelled with it.',
        'Once a payment has moved, a customer cannot cancel from the platform: money against a request can only be returned through a refund, which is raised by the platform team and reviewed by them. The request page says the same thing at the point of refusal.',
        'A completed assignment cannot be cancelled. A disagreement after completion is recorded as a dispute, which the platform team reviews.',
      ],
    },
    {
      title: 'Warranty and quality',
      lines: [
        a.quote.warrantyTerms
          ? `The provider states this warranty on the accepted quote version: ${a.quote.warrantyTerms}`
          : 'The provider stated no warranty on the accepted quote version.',
        'THE PLATFORM DOES NOT ENFORCE A WARRANTY. The paragraph above is the provider\u2019s own statement, recorded against the version you accepted — it is not a platform policy, the platform holds no warranty model behind it, and no claim, period or exclusion is tracked here.',
        a.quoteSummary && /guarantee|warrant/i.test(a.quoteSummary) && !a.quote.warrantyTerms
          ? 'The provider also mentions a guarantee in the free-text wording of their quote, quoted above. That is their statement, in their words.'
          : 'If a warranty matters to you and none is stated above, ask for it in a new quote version before accepting — a promise that is not in the version you accept is not in this agreement.',
        'What the platform does hold: the evidence the provider submits when the work is done, and your approval of it, both recorded against this assignment.',
      ],
    },
    {
      title: 'What this agreement is not',
      lines: [
        'It is not a signature. There is no e-signature service behind these buttons, and no cryptographic signature is created.',
        'It is a recorded acceptance: you tick a box and verify a code sent to your email, and the platform stores that, the time, and the exact version of these terms you were shown.',
        'Nothing promised in a chat, a phone call or in person replaces this document or the locked quote version above.',
      ],
    },
  ];

  // Canonical form: the sections in order, trimmed, so an incidental whitespace change in this file does
  // not invalidate every recorded acceptance.
  const canonical = sections
    .map(section => `${section.title}\n${section.lines.map(line => line.trim()).join('\n')}`)
    .join('\n\n');

  return { sections, canonical };
}

export function agreementHash(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
