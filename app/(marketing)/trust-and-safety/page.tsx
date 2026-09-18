import type { Metadata } from 'next';
import { BadgeCheck, Check, CircleCheckBig, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  ActionLink,
  ActionRow,
  ArrowIcon,
  Card,
  CtaBand,
  Faq,
  FactList,
  PageHero,
  Section,
  SectionHeader,
} from '@/components/marketing/PageSections';

/**
 * /trust-and-safety — verification, payment protection, safety guidance,
 * reporting paths and the limits of all three.
 *
 * This route absorbed the payment-protection and provider-check cards that used
 * to be two of the four bento cards on the landing page. Everything here maps to
 * something the platform actually does:
 *
 *   verification      the checks the landing page already promised (identity,
 *                     licence where the trade requires one, insurance where
 *                     applicable) plus the re-check on change
 *   payment hold      payment_obligations with funding/funded states, released
 *                     against approval — NOT "escrow", see the wording note below
 *   dispute hold      a dispute or an in-flight refund blocks payout eligibility
 *                     (supabase/migrations/…_refund_dispute_interlocks.sql)
 *   review            the platform control plane's Trust & Safety capability —
 *                     "Provider verification, moderation and safety operations"
 *
 * WORDING CONSTRAINTS (from the PRD, and the reason this page reads the way it
 * does): "Never imply universal insurance, escrow or emergency response."
 *
 * So this page never says escrow, never implies the platform insures the work,
 * and never implies it can dispatch help. The payment protection section states
 * the mechanism — a hold placed by the payment provider, released on approval —
 * and then states plainly what it is not. That is deliberate, and it is the one
 * page on this site where hedging is the honest position rather than a weakness.
 */
export const metadata: Metadata = {
  title: 'Trust & safety',
  description:
    'How providers are verified, how payment is held and released, how to report a problem on a request, and what the platform does not do. Emergencies are not handled here.',
  alternates: { canonical: '/trust-and-safety' },
  robots: { index: true, follow: true },
};

const VERIFICATION_CHECKS = [
  { label: 'Identity', value: 'Checked before quoting' },
  { label: 'Licence', value: 'Checked where the trade requires one' },
  { label: 'Insurance', value: 'Requested where applicable' },
  { label: 'Re-check', value: 'Repeated as details change' },
];

const PAYMENT_MECHANICS = [
  'Your payment is held with the payment provider, not passed to the provider on acceptance',
  'It is released against your approval of the finished work',
  'A refund is recorded against the original payment rather than paid separately',
  'An open dispute blocks the provider’s payout until it is resolved',
  'A provider’s payout account is verified before a transfer is attempted',
];

const CUSTOMER_TIPS = [
  'Keep the scope on the request. A price agreed in a message thread is not the price the platform can hold anyone to.',
  'Read the exclusions before accepting a quote. Most disagreements are about what was never included.',
  'Keep the payment on the platform. A payment made outside it is outside every protection described on this page.',
  'Approve the work you can see. Approval is what releases the money, and it is not reversible by asking nicely.',
  'Match the identity of the person who arrives to the provider on the request, and raise it if they differ.',
];

const PROVIDER_TIPS = [
  'Quote against the customer’s scope, and list your exclusions on the quote.',
  'Get a change approved before you carry it out — carried-out work that was never re-approved is the most common way a payout gets held.',
  'Keep statuses current: the customer cannot approve work that still shows as in progress.',
  'Decline anything unsafe rather than working around it, and report it.',
  'Keep your verification details current. A lapsed licence or insurance detail pauses what you can quote for.',
];

const REPORT_PATHS = [
  {
    title: 'Before you approve the work',
    body: 'Raise the problem on the request itself. The work is in a submitted-for-approval state, the payment is still held, and nothing is released while the scope and the finished work are compared.',
    steps: [
      'The dispute is recorded against the payment',
      'The provider’s payout eligibility is blocked while it is open',
      'Resolution is recorded against the dispute, not just agreed in chat',
    ],
  },
  {
    title: 'After a payment has been released',
    body: 'The remaining lever is a refund against the original payment. A refund in flight blocks the provider’s payout until it completes, so the two cannot both settle.',
    steps: [
      'Refunds are recorded against the original payment',
      'A refund in progress is a hold, not a note',
      'Bank-side timings are the bank’s, not the platform’s',
    ],
  },
  {
    title: 'Anything illegal, threatening or unsafe',
    body: 'Contact the appropriate emergency service first. The platform is not an emergency response service and cannot dispatch help to you.',
    steps: [
      'Emergency services handle emergencies',
      'Report the account to the platform afterwards',
      'Reported accounts can be suspended while they are reviewed',
    ],
  },
];

const LIMITATIONS = [
  {
    title: 'Verification is not insurance',
    body: 'A check confirms what a provider submitted at a point in time. It is not a warranty of the work, and it is not cover for damage.',
  },
  {
    title: 'A payment hold is not escrow',
    body: 'The platform does not hold your money itself. The hold is placed by the payment provider, under their terms, and it protects the payment — not the property the work happens on.',
  },
  {
    title: 'Not an emergency service',
    body: 'Nothing on this platform is monitored as an emergency line. Emergencies belong with the emergency services.',
  },
  {
    title: 'Not every disagreement is mediated',
    body: 'The platform holds money and records what was agreed. It does not adjudicate every dispute about the quality of a job, and it does not guarantee an outcome either way.',
  },
];

const FAQS = [
  {
    question: 'What exactly has been checked about a provider?',
    answer:
      'Identity is checked before a provider can quote, licences are checked where the trade requires one, and insurance is requested where it applies. It is a point-in-time check repeated as details change — not a continuous inspection and not a rating.',
  },
  {
    question: 'Is my money held in escrow?',
    answer:
      'No, and this page will not call it that. Your payment is held by the payment provider rather than passed on immediately, and released against your approval. The difference matters: an escrow arrangement carries legal obligations the platform does not claim, and the money is not held by the platform itself.',
  },
  {
    question: 'What happens after I report a problem?',
    answer:
      'The report is recorded against the payment. While a dispute is open the provider’s payout is blocked, so the money cannot move while the agreed scope and the finished work are compared. Resolution is recorded against the dispute.',
  },
  {
    question: 'Can I pay a provider directly to save the fee?',
    answer:
      'You can, and it removes every protection on this page: there is no hold to release, no refund path, and no record of what was agreed. The fee schedule is published on the pricing page; the protection is what you get for it.',
  },
  {
    question: 'Is the platform insured against bad work?',
    answer:
      'No. The platform does not insure the work and does not describe itself as doing so. What it does is record the agreed scope, hold the payment, and release it against your approval.',
  },
];

export default function TrustAndSafetyPage() {
  return (
    <>
      <PageHero
        eyebrow="Trust & safety"
        title="Who you are dealing with, and what happens when it goes wrong"
        lede="What gets verified, how a payment is held, how to report a problem on a request, and — just as importantly — what none of that covers."
        note="Emergencies are not handled here: contact your local emergency service first"
        actions={
          <ActionRow>
            <ActionLink href="#report-a-concern" variant="amber" icon={<ArrowIcon />}>
              Report a concern
            </ActionLink>
            <ActionLink href="#policies" variant="ghost">
              View policies
            </ActionLink>
          </ActionRow>
        }
      />

      {/* ------------------------------------------------- verification */}
      <Section id="verification" tone="white">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <SectionHeader
              eyebrow="Verification"
              accent="primary"
              title="What “verified” means here, precisely"
              lede="Verification happens before a provider can quote, and it is repeated as their details change. It answers “is this who they say they are, and are they allowed to do this trade” — and nothing more than that."
              align="left"
            />
          </div>

          <div className="grid gap-6">
            <Card tone="canvas">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <BadgeCheck aria-hidden="true" className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-bold text-slate-900">The checks</h3>
              </div>
              <FactList items={VERIFICATION_CHECKS} />
            </Card>

            <Card tone="canvas">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TriangleAlert aria-hidden="true" className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-bold text-slate-900">What it does not mean</h3>
              </div>
              <ul className="grid gap-2.5">
                {[
                  'It is not a guarantee that the work will be done well',
                  'It is not insurance and it does not cover damage',
                  'It is not a rating, and it is not a recommendation',
                  'It is checked at a point in time, not continuously',
                ].map((line) => (
                  <li key={line} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                    <span aria-hidden="true" className="text-slate-400">
                      &ndash;
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ protected payment */}
      <Section id="protected-payment" tone="canvas">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Protected payment"
            accent="emerald"
            title="How the payment is held and released"
            lede="One mechanism does the work on this page: money is held rather than passed on, and released against your approval. Everything else follows from that."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card tone="primary">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-amber-300">
              <ShieldCheck aria-hidden="true" className="h-7 w-7" />
            </div>
            <h3 className="mb-2 text-xl font-bold">The mechanism</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              Your payment sits with the payment provider until the work is confirmed, so a
              disagreement about what was finished is settled before anyone is paid.
            </p>
            <ul className="grid gap-2.5 rounded-xl border border-white/10 bg-primary-dark/60 p-4">
              {PAYMENT_MECHANICS.map((point) => (
                <li key={point} className="flex gap-2 font-mono text-xs text-slate-200">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-center gap-2 font-mono text-xs text-amber-300">
              <BadgeCheck aria-hidden="true" className="h-[15px] w-[15px]" />
              Payments handled by our payment provider
            </p>
          </Card>

          <Card tone="white" className="flex flex-col justify-center">
            <h3 className="mb-3 text-lg font-bold text-slate-900">
              Why this page does not say “escrow”
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              Escrow is a specific legal arrangement with duties attached to whoever holds the
              money. Here the money is held by the payment provider, under their terms, and the
              platform is not the holder. Calling that escrow would overstate what protects you, on
              the page where overstating it would matter most.
            </p>
            <p className="text-sm leading-relaxed text-slate-600">
              What it is: a hold, released on your approval, with a refund path and a dispute path
              attached to the same payment.
            </p>
          </Card>
        </div>
      </Section>

      {/* ------------------------------------------------------ safety tips */}
      <Section id="safety-tips" tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Safety guidelines"
            accent="amber"
            title="The habits that keep a job straightforward"
            lede="These are not rules the platform enforces. They are the behaviours, on both sides, that decide whether a job ends with an approval or a dispute."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card tone="canvas">
            <h3 className="mb-4 text-lg font-bold text-slate-900">If you are the customer</h3>
            <ul className="grid gap-3">
              {CUSTOMER_TIPS.map((tip) => (
                <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
                  <CircleCheckBig aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card tone="canvas">
            <h3 className="mb-4 text-lg font-bold text-slate-900">If you are the provider</h3>
            <ul className="grid gap-3">
              {PROVIDER_TIPS.map((tip) => (
                <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
                  <CircleCheckBig aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      {/* --------------------------------------------------------- reporting */}
      <Section id="report-a-concern" tone="canvas">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Report a concern"
            accent="primary"
            title="Where a problem goes, and what happens to it"
            lede="Which path applies depends on how far the job got. The one that matters most is the first: while the payment is still held, a problem can be fixed rather than compensated."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {REPORT_PATHS.map((path) => (
            <Card key={path.title} tone="white" className="flex flex-col">
              <h3 className="mb-3 text-base font-bold text-slate-900">{path.title}</h3>
              <p className="mb-5 text-sm leading-relaxed text-slate-600">{path.body}</p>
              <ul className="mt-auto grid gap-2 border-t border-slate-100 pt-4">
                {path.steps.map((step) => (
                  <li key={step} className="flex gap-2 font-mono text-[11px] text-slate-500">
                    <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <div
            role="note"
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-secondary-light p-5"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
            <div>
              <h3 className="mb-1 text-sm font-bold text-amber-800">
                Emergency disclaimer
              </h3>
              <p className="text-sm leading-relaxed text-amber-800">
                This platform is not an emergency service. It cannot dispatch help, and no page on it
                is monitored as an emergency line. If there is a fire, a gas leak, flooding, a live
                electrical danger, an injury or a threat to anyone’s safety, contact the appropriate
                emergency service for your location first — then report the account here.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- policies */}
      <Section id="policies" tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Policies & limitations"
            accent="primary"
            title="What this page commits to, and what it does not"
            lede="A trust page is only useful if it is also the page that tells you what is not covered. These four limits are the ones that matter."
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {LIMITATIONS.map((limit) => (
            <Card key={limit.title} tone="canvas">
              <h3 className="mb-2 text-base font-bold text-slate-900">{limit.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{limit.body}</p>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-relaxed text-slate-600">
          Formal terms, privacy and cookie policies are published in the platform’s policy library.
          Until that library is live, this page is the platform’s own statement of how it operates,
          and anything it does not claim above should not be assumed from the rest of the site.
        </p>
      </Section>

      <Section tone="canvas">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Questions"
            accent="primary"
            title="Safety and payment questions"
          />
        </div>
        <Faq items={FAQS} />
      </Section>

      <CtaBand
        eyebrow="If something has gone wrong"
        title="Report it while the payment is still held"
        lede="A problem raised before you approve can still change the outcome. A problem raised after release can only be refunded."
        note={
          <>
            <ShieldCheck aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />
            Verification, held payment and approval apply to every job on the platform
          </>
        }
        actions={
          <ActionRow>
            <ActionLink href="#report-a-concern" variant="amber" icon={<ArrowIcon />}>
              Report a concern
            </ActionLink>
            <ActionLink href="#policies" variant="ghost">
              View policies
            </ActionLink>
          </ActionRow>
        }
      />
    </>
  );
}
