import type { Metadata } from 'next';
import { BadgeCheck, CircleCheckBig, TriangleAlert } from 'lucide-react';
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
import { FEE_POLICY, FEE_REVIEW_WINDOW_DAYS, feeFor } from '@/features/pricing/fee-policy';
import type { FeeRate, Money } from '@/features/pricing/types';

/**
 * /pricing — what each side pays, and what none of it depends on.
 *
 * THE HARD CONSTRAINT ON THIS PAGE
 *
 * It publishes figures, so it can only publish figures that exist. There is no
 * fee logic anywhere in this repository — no rate column, no fee calculation in
 * the payment path — so there is nothing to read a rate from, and writing one
 * into this file would advertise a commercial term nobody has agreed. The page
 * therefore renders from features/pricing/fee-policy.ts, whose `published` flag
 * is currently false, and in that state it quotes no numbers at all: it says
 * plainly that no schedule is in force and shows what the schedule will contain.
 *
 * The PRD asks for four things this page must display — customer/provider fee
 * structure, taxes/FX caveats, worked examples and effective dates — and each has
 * a section below. Three of them are simply empty until the policy is filled in,
 * which is the point: the structure is finished, the numbers are missing, and
 * the missing ones are visible rather than improvised.
 *
 * The "outdated pricing" state the PRD also requires is handled by comparing
 * `reviewedAt` against FEE_REVIEW_WINDOW_DAYS, so a schedule left unreviewed
 * starts complaining on its own.
 */
export const metadata: Metadata = {
  title: 'Pricing & fees',
  description:
    'How charges work on the platform: what customers pay, what providers keep, how taxes, currencies and FX are handled, and where the published fee schedule appears.',
  alternates: { canonical: '/pricing' },
  robots: { index: true, follow: true },
};

/** Cost lines a quote can carry. Vocabulary from the PRD's quote specification. */
const QUOTE_COST_LINES = [
  'Labour',
  'Travel',
  'Inspection',
  'Materials',
  'Equipment',
  'Subcontractors',
  'Taxes',
];

/** The non-price parts of a quote, which is where disputes actually start. */
const QUOTE_TERMS = [
  'What is excluded',
  'Optional extras',
  'Schedule and dates',
  'How long the quote holds',
  'Warranty',
  'Who supplies materials',
  'Payment terms',
];

const TAX_CAVEATS = [
  {
    title: 'Currency follows the market',
    body: 'Every market in the catalogue carries its own default currency, and a request belongs to exactly one market. The quote, the fee and the payment are all denominated in that market’s currency.',
  },
  {
    title: 'Taxes are set by jurisdiction',
    body: 'Where sales tax, VAT or a service levy applies it is determined by the provider’s jurisdiction and the nature of the work — not by the platform. It belongs on the quote as a line of its own rather than buried in a total.',
  },
  {
    title: 'FX, when two currencies are involved',
    body: 'If a card is issued in one currency and the charge is in another, the conversion is performed by the payment provider and the issuing bank. Their rate and any bank-side charge are outside the platform’s control.',
  },
  {
    title: 'One charge, from one schedule',
    body: 'Platform charges are taken from the published schedule and nowhere else. There is no listing fee, no subscription and no matching charge in this platform.',
  },
];

const FAQS = [
  {
    question: 'Why are there no numbers on this page?',
    answer:
      'Because no fee schedule is in force yet. Publishing invented percentages on a pricing page would turn them into an advertised commercial term, and the first person to be charged by them would reasonably ask where they were agreed. The page publishes figures the moment they exist, with the date they take effect.',
  },
  {
    question: 'Does it cost anything to post a request or to look around?',
    answer:
      'No. Browsing, searching and posting a request are free, and providers are not charged to be listed or to quote. A platform fee, when there is one, attaches to a transaction rather than to participation.',
  },
  {
    question: 'Who decides the price of the work?',
    answer:
      'The provider does, in the quote. The platform does not set rates for trades, and the numbers you compare are the providers’ own answers to the same scope. The only figure the platform contributes is its own fee, from the schedule above.',
  },
  {
    question: 'When does money actually move?',
    answer:
      'Your payment is held with the payment provider rather than passed on immediately, and it is released against your approval of the finished work. That hold is what makes a refund or a dispute possible after the work has been done.',
  },
  {
    question: 'What if I think a charge is wrong?',
    answer:
      'Raise it against the request before you approve it. While a dispute is open the provider’s payout is blocked, which gives the charge time to be checked against the agreed quote before the money leaves.',
  },
];

function FormattedMoney({ value }: { value: Money }) {
  const formatted = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: value.currency,
    maximumFractionDigits: 2,
  }).format(value.amountMinor / 100);

  return <span className="font-mono text-sm font-bold text-slate-900">{formatted}</span>;
}

function rateSummary(rate: FeeRate | null): string[] {
  if (!rate) return [];
  const parts: string[] = [];
  if (rate.percent !== null) parts.push(`${rate.percent}% of ${rate.basis}`);
  if (rate.flatMinor !== null) parts.push('plus a fixed charge per job');
  return parts;
}

/** True when a published schedule has gone longer than the review window. */
function isStale(reviewedAt: string | null): boolean {
  if (!reviewedAt) return true;
  const reviewed = new Date(reviewedAt).getTime();
  if (Number.isNaN(reviewed)) return true;
  return Date.now() - reviewed > FEE_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export default function PricingPage() {
  const schedule = FEE_POLICY;
  const customerRate = rateSummary(schedule.customer);
  const providerRate = rateSummary(schedule.provider);

  return (
    <>
      <PageHero
        eyebrow="Pricing & fees"
        title="What you pay, and what the provider keeps"
        lede="Two numbers matter: the provider’s quote for the work, and the platform’s own fee. The quote comes from the provider. The fee comes from the published schedule below — and it is published here or nowhere."
        note={
          schedule.published && schedule.effectiveFrom
            ? `Fee schedule effective from ${new Date(schedule.effectiveFrom).toDateString()}`
            : 'No fee schedule is in force yet — no fee figures are quoted on this site'
        }
        actions={
          <ActionRow>
            <ActionLink href="/requests/new" variant="amber" icon={<ArrowIcon />}>
              Start a request
            </ActionLink>
            <ActionLink href="/providers" variant="ghost">
              Provider sign up
            </ActionLink>
          </ActionRow>
        }
      />

      {/* ------------------------------------------------ fee schedule */}
      <Section id="fee-schedule" tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Fee schedule"
            accent="primary"
            title="Platform charges"
            lede="What each side pays the platform, stated separately from the price of the work itself."
          />
        </div>

        {schedule.published ? (
          <>
            {isStale(schedule.reviewedAt) ? (
              <div className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-secondary-light p-4">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
                <p className="text-sm leading-relaxed text-amber-800">
                  This schedule is due for review. The figures below are the last published ones —
                  check them against your quote before relying on them.
                </p>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card tone="canvas">
                <h3 className="mb-4 text-lg font-bold text-slate-900">What a customer pays</h3>
                <FactList
                  items={[
                    { label: 'Provider’s quote', value: 'Priced by the provider' },
                    ...(customerRate.length
                      ? [{ label: 'Platform fee', value: customerRate.join(', ') }]
                      : []),
                  ]}
                />
              </Card>

              <Card tone="canvas">
                <h3 className="mb-4 text-lg font-bold text-slate-900">What a provider keeps</h3>
                <FactList
                  items={[
                    { label: 'Agreed quote', value: 'Paid on approval' },
                    ...(providerRate.length
                      ? [{ label: 'Platform fee', value: providerRate.join(', ') }]
                      : []),
                  ]}
                />
              </Card>
            </div>

            {schedule.notes.length ? (
              <ul className="mx-auto mt-10 grid max-w-3xl gap-2.5">
                {schedule.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                    <CircleCheckBig aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          /* The honest empty state. It is not a shrug: it says what is missing,
             why it is missing, and what will appear in its place. */
          <Card tone="canvas" className="mx-auto max-w-3xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <TriangleAlert aria-hidden="true" className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">
              The fee schedule is not published yet
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              No schedule has been agreed, so no fee is being applied and no fee is quoted here.
              This section will carry the customer and provider rates, the basis each is charged on,
              and the date they take effect — on the day they are in force, not before.
            </p>
            <FactList
              items={[
                { label: 'Posting a request', value: 'Free' },
                { label: 'Browsing and searching', value: 'Free' },
                { label: 'Provider listing', value: 'No charge' },
                { label: 'Fee schedule', value: 'Not in force' },
              ]}
            />
          </Card>
        )}
      </Section>

      {/* ------------------------------------------- what a quote carries */}
      <Section id="what-a-quote-contains" tone="canvas">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="The quote"
            accent="amber"
            title="What a price is made of"
            lede="The platform’s fee is the small print of a job; the quote is the job. These are the lines a quote can carry, and the terms that decide whether two quotes are actually comparable."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card tone="white">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Cost lines</h3>
            <ul className="flex flex-wrap gap-2">
              {QUOTE_COST_LINES.map((line) => (
                <li
                  key={line}
                  className="rounded-sm border border-slate-200 bg-canvas px-2.5 py-1 font-mono text-[11px] text-slate-700"
                >
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">
              A provider can price these separately, which is what makes two quotes comparable
              instead of merely different.
            </p>
          </Card>

          <Card tone="white">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Terms that matter as much</h3>
            <ul className="flex flex-wrap gap-2">
              {QUOTE_TERMS.map((term) => (
                <li
                  key={term}
                  className="rounded-sm border border-slate-200 bg-canvas px-2.5 py-1 font-mono text-[11px] text-slate-700"
                >
                  {term}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">
              Most disagreements are not about price. They are about exclusions, materials
              responsibility and dates — so those sit on the quote, not in a message thread.
            </p>
          </Card>
        </div>
      </Section>

      {/* --------------------------------------------- taxes and currency */}
      <Section id="taxes-and-currency" tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Taxes, currency and FX"
            accent="primary"
            title="The parts the platform does not set"
            lede="Fees are ours to publish. Taxes, exchange rates and bank charges are not, and pretending otherwise is how pricing pages end up wrong at the exact moment somebody relies on them."
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {TAX_CAVEATS.map((caveat) => (
            <Card key={caveat.title} tone="canvas">
              <h3 className="mb-2 text-base font-bold text-slate-900">{caveat.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{caveat.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------- examples */}
      <Section id="worked-examples" tone="canvas">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Worked examples"
            accent="amber"
            title="What a job costs, end to end"
            lede="Once a schedule is in force these examples are computed from it, so the arithmetic on this page cannot drift from the rates above."
          />
        </div>

        {schedule.published && schedule.examples.length ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Worked examples of platform fees on a quote</caption>
              <thead className="bg-canvas font-mono text-[11px] tracking-wider text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Example
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Quote
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Platform fee
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule.examples.map((example) => {
                  const customerFee = feeFor(example.quote, 'customer');
                  return (
                    <tr key={example.label} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-slate-600">{example.label}</td>
                      <td className="px-5 py-3">
                        <FormattedMoney value={example.quote} />
                      </td>
                      <td className="px-5 py-3">
                        {customerFee ? (
                          <FormattedMoney value={customerFee} />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card tone="white" className="mx-auto max-w-3xl text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              Examples are published with the schedule. Until then, the only number that applies to
              your job is the one on the provider’s quote.
            </p>
            <div className="mt-5">
              <ActionLink href="/how-it-works" variant="link" icon={<ArrowIcon />}>
                See how a quote is built during a request
              </ActionLink>
            </div>
          </Card>
        )}
      </Section>

      {/* ------------------------------------------------------ markets */}
      <Section id="markets" tone="white">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <SectionHeader
            eyebrow="Markets"
            accent="primary"
            title="Where the platform operates, and where it does not"
            lede="A request belongs to exactly one market, and the market decides the currency and which schedule applies."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card tone="canvas">
            <h3 className="mb-2 text-base font-bold text-slate-900">Supported market</h3>
            <p className="text-sm leading-relaxed text-slate-600">
              Requests can be posted in any market listed in the request form. The form will not
              offer a market the platform cannot transact in.
            </p>
          </Card>
          <Card tone="canvas">
            <h3 className="mb-2 text-base font-bold text-slate-900">Elsewhere</h3>
            <p className="text-sm leading-relaxed text-slate-600">
              If your market is not listed, the request cannot be posted yet rather than failing
              later — and nothing is charged for trying.
            </p>
          </Card>
          <Card tone="canvas">
            <h3 className="mb-2 text-base font-bold text-slate-900">Changing market</h3>
            <p className="text-sm leading-relaxed text-slate-600">
              Prices, fees and currencies are per market, so a quote accepted in one market is not
              transferable to another.
            </p>
          </Card>
        </div>
      </Section>

      <Section tone="canvas">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <SectionHeader eyebrow="Questions" accent="primary" title="Pricing questions, answered plainly" />
        </div>
        <Faq items={FAQS} />
      </Section>

      <CtaBand
        eyebrow="Ready when you are"
        title="The quote is the price. Start there."
        lede="Post what you need done, compare itemized quotes from verified providers, and release payment only once the work is approved."
        note={
          <>
            <BadgeCheck aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />
            No fee schedule is in force today, so nothing here depends on one
          </>
        }
        actions={
          <ActionRow>
            <ActionLink href="/requests/new" variant="amber" icon={<ArrowIcon />}>
              Start a request
            </ActionLink>
            <ActionLink href="/providers" variant="ghost">
              Provider sign up
            </ActionLink>
          </ActionRow>
        }
      />
    </>
  );
}
