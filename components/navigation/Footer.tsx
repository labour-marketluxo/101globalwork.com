import Link from 'next/link';
import { getDefaultMarketSlug } from '@/features/discovery/data/market-catalog';

/**
 * Footer — the design's corporate footer: near-black teal, five columns, mono
 * uppercase headings, hairline rules.
 *
 * Rendered as a bare <footer> with NO wrapper element, deliberately:
 * app/(admin)/admin/layout.tsx hides this with `body > footer`, which only
 * matches while <footer> remains a direct child of <body>.
 *
 * LINK DISCIPLINE: every href below points at a route that exists. The design
 * advertises Privacy, Terms, Dispute Arbitration and a Security Center — this
 * app has none of those routes yet, and a footer of 404s is worse than a
 * shorter footer. Add them here in the same change that adds the pages.
 *
 * The year is evaluated during the server render, exactly as before.
 */

const columnsFor = (marketSlug: string) => [
  {
    heading: 'Services',
    links: [
      { href: `/${marketSlug}/search?q=Plumbing`, label: 'Plumbing' },
      { href: `/${marketSlug}/search?q=Electrical`, label: 'Electrical' },
      { href: `/${marketSlug}/search?q=Air+conditioning`, label: 'Air conditioning & HVAC' },
      { href: `/${marketSlug}/search?q=Home+cleaning`, label: 'Home cleaning' },
      { href: '/services', label: 'All services' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing & fees' },
      { href: '/trust-and-safety', label: 'Trust & safety' },
      { href: '/#verticals', label: 'Trade network' },
      { href: '/requests/new', label: 'Post a request' },
      { href: `/${marketSlug}/search`, label: 'Find providers' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/sign-up?intent=customer', label: 'Create an account' },
      { href: '/sign-in', label: 'Sign in' },
      { href: '/work', label: 'My work' },
      { href: '/providers', label: 'Become a provider' },
    ],
  },
];

export default async function Footer() {
  // Search only exists at /{market}/search now, so every search link needs a market
  // in the path. Resolved once per request (the helper is request-cached), and the
  // same value the landing hero and the /search redirect use.
  const marketSlug = await getDefaultMarketSlug();
  const COLUMNS = columnsFor(marketSlug);

  return (
    <footer className="w-full border-t border-solid border-white/10 bg-primary-deep py-14 text-xs text-slate-400">
      <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <div className="mb-4 flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-solid border-white/15 bg-white/10 font-mono text-[10px] font-bold text-white"
              >
                101
              </span>
              <span className="text-lg font-bold tracking-tight text-white">101GlobalWork</span>
            </div>
            <p className="mb-4 max-w-sm text-xs leading-relaxed text-slate-400">
              Agree an itemized quote with a verified provider first, then release payment only once
              the work is approved.
            </p>
            {/* Not a status claim: the design's green dot + "All systems nominal"
                implied live telemetry that this app does not publish. */}
            <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Verified providers &bull; Itemized quotes &bull; Approval-based payment</span>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-4 font-mono text-[11px] font-semibold tracking-wider text-white uppercase">
                {column.heading}
              </h2>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="no-underline transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-solid border-white/10 pt-8 font-mono text-[11px] text-slate-500 sm:flex-row">
          <div>&copy; {new Date().getFullYear()} 101GlobalWork. All rights reserved.</div>
          <div>On-demand service coordination</div>
        </div>
      </div>
    </footer>
  );
}
