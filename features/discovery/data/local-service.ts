import { cache } from 'react';
import {
  getMarket,
  getMarketLocations,
  getMarketServices,
  searchMarketProviders,
  type Market,
  type MarketLocation,
  type MarketProvider,
} from '@/features/discovery/data/market-catalog';
import {
  getLocalServiceRoute,
  getPermanentRedirectForPaths,
  getServiceTaxonomy,
  type IndexabilityState,
  type ServiceTaxonomy,
  type TaxonomyCategory,
  type TaxonomyService,
} from '@/features/discovery/data/service-taxonomy';

/**
 * The local discovery page — /{market}/{region}/{locality}/{service-plural}
 *
 * WHAT THIS RESOLVES, AND WHY IT IS NOT ONE QUERY
 *
 * A URL like /ng/abuja/gwarinpa/plumbers has to answer four questions before a page
 * can be rendered, and each one has a different authority in this schema:
 *
 *   location hierarchy   `public_location_catalog` — region and locality must be real
 *                        rows, and the locality must actually sit under the region.
 *                        Being real is what makes the page a location page rather
 *                        than a keyword guess.
 *   which service        `public_service_catalog` + the taxonomy projections — the URL
 *                        segment is a HANDLE ("plumbers"), not an identifier, so it is
 *                        matched against the route slug, the ordinary-language aliases
 *                        people actually type, and finally the canonical key.
 *   the page's own route `public_service_route_catalog` — the registered slug, the
 *                        canonical path, and the indexability the policy engine
 *                        evaluated FOR THIS LOCALITY.
 *   local supply         `provider_matching_eligibility` — real, and zero today.
 *                        Nothing is inferred from the others: a location page with no
 *                        providers says so.
 *
 * INDEXABILITY IS NOT DECIDED HERE. `route.indexability` is written by
 * app_private.evaluate_route_indexability from the market's own minimum supply and
 * quality thresholds, and it counts eligible providers INSIDE the locality — which is
 * why the local route can be noindex while the market route for the same service also
 * is, or not: they are separate evaluations of separate questions. The page reports
 * the state and explains it; it never overrides it.
 *
 * NO PRICING IS READ HERE, because none is publishable: see features/pricing/fee-policy.ts.
 */

/** URL segments are matched case-insensitively and by slug spelling. */
function slugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type LocalServiceContext = {
  market: Market;
  /** The `[region]` segment. Holds regions AND cities: this market has both. */
  region: MarketLocation;
  locality: MarketLocation;
  /** Other localities under the same region — the coverage list. */
  siblings: MarketLocation[];
  service: TaxonomyService;
  category: TaxonomyCategory | null;
  /** Every location in the market, so the supply read can scope itself. */
  locations: MarketLocation[];
  /** The registry's route for this service in this locality, when one is registered. */
  route: {
    slug: string;
    canonicalPath: string;
    indexability: IndexabilityState | null;
    indexingThreshold: number | null;
  } | null;
  /** Canonical href, without a trailing slash. */
  canonicalHref: string;
  /** The URL segment that was requested, for the "you are not on the handle" redirect. */
  requestedSlug: string;
  /** True only when the platform's policy says so. */
  indexable: boolean;
  taxonomy: ServiceTaxonomy;
};

/**
 * Local supply: the providers a visitor can actually be matched with here.
 *
 * Separate from the resolver because it is the slow read, and the page streams it
 * behind an in-page `<Suspense>` — the identity of the page (is this a real location
 * and service?) has to be settled BEFORE the shell is flushed, or a 404 becomes a
 * soft-404. Same source as the market search results, so the count on this page and
 * the list on the search page cannot disagree.
 */
export type LocalSupply = { providers: MarketProvider[]; unavailable: boolean };

export const getLocalSupply = cache(async function getLocalSupply(
  context: LocalServiceContext,
): Promise<LocalSupply> {
  const marketServices = await getMarketServices();
  return searchMarketProviders({
    market: context.market,
    locations: context.locations,
    services: marketServices,
    serviceKey: context.service.canonicalKey,
    areaCode: context.locality.code,
  });
});

export type LocalServiceResolution =
  | { kind: 'page'; context: LocalServiceContext }
  /** The requested path is retired. The caller issues a permanent redirect. */
  | { kind: 'redirect'; toPath: string; status: 301 | 308 };

/**
 * The location chain, or null when any step is not real.
 *
 * The shape is fixed at three levels under the market — country → region → locality —
 * which is what the URL encodes. This market happens to hold one region row
 * (`niger-state`) and two city rows (`abuja`, `minna`), with `gwarinpa` and `minna`
 * one level below; the resolver therefore accepts a region OR a city in the `[region]`
 * position and any child in the `[locality]` position, and does not care which
 * `location_type` string a row carries. Type strings are a catalog detail the URL
 * should not be encoding.
 */
function resolveLocationChain(
  locations: MarketLocation[],
  regionSlug: string,
  localitySlug: string,
): { region: MarketLocation; locality: MarketLocation; siblings: MarketLocation[] } | null {
  const country = locations.find((location) => location.parentId === null);
  if (!country) return null;

  const regionNeedle = slugKey(safeDecode(regionSlug));
  const localityNeedle = slugKey(safeDecode(localitySlug));

  const region = locations.find(
    (location) =>
      location.parentId === country.locationId && slugKey(location.code) === regionNeedle,
  );
  if (!region) return null;

  const locality = locations.find(
    (location) =>
      location.parentId === region.locationId && slugKey(location.code) === localityNeedle,
  );
  if (!locality) return null;

  return {
    region,
    locality,
    siblings: locations.filter(
      (location) =>
        location.parentId === region.locationId && location.locationId !== locality.locationId,
    ),
  };
}

/**
 * Which service a URL segment means.
 *
 * Order matters and is deliberate: the registry's handle first (it is the URL the
 * platform chose), then the aliases people actually type, then the canonical key as
 * the pre-curation fallback. All three resolve to the same service, so the page can
 * be reached — the redirect below then moves the visitor onto the registered handle,
 * which is what stops two URLs for one service from both being live.
 */
function matchService(taxonomy: ServiceTaxonomy, segment: string): TaxonomyService | null {
  const needle = slugKey(safeDecode(segment));
  if (!needle) return null;

  const bySlug = taxonomy.services.find(
    (service) => service.slug !== null && slugKey(service.slug) === needle,
  );
  if (bySlug) return bySlug;

  const byAlias = taxonomy.services.find((service) =>
    service.aliases.some((alias) => slugKey(alias) === needle),
  );
  if (byAlias) return byAlias;

  return taxonomy.services.find((service) => slugKey(service.canonicalKey) === needle) ?? null;
}

/** Every handle a retired path might be using for this combination. */
function redirectCandidates(marketSlug: string, region: string, locality: string, service: string): string[] {
  const base =
    `/${marketSlug}/${safeDecode(region)}/${safeDecode(locality)}/${safeDecode(service)}`.toLowerCase();
  return [base, `${base}/`];
}

/**
 * Resolve one local page. Cached per request: `generateMetadata` and the page body
 * both call it, and without this they would each pay for every read below.
 *
 * Returns null when the location chain or the service is not real, and the caller
 * renders a 404. That is the point of the route: /ng/lagos/ikeja/plumbers does not
 * 404 because Lagos is a bad keyword — the mock hub files carry a Lagos — it 404s
 * because this database has no Lagos, no Ikeja and no route for them, and inventing
 * supply for a city the platform does not serve is the one thing this codebase
 * refuses to do.
 */
export const resolveLocalService = cache(async function resolveLocalService(
  marketSlug: string,
  regionSlug: string,
  localitySlug: string,
  serviceSlug: string,
): Promise<LocalServiceResolution | null> {
  const market = await getMarket(marketSlug);
  if (!market) return null;

  const locations = await getMarketLocations(market.marketId);
  const chain = resolveLocationChain(locations, regionSlug, localitySlug);
  if (!chain) return null;

  const { region, locality, siblings } = chain;

  // A retired path is answered before anything else is resolved: the handle may name
  // a service this catalog no longer keys at all, and a redirect is a better answer
  // than a 404 for a URL the platform itself used to publish.
  const redirect = await getPermanentRedirectForPaths(
    redirectCandidates(market.slug, regionSlug, localitySlug, serviceSlug),
  );
  if (redirect) return redirect;

  const taxonomy = await getServiceTaxonomy(market, locations);
  if (taxonomy.unavailable) return null;

  const service = matchService(taxonomy, serviceSlug);
  if (!service) return null;

  const category =
    taxonomy.categories.find((item) =>
      item.services.some((member) => member.serviceEntityId === service.serviceEntityId),
    ) ?? null;

  const route = await getLocalServiceRoute(locality.locationId, service.serviceEntityId);

  const canonicalPath =
    route?.canonicalPath ??
    `/${market.slug}/${region.code}/${locality.code}/${service.slug ?? slugKey(service.canonicalKey)}/`;

  return {
    kind: 'page',
    context: {
      market,
      region,
      locality,
      siblings,
      service,
      category,
      locations,
      route,
      canonicalHref: canonicalPath.replace(/\/$/, ''),
      requestedSlug: safeDecode(serviceSlug),
      indexable: route?.indexability === 'indexable',
      taxonomy,
    },
  };
});
