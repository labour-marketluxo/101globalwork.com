import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Sparkles } from 'lucide-react';
import OutcomePromptBar from '@/components/landing/OutcomePromptBar';

/**
 * HeroSection — full-bleed deep-teal hero over infrastructure photography.
 *
 * Ported from the design's hero. Three deliberate departures:
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
 */

const PRESETS = [
  { label: 'Leaking tap or burst pipe', q: 'Leaking tap and a burst pipe under the sink' },
  { label: 'Electrical fault', q: 'Sockets keep tripping — need an electrician to trace the fault' },
  { label: 'Air conditioning service', q: 'Air conditioning unit needs a service and a gas refill' },
  { label: 'Deep clean before move-in', q: 'Deep clean of a three-bedroom flat before we move in' },
];

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden bg-primary pt-16 pb-28">
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

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pt-8 text-center sm:px-6 lg:px-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs text-emerald-300 shadow-sm backdrop-blur-sm">
          <Sparkles aria-hidden="true" className="h-[15px] w-[15px] text-secondary" />
          <span className="font-semibold tracking-wide uppercase">
            On-demand service coordination
          </span>
        </div>

        <h1 className="mb-6 text-3xl leading-[1.15] font-extrabold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
          Describe the work you need done.
          <br className="hidden sm:inline" />{' '}
          <span className="text-amber-300">We match you with verified providers.</span>
        </h1>

        <p className="mx-auto mb-10 max-w-3xl text-base leading-relaxed text-slate-200 sm:text-lg lg:text-xl">
          Stop scrolling listings and cold-calling contractors. Say what needs doing, in your own
          words, and compare itemized quotes from verified local providers. Your payment is held
          until you approve the finished work.
        </p>

        <OutcomePromptBar />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
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

      {/* Trust strip, pinned to the bottom of the hero as in the design */}
      <div className="absolute right-0 bottom-0 left-0 z-10 border-t border-white/10 bg-primary-deep/90 px-4 py-3.5 backdrop-blur-md">
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
            <span>Escrow-protected</span>
          </div>
        </div>
      </div>
    </section>
  );
}
