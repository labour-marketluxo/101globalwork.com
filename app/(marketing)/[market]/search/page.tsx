import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  MarketDataNotice,
  MarketEmptyState,
  MarketFilterPanel,
  ProviderResultCard,
  activeFilterCount,
  type FilterState,
} from '@/components/discovery/MarketSections';
import {
  getMarket,
  getMarketLocations,
  getMarketServices,
  locationScopeIds,
  searchMarketProviders,
  type ProviderSort,
} from '@/features/discovery/data/market-catalog';
import { PREVIEW_PROVIDERS } from '@/features/discovery/data/preview-providers';

/**
 * Market search — /{market}/search
 *
 * Everything the page can filter on comes from the URL: `q`, `category`, `area`,
 * `availability`, `sort`. Because it is a plain GET form with no client state, every
 * filtered view is a shareable, back-button-safe URL, and the whole page still
 * renders with JavaScript off.
 *
 * WHAT THIS PAGE DOUBLES AS, AND WHY THAT MATTERS
 *
 * Results are empty today — zero provider profiles are published — so the empty state
 * is not an edge case here, it is the normal render. It is therefore written as a
 * real destination (post the work) rather than an apology, and it distinguishes three
 * genuinely different situations, which a single "no results" line would blur:
 *
 *   no filters + no providers   the market has no published supply
 *   filters + no providers      the filters excluded everything
 *   area not in this market     the area slug does not exist here at all
 *   read failed                 our problem, not a statement about supply
 *
 * ROUTE-SPECIFIC DEVIATIONS FROM THE BRIEF, all of them because the column does not
 * exist: there is no price-range filter, no rating filter and no price or star
 * rating on a result card. See MarketDataNotice and market-catalog.ts — the short
 * version is that this database has no reviews table and no publicly readable price,
 * and inventing either is the one thing this codebase does not do.
 *
 * robots: index:false, follow:true, matching /search. Note that `app/robots.ts`
 * disallows `/search` exactly, so the nested form needed its own entry there — a
 * path-prefix rule would not have covered it.
 */

type Params = Promise<{ market: string }>;
type SearchParams = Promise<{
  q?: string;
  category?: string;
  area?: string;
  availability?: string;
  sort?: string;
  /** Dev-only UI preview. Ignored in production — see the note below. */
  preview?: string;
}>;

/**
 * `?preview=1` renders the result-card UI from sample rows.
 *
 * It exists because the real query returns nothing today — zero provider profiles are
 * published — which makes the card itself impossible to review. The guard is
 * `process.env.NODE_ENV !== 'production'`, which Next inlines at build time, so in a
 * production bundle this is dead code and the param does nothing. The sample list
 * lives in features/discovery/data/preview-providers.ts and is imported nowhere else.
 *
 * Filtering in preview mode runs over those rows locally, so the filters can be
 * exercised too, and the banner above the results says exactly that.
 */
function previewEnabled(value: string | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return value === '1' || value === 'true';
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) return {};

  return {
    title: `Search providers in ${found.displayName}`,
    description: `Search verified providers by service and area in ${found.displayName}.`,
    alternates: { canonical: `/${found.slug}/search` },
    robots: { index: false, follow: true },
  };
}

export default async function MarketSearchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) redirect('/');

  const query = await searchParams;
  const state: FilterState = {
    query: query.q?.trim() ?? '',
    category: query.category?.trim() ?? '',
    area: query.area?.trim() ?? '',
    acceptingOnly: query.availability === 'open',
    sort: query.sort === 'experience' ? 'experience' : 'readiness',
  };

  const [locations, services] = await Promise.all([
    getMarketLocations(found.marketId),
    getMarketServices(),
  ]);

  const selectedArea = state.area ? locations.find((location) => location.code === state.area) : undefined;
  const areaIsUnknown = Boolean(state.area) && !selectedArea;

  const previewMode = previewEnabled(query.preview);

  // Preview rows are filtered locally. The real path is a database query; this is a
  // stand-in shaped like its result, which is the whole point of the flag.
  const previewProviders = previewMode
    ? (() => {
        const scopeAreaIds = locationScopeIds(locations, state.area || undefined);
        const scopeAreaNames = new Set(
          locations.filter((location) => scopeAreaIds.includes(location.locationId)).map((l) => l.name),
        );
        const serviceName = services.find((s) => s.canonicalKey === state.category)?.displayName;
        const need = state.query.toLowerCase();

        return PREVIEW_PROVIDERS.filter((provider) => {
          if (state.acceptingOnly && !provider.acceptsNewWork) return false;
          if (serviceName && !provider.services.includes(serviceName)) return false;
          if (state.area && !provider.areas.some((area) => scopeAreaNames.has(area))) return false;
          if (need) {
            const haystack = `${provider.headline ?? ''} ${provider.description ?? ''}`.toLowerCase();
            if (!haystack.includes(need)) return false;
          }
          return true;
        }).sort((a, b) =>
          state.sort === 'experience'
            ? (b.yearsExperience ?? 0) - (a.yearsExperience ?? 0)
            : b.readinessScore - a.readinessScore,
        );
      })()
    : [];

  const { providers, unavailable } = previewMode
    ? { providers: previewProviders, unavailable: false }
    : areaIsUnknown
      ? { providers: [], unavailable: false }
      : await searchMarketProviders({
          market: found,
          locations,
          services,
          query: state.query || undefined,
          serviceKey: state.category || undefined,
          areaCode: state.area || undefined,
          acceptingOnly: state.acceptingOnly,
          sort: state.sort as ProviderSort,
        });

  const applied = activeFilterCount(state);
  const selectedService = services.find((service) => service.canonicalKey === state.category);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-14 pb-24">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: found.displayName, href: `/${found.slug}` },
          { label: 'Search' },
        ]}
      />

      <header className="mb-10">
        <p className="eyebrow">Market · {found.code}</p>
        <h1 className="mt-3 mb-4 text-4xl leading-tight font-bold tracking-tight text-ink sm:text-5xl">
          {state.query ? `“${state.query}” in ${found.displayName}` : `Providers in ${found.displayName}`}
        </h1>
        <p className="lede left">
          {selectedService ? `${selectedService.displayName} · ` : ''}
          {selectedArea ? `${selectedArea.name} · ` : ''}
          Matched on the service and area a provider is eligible for, not on a ranked list. Quotes
          are priced in {found.currencyCode}.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-28">
          <MarketFilterPanel
            marketSlug={found.slug}
            marketName={found.displayName}
            services={services}
            locations={locations}
            state={state}
          />
        </aside>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-ink">
              {unavailable
                ? 'Results unavailable'
                : `${providers.length} provider${providers.length === 1 ? '' : 's'}`}
            </h2>
            <p className="text-sm text-muted">
              {applied > 0
                ? `${applied} filter${applied === 1 ? '' : 's'} applied`
                : 'No filters applied'}
            </p>
          </div>

          <div className="mt-5">
            {previewMode ? (
              <div className="notice border-amber-300 bg-secondary-light">
                <strong>Preview mode — sample cards, not real providers.</strong> This flag
                ({' '}
                <code>?preview=1</code>) only works in development; it renders the card UI from
                sample rows so the layout can be reviewed, and the filters below are applied to
                those rows locally.{' '}
                <Link href={`/${found.slug}/search`}>Show the real (empty) result set</Link>.
              </div>
            ) : null}

            {areaIsUnknown ? (
              <div className="notice">
                <strong>&ldquo;{state.area}&rdquo; is not an area in {found.displayName}.</strong> The
                market&rsquo;s catalog has{' '}
                {locations
                  .filter((location) => location.type !== 'country')
                  .map((location) => location.name)
                  .join(', ')}
                .{' '}
                <Link href={`/${found.slug}/search`} className="underline">
                  Clear the area filter
                </Link>
                .
              </div>
            ) : providers.length === 0 ? (
              <MarketEmptyState
                marketName={found.displayName}
                hasFilters={applied > 0}
                unavailable={unavailable}
              />
            ) : (
              <div className="grid gap-3">
                {providers.map((provider) => (
                  <ProviderResultCard key={provider.slug} provider={provider} sample={previewMode} />
                ))}
              </div>
            )}
          </div>

          <MarketDataNotice className="mt-8" />

          <p className="hint">
            Need something this list does not cover?{' '}
            <Link href="/requests/new">Describe the work</Link> and it becomes a request with an
            itemized scope.
          </p>
        </section>
      </div>
    </div>
  );
}
