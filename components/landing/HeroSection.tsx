import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Sparkles } from 'lucide-react';
import OutcomePromptBar from '@/components/landing/OutcomePromptBar';

/**
 * HeroSection — full-bleed deep-teal hero over infrastructure photography.
 *
 * Ported from the design's hero. Four deliberate departures:
 *
 * 1. NO `fixed` header offset. The design's section carries `pt-24` to clear a
 *    fixed header; the header here is `sticky`, so it occupies real layout space
 *    and the hero starts below it with no compensation.
 *
 * 2. The photography is a LOCAL asset (public/images/landing). The design
 *    hot-links Google's "aida" CDN, which next/image would reject unless the
 *    hostname were declared in next.config.ts — and would leave the hero
 *    dependent on a URL nobody on this team controls.
 *
 * 3. The trust strip carries no invented numbers. The design's version claimed
 *    "1,480+ Crews Online", "Escrow Protected: $3.82M", "Avg Urgent Dispatch:
 *    42 Minutes" and "99.8% On-Spec Sign-off" — all fabricated, and the first
 *    of them animated with `animate-ping` to imply a live feed. What is left is
 *    what the product actually does; it belongs in the strip with the same
 *    visual weight, and the strip can take real telemetry the day it exists.
 *
 *    One wording change came later than the port: the "Escrow-protected" chip
 *    now reads "Held by our payment provider". Escrow is a specific legal
 *    arrangement with duties attached to whoever holds the money, and the money
 *    here sits with the payment provider rather than with us — so the PRD's
 *    "never imply universal insurance, escrow or emergency response" and
 *    /trust-and-safety, which spells that out, both refuse the term. A trust
 *    strip that contradicted the trust page would be worse than a shorter one.
 *
 * 4. The hero is ONE SCREEN — as measured from the top of the page, header
 *    included. The design's `min-h-[92vh]` + `pt-24`/`pb-16` rendered a 941px
 *    section on a 900px viewport: the hero ran past the fold and the trust
 *    strip landed on top of the content block. Here the section is
 *    `min-h-[calc(100vh-83px)]`, i.e. exactly the space left by the sticky
 *    bar, so header + hero = one full screen. A literal `h-screen`/`min-h-screen`
 *    would NOT do this: the bar is `sticky`, so it occupies 83px of real flow
 *    (80px `h-20` + its 1px rule + subpixel rounding) and a 100vh section would
 *    start below it and still overshoot the fold by 83px — the original bug,
 *    just moved. Height is a MINIMUM, so a viewport shorter than the content (a
 *    667px phone in portrait) grows the section instead of spilling into the
 *    strip below it.
 *
 *    The trust strip is a SIBLING of the section, not a child: it is
 *    deliberately not part of that one-screen height, and is revealed on the
 *    first scroll instead.
 *
 * 5. The headline's second line is `text-secondary` (#D97706 — the design's
 *    `amber-brand`), matching the design's `<span class="text-amber-brand">`
 *    rather than the lighter `text-amber-300` this file used first. The general
 *    rule in this repo is amber-on-dark ⇒ `text-amber-300`, because #D97706 is
 *    only ~3.1:1 on white; over `bg-primary` it measures ~3.9:1, which clears AA
 *    for large text — and this line is 30–60px extrabold.
 */

const PRESETS = [
  { label: 'Leaking tap or burst pipe', q: 'Leaking tap and a burst pipe under the sink' },
  { label: 'Electrical fault', q: 'Sockets keep tripping — need an electrician to trace the fault' },
  { label: 'Air conditioning service', q: 'Air conditioning unit needs a service and a gas refill' },
  { label: 'Deep clean before move-in', q: 'Deep clean of a three-bedroom flat before we move in' },
];

export default function HeroSection() {
  return (
    <>
      <section className="relative flex min-h-[calc(100vh-83px)] items-center justify-center overflow-hidden bg-primary py-6">
        {/* Background layer */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/landing/hero-infrastructure.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center saturate-[1.1]"
          />
          {/* The overlay is what guarantees the white headline clears AA
              contrast regardless of what the photograph does underneath. */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/80 via-primary/75 to-primary/95 backdrop-blur-[1.5px]" />
        </div>

        {/* Content — vertically centred in the one-screen section. The rhythm
            here is the design's (mb-5/mb-5/mb-8/mt-4) minus the two
            asymmetries it carried for its fixed header: no `pt-8` on the inner
            wrapper, and no `pb-28` reserving room for the trust strip, which is
            no longer inside this box.

            THE FIT RULE, because it is not obvious and it has bitten us:
            the hero measures exactly one screen only while
                header (83) + content + padding ≤ viewport
            because `min-h` stops binding the moment the content is taller than
            it — the section is then sized by the content, runs past the fold,
            and the strip drops below it. So the padding here is deliberately
            small (`py-6`, not the design's `pt-24 pb-16`): it is invisible
            whenever the min-height binds — the content is centred in a taller
            box and padding plays no part — and it buys ~32px of headroom on
            short windows, where it is the only thing keeping the strip at the
            fold. At `py-6` the hero stays exact down to a 812px viewport, and
            below that it is the CONTENT that has to shrink, not this number. */}
        <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs text-emerald-300 shadow-sm backdrop-blur-sm">
            <Sparkles aria-hidden="true" className="h-[15px] w-[15px] text-secondary" />
            <span className="font-semibold tracking-wide uppercase">
              On-demand service coordination
            </span>
          </div>

          <h1 className="mb-3 text-3xl leading-[1.15] font-extrabold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
            Describe the work you need done.
            <br className="hidden sm:inline" />{' '}
            <span className="text-secondary">We match you with verified providers.</span>
          </h1>

          <p className="mx-auto mb-3 max-w-3xl text-base leading-relaxed text-slate-200 sm:text-lg lg:text-xl">
            Stop scrolling listings and cold-calling contractors. Say what needs doing, in your own
            words, and compare itemized quotes from verified local providers. Your payment is held
            until you approve the finished work.
          </p>

          <OutcomePromptBar />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
            <span className="mr-1 font-mono text-[11px] tracking-wider text-slate-400 uppercase">
              Common jobs:
            </span>
            {PRESETS.map((preset) => (
              <Link
                key={preset.label}
                href={`/search?q=${encodeURIComponent(preset.q)}`}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-slate-200 no-underline backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                {preset.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip. A SIBLING of the hero, not a child: the hero above is
          deliberately exactly one screen, and this band is not part of that
          height — it is the first thing revealed on scroll, directly beneath
          the one-screen hero, the way the design's strip sat on the hero's
          bottom edge. The design pinned it `absolute bottom-0` INSIDE the
          section over the (dark, translucent) photography; here it sits on the
          page canvas below the hero, so the same 90% teal would read washed
          out over #FAFAFA and the backdrop blur would have nothing to blur.
          Solid `bg-primary-deep` is that same band, unattenuated. */}
      <div className="border-t border-white/10 bg-primary-deep px-4 py-3.5">
        <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] text-slate-300 sm:justify-between">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-white">Verified providers only</span>
          </div>
          <div className="hidden text-white/30 sm:inline-block">&bull;</div>
          <div>Itemized quotes before work starts</div>
          <div className="hidden text-white/30 sm:inline-block">&bull;</div>
          <div>Payment released after you approve</div>
          <div className="hidden text-white/30 sm:inline-block">&bull;</div>
          <div className="flex items-center gap-1 text-amber-300">
            <ShieldCheck aria-hidden="true" className="h-[15px] w-[15px]" />
            <span>Held by our payment provider</span>
          </div>
        </div>
      </div>
    </>
  );
}
