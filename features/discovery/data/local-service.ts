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
import { resolveLocationChain, safeDecode, slugKey } from '@/features/discovery/data/route-segments';

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

/**
 * `slugKey` and `safeDecode` used to live here, and the location chain below was this
 * file's private business. Both moved to route-segments.ts the moment a second route
 * shape needed them: five nested route files now parse the same segments, and a second
 * copy of "what counts as the same slug" is how two URLs for one page appear.
 */

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

/**
 * Supply for an AREA rather than for one service — what the problem and outcome pages
 * need when they are opened with a location in the path.
 *
 * Same source as everything else (provider_matching_eligibility joined to the public
 * profile projection), so a count here and a count on the local service page for the
 * same area cannot disagree.
 *
 * The area code is expanded to its descendants by `locationScopeIds`, which is why a
 * region-scoped page shows providers recorded in its localities too. Narrowing by
 * service is a FILTER over that result rather than a second query, because
 * `searchMarketProviders` takes a single canonical key and a problem may link to more
 * than one service. When the entity links to no service at all, no narrowing happens and
 * the caller is expected to say so on the page — an unfiltered area count presented as
 * "providers for this problem" would be a claim the data does not support.
 */
export const getAreaSupply = cache(async function getAreaSupply(input: {
  market: Market;
  locations: MarketLocation[];
  /** A canonical location code: a locality, a city or a region. */
  areaCode: string;
  /** Display names of the services the page is about. Empty means "do not narrow". */
  serviceNames?: string[];
}): Promise<LocalSupply> {
  const marketServices = await getMarketServices();
  const result = await searchMarketProviders({
    market: input.market,
    locations: input.locations,
    services: marketServices,
    areaCode: input.areaCode,
  });

  if (result.unavailable) return { providers: [], unavailable: true };

  const wanted = new Set((input.serviceNames ?? []).map((name) => name.trim().toLowerCase()));
  if (wanted.size === 0) return result;

  return {
    providers: result.providers.filter((provider) =>
      provider.services.some((name) => wanted.has(name.trim().toLowerCase())),
    ),
    unavailable: false,
  };
});

export type LocalServiceResolution =
  | { kind: 'page'; context: LocalServiceContext }
  /** The requested path is retired. The caller issues a permanent redirect. */
  | { kind: 'redirect'; toPath: string; status: 301 | 308 };

export type LocalLocationContext = {
  market: Market;
  /** The `[region]` segment: a region row or a city row, whichever the catalogue has. */
  region: MarketLocation;
  locality: MarketLocation;
  /** Other localities under the same region — the coverage list. */
  siblings: MarketLocation[];
  /** Every location in the market, so the supply reads can scope themselves. */
  locations: MarketLocation[];
};

/**
 * The location half of a nested discovery URL, and nothing else.
 *
 * Split out of `resolveLocalService` because not every nested route is a service page:
 * /{market}/{region}/{outcome-slug} and the provider profile at the foot of the tree
 * need the same two segment resolutions and none of the service matching, and the
 * provider profile sits UNDER the service leaf, so it would otherwise pay for the
 * service taxonomy read twice.
 *
 * Cached per request, so calling it and then calling `resolveLocalService` — which calls
 * it too — is one location read, not two.
 */
export const resolveLocalLocation = cache(async function resolveLocalLocation(
  marketSlug: string,
  regionSlug: string,
  localitySlug: string,
): Promise<LocalLocationContext | null> {
  const market = await getMarket(marketSlug);
  if (!market) return null;

  const locations = await getMarketLocations(market.marketId);
  const chain = resolveLocationChain(locations, regionSlug, localitySlug);
  if (!chain) return null;

  return {
    market,
    region: chain.region,
    locality: chain.locality,
    siblings: chain.siblings,
    locations,
  };
});

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
  const location = await resolveLocalLocation(marketSlug, regionSlug, localitySlug);
  if (!location) return null;

  const { market, region, locality, siblings, locations } = location;

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
