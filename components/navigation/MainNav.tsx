import Link from 'next/link';
import AuthNav from '@/components/navigation/AuthNav';
import { getCountrySlugs } from '@/features/discovery/data/mock-locations';
import { MobileNav, NavLinks } from '@/components/navigation/NavLinks';

/**
 * MainNav — the site header.
 *
 * Ported from the design's header: a translucent deep-teal bar over a backdrop
 * blur, white wordmark, hairline white rules, amber CTA on the right.
 *
 * THE SHADOW IS AN ADDITION RATHER THAN A PORT, and the design reference is worth quoting on that: its own
 * header carries only the hairline (`border-b border-white/10`) plus a `transition-all` that suggests a
 * scroll-state change nobody ever implemented. Elevation is added here instead, because the bar is translucent
 * and content scrolling underneath should read as passing beneath something rather than disappearing at a line.
 * Three deliberate choices:
 *
 *   TINTED, NOT BLACK. `shadow-primary-deep/25` uses the palette's own deep teal, the same idiom the amber CTAs
 *   already use (`shadow-lg shadow-amber-950/20`), so the shadow belongs to the design rather than sitting on
 *   top of it as grey. A neutral black shadow at a comparable strength is what makes a dark bar look dirty.
 *
 *   STATIC, NOT SCROLL-DEPENDENT. A shadow that appears once the page scrolls needs a scroll listener, and this
 *   component is a server component today; adding one would put a client component — and its JavaScript — on
 *   every page in the site for a decoration.
 *
 *   `lg`, NOT `md`. A shadow tight enough to read as a second hairline is redundant beside the border that is
 *   already there, so the elevation is a soft spread rather than an edge.
 *
 * ⚠️ WHAT IT CANNOT DO: over the deep-teal hero band a teal shadow has almost nothing to bite on, so the lift
 * shows on the light sections and becomes obvious once content scrolls under the bar. That is a property of a
 * dark bar over a dark hero, not something a stronger shadow fixes.
 *
 * ⚠️ AND IT IS NOT LANDING-PAGE-ONLY. This component is the site header for every group that renders SiteChrome
 * — marketing, the signed-in workspaces, the account pages, /legal, /payments and the 404 — so the shadow
 * appears in all of them. The alternative is a per-group header, which is a bigger change than a shadow.
 *
 * STICKY, not fixed. The design uses `fixed`, which removes the bar from flow —
 * every page underneath would then need its own top offset, and the admin
 * workspace (which hides this header entirely) would need to opt back out.
 * `sticky` gives the same pinned-on-scroll behaviour for free, and because the
 * bar is 85% opaque teal it still reads as one continuous dark block with the
 * teal hero directly beneath it.
 *
 * `.site-header` is kept on the element as a semantic hook, NOT for styling:
 * app/(admin)/admin/layout.tsx hides the marketing chrome with
 *     `.site-header, body > footer { display: none; }`
 * and nothing in either stylesheet targets it any more. Drop the class and the
 * marketing header reappears on every admin screen.
 *
 * Responsive strategy is utilities-only: section links collapse below `lg` (the
 * MobileNav drawer takes over there), and AuthNav keeps the bar to a single row at
 * every width. The old approach — a `<700px` block in the unlayered
 * entry-points.css — is gone, because an unlayered rule outranks every utility and
 * a header that cannot be overridden by Tailwind cannot be made responsive in
 * Tailwind.
 *
 * The "Verified providers • Itemized quotes" pill that used to sit beside the logo
 * (hidden below `xl`) has been removed. The same claim still appears in the hero's
 * trust strip and in the footer, so nothing is lost — and the bar is cleaner for it,
 * with one less thing competing with the wordmark and the actions.
 *
 * Every anchor carries `no-underline` explicitly: preflight is deliberately not
 * imported in this project, so no global `a { text-decoration: none }` exists
 * and a bare <a> renders browser-default blue and underlined.
 */

export default function MainNav() {
  // The Home link marks itself on a market page, so the bar needs to know which slugs are markets.
  // Same source the hub routes resolve against, read on the server and passed down as plain data.
  const marketSlugs = getCountrySlugs();

  return (
    <header className="site-header sticky top-0 z-50 border-b border-solid border-white/10 bg-primary/85 shadow-lg shadow-primary-deep/25 backdrop-blur-md">
      <div className="mx-auto flex h-20 w-full max-w-[1536px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            {/* Monogram stands in for the design's logo tile — that asset was
                the design tool's own mark. Drop a real logo in this slot. */}
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-white/15 bg-white/10 font-mono text-[11px] font-bold text-white"
            >
              101
            </span>
            <span className="hidden text-xl font-bold tracking-tight text-white sm:inline">
              101GlobalWork
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-3 lg:gap-4">
          <NavLinks marketSlugs={marketSlugs} />
          <MobileNav marketSlugs={marketSlugs} />
        </div>

        <AuthNav />
      </div>
    </header>
  );
}
