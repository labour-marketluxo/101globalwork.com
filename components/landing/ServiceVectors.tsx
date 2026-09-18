import Link from 'next/link';
import {
  ArrowRight,
  CircleCheckBig,
  ClipboardCheck,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';

/**
 * ServiceVectors — "two ways to get work done", plus the three-step flow.
 *
 * Ported from the design's section 2, which pitches two procurement paths as
 * side-by-side bento cards and then explains the process.
 *
 * Copy is rewritten rather than transcribed. The design's cards quote prices
 * ("$149 flat", "$95 - $130/hr") and promise "2-Hour Arrival Guarantee" and
 * "18 within 5 miles" — none of which this app can honour, and the first two
 * would be advertised contractual terms. The visual structure is identical; the
 * right-hand column of each comparison row now states what the platform does
 * instead of a number it cannot stand behind.
 *
 * The design's card B also branded its scope breakdown as "Algorithmic WBS".
 * Splitting a request into stages is a real feature here; calling it algorithmic
 * would be marketing for something that has not been built that way.
 *
 * THE THREE-STEP FLOW USED TO LIVE HERE, under an `id="how-it-works"` anchor that
 * the header and footer jumped to. It moved to /how-it-works, where the same three
 * beats are the summary rather than the whole story: that route carries the full
 * seven-stage journey for customers and for providers. A three-card summary could
 * only ever say "describe it, compare quotes, approve and pay", which is the part
 * a visitor already assumes — leaving it here made the landing page longer without
 * making it more informative.
 */

const QUICK_STEPS = [
  { label: 'Posting a request', value: 'Free' },
  { label: 'Quotes you receive', value: 'Itemized' },
  { label: 'Providers who quote', value: 'Verified' },
];

const PROJECT_STEPS = [
  {
    icon: Layers,
    title: 'Structured stages',
    detail: 'Scope is split into stages with dates and deliverables, not one vague total.',
  },
  {
    icon: ClipboardCheck,
    title: 'Sign-off per stage',
    detail: 'Work moves on only once the previous stage has been approved.',
  },
  {
    icon: ShieldCheck,
    title: 'One thread',
    detail: 'Quotes, messages, dates and payments stay attached to the request.',
  },
];

export default function ServiceVectors() {
  return (
    <section className="w-full bg-white py-24">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
        {/* Section title */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="rounded-full border border-primary-subtle bg-primary-surface px-3 py-1 font-mono text-xs font-bold tracking-wider text-primary uppercase">
            Architected for any scale
          </span>
          <h2 className="mt-3 mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Two ways to get work done
          </h2>
          <p className="text-base text-slate-600 sm:text-lg">
            Whether it is a two-hour repair or a multi-week project, the flow is the same: describe
            it, compare quotes, and pay when it is done.
          </p>
        </div>

        {/* Two vector cards */}
        <div className="mb-20 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Vector A — quick service */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-canvas p-8 transition-all hover:border-secondary/40 hover:shadow-xl sm:p-10">
            <div className="pointer-events-none absolute top-0 right-0 h-36 w-36 rounded-bl-full bg-secondary/5 transition-all group-hover:scale-110" />
            <div>
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <Zap aria-hidden="true" className="h-8 w-8" />
                </div>
                <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-secondary-light px-3 py-1 font-mono text-xs font-bold text-amber-800">
                  <Timer aria-hidden="true" className="h-[15px] w-[15px]" />
                  Single trade
                </span>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-slate-900">Quick service</h3>
              <p className="mb-4 font-mono text-xs tracking-wider text-slate-500 uppercase">
                One provider, one visit
              </p>
              <p className="mb-6 text-sm leading-relaxed text-slate-600">
                For the jobs where something needs attention now: a leaking pipe, a breaker that
                keeps tripping, a door that will not lock, an appliance that has stopped.
              </p>

              <div className="mb-8 space-y-3 rounded-xl border border-slate-200/80 bg-white p-5 font-mono text-xs">
                {QUICK_STEPS.map((step, index) => (
                  <div
                    key={step.label}
                    className={`flex items-center justify-between ${
                      index < QUICK_STEPS.length - 1 ? 'border-b border-slate-100 pb-2.5' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2 text-slate-500">
                      <CircleCheckBig aria-hidden="true" className="h-[18px] w-[18px] text-secondary" />
                      {step.label}
                    </span>
                    <span className="text-sm font-bold text-slate-900">{step.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-mono text-xs text-slate-500">Describe it in your own words</span>
              <Link
                href="/search"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold text-white no-underline shadow-sm transition-colors hover:bg-primary-dark"
              >
                <Search aria-hidden="true" className="h-[15px] w-[15px]" />
                Find providers
              </Link>
            </div>
          </div>

          {/* Vector B — project work */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-canvas p-8 transition-all hover:border-primary/40 hover:shadow-xl sm:p-10">
            <div className="pointer-events-none absolute top-0 right-0 h-36 w-36 rounded-bl-full bg-primary/5 transition-all group-hover:scale-110" />
            <div>
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers aria-hidden="true" className="h-8 w-8" />
                </div>
                <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-mono text-xs font-bold text-white">
                  <Sparkles aria-hidden="true" className="h-[15px] w-[15px] text-amber-300" />
                  Multi-stage
                </span>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-slate-900">Project work</h3>
              <p className="mb-4 font-mono text-xs tracking-wider text-slate-500 uppercase">
                Multi-trade and multi-visit
              </p>
              <p className="mb-6 text-sm leading-relaxed text-slate-600">
                For work that spans several visits or several trades: a renovation, a fit-out, or a
                repair programme across more than one property.
              </p>

              <div className="mb-8 space-y-3 rounded-xl border border-slate-200/80 bg-white p-5 text-xs">
                {PROJECT_STEPS.map((step, index) => (
                  <div
                    key={step.title}
                    className={`flex items-start gap-3 ${
                      index < PROJECT_STEPS.length - 1 ? 'border-b border-slate-100 pb-2.5' : ''
                    }`}
                  >
                    <step.icon aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
                    <div>
                      <strong className="block font-medium text-slate-900">{step.title}</strong>
                      <span className="text-[11px] text-slate-500">{step.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-mono text-xs text-slate-500">Multi-stage and multi-trade</span>
              <Link
                href="/requests/new"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold text-white no-underline shadow-sm transition-colors hover:bg-primary-dark"
              >
                Post a request
                <ArrowRight aria-hidden="true" className="h-[15px] w-[15px] text-amber-300" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
