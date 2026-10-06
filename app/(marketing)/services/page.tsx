import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search } from '@/components/ui/icons';
import { Section } from '@/components/marketing/PageSections';
import { getDefaultMarketSlug } from '@/features/discovery/data/market-catalog';

/**
 * /services — the trade directory and scope-matching portal.
 *
 * WHAT CHANGED. This was a three-line text block: an eyebrow, a headline and a link, with a note
 * that service pages only become indexable after supply and usefulness checks. It is now the
 * directory those checks are about — a search field, a bento grid of trade categories with their
 * popular scopes, and a custom-scope callout for work that does not fit a preset category.
 *
 * THE SEARCH FIELD IS A PLAIN GET FORM, not client JavaScript. It posts `?q=` to `/search`, which
 * is a route handler that resolves the default market at request time and forwards the whole query
 * string to `/{market}/search` (see app/search/route.ts). That keeps the page a server component
 * with no client bundle and makes the field work before hydration, on a slow connection.
 *
 * EVERY CATEGORY ACTION LANDS ON A MARKET-SCOPED SEARCH. The public service catalogue currently
 * holds real rows for only a couple of trades, so linking a card at `/{market}/services/{slug}`
 * would 404 for most of these headings; the search route accepts any phrase and is honest when it
 * finds nothing. Scope pills and the "Browse category" link therefore carry their own query.
 *
 * THE CATEGORY SET IS THE BRIEF'S, VERBATIM. The headings and the scope chips describe the shape of
 * the directory, not a count of supply — the platform's published position is that the catalogue is
 * nearly empty, so nothing here shows a provider count, a rating or a "jobs completed" figure.
 * ("ACTIVE" reads as "this category is browsable", not "providers are available"; the copy
 * avoids implying the latter.)
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
    title: 'Plumbing & Mechanical',
    scopes: ['Valve Replacement', 'Leak & Pipe Repair', 'Drainage & Fittings'],
  },
  {
    title: 'Electrical & Power',
    scopes: ['Distribution Panel', 'Fault Tracing', 'Lighting Installation'],
  },
  {
    title: 'HVAC & Climate',
    scopes: ['Ducted AC System', 'Split Unit Service', 'Ventilation'],
  },
  {
    title: 'Facilities Maintenance',
    scopes: ['Preventive Maintenance', 'Reactive Repairs', 'Site Inspections'],
  },
  {
    title: 'Commercial Renovation',
    scopes: ['Fit-out & Partitioning', 'Flooring', 'Painting & Finishes'],
  },
];

export default async function ServicesPage() {
  const marketSlug = await getDefaultMarketSlug();
  const searchHref = (query: string) => `/${marketSlug}/search?q=${encodeURIComponent(query)}`;

  return (
    <Section tone="canvas">
      {/* ── hero: scope + search ──────────────────────────────────────────────────────── */}
      <div className="max-w-3xl">
        <span className="mb-4 inline-flex w-fit rounded-full bg-emerald-50 px-3 py-1 font-sans text-xs text-emerald-700">
          DIRECTORY &amp; SCOPES
        </span>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900">
          Find the work you need done
        </h1>
        <p className="mb-8 max-w-2xl leading-relaxed text-slate-600">
          Browse verified trade categories or post a custom scope to receive itemized quotes
          directly from vetted providers.
        </p>

        <form
          action="/search"
          method="get"
          role="search"
          className="flex max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <Search aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            name="q"
            aria-label="Search trade categories or describe a task"
            placeholder="Search plumbing, electrical, HVAC, or describe a task..."
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#F59E0B] px-4 py-2.5 font-sans text-xs font-bold text-slate-950 transition-all hover:bg-[#D97706] active:scale-95"
          >
            Find Trade
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* ── category bento grid ───────────────────────────────────────────────────────── */}
      <div className="my-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => (
          <article
            key={category.title}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300"
          >
            <div>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">{category.title}</h2>
                <span className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 font-sans text-[10px] text-emerald-700">
                  ACTIVE
                </span>
              </div>

              <ul className="flex flex-wrap gap-2">
                {category.scopes.map((scope) => (
                  <li key={scope}>
                    <Link
                      href={searchHref(scope)}
                      className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 no-underline transition-colors hover:bg-slate-200 hover:text-slate-900"
                    >
                      {scope}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <Link
                href={searchHref(category.title)}
                className="flex items-center gap-1 font-sans text-xs font-semibold text-slate-800 no-underline transition-colors hover:text-amber-600"
              >
                Browse category
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* ── custom scope callout ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-[#0D282E] p-8 text-white shadow-lg md:flex-row md:p-10">
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
          href="/requests/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#F59E0B] px-6 py-3.5 font-sans text-xs font-bold text-slate-950 no-underline transition-all hover:bg-[#D97706] active:scale-95"
        >
          Post Custom Request
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </Section>
  );
}
