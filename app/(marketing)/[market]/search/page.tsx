import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FlaskConical, MapPin, TriangleAlert } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  MarketDataNotice,
  MarketEmptyState,
  MarketFilterPanel,
  NoticePanel,
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
 *
 * THE PAGE IS DRESSED AS A CONTINUATION OF THE LANDING PAGE (restyled
 * 2026-09-20). Every visitor reaches a search result from the hero's prompt bar
 * or one of its preset chips, so the first thing they see here has to look like
 * the page they just left: the same deep-teal band, the same mono metadata, the
 * same amber-for-actions rule. Concretely, the band, the callouts and the
 * result cards now use the vocabulary of components/marketing/PageSections.tsx
 * and components/navigation/AuthNav.tsx.
 *
 * Two structural consequences worth stating, because they are the parts that
 * would be "tidied" back by accident:
 *
 *   - The band is FULL-BLEED under the navbar, not a boxed header inside the
 *     content column. The bar is solid teal and the band continues it, so the
 *     page opens as one dark block. Its container is `max-w-7xl`, the width the
 *     grid below it also uses, so the query still lines up with the sidebar.
 *   - The result count moved DOWN into the results column, where "0 providers"
 *     heads the answer rather than competing with the query on the band.
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

/**
 * The band's applied-filter chip. Amber on the deep teal, per this project's
 * amber-on-dark rule (`text-amber-300`, not `text-secondary`, which only clears
 * AA on the hero's very large type). Amber is used here because these chips ARE
 * the status: they are why the list below is short.
 */
const META_CHIP =
  'inline-flex items-center gap-1.5 rounded-full border border-solid border-amber-400/30 bg-amber-400/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-amber-300 uppercase';

/** Result-count badge on the light canvas. Amber text on white must be amber-800. */
const COUNT_BADGE_ON = 'rounded-full bg-secondary-light px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase';
const COUNT_BADGE_OFF = 'rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase';

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
    <div className="w-full">
      {/* ------------------------------------------------------------------
          HERO BAND — the query, on the navbar's own deep teal.

          The bar above is solid teal and this section continues it, so the page
          opens as one dark block and the query reads as a headline rather than
          as a row above a layout. That is the landing hero's construction, and
          it is the reason a visitor arriving from the hero prompt bar does not
          feel the page change dialect underneath them.

          The result COUNT deliberately moved out of here and into the results
          column. On a dark band it competed with the query for the first read,
          and "0 providers" is the answer to the query, not a peer of it.
         ------------------------------------------------------------------ */}
      <section className="relative w-full overflow-hidden bg-primary">
        <div className="pointer-events-none absolute -top-32 -right-16 h-72 w-lg rounded-full bg-secondary/10 blur-[130px]" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Breadcrumbs
            tone="dark"
            className="mb-6"
            items={[
              { label: 'Home', href: '/' },
              { label: found.displayName, href: `/${found.slug}` },
              { label: 'Search' },
            ]}
          />

          <span className="inline-flex items-center gap-2 rounded-full border border-solid border-white/15 bg-white/10 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-amber-300 uppercase">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            Market · {found.code}
          </span>

          <h1 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {state.query
              ? `“${state.query}” in ${found.displayName}`
              : `Providers in ${found.displayName}`}
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Matched on the service and area a provider is eligible for, not on a ranked list.
            Quotes are priced in {found.currencyCode}.
          </p>

          {/* The filters that are currently narrowing the list, restated here so
              reading them does not mean scrolling back to the sidebar. The
              service and area names used to be prefixed onto the lede above;
              chips say the same thing in a form you can scan. */}
          {selectedService || selectedArea || state.acceptingOnly ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {selectedService ? (
                <span className={META_CHIP}>Service · {selectedService.displayName}</span>
              ) : null}
              {selectedArea ? <span className={META_CHIP}>Area · {selectedArea.name}</span> : null}
              {state.acceptingOnly ? <span className={META_CHIP}>Accepting new work</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-28">
            <MarketFilterPanel
              marketSlug={found.slug}
              marketName={found.displayName}
              services={services}
              locations={locations}
              state={state}
            />
          </aside>

          <section className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-solid border-slate-200 pb-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {unavailable
                  ? 'Results unavailable'
                  : `${providers.length} provider${providers.length === 1 ? '' : 's'}`}
              </h2>
              <span className={applied > 0 ? COUNT_BADGE_ON : COUNT_BADGE_OFF}>
                {applied > 0
                  ? `${applied} filter${applied === 1 ? '' : 's'} applied`
                  : 'No filters applied'}
              </span>
            </div>

            {/* `grid gap-5` rather than a stack of `.notice` margins: the preview
                banner and the area banner can both be on screen at once, and
                they should space by the same rule whether one or two render. */}
            <div className="mt-5 grid gap-5">
              {previewMode ? (
                <NoticePanel
                  tone="amber"
                  icon={<FlaskConical className="h-5 w-5" />}
                  title="Preview mode — sample cards, not real providers."
                >
                  This flag (<code>?preview=1</code>) only works in development; it renders the card
                  UI from sample rows so the layout can be reviewed, and the filters are applied to
                  those rows locally.{' '}
                  <Link href={`/${found.slug}/search`}>Show the real (empty) result set</Link>.
                </NoticePanel>
              ) : null}

              {areaIsUnknown ? (
                <NoticePanel
                  tone="amber"
                  icon={<TriangleAlert className="h-5 w-5" />}
                  title={`“${state.area}” is not an area in ${found.displayName}.`}
                >
                  The market&rsquo;s catalog has{' '}
                  {locations
                    .filter((location) => location.type !== 'country')
                    .map((location) => location.name)
                    .join(', ')}
                  . <Link href={`/${found.slug}/search`}>Clear the area filter</Link>.
                </NoticePanel>
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

            <p className="mt-6 text-sm leading-relaxed text-slate-500">
              Need something this list does not cover?{' '}
              <Link
                href="/requests/new"
                className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
              >
                Describe the work
              </Link>{' '}
              and it becomes a request with an itemized scope.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
