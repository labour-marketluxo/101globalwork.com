import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Market, MarketLocation } from '@/features/discovery/data/market-catalog';
import {
  numberOrNull,
  readPublicProjection,
  stringArray,
  text,
} from '@/features/discovery/data/public-projection';

/**
 * The canonical service taxonomy, as a public visitor can read it.
 *
 * THE SHAPE OF THE DATA, AND WHY THIS FILE IS SO DEFENSIVE
 *
 * The platform's taxonomy is canonical in `taxonomy_entities` (kind='service'),
 * with names in `entity_names` and search vocabulary in `entity_synonyms`. None of
 * those three tables can be read by an anonymous visitor — they carry
 * `for select to anon, authenticated using (false)` policies on purpose, because
 * they also hold problems, outcomes, skills and credentials that have not been
 * curated for publication yet.
 *
 * So the public surface is a set of CURATED PROJECTION TABLES, exactly like
 * `public_service_catalog` and `public_location_catalog` before them:
 *
 *   public_service_catalog                  the allowlisted services (pre-existing)
 *   public_service_content_catalog          per-service summary + platform guidance  ┐
 *   public_service_alias_catalog            the words people actually type          │ added by
 *   public_service_route_catalog            slug + indexability per service route   │ the phase-3
 *   public_service_category_catalog         the curated grouping layer              │ taxonomy
 *   public_service_category_member_catalog  category → service membership           │ migration
 *   public_route_redirect_catalog           former path → current path, 301/308     ┘
 *
 * Every read below tolerates those six tables being ABSENT. That is not
 * defensive-programming theatre: this deployment is live and its database is
 * migrated separately, so between "code deployed" and "migration pushed" exists a
 * window in which the projections do not exist. In that window the routes must
 * still render — with their honest "not configured" states — rather than 500.
 * A generic PostgREST error is therefore read as "not present yet", and only a
 * failure of the *service catalog itself* is treated as an outage.
 *
 * WHAT THIS FILE STILL REFUSES TO DO
 *
 * There are no ratings, prices, review counts or lead times here, because none of
 * them exist in the database (see market-catalog.ts and fee-policy.ts). The two
 * numbers this file does report are real and verifiable: how many published
 * providers are eligible for a service (`provider_matching_eligibility`, the same
 * source the search results use), and how many locations the market catalog
 * covers.
 */

export type IndexabilityState =
  | 'indexable'
  | 'noindex_follow'
  | 'canonical_to_parent'
  | 'blocked_private'
  | 'insufficient_content'
  | 'insufficient_supply'
  | 'duplicate';

export type TaxonomyService = {
  serviceEntityId: string;
  canonicalKey: string;
  displayName: string;
  /** URL handle from the route registry. Null until a slug has been curated. */
  slug: string | null;
  /** Plain-language scope of the work. Null until curated — never generated here. */
  summary: string | null;
  /** Platform guidance (how to get a useful quote). Curated content, not claims. */
  guidance: string[];
  /** Alternative phrases the service is known by, projected from entity_synonyms. */
  aliases: string[];
  /** Published providers eligible for this service in this market. Real, and 0 today. */
  providerCount: number;
  /**
   * `indexability_policies.minimum_supply` for this route's market and kind,
   * projected into the public catalogue so a page can state the platform's own
   * threshold instead of asserting a number it made up. Null when no policy is
   * configured, in which case the page makes no claim about indexing at all.
   */
  indexingThreshold: number | null;
  /** Policy-evaluated indexability from the route registry, or null if no route. */
  indexability: IndexabilityState | null;
  languageCode: string;
  /** True when the name is not published in the market's own default language. */
  localeIsFallback: boolean;
  /** Canonical path from the registry, when it exists. */
  canonicalPath: string | null;
};

export type TaxonomyCategory = {
  categoryId: string;
  canonicalKey: string;
  slug: string;
  displayName: string;
  definition: string;
  guidance: string[];
  /** The services curated into this category, in catalog order. */
  services: TaxonomyService[];
  languageCode: string;
  localeIsFallback: boolean;
};

export type ServiceTaxonomy = {
  categories: TaxonomyCategory[];
  /** Every published service in the catalog, categorised or not. */
  services: TaxonomyService[];
  /** Services that belong to no category — the directory still lists them. */
  uncategorised: TaxonomyService[];
  /** False when no category layer has been curated for this market. */
  categoriesConfigured: boolean;
  /** True when the service catalog itself could not be read. An outage, not emptiness. */
  unavailable: boolean;
};

export type TaxonomyResolution =
  /** The segment is a curated category, and everything under it. */
  | { kind: 'category'; category: TaxonomyCategory }
  /** The segment is a service, with its category when it has one. */
  | { kind: 'service'; service: TaxonomyService; category: TaxonomyCategory | null }
  /** The segment used to be a URL. The caller sends a permanent redirect. */
  | { kind: 'redirect'; toPath: string; status: 301 | 308 }
  | null;

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Read one projection, tolerating its absence. The implementation — and the reasoning
 * for warning on anything that is not a missing table — lives in ./public-projection.ts,
 * which every discovery surface now shares.
 */
const readProjection = readPublicProjection;

/**
 * Published providers eligible for each service, market-wide.
 *
 * `provider_matching_eligibility` is the same projection the market search reads,
 * so a number here and the number of search results for the same service cannot
 * disagree. Read failures degrade to an empty map, which makes counts 0 — and 0 is
 * also the true answer today, so the failure is invisible rather than misleading.
 */
async function getProviderCounts(
  supabase: Client,
  locationIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (locationIds.length === 0) return counts;

  try {
    const { data, error } = await supabase
      .from('provider_matching_eligibility')
      .select('provider_id,service_entity_id')
      .eq('is_eligible', true)
      .in('location_id', locationIds);

    if (error) return counts;

    const perService = new Map<string, Set<string>>();
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const serviceId = row.service_entity_id as string | null;
      const providerId = row.provider_id as string | null;
      if (!serviceId || !providerId) continue;
      const set = perService.get(serviceId) ?? new Set<string>();
      set.add(providerId);
      perService.set(serviceId, set);
    }

    for (const [serviceId, providers] of perService) counts.set(serviceId, providers.size);
    return counts;
  } catch {
    return counts;
  }
}

/**
 * The whole taxonomy for one market: categories with their services, plus every
 * service on its own so the directory can show the ones nothing has grouped yet.
 *
 * Wrapped in React's `cache()`: the directory page and its metadata both read it
 * in one request, and the category/service pages read it twice (once to resolve
 * the segment, once to render).
 */
export const getServiceTaxonomy = cache(async function getServiceTaxonomy(
  market: Market,
  locations: MarketLocation[],
): Promise<ServiceTaxonomy> {
  const supabase = await createSupabaseServerClient();

  const servicesResult = await supabase
    .from('public_service_catalog')
    .select('service_entity_id,canonical_key,display_name')
    .order('display_name');

  if (servicesResult.error) {
    return {
      categories: [],
      services: [],
      uncategorised: [],
      categoriesConfigured: false,
      unavailable: true,
    };
  }

  const serviceRows = (servicesResult.data ?? []) as unknown as Record<string, unknown>[];

  const [contentRows, aliasRows, routeRows, memberRows, counts] = await Promise.all([
    readProjection(supabase, 'public_service_content_catalog', 'service_entity_id,summary,guidance,language_code'),
    readProjection(supabase, 'public_service_alias_catalog', 'service_entity_id,language_code,phrase'),
    readProjection(
      supabase,
      'public_service_route_catalog',
      'service_entity_id,slug,canonical_path,indexability,minimum_supply,location_id,language_code',
    ),
    readProjection(
      supabase,
      'public_service_category_member_catalog',
      'category_id,service_entity_id,sort_order',
    ),
    getProviderCounts(supabase, locations.map((location) => location.locationId)),
  ]);

  const marketLanguage = market.languageCode.toLowerCase();

  const contentByService = new Map(contentRows.map((row) => [row.service_entity_id as string, row]));
  // MARKET-LEVEL ROUTES ONLY. The projection also carries location-scoped routes
  // (…/abuja/gwarinpa/plumbers/), and those are a different kind of page: keying this
  // map by service alone would let a locality's handle overwrite the taxonomy's, so
  // the service directory would start linking to a Gwarinpa URL. The local page uses
  // getLocalServiceRoute() instead.
  const routeByService = new Map(
    routeRows
      .filter((row) => row.location_id === null || row.location_id === undefined)
      .map((row) => [row.service_entity_id as string, row]),
  );

  const aliasesByService = new Map<string, string[]>();
  for (const row of aliasRows) {
    const serviceId = row.service_entity_id as string;
    const phrase = row.phrase as string;
    if (!serviceId || !phrase) continue;
    const list = aliasesByService.get(serviceId) ?? [];
    list.push(phrase);
    aliasesByService.set(serviceId, list);
  }

  const services: TaxonomyService[] = serviceRows.map((row) => {
    const serviceEntityId = row.service_entity_id as string;
    const content = contentByService.get(serviceEntityId);
    const route = routeByService.get(serviceEntityId);
    const languageCode = text(content?.language_code) ?? market.languageCode;

    return {
      serviceEntityId,
      canonicalKey: row.canonical_key as string,
      displayName: row.display_name as string,
      slug: text(route?.slug),
      canonicalPath: text(route?.canonical_path),
      summary: text(content?.summary),
      guidance: stringArray(content?.guidance),
      aliases: aliasesByService.get(serviceEntityId) ?? [],
      providerCount: counts.get(serviceEntityId) ?? 0,
      indexingThreshold: numberOrNull(route?.minimum_supply),
      indexability: (text(route?.indexability) as IndexabilityState | null) ?? null,
      languageCode,
      localeIsFallback: languageCode.toLowerCase() !== marketLanguage,
    };
  });

  const servicesById = new Map(services.map((service) => [service.serviceEntityId, service]));

  // Categories are market-scoped when the row names a market, and market-agnostic
  // when it does not — the same rule `indexability_policies` uses.
  const categoryRows = await readProjection(
    supabase,
    'public_service_category_catalog',
    'category_id,market_id,canonical_key,slug,display_name,definition,guidance,language_code,sort_order',
  );

  const categories: TaxonomyCategory[] = categoryRows
    .filter((row) => row.market_id === null || row.market_id === market.marketId)
    .map((row) => {
      const categoryId = row.category_id as string;
      const languageCode = text(row.language_code) ?? market.languageCode;
      const memberServices = memberRows
        .filter((member) => member.category_id === categoryId)
        .map((member) => servicesById.get(member.service_entity_id as string))
        .filter((service): service is TaxonomyService => Boolean(service));

      return {
        categoryId,
        canonicalKey: row.canonical_key as string,
        slug: row.slug as string,
        displayName: row.display_name as string,
        definition: (row.definition as string) ?? '',
        guidance: stringArray(row.guidance),
        services: memberServices,
        languageCode,
        localeIsFallback: languageCode.toLowerCase() !== marketLanguage,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const categorised = new Set(categories.flatMap((category) => category.services.map((s) => s.serviceEntityId)));

  return {
    categories,
    services,
    uncategorised: services.filter((service) => !categorised.has(service.serviceEntityId)),
    categoriesConfigured: categories.length > 0,
    unavailable: false,
  };
});

/**
 * The registry's own SEO document for a service route, when one exists.
 *
 * `public_discovery_documents` is the platform's allowlisted SEO projection — the
 * same table the older /{market}/{city}/{locality}/{service} page reads through
 * lib/discovery/public-page.ts. Taxonomy pages use it for the fields that ARE the
 * page's search identity (title, h1, meta description, summary and the JSON-LD
 * payload) rather than composing them in JSX, because those strings are curation:
 * they belong with the route in the registry, where an operator can change them
 * without a deploy.
 *
 * WHY THIS DUPLICATES public-page.ts RATHER THAN CALLING IT. That helper throws on a
 * read error, which is the right call for a page whose entire content is the
 * document — there is nothing honest left to render. Here the document is an
 * ENHANCEMENT: the taxonomy projections can still render a complete page without
 * it, so a failure degrades to composed copy instead of a 500. Same query, opposite
 * failure policy, which is why it is a separate function rather than a flag.
 */
export type PublicRouteDocument = {
  canonicalPath: string;
  title: string;
  h1: string;
  metaDescription: string | null;
  summary: string | null;
  structuredData: Record<string, unknown> | null;
  indexability: IndexabilityState | null;
};

export const getPublicRouteDocument = cache(async function getPublicRouteDocument(
  canonicalPath: string,
): Promise<PublicRouteDocument | null> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('public_discovery_documents')
      .select('canonical_path,title,h1,meta_description,summary,structured_data,indexability')
      .eq('canonical_path', canonicalPath)
      .eq('is_public', true)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as unknown as Record<string, unknown>;
    return {
      canonicalPath: row.canonical_path as string,
      title: row.title as string,
      h1: row.h1 as string,
      metaDescription: text(row.meta_description),
      summary: text(row.summary),
      structuredData:
        row.structured_data && typeof row.structured_data === 'object'
          ? (row.structured_data as Record<string, unknown>)
          : null,
      indexability: (text(row.indexability) as IndexabilityState | null) ?? null,
    };
  } catch {
    return null;
  }
}
);

/**
 * Paths a retired URL might still be using.
 *
 * The registry writes `canonical_path` WITH a trailing slash (see
 * `/{market}/{city}/{locality}/{service}/`), while Next's links are emitted
 * without one — next.config.ts deliberately does not set `trailingSlash`, so a
 * trailing-slash link costs a 308 on every click. Both spellings therefore have to
 * be looked up, or half the history would be invisible.
 */
function redirectCandidates(marketSlug: string, segment: string): string[] {
  const base = `/${marketSlug.toLowerCase()}/services/${segment}`.toLowerCase();
  return [base, `${base}/`];
}

/**
 * Resolve one `/[market]/services/[slug]` segment.
 *
 * ORDER, and it is a decision rather than an accident:
 *
 *   1. curated category   a category owns its slug; categories are the broader
 *                         grouping, so if a category and a service ever collide the
 *                         category is the one that meant to be at that URL.
 *   2. curated service    the slug from the route registry.
 *   3. redirect history   the slug used to be a route and is now a 301/308. The
 *                         lookup is by PATH, because that is what `route_redirects`
 *                         records — see the migration's note on why a service slug
 *                         is a handle and never an identifier.
 *   4. canonical_key      LAST, and only as a pre-curation fallback: until a slug
 *                         is curated, the canonical key is the only handle a
 *                         service has, and a dead directory is worse than an ugly
 *                         URL that the registry will later redirect.
 *
 * Returns null for anything else, and the caller renders a 404.
 */
export async function resolveTaxonomySegment(
  market: Market,
  locations: MarketLocation[],
  segment: string,
): Promise<TaxonomyResolution> {
  const needle = segment.trim().toLowerCase();
  if (!needle) return null;

  const taxonomy = await getServiceTaxonomy(market, locations);
  if (taxonomy.unavailable) return null;

  const category = taxonomy.categories.find((item) => item.slug.toLowerCase() === needle);
  if (category) return { kind: 'category', category };

  const service = taxonomy.services.find((item) => item.slug?.toLowerCase() === needle);
  if (service) {
    return { kind: 'service', service, category: categoryForService(taxonomy, service) };
  }

  const redirect = await getPermanentRedirect(market.slug, needle);
  if (redirect) return redirect;

  const byKey = taxonomy.services.find((item) => item.canonicalKey.toLowerCase() === needle);
  if (byKey) return { kind: 'service', service: byKey, category: categoryForService(taxonomy, byKey) };

  return null;
}

function categoryForService(
  taxonomy: ServiceTaxonomy,
  service: TaxonomyService,
): TaxonomyCategory | null {
  return (
    taxonomy.categories.find((category) =>
      category.services.some((member) => member.serviceEntityId === service.serviceEntityId),
    ) ?? null
  );
}

/**
 * Look up a retired path in the public projection of `route_redirects`.
 *
 * Only 301 and 308 are honoured, because those are the only statuses the canonical
 * table allows (`check (http_status in (301,308))`) and because a 302 on a retired
 * public URL would tell a crawler to keep asking. Anything else is treated as no
 * redirect at all.
 */
async function getPermanentRedirect(
  marketSlug: string,
  segment: string,
): Promise<{ kind: 'redirect'; toPath: string; status: 301 | 308 } | null> {
  const candidates = redirectCandidates(marketSlug, segment);
  return getPermanentRedirectForPaths(candidates);
}

/**
 * The same retired-path lookup, for any set of candidate paths.
 *
 * Exported because the local discovery page needs it for a FOUR-segment path
 * (/{market}/{region}/{locality}/{service}/) and duplicating the query would mean
 * two places to fix when the projection changes. Callers pass every spelling a
 * retired handle might still be receiving.
 */
export async function getPermanentRedirectForPaths(
  candidates: string[],
): Promise<{ kind: 'redirect'; toPath: string; status: 301 | 308 } | null> {
  if (!candidates.length) return null;

  const supabase = await createSupabaseServerClient();
  const wanted = candidates.map((candidate) => candidate.toLowerCase());
  const rows = await readProjection(supabase, 'public_route_redirect_catalog', 'from_path,to_path,http_status');
  const match = rows.find((row) => wanted.includes(String(row.from_path).toLowerCase()));

  const toPath = text(match?.to_path);
  if (!toPath) return null;

  const status = Number(match?.http_status) === 308 ? 308 : 301;
  return { kind: 'redirect', toPath, status };
}

/**
 * The route the registry holds for one service in one locality.
 *
 * This is the local page's authority for three things: the URL handle (so a URL
 * that uses a different one can be sent to the registered path), the canonical
 * path, and — most importantly — the indexability the platform's own policy engine
 * evaluated for THIS location, which is not the same answer as the market-level
 * route's (it counts eligible providers inside the locality).
 */
export async function getLocalServiceRoute(
  localityId: string,
  serviceEntityId: string,
): Promise<{
  slug: string;
  canonicalPath: string;
  indexability: IndexabilityState | null;
  indexingThreshold: number | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  const rows = await readProjection(
    supabase,
    'public_service_route_catalog',
    'service_entity_id,slug,canonical_path,indexability,minimum_supply,location_id',
  );

  const match = rows.find(
    (row) => row.location_id === localityId && row.service_entity_id === serviceEntityId,
  );
  if (!match) return null;

  return {
    slug: match.slug as string,
    canonicalPath: match.canonical_path as string,
    indexability: (text(match.indexability) as IndexabilityState | null) ?? null,
    indexingThreshold: numberOrNull(match.minimum_supply),
  };
}

/**
 * Where a service's own page lives.
 *
 * The registry path wins whenever it exists; the canonical key is the fallback
 * described in `resolveTaxonomySegment`. Keeping this in one function means every
 * link on the site — directory card, category card, breadcrumb — points at exactly
 * the same URL, which is the whole point of having a registry.
 */
export function serviceHref(marketSlug: string, service: TaxonomyService): string {
  return `/${marketSlug}/services/${service.slug ?? service.canonicalKey}`;
}

export function categoryHref(marketSlug: string, category: TaxonomyCategory): string {
  return `/${marketSlug}/services/${category.slug}`;
}

/**
 * Every catalogue service, with the handle the registry holds for it in ONE locality.
 *
 * The locality hub needs this and cannot use `getLocalServiceRoute` in a loop: that function
 * reads the whole route projection and then filters, so calling it per service would read the
 * same rows N times. This reads once and answers for every service.
 *
 * `handle: null` MEANS THE TRADE HAS NO PAGE HERE, and the hub must respect that — it links
 * the service where the registry has a route and falls back to search where it does not. That
 * is the same rule the mock hubs apply with their `live` flag, except this one is derived from
 * the registry rather than hand-maintained, so it cannot go stale when supply arrives.
 *
 * Indexability rides along per service per locality, because that is the granularity the policy
 * engine evaluates at: one trade in one area can be indexable while the next is not.
 */
export type LocalityServiceLink = {
  service: TaxonomyService;
  /** The registered URL handle for this service in this locality, when one exists. */
  handle: string | null;
  canonicalPath: string | null;
  indexability: IndexabilityState | null;
  indexingThreshold: number | null;
};

export async function getLocalityServiceLinks(
  market: Market,
  locations: MarketLocation[],
  localityId: string,
): Promise<{ links: LocalityServiceLink[]; unavailable: boolean }> {
  const taxonomy = await getServiceTaxonomy(market, locations);
  if (taxonomy.unavailable) return { links: [], unavailable: true };

  const supabase = await createSupabaseServerClient();
  const rows = await readProjection(
    supabase,
    'public_service_route_catalog',
    'service_entity_id,slug,canonical_path,indexability,minimum_supply,location_id',
  );

  const links = taxonomy.services.map((service) => {
    const match = rows.find(
      (row) => row.location_id === localityId && row.service_entity_id === service.serviceEntityId,
    );
    return {
      service,
      handle: text(match?.slug),
      canonicalPath: text(match?.canonical_path),
      indexability: (text(match?.indexability) as IndexabilityState | null) ?? null,
      indexingThreshold: numberOrNull(match?.minimum_supply),
    };
  });

  return { links, unavailable: false };
}
