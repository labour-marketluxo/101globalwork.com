import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Search } from '@/components/ui/icons';
import { CheckItem, CheckList } from '@/components/ui/CheckList';
import { CardImage } from '@/components/discovery/CardImage';
import { HERO_BAND, PUBLIC_BAND } from '@/components/discovery/tokens';
import { getDefaultMarketSlug } from '@/features/discovery/data/market-catalog';

/**
 * /services — the trade directory and scope-matching portal.
 *
 * THE HERO SITS ON THE SITE'S OWN BAND. It used to be dark text on the canvas, which made this the
 * one public page whose opening block did not match the market hubs or the landing page. It is now
 * the same full-bleed `HERO_BAND` band, at the same 1320px measure, with the search field as the
 * white card the other heroes use.
 *
 * EVERY CARD CARRIES ARTWORK. The cards are hand-written (the category list is the brief's, not a
 * catalogue read), so their art keys are `directory:<slug>`; the input point is
 * components/discovery/CardImage.tsx. The card is deliberately compact: header and status at the
 * top, the picture in the middle, then the scopes as a plain vertical list of checked lines and the
 * jump-off link at the card's bottom-right corner. The scopes were pills for one revision; a list of three things the
 * category covers does not need a background behind every line (components/ui/CheckList.tsx).
 *
 * THE SCOPE LIST WRAPS. It is a wrapping flex row, not a column: two short scopes share a line and a long
 * one takes the line it needs, so the list is as tall as its content instead of one row per scope. Nothing
 * is forced onto a row — an item is only beside another when its own text fits there.
 *
 * THE SEARCH FIELD IS A PLAIN GET FORM, not client JavaScript. It posts `?q=` to `/search`, which
 * is a route handler that resolves the default market at request time and forwards the whole query
 * string to `/{market}/search` (see app/search/route.ts). That keeps the page a server component
 * with no client bundle and makes the field work before hydration, on a slow connection.
 *
 * EVERY CATEGORY ACTION LANDS ON A MARKET-SCOPED SEARCH. The public service catalogue currently
 * holds real rows for only a couple of trades, so linking a card at `/{market}/services/{slug}`
 * would 404 for most of these headings; the search route accepts any phrase and is honest when it
 * finds nothing. The scope rows and the "Browse category" link therefore carry their own query.
 *
 * THE CATEGORY SET IS THE BRIEF'S, VERBATIM. The headings and the scope names describe the shape of
 * the directory, not a count of supply — the platform's published position is that the catalogue is
 * nearly empty, so nothing here shows a provider count, a rating or a "jobs completed" figure.
 * ("ACTIVE" reads as "this category is browsable", not "providers are available".)
 */

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Browse trade categories or describe your own scope, and receive itemized quotes from providers checked before they can quote.',
  alternates: { canonical: '/services' },
  robots: { index: false, follow: true },
};

/** The directory's categories, each with the scopes people actually search for. */
const CATEGORIES = [
  {
    slug: 'plumbing-mechanical',
    title: 'Plumbing & Mechanical',
    scopes: ['Valve Replacement', 'Leak & Pipe Repair', 'Drainage & Fittings'],
  },
  {
    slug: 'electrical-power',
    title: 'Electrical & Power',
    scopes: ['Distribution Panel', 'Fault Tracing', 'Lighting Installation'],
  },
  {
    slug: 'hvac-climate',
    title: 'HVAC & Climate',
    scopes: ['Ducted AC System', 'Split Unit Service', 'Ventilation'],
  },
  {
    slug: 'facilities-maintenance',
    title: 'Facilities Maintenance',
    scopes: ['Preventive Maintenance', 'Reactive Repairs', 'Site Inspections'],
  },
  {
    slug: 'commercial-renovation',
    title: 'Commercial Renovation',
    scopes: ['Fit-out & Partitioning', 'Flooring', 'Painting & Finishes'],
  },
];

export default async function ServicesPage() {
  const marketSlug = await getDefaultMarketSlug();
  const searchHref = (query: string) => `/${marketSlug}/search?q=${encodeURIComponent(query)}`;

  return (
    <>
      {/* ── hero: the site's own band, with the scope-and-search field ─────────────────── */}
      <section className={`${HERO_BAND} px-4 pt-10 pb-14 text-white sm:px-6 lg:px-8`}>
        <div className={PUBLIC_BAND}>
          <span className="mb-4 inline-flex w-fit rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-sans text-xs text-emerald-400">
            DIRECTORY &amp; SCOPES
          </span>
          <h1 className="mb-4 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Find the work you need done
          </h1>
          <p className="mb-8 max-w-2xl leading-relaxed text-slate-300">
            Browse verified trade categories or post a custom scope to receive itemized quotes
            directly from vetted providers.
          </p>

          <form
            action="/search"
            method="get"
            role="search"
            className="flex max-w-xl items-center gap-2 rounded-2xl border border-emerald-900/30 bg-white p-2 shadow-xl focus-within:ring-2 focus-within:ring-emerald-400"
          >
            <Search aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              name="q"
              aria-label="Search trade categories or describe a task"
              placeholder="Search plumbing, electrical, HVAC, or describe a task..."
              className="w-full min-w-0 border-none bg-transparent px-3 py-2.5 text-sm text-slate-900 ring-0 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border-0 bg-[#F59E0B] px-5 py-3 font-sans text-xs font-bold text-slate-950 transition-all hover:bg-[#D97706] active:scale-95"
            >
              Find Trade
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </section>

      <div className={`${PUBLIC_BAND} px-4 pt-12 pb-24 sm:px-6 lg:px-8`}>
        {/* ── category bento grid ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
            <article
              key={category.slug}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300"
            >
              {/* Header and status, at the top of the card. */}
              <div className="flex items-start justify-between gap-3 p-5 pb-4">
                <h2 className="text-lg font-bold text-slate-900">{category.title}</h2>
                <span className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 font-sans text-[10px] text-emerald-700">
                  ACTIVE
                </span>
              </div>

              {/* Artwork, full-bleed in the middle. Map `directory:<slug>` in CardImage.tsx. */}
              <CardImage artKey={`directory:${category.slug}`} />

              {/* The scopes wrap, then the way into the category. */}
              <div className="flex flex-1 flex-col p-5">
                <CheckList className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2.5 p-0">
                  {category.scopes.map((scope) => (
                    <CheckItem key={scope} className="text-sm text-slate-600">
                      <Link
                        href={searchHref(scope)}
                        className="text-slate-600 no-underline transition-colors hover:text-primary"
                      >
                        {scope}
                      </Link>
                    </CheckItem>
                  ))}
                </CheckList>

                <div className="mt-auto pt-5">
                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <Link
                      href={searchHref(category.title)}
                      className="group inline-flex items-center gap-2 font-sans text-xs font-semibold text-slate-800 no-underline transition-colors hover:text-amber-600"
                    >
                      Browse category
                      {/* The arrow rides in its own chip, so the link reads as a button and the
                          icon travels on hover instead of the whole row shifting. */}
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-all group-hover:translate-x-0.5 group-hover:border-amber-300 group-hover:bg-amber-100 group-hover:text-amber-700">
                        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* ── custom scope callout ──────────────────────────────────────────────────────── */}
        <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-3xl bg-[#0D282E] p-8 text-white shadow-lg md:flex-row md:p-10">
          <div>
            <span className="mb-3 inline-flex w-fit rounded-full border border-amber-800/60 bg-amber-950/60 px-3 py-1 font-sans text-xs text-amber-400">
              CAN&rsquo;T FIND YOUR EXACT TRADE?
            </span>
            <h2 className="mb-2 text-2xl font-bold text-white">Describe your job in your own words</h2>
            <p className="max-w-lg text-sm text-slate-300">
              You don&rsquo;t need a pre-set category. Write your scope once, and verified providers
              will quote against your exact specifications.
            </p>
          </div>

          <Link
            href="/app/requests/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#F59E0B] px-6 py-3.5 font-sans text-xs font-bold text-slate-950 no-underline transition-all hover:bg-[#D97706] active:scale-95"
          >
            Post Custom Request
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
