import Image from 'next/image';
import {
  BadgeCheck,
  Check,
  CircleCheckBig,
  Quote,
  ShieldCheck,
} from 'lucide-react';

/**
 * TrustSection — the light "how you are protected" bento grid.
 *
 * Ported from the design's section 4: a 12-column bento of two wide cards and
 * two narrow ones, alternating white and solid deep-teal panels.
 *
 * WHAT IS NOT PORTED, AND WHY
 *
 * The design filled this section with proof that does not exist. Card 1 was a
 * "PROVEN OUTCOME CASE STUDY" quoting a fixed $29,850 solar contract delivered
 * in 15 days by "Bonded C-46"; card 3 claimed a "$5,000,000 minimum" surety
 * bond and "Daily Automated Audits"; card 4 was a five-star testimonial from a
 * named VP of Facilities at a named company, with a stock portrait beside it.
 * None of that is real, and this is precisely the part of the page a buyer uses
 * to decide whether to trust the platform with money — so the structure stays
 * and the claims become statements about mechanism instead of results.
 *
 * Card 4 keeps its pull-quote shape but drops the persona, the rating and the
 * portrait. An unattributed line about why the product works that way is
 * honest; an invented customer is not.
 *
 * The emerald pill on card 1 is the design's own "verified" accent and the only
 * green in the page outside the header status dots — the token set has no
 * successor for it, so Tailwind's default emerald is used deliberately.
 */

const PAYMENT_POINTS = [
  'Your payment is held, not sent on to the provider',
  'Released only once you approve the work',
  'A clear window to raise a problem before release',
];

const CHECKS = [
  { label: 'Identity', value: 'Checked before quoting' },
  { label: 'Licence', value: 'Checked where the trade needs one' },
  { label: 'Insurance', value: 'Requested where applicable' },
];

export default function TrustSection() {
  return (
    <section
      id="trust"
      className="w-full scroll-mt-24 border-y border-slate-200 bg-canvas-subtle py-24"
    >
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-xs font-bold tracking-wider text-emerald-800 uppercase">
            No upfront risk
          </span>
          <h2 className="mt-3 mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            You pay when the work is approved
          </h2>
          <p className="text-base text-slate-600 sm:text-lg">
            No deposit into a stranger&rsquo;s account. Payment is held and released against the
            work you have signed off.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Card 1 — agreed scope */}
          <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-7">
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">
                  Agreed up front
                </span>
                <span className="font-mono text-xs text-slate-500">Before any work starts</span>
              </div>

              <div className="mb-6 flex flex-col items-start gap-6 sm:flex-row">
                <div className="h-36 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:w-48">
                  <Image
                    src="/images/landing/case-study-solar.jpg"
                    alt=""
                    width={512}
                    height={286}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900">
                    Itemized quotes, so you compare the same thing twice
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Every quote lists what is included, what is excluded and what each part costs.
                    You compare quotes built on one agreed scope, instead of guessing why one came
                    in lower than another.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                      <span className="block text-[10px] text-slate-400">QUOTES</span>
                      <strong className="text-slate-900">Itemized</strong>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                      <span className="block text-[10px] text-slate-400">CHANGES</span>
                      <strong className="text-primary">Re-approved</strong>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                      <span className="block text-[10px] text-slate-400">PAYMENT</span>
                      <strong className="text-emerald-700">Held</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4 font-mono text-xs text-slate-500">
              <span>Nothing is released without your approval</span>
              <span className="flex items-center gap-1 font-semibold text-primary">
                <CircleCheckBig aria-hidden="true" className="h-[15px] w-[15px]" />
                Released on sign-off
              </span>
            </div>
          </div>

          {/* Card 2 — payment protection (solid teal) */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-primary p-6 text-white shadow-sm sm:p-8 lg:col-span-5">
            <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-primary-dark opacity-60" />
            <div>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-amber-300">
                <ShieldCheck aria-hidden="true" className="h-7 w-7" />
              </div>
              <h3 className="mb-2 text-xl font-bold">How your payment is protected</h3>
              <p className="mb-6 text-sm leading-relaxed text-slate-300">
                Your money sits with the payment provider until the work is confirmed, so a
                disagreement about what was finished is settled before anyone is paid.
              </p>
              <div className="space-y-2.5 rounded-xl border border-white/10 bg-primary-dark/60 p-4 font-mono text-xs text-slate-200">
                {PAYMENT_POINTS.map((point) => (
                  <div key={point} className="flex items-center gap-2">
                    <Check aria-hidden="true" className="h-4 w-4 text-amber-300" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 pt-6 font-mono text-xs text-amber-300">
              <BadgeCheck aria-hidden="true" className="h-[15px] w-[15px]" />
              <span>Payments handled by our payment provider</span>
            </div>
          </div>

          {/* Card 3 — provider checks */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-5">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <BadgeCheck aria-hidden="true" className="h-7 w-7" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900">How providers are checked</h3>
              <p className="mb-4 text-sm leading-relaxed text-slate-600">
                A provider is reviewed before they can quote, and re-checked as their details
                change.
              </p>
              <div className="space-y-2.5 font-mono text-xs">
                {CHECKS.map((check) => (
                  <div
                    key={check.label}
                    className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                  >
                    <span className="text-slate-500">{check.label}</span>
                    <span className="text-right font-bold text-slate-900">{check.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 border-t border-slate-100 pt-4 font-mono text-xs text-slate-500">
              Re-checked as details change
            </div>
          </div>

          {/* Card 4 — pull quote */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-7">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <Quote aria-hidden="true" className="h-6 w-6" />
              </div>
              <h3 className="mb-4 text-xl font-bold text-slate-900">
                Why we ask for itemized quotes
              </h3>
              <blockquote className="mb-4 text-base leading-relaxed font-medium text-slate-800 italic sm:text-lg">
                &ldquo;The hard part of hiring is rarely finding someone. It is agreeing what
                &lsquo;done&rsquo; means before the work starts &mdash; and paying only once it is
                true.&rdquo;
              </blockquote>
              <p className="text-sm leading-relaxed text-slate-600">
                That single agreement is what the whole flow is built around: the scope, the quote,
                the approval and the release are all the same conversation.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 font-mono text-xs text-slate-400">
              <span>How the platform is designed</span>
              <span>Not a customer quotation</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
