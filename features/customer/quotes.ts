import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { QuoteRow } from '@/features/customer/requests';

/**
 * Quote-side reads and the rules that decide which actions a quote offers.
 *
 * The rows themselves come from `getRequestQuotes` (the definer function), because a customer cannot read
 * provider identity directly. What lives here is everything that would otherwise be re-derived in each of
 * the three quote surfaces — grouping, history order, and whether an action is available — so the
 * comparison table, the quote detail and the request detail cannot disagree about the same quote.
 */

export type ChangeRequest = {
  id: string;
  quoteId: string;
  kind: 'revision' | 'clarification' | 'decline';
  message: string;
  status: 'open' | 'withdrawn';
  createdAt: string;
  withdrawnAt: string | null;
};

export async function getChangeRequests(requestId: string): Promise<ChangeRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('quote_change_requests')
    .select('id,quote_id,kind,message,status,created_at,withdrawn_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read change requests: ${error.message}`);
    }
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    quoteId: row.quote_id,
    kind: row.kind as ChangeRequest['kind'],
    message: row.message,
    status: row.status as ChangeRequest['status'],
    createdAt: row.created_at,
    withdrawnAt: row.withdrawn_at,
  }));
}

export type ProviderQuoteGroup = {
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  providerHeadline: string | null;
  identityVerified: boolean;
  readinessScore: number | null;
  trustScore: number | null;
  /** The version a decision should be made about. */
  latest: QuoteRow;
  /** Older versions, newest first — the change history for that provider. */
  history: QuoteRow[];
  /** Every version in the group, latest first. */
  versions: QuoteRow[];
};

/**
 * One group per provider, with the version to act on separated from the versions that are only history.
 *
 * ⚠️ THE LATEST VERSION IS THE OFFER, NOT THE FIRST. A provider who re-prices supersedes their earlier
 * number, and the database will refuse to accept a superseded version — so a table that showed the oldest
 * price as "the price" would be showing the customer a button that cannot work.
 */
export function groupQuotes(quotes: readonly QuoteRow[]): ProviderQuoteGroup[] {
  const byProvider = new Map<string, QuoteRow[]>();
  for (const quote of quotes) {
    byProvider.set(quote.providerId, [...(byProvider.get(quote.providerId) ?? []), quote]);
  }

  const groups: ProviderQuoteGroup[] = [];
  for (const [providerId, versions] of byProvider) {
    const ordered = [...versions].sort((a, b) =>
      b.versionMajor - a.versionMajor || b.versionRevision - a.versionRevision ||
      Date.parse(b.submittedAt) - Date.parse(a.submittedAt));

    const latest = ordered.find(quote => quote.isLatest) ?? ordered[0];
    if (!latest) continue;

    groups.push({
      providerId,
      providerName: latest.providerName,
      providerSlug: latest.providerSlug,
      providerHeadline: latest.providerHeadline,
      identityVerified: latest.identityVerified,
      readinessScore: latest.readinessScore,
      trustScore: latest.trustScore,
      latest,
      history: ordered.filter(quote => quote.quoteId !== latest.quoteId),
      versions: ordered,
    });
  }

  // Cheapest first, which is the order a customer reads a comparison in. Ties fall to the provider id so
  // the order never depends on Map iteration.
  return groups.sort((a, b) => a.latest.totalMinor - b.latest.totalMinor || a.providerId.localeCompare(b.providerId));
}

/**
 * The states a request can be in and still have a quote accepted from it.
 *
 * ⚠️ `submitted` IS DELIBERATELY ABSENT. The accept command's own precondition also allows `submitted`,
 * but the request state machine refuses `submitted → accepted` and a request in `submitted` cannot hold a
 * quote anyway — the provider quote command advances it to `matching` on the first quote. Offering Accept
 * in that state would be offering a button the database rejects.
 */
const ACCEPTING_REQUEST_STATES = ['matching', 'quoted'];

export type QuoteActionability = {
  expired: boolean;
  canAccept: boolean;
  canDecline: boolean;
  canQuestion: boolean;
  /** Why an action is missing, in the words the page shows. Null when the quote is fully actionable. */
  blockedReason: string | null;
};

/**
 * Which actions a quote can carry, and why not when it cannot.
 *
 * ⚠️ THIS MIRRORS THE DATABASE'S OWN RULES AND SAYS SO WHEN THEY BLOCK SOMETHING. Every refusal here is
 * also enforced in SQL — this only stops the page offering a button whose result would be an error. When
 * the two could disagree, the database wins and the page shows what it said; nothing here is the guard.
 */
export function quoteActionability(
  quote: QuoteRow,
  options: { requestState: string; hasActiveAssignment: boolean },
): QuoteActionability {
  const expired = Boolean(quote.validUntil && Date.parse(quote.validUntil) < Date.now());
  const submitted = quote.status === 'submitted';

  if (!quote.isLatest && submitted) {
    return {
      expired, canAccept: false, canDecline: false, canQuestion: false,
      blockedReason: `Superseded by ${quote.supersededBy ?? 'a later version'} — act on the current version.`,
    };
  }

  if (quote.status === 'accepted') {
    return { expired, canAccept: false, canDecline: false, canQuestion: false, blockedReason: 'Accepted. This version is locked.' };
  }

  if (quote.status === 'declined' || quote.status === 'expired' || quote.status === 'withdrawn') {
    return { expired, canAccept: false, canDecline: false, canQuestion: false, blockedReason: `This quote is ${quote.status}.` };
  }

  if (options.hasActiveAssignment) {
    return { expired, canAccept: false, canDecline: false, canQuestion: false, blockedReason: 'A provider is already assigned to this request.' };
  }

  if (!ACCEPTING_REQUEST_STATES.includes(options.requestState)) {
    return { expired, canAccept: false, canDecline: false, canQuestion: false, blockedReason: 'This request is closed.' };
  }

  return {
    expired,
    canAccept: submitted && !expired,
    canDecline: submitted,
    canQuestion: submitted,
    blockedReason: expired ? 'Past its validity date — the provider would have to re-quote.' : null,
  };
}

/** The next version after this one inside the same provider group, for the history log. */
export function nextVersion(versions: readonly QuoteRow[], quoteId: string): QuoteRow | null {
  const index = versions.findIndex(quote => quote.quoteId === quoteId);
  return index > 0 ? versions[index - 1] : null;
}

export function formatMoney(amountMinor: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
  }
}

/** Days left on a quote, or null when it never expires. Negative means already expired. */
export function daysRemaining(validUntil: string | null): number | null {
  if (!validUntil) return null;
  return Math.ceil((Date.parse(validUntil) - Date.now()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The compared attributes, in one place.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The rows the comparison table, the quote detail and the agreement all read.
 *
 * ⚠️ DERIVED HERE RATHER THAN IN EACH COMPONENT. "What does this quote say about materials?" has exactly one
 * answer, and three surfaces render it. A helper per surface would be three places for the wording to drift
 * — and the drift would be invisible until a customer compared two screens about the same quote.
 *
 * ⚠️ `stated: false` IS A DIFFERENT ANSWER FROM A NEGATIVE. A provider who did not answer the inspection
 * question has not said "no inspection needed". The pages render the two differently, and the type carries
 * the distinction rather than leaving it to whoever renders it.
 */
export type QuoteAttribute = {
  key: string;
  label: string;
  /** The answer, in the words a customer reads. */
  value: string;
  /** Anything the provider added beyond the answer. */
  detail: string | null;
  /** False when the provider did not say, so the surfaces can style it as an absence. */
  stated: boolean;
};

export function lineItemSubtotal(items: readonly { amountMinor: number }[]): number {
  return items.reduce((sum, item) => sum + item.amountMinor, 0);
}

export function quoteAttributes(quote: QuoteRow): QuoteAttribute[] {
  const days = daysRemaining(quote.validUntil);
  const subtotal = lineItemSubtotal(quote.lineItems);

  const validity = !quote.validUntil
    ? { value: 'No expiry set', detail: 'This offer does not lapse on its own.', stated: true }
    : days !== null && days < 0
      ? { value: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, detail: `It was valid until ${dateOnly(quote.validUntil)}.`, stated: true }
      : { value: `${days} day${days === 1 ? '' : 's'} left`, detail: `Valid until ${dateOnly(quote.validUntil)}.`, stated: true };

  return [
    {
      key: 'total',
      label: 'Total price',
      value: formatMoney(quote.totalMinor, quote.currencyCode),
      detail:
        quote.taxesAndFeesMinor > 0
          ? `${formatMoney(subtotal, quote.currencyCode)} of work plus ${formatMoney(quote.taxesAndFeesMinor, quote.currencyCode)} in taxes and fees.`
          : 'No taxes or fees are charged on top of this price.',
      stated: true,
    },
    {
      key: 'lineItems',
      label: 'Line items',
      value: quote.lineItems.length > 0 ? `${quote.lineItems.length} itemised` : 'Not itemised',
      detail:
        quote.lineItems.length > 0
          ? quote.lineItems.map(item => `${item.label} — ${formatMoney(item.amountMinor, quote.currencyCode)}`).join('\n')
          : 'The provider priced this in a single number. The description below is their only breakdown.',
      stated: quote.lineItems.length > 0,
    },
    {
      key: 'taxes',
      label: 'Taxes and fees',
      value: quote.taxesAndFeesMinor > 0 ? formatMoney(quote.taxesAndFeesMinor, quote.currencyCode) : 'None itemised',
      detail:
        quote.taxesAndFeesMinor > 0
          ? 'Already included in the total above — not added again.'
          : 'Nothing was separated out as a tax or a fee.',
      stated: quote.taxesAndFeesMinor > 0,
    },
    {
      key: 'materials',
      label: 'Materials',
      value:
        quote.materialsIncluded === true
          ? 'Included in the price'
          : quote.materialsIncluded === false
            ? 'Not included'
            : 'Not stated',
      detail: quote.materialsNote,
      stated: quote.materialsIncluded !== null || Boolean(quote.materialsNote),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      value: quote.timelineDays !== null ? `${quote.timelineDays} day${quote.timelineDays === 1 ? '' : 's'} of work` : 'Not stated',
      detail: quote.timelineNote,
      stated: quote.timelineDays !== null || Boolean(quote.timelineNote),
    },
    {
      key: 'exclusions',
      label: 'Exclusions',
      value: quote.exclusions ? 'The provider listed exclusions' : 'None stated',
      detail: quote.exclusions,
      stated: Boolean(quote.exclusions),
    },
    { key: 'validity', label: 'Validity', ...validity },
    {
      key: 'inspection',
      label: 'Inspection',
      value:
        quote.inspectionRequired === true
          ? 'Required before work starts'
          : quote.inspectionRequired === false
            ? 'Not required'
            : 'Not stated',
      detail: null,
      stated: quote.inspectionRequired !== null,
    },
    {
      key: 'warranty',
      label: 'Warranty',
      value: quote.warrantyTerms ? 'Offered, in the provider’s words' : 'Not stated',
      detail: quote.warrantyTerms,
      stated: Boolean(quote.warrantyTerms),
    },
    {
      key: 'addons',
      label: 'Optional add-ons',
      value: quote.optionalAddons.length > 0 ? `${quote.optionalAddons.length} available` : 'None offered',
      detail:
        quote.optionalAddons.length > 0
          ? `${quote.optionalAddons.map(item => `${item.label} — ${formatMoney(item.amountMinor, quote.currencyCode)}`).join('\n')}\nNot part of the total above; buy one only by asking the provider.`
          : null,
      stated: quote.optionalAddons.length > 0,
    },
  ];
}

function dateOnly(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Failure vocabulary for the decision actions.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ A FIXED VOCABULARY, NOT THE DATABASE'S OWN MESSAGE. These travel in the query string, so putting the
 * database's text there would let anyone type a message that renders inside the platform's own notice
 * styling — the same reflected-message problem the intake flow avoids. The mapper below is the only thing
 * that reads a database message, and everything it does not recognise becomes `failed`.
 */
export const DECISION_FAILURES = [
  'not_authorized',
  'not_found',
  'closed',
  'already_quoted',
  'superseded',
  'expired',
  'already_assigned',
  'locked',
  'money_moved',
  'too_short',
  'step_up_required',
  'bad_code',
  'code_send_failed',
  'not_delivered',
  'failed',
] as const;
export type DecisionFailure = (typeof DECISION_FAILURES)[number];

export const DECISION_FAILURE_COPY: Record<DecisionFailure, string> = {
  not_authorized: 'That is not yours to change. If you were signed in as somebody else, sign in again.',
  not_found: 'That no longer exists — it may have been withdrawn or the page is out of date.',
  closed: 'This request is closed, so nothing on it can be changed any more.',
  already_quoted:
    'A provider has already priced this request, so it cannot be edited now. Ask for a revised quote instead — changing the work after a price was given would make that price meaningless.',
  superseded: 'That version has been replaced by a newer one. Use the current version.',
  expired: 'That quote is past its validity date, so it cannot be accepted. The provider would have to re-quote.',
  already_assigned: 'A provider is already assigned to this request.',
  locked: 'That quote version is locked because it was accepted. Accepted versions cannot be changed.',
  money_moved: 'Money has already been paid against this request. A refund has to be raised by the platform team, so this cannot be cancelled from here.',
  too_short: 'Add a sentence or two — a reason nobody can read is not a reason.',
  step_up_required: 'For this step we need you to verify again. Send the code and enter it below.',
  bad_code: 'That code was not right, or it has expired. Send a new one and try again.',
  code_send_failed: 'The code could not be sent. Email delivery is not guaranteed on this project — try again in a minute.',
  not_delivered: 'The code was accepted but the agreement was not recorded. Nothing was lost; try again.',
  failed: 'That did not work. Nothing was changed — try again.',
};

export function decisionFailureCode(value: string | undefined | null): DecisionFailure | null {
  if (!value) return null;
  return (DECISION_FAILURES as readonly string[]).includes(value) ? (value as DecisionFailure) : null;
}

/** Maps a database message onto the vocabulary. Unrecognised messages become `failed`, never a passthrough. */
export function failureFromMessage(message: string): DecisionFailure {
  const text = message.toLowerCase();
  if (text.includes('already quoted') || text.includes('already priced')) return 'already_quoted';
  if (text.includes('can no longer be edited') || text.includes('can no longer be cancelled')) return 'closed';
  if (text.includes('describe the work')) return 'too_short';
  if (text.includes('step-up')) return 'step_up_required';
  if (text.includes('locked')) return 'locked';
  if (text.includes('superseded')) return 'superseded';
  if (text.includes('already assigned') || text.includes('already been assigned')) return 'already_assigned';
  if (text.includes('money against it') || text.includes('refund')) return 'money_moved';
  if (text.includes('cannot be accepted') || text.includes('not available for acceptance') || text.includes('cannot be accepted')) return 'expired';
  if (text.includes('is closed') || text.includes('cannot be cancelled')) return 'closed';
  if (text.includes('at least 10') || text.includes('say what') || text.includes('give the provider a reason')) return 'too_short';
  if (text.includes('not authorized')) return 'not_authorized';
  if (text.includes('not found')) return 'not_found';
  return 'failed';
}
