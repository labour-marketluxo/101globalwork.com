import Link from 'next/link';
import { LayoutGrid, Sparkles } from 'lucide-react';

/**
 * ClosingCta — the final deep-teal call to action, with the design's amber glow.
 *
 * The design's second button was "Schedule Enterprise Demo" pointing at `#`.
 * There is no demo-booking flow in this app, and a button that goes nowhere is
 * worse than no button, so it points at the service directory instead — the
 * genuine next step for someone who is not ready to post yet.
 *
 * The glow is `blur-[140px]` on a `bg-secondary/15` circle, exactly as in the
 * design. It sits behind the content (`pointer-events-none`, and the content is
 * lifted with `relative z-10`) so it can never intercept a click.
 */
export default function ClosingCta() {
  return (
    <section
      id="get-started"
      className="relative w-full scroll-mt-24 overflow-hidden bg-primary py-24 text-white"
    >
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/15 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-[1000px] px-4 text-center sm:px-6 lg:px-8">
        <span className="mb-6 inline-block rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
          Ready when you are
        </span>

        <h2 className="mb-6 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
          Ready to get your next job sorted?
        </h2>

        <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          Post what you need, compare itemized quotes from verified providers, and release payment
          only once you are happy with the work.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/requests/new"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-8 py-4 font-mono text-base font-bold text-white no-underline shadow-xl shadow-amber-950/30 transition-all hover:bg-secondary-dark sm:w-auto"
          >
            <Sparkles aria-hidden="true" className="h-5 w-5" />
            Post a request
          </Link>
          <Link
            href="/services"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-mono text-base font-semibold text-white no-underline transition-all hover:bg-white/20 sm:w-auto"
          >
            <LayoutGrid aria-hidden="true" className="h-5 w-5" />
            Browse services
          </Link>
        </div>
      </div>
    </section>
  );
}
