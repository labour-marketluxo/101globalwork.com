import type { Metadata } from 'next';
import { BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';
import {
  ActionLink,
  ActionRow,
  ArrowIcon,
  Card,
  CtaBand,
  Faq,
  JourneyStepList,
  PageHero,
  Section,
  SectionHeader,
} from '@/components/marketing/PageSections';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * /how-it-works — the full customer and provider walkthrough.
 *
 * This route absorbed the three-step block that used to sit inside the landing
 * page's ServiceVectors section. That block could only ever say "describe it,
 * compare quotes, approve and pay"; the seven stages below are the PRD's actual
 * scope (discovery → request → quote → work → payment → completion → dispute)
 * for each side of the marketplace, which never fitted on the landing page.
 *
 * WHY THE COPY IS WRITTEN THIS WAY
 *
 * Every mechanism described here exists in this repository, and nothing else is
 * claimed: the request state machine (`supabase/migrations/…_request_scope_state_foundation.sql`
 * — draft/submitted/matching/quoted/accepted/scheduled/in_progress/
 * submitted_for_approval/completed/cancelled/disputed), the payment obligation
 * states (pending/funding/funded/…), and the payout interlocks that block a
 * payout while a refund or dispute is open (`…_refund_dispute_interlocks.sql`).
 * No timetable, no price and no guarantee is stated, because the platform
 * publishes none of those yet — see /pricing, which is deliberately held back
 * until the fee schedule is configured.
 */
export const metadata: Metadata = {
  title: 'How it works',
  description:
    'The full journey on both sides of the marketplace: how a request becomes an itemized quote, how work is approved, and how payment is held and released.',
  alternates: { canonical: '/how-it-works' },
  robots: { index: true, follow: true },
};

const CUSTOMER_JOURNEY = [
  {
    number: '1',
    title: 'Discovery',
    body: 'Start from the work itself. Describe the problem in plain language, or browse by trade and location, and see who is available before you commit to anything.',
    detail: [
      'Browsing and searching need no account',
      'Provider listings show what has been checked',
    ],
  },
  {
    number: '2',
    title: 'Request',
    body: 'Write what needs doing. That description becomes the scope both sides work from — not a chat message that gets re-interpreted later.',
    detail: ['Posting a request costs nothing', 'You can refine the scope before work starts'],
  },
  {
    number: '3',
    title: 'Quote',
    body: 'Verified providers quote against that same scope, so the numbers you are comparing are answers to the same question.',
    detail: [
      'Itemized quotes: what is included, what is excluded, what each part costs',
      'Materials responsibility, schedule, validity and warranty sit with the quote',
      'A request moves through matching and quoted states, which you can see',
    ],
  },
  {
    number: '4',
    title: 'Work',
    body: 'Accepting a quote schedules the work. Multi-stage projects are split into stages with their own dates and deliverables, so progress is visible per stage rather than as one vague total.',
    detail: [
      'Request states move accepted → scheduled → in progress',
      'A change to the scope is re-approved before it is done, not argued about afterwards',
    ],
  },
  {
    number: '5',
    title: 'Payment',
    body: 'Your payment is held rather than passed on, and it is released against your approval. A disagreement about what was finished is therefore settled before anyone is paid.',
    detail: [
      'Held with the payment provider, not sent to the provider on acceptance',
      'Released only once you approve the finished work',
      'A window to raise a problem before release',
    ],
  },
  {
    number: '6',
    title: 'Completion',
    body: 'You approve the work, the release happens against that approval, and the request closes with the quote, the messages and the payment history attached to it.',
    detail: [
      'Work submitted for approval is a distinct state, not a silent hand-off',
      'Staged projects are signed off stage by stage',
    ],
  },
  {
    number: '7',
    title: 'Disputes',
    body: 'If the work is not what was agreed, raise it before you approve. The payment stays held, the provider’s payout is blocked, and the agreed scope is what gets reviewed.',
    detail: [
      'An open dispute is a financial hold, not a label: payout eligibility is blocked',
      'Refunds are recorded against the original payment',
      'Support reviews the scope, the quote and the submitted work',
    ],
  },
];

const PROVIDER_JOURNEY = [
  {
    number: '1',
    title: 'Create a provider profile',
    body: 'Describe the services you actually take on, the area you cover, and the credentials behind them.',
    detail: ['One profile can carry several services', 'You control what is shown publicly'],
  },
  {
    number: '2',
    title: 'Get verified',
    body: 'Verification happens before you can quote, and it is re-checked as your details change — the same checks a customer sees on your listing.',
    detail: [
      'Identity checked before quoting',
      'Licence checked where the trade requires one',
      'Insurance requested where applicable',
    ],
  },
  {
    number: '3',
    title: 'See requests that fit',
    body: 'Requests reach you matched on the service you offer and the area you cover, described by the customer rather than pre-packaged by a sales team.',
    detail: ['You choose what to quote for', 'Declining a request costs nothing'],
  },
  {
    number: '4',
    title: 'Quote',
    body: 'Quote against the customer’s scope and itemize it. An itemized quote is the thing that protects you when the work turns out to be more or less than the first description suggested.',
    detail: [
      'Labour, travel, inspection, materials, equipment and subcontractors can be listed separately',
      'Exclusions and options belong on the quote, not in a message thread',
    ],
  },
  {
    number: '5',
    title: 'Do the work',
    body: 'Agree dates, keep the status current, and get any change to the scope re-approved before you carry it out.',
    detail: ['Changes are re-approved by the customer', 'Stage sign-off on multi-stage projects'],
  },
  {
    number: '6',
    title: 'Get paid',
    body: 'Payment is funded before the work is done and released to you after the customer approves it, so you are not chasing an invoice after the fact.',
    detail: [
      'Payout eligibility is calculated per obligation',
      'A refund or an open dispute blocks the payout until it is resolved',
      'Payout accounts are verified before a transfer is attempted',
    ],
  },
  {
    number: '7',
    title: 'Handle a problem',
    body: 'If a customer raises an issue, respond on the same thread. Payouts stay blocked while a dispute is open and clear once it is resolved.',
    detail: ['The dispute is recorded against the payment', 'Resolution is recorded, not just agreed in chat'],
  },
];

const DISPUTE_PATHS = [
  {
    title: 'Before you approve',
    body: 'Raise the problem on the request itself. The work sits in a submitted-for-approval state, so nothing is released while you and the provider settle it.',
  },
  {
    title: 'After a release',
    body: 'Refunds are recorded against the original payment, and a refund in flight blocks the provider’s payout until it completes.',
  },
  {
    title: 'If it is unsafe',
    body: 'Emergencies are not a platform matter. Contact the appropriate emergency service first; the platform is not an emergency response service.',
  },
];

const FAQS = [
  {
    question: 'Do I need an account to look for someone?',
    answer:
      'No. Searching, browsing trades and reading provider listings are all public. You sign in to post a request, because the request has to belong to somebody before providers can quote on it.',
  },
  {
    question: 'What does it cost to post a request?',
    answer:
      'Posting is free. Fees are a separate question from the quote, and the fee schedule is published on the pricing page rather than buried in the request flow.',
  },
  {
    question: 'Who checks the providers?',
    answer:
      'Identity is checked before a provider can quote, licences are checked where the trade requires one, and insurance is requested where it applies. The full list of verification types, and what they do not guarantee, is on the trust and safety page.',
  },
  {
    question: 'What happens if the work is not what was quoted?',
    answer:
      'Raise it before you approve. The payment stays held and the provider’s payout is blocked while the dispute is open, and the agreed scope and the itemized quote are the documents that get reviewed.',
  },
  {
    question: 'Can the scope change mid-project?',
    answer:
      'Yes, and it is expected — a fit-out rarely survives first contact. What cannot happen is a change being carried out and then invoiced: a change is re-approved before the work is done.',
  },
];

export default async function HowItWorksPage() {
  // The header is auth-aware, so this route renders per request rather than from
  // a static shell. The read is deliberately fire-and-forget: it exists to let
  // the layout resolve a session, and a Supabase outage must not turn a public
  // page into a 500.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.getUser().catch(() => undefined);

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From a description to finished work"
        lede="The platform does one thing: it turns what you need done into a scope both sides agree on, holds the payment, and releases it against your approval. Here is the whole journey, for both sides of it."
        actions={
          <ActionRow>
            <ActionLink href="/requests/new" variant="amber" icon={<ArrowIcon />}>
              Get started
            </ActionLink>
            <ActionLink href="/providers" variant="ghost">
              Become a provider
            </ActionLink>
          </ActionRow>
        }
      />

      {/* Customer journey — the seven stages the PRD defines for this route. */}
      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeader
              eyebrow="Customer journey"
              accent="primary"
              title="What happens when you post a request"
              lede="Seven stages, from the first search to a closed request. You are never asked to pay into a stranger’s account, and you are never asked to approve something you cannot see."
              align="left"
            />
            <div className="mt-6">
              <ActionLink href="/requests/new" variant="primary" icon={<ArrowIcon />}>
                Start a request
              </ActionLink>
            </div>
          </div>

          <JourneyStepList steps={CUSTOMER_JOURNEY} />
        </div>
      </Section>

      {/* Provider journey — same seven beats, the other side of the deal. */}
      <Section tone="canvas">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Provider journey"
            accent="amber"
            title="What happens when you take work"
            lede="Verification, matching, quoting, delivery and payout — the same flow seen from the trades side, including what happens to your money when a customer raises a problem."
          />
        </div>

        <div className="mx-auto max-w-3xl">
          <JourneyStepList steps={PROVIDER_JOURNEY} />
        </div>
      </Section>

      {/* The dispute overview the PRD asks for, as three entry points rather
          than one paragraph: which path applies depends on how far the job got. */}
      <Section tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="When something goes wrong"
            accent="emerald"
            title="Three ways a problem gets handled"
            lede="Payment being held is what makes these paths possible. Once money has moved, the only remaining lever is a refund; while it has not, the agreement can still be corrected."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {DISPUTE_PATHS.map((path) => (
            <Card key={path.title} tone="canvas" className="flex flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck aria-hidden="true" className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-slate-900">{path.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{path.body}</p>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-slate-600">
          The reporting paths, the verification types and the limitations behind them are set out on{' '}
          <ActionLink href="/trust-and-safety" variant="link" icon={<ArrowIcon />}>
            trust and safety
          </ActionLink>
          , and the fee schedule on{' '}
          <ActionLink href="/pricing" variant="link" icon={<ArrowIcon />}>
            pricing and fees
          </ActionLink>
          .
        </p>
      </Section>

      <Section tone="canvas">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Questions"
            accent="primary"
            title="The things people ask before their first request"
          />
        </div>
        <Faq items={FAQS} />
      </Section>

      <CtaBand
        eyebrow="Ready when you are"
        title="Start with the work you actually need done"
        lede="Describe it once. Compare itemized quotes from verified providers, and release payment only when the work is approved."
        note={
          <>
            <BadgeCheck aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />
            Providers are verified before they can quote
          </>
        }
        actions={
          <ActionRow>
            <ActionLink href="/requests/new" variant="amber" icon={<Sparkles aria-hidden="true" className="h-5 w-5" />}>
              Get started
            </ActionLink>
            <ActionLink href="/providers" variant="ghost">
              Become a provider
            </ActionLink>
          </ActionRow>
        }
      />
    </>
  );
}
