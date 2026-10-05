import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FlaskConical, MapPin, TriangleAlert } from 'lucide-react';
import {
  MarketDataNotice,
  MarketEmptyState,
  MarketFilterPanel,
  NoticePanel,
  ProviderResultCard,
  activeFilterCount,
  type FilterState,
} from '@/components/discovery/MarketSections';
import { PUBLIC_BAND, PUBLIC_SHELL } from '@/components/discovery/tokens';
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
 *     page opens as one dark block. Its container is `PUBLIC_BAND` — the same
 *     1320px measure the landing sections use, and the width the grid below it
 *     also uses (`PUBLIC_SHELL`), so the query still lines up with the sidebar.
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

/**
 * The count badge on the light canvas. Both variants are the SAME shape — a
 * quiet mono pill — so the row reads as one bar whichever way it lands; only
 * the tone changes. Amber TEXT on white must be amber-800 (#d97706 measures
 * ~3.1:1 and fails AA), so the applied variant keeps amber-800 on amber-100.
 * Labels are written in caps rather than uppercased by a utility: the badge
 * class is now the spec's exact string and carries no `uppercase`.
 */
const COUNT_BADGE_ON =
  'font-mono text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-200/70';
const COUNT_BADGE_OFF =
  'font-mono text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/60';

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
      <section className="w-full bg-primary px-4 pt-8 pb-14 text-white sm:px-6 lg:px-8">
        <div className={PUBLIC_BAND}>
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center">
            <Link href="/" className="font-sans text-sm text-slate-300 underline decoration-slate-500/60 underline-offset-4 transition-colors hover:text-white">
              Home
            </Link>
            <span aria-hidden="true" className="mx-2 text-sm text-slate-500 select-none">
              /
            </span>
            <Link href={`/${found.slug}`} className="font-sans text-sm text-slate-300 underline decoration-slate-500/60 underline-offset-4 transition-colors hover:text-white">
              {found.displayName}
            </Link>
            <span aria-hidden="true" className="mx-2 text-sm text-slate-500 select-none">
              /
            </span>
            <span className="font-sans text-sm text-slate-400">Search</span>
          </nav>

          <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 shadow-none">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono text-[11px] font-bold tracking-wider text-amber-400 uppercase">
              MARKET · {found.code}
            </span>
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

      <div className={PUBLIC_SHELL}>
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
            {/* THE COUNT ROW IS A BAR, NOT A BOX: no wrapping card, no
                `flex-wrap`/`items-end` — one hairline under it and `mb-6`
                before the grid. `m-0` on the h2 cancels the UA margin this
                project has no preflight to reset, which is what used to make
                the row sit low and look boxed in. */}
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200/80 w-full">
              <h2 className="m-0 text-2xl font-bold text-slate-900 tracking-tight">
                {unavailable
                  ? 'Results unavailable'
                  : `${providers.length} provider${providers.length === 1 ? '' : 's'}`}
              </h2>
              <span className={applied > 0 ? COUNT_BADGE_ON : COUNT_BADGE_OFF}>
                {applied > 0
                  ? `${applied} FILTER${applied === 1 ? '' : 'S'} APPLIED`
                  : 'NO FILTERS APPLIED'}
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

            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-500">
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
