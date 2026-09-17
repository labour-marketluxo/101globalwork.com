import Link from 'next/link';
import AuthNav from '@/components/navigation/AuthNav';

/**
 * MainNav — the site header.
 *
 * Ported from the design's header: a translucent deep-teal bar over a backdrop
 * blur, white wordmark, hairline white rules, amber CTA on the right.
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
 * Responsive strategy is utilities-only: section links collapse below `lg`, the
 * trust pill below `xl`, and AuthNav keeps the bar to a single row at every
 * width. The old approach — a `<700px` block in the unlayered entry-points.css —
 * is gone, because an unlayered rule outranks every utility and a header that
 * cannot be overridden by Tailwind cannot be made responsive in Tailwind.
 *
 * Every anchor carries `no-underline` explicitly: preflight is deliberately not
 * imported in this project, so no global `a { text-decoration: none }` exists
 * and a bare <a> renders browser-default blue and underlined.
 */

const SECTION_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/services', label: 'Services' },
  { href: '/#verticals', label: 'Trade network' },
  { href: '/#trust', label: 'Trust & escrow' },
  { href: '/providers', label: 'For providers' },
] as const;

export default function MainNav() {
  return (
    <header className="site-header sticky top-0 z-50 border-b border-solid border-white/10 bg-primary/85 backdrop-blur-md">
      <div className="mx-auto flex h-20 w-full max-w-[1536px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            {/* Monogram stands in for the design's logo tile — that asset was
                the design tool's own mark. Drop a real logo in this slot. */}
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-white/15 bg-white/10 font-mono text-[11px] font-bold text-white"
            >
              101
            </span>
            <span className="text-xl font-bold tracking-tight text-white">101GlobalWork</span>
          </Link>

          <div className="hidden items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300 xl:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Verified providers &bull; Itemized quotes</span>
          </div>
        </div>

        <nav
          aria-label="Sections"
          className="hidden items-center gap-8 text-[14px] font-medium text-slate-200 lg:flex"
        >
          {SECTION_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="no-underline transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <AuthNav />
      </div>
    </header>
  );
}
