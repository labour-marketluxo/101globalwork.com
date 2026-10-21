import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Market catalog reads for the public /{market}/services and /{market}/search
 * routes.
 *
 * WHY THIS EXISTS SEPARATELY FROM mock-locations.ts
 *
 * The older location hubs (`/{market}`, `/{market}/{city}`, `…/{locality}`) render
 * from `features/discovery/data/mock-locations.ts`, which is hardcoded and says so.
 * It has to be: the hub projections do not exist in SQL yet. These two routes are
 * different — they are supposed to be *market-scoped and searchable*, so they read
 * the real catalogs instead, and render nothing at all where the data is absent.
 *
 * WHAT IS ACTUALLY IN THE DATABASE (measured against the live project as an ANON
 * visitor, i.e. with RLS applied exactly as a signed-out browser sees it):
 *
 *   public_market_catalog         1 row   NG / Nigeria / NGN
 *   public_location_catalog       5 rows  Nigeria → Abuja → Gwarinpa; Niger State → Minna
 *   public_service_catalog        2 rows  Plumbing, Tailoring & alterations
 *   provider_public_profiles      0 rows
 *   provider_matching_eligibility 0 rows
 *
 * That zero is the single most important fact in this file. Both pages therefore
 * have to be honest about empty inventory: today, a market search returns no
 * providers because none are published, not because the query is broken.
 *
 * WHAT DELIBERATELY DOES NOT APPEAR HERE, AND WHY
 *
 * Ratings, prices, review counts, job counts and availability windows do not exist
 * in this database — there is no reviews table, no price column a public visitor can
 * read, and the only availability signal is a boolean. A filter or a "★ 4.8" badge
 * built on those would be invented, which is the one thing this codebase refuses to
 * do (see the removed proof-metrics in components/landing, and fee-policy.ts). So:
 *
 *   filter / card field            status
 *   -----------------------------  -----------------------------------------------
 *   service category               real  (public_service_catalog)
 *   area / region                  real  (public_location_catalog, incl. descendants)
 *   accepting new work             real  (provider_public_profiles.accepts_new_work)
 *   free-text query                real  (ilike over headline + description; there is
 *                                        no FTS index, so this is a scan — fine at
 *                                        this size, flagged for when it is not)
 *   price range                    DOES NOT EXIST
 *   rating / stars                 DOES NOT EXIST
 *   availability windows           DOES NOT EXIST
 *
 * RLS NOTE, and it is a real one: the policy on `provider_public_profiles` is
 * `for select to anon using (…)`. The GRANT covers anon and authenticated, but with
 * no policy for `authenticated` there is no permissive rule for it, so a SIGNED-IN
 * visitor reads zero rows from this table while a signed-out visitor reads the public
 * ones. The page-level consequence is that search results can differ by session
 * state, which is not intended. Fixing it is a one-line policy change on the
 * database, deliberately not smuggled into a frontend commit.
 */

export type Market = {
  marketId: string;
  /** Lowercased `code` — the URL segment. 'NG' in the catalog, 'ng' in the path. */
  slug: string;
  code: string;
  displayName: string;
  languageCode: string;
  /** ISO 4217. The market's currency, which is what quotes are denominated in. */
  currencyCode: string;
};

export type MarketLocation = {
  locationId: string;
  parentId: string | null;
  /** country | region | city | locality — note the catalog has one level more than the hub routes do. */
  type: string;
  name: string;
  code: string;
};

export type MarketService = {
  serviceEntityId: string;
  canonicalKey: string;
  displayName: string;
};

/** Only the fields a public visitor can actually read. No rating, no price. */
export type MarketProvider = {
  slug: string;
  headline: string | null;
  description: string | null;
  yearsExperience: number | null;
  acceptsNewWork: boolean;
  verified: boolean;
  /** Platform-computed discoverability score. NOT a customer rating, and not a ranking promise. */
  readinessScore: number;
  trustScore: number;
  /** Service and area names this provider is eligible for, resolved from the catalogs. */
  services: string[];
  areas: string[];
};

/** Only the two orderings the public columns can actually support. */
export type ProviderSort = 'readiness' | 'experience';

export type ProviderSearchInput = {
  market: Market;
  /** Every location in the market; used to scope the query and resolve area names. */
  locations: MarketLocation[];
  services: MarketService[];
  query?: string;
  /** canonical_key from public_service_catalog. */
  serviceKey?: string;
  /** canonical_code from public_location_catalog. */
  areaCode?: string;
  acceptingOnly?: boolean;
  sort?: ProviderSort;
};

export type ProviderSearchResult = {
  providers: MarketProvider[];
  /** True when the read failed. The page says so rather than 500ing. */
  unavailable: boolean;
};

/** Case-insensitive lookup by the URL segment. 'ng' → NG / Nigeria / NGN. */
export const getMarket = cache(async function getMarket(slug: string): Promise<Market | null> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('public_market_catalog')
      .select('market_id,code,display_name,default_language_code,default_currency_code')
      .ilike('code', slug)
      .maybeSingle();

    if (error || !data) return null;

    return {
      marketId: data.market_id as string,
      slug: String(data.code).toLowerCase(),
      code: data.code as string,
      displayName: data.display_name as string,
      languageCode: data.default_language_code as string,
      currencyCode: data.default_currency_code as string,
    };
  } catch {
    return null;
  }
});

/**
 * Last-resort market slug for links that must have one.
 *
 * Only reachable when the env override is absent AND the catalog cannot be read —
 * i.e. when the database is unreachable. A hardcoded slug is ugly; a link to
 * `/undefined/search` is worse, and this is the market the seeded catalog carries.
 * The page it points at renders its own unavailable state, so a visitor sees an
 * honest message rather than a broken URL.
 */
const FALLBACK_MARKET_SLUG = 'ng';

/**
 * The market used whenever there is no market in the path: the landing page's search
 * forms, the footer's service links and the `/search` redirect.
 *
 * Resolution order is env override → first row of the live catalog → the constant
 * above, so a second market can be made the default without a code change, and the
 * link targets cannot silently drift from the catalog.
 *
 * Wrapped in React's `cache()`: the footer and the landing hero are rendered in the
 * same request and would otherwise each pay for the same read.
 */
export const getDefaultMarketSlug = cache(async function getDefaultMarketSlug(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_MARKET_SLUG?.trim().toLowerCase();
  if (fromEnv) return fromEnv;

  const supabase = await createSupabaseServerClient();

  try {
    const { data } = await supabase
      .from('public_market_catalog')
      .select('code')
      .order('code')
      .limit(1)
      .maybeSingle();

    if (data?.code) return String(data.code).toLowerCase();
  } catch {
    // fall through to the constant
  }

  return FALLBACK_MARKET_SLUG;
});

export async function getMarketLocations(marketId: string): Promise<MarketLocation[]> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('public_location_catalog')
      .select('location_id,parent_id,location_type,display_name,canonical_code')
      .eq('market_id', marketId);

    if (error || !data) return [];

    return data.map((row) => ({
      locationId: row.location_id as string,
      parentId: (row.parent_id as string | null) ?? null,
      type: row.location_type as string,
      name: row.display_name as string,
      code: (row.canonical_code as string | null) ?? '',
    }));
  } catch {
    return [];
  }
}

/**
 * The service catalog is platform-wide: there is no market-service join table, so
 * every market offers the same list. Said plainly here so that nobody later reads
 * "market services" as evidence of per-market curation that does not exist.
 */
export async function getMarketServices(): Promise<MarketService[]> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('public_service_catalog')
      .select('service_entity_id,canonical_key,display_name')
      .order('display_name');

    if (error || !data) return [];

    return data.map((row) => ({
      serviceEntityId: row.service_entity_id as string,
      canonicalKey: row.canonical_key as string,
      displayName: row.display_name as string,
    }));
  } catch {
    return [];
  }
}

/**
 * A selected area plus everything beneath it, so choosing "Abuja" also matches a
 * provider whose eligible area is "Gwarinpa". The eligibility table stores exact
 * location ids with no ancestry, so the expansion has to happen here.
 */
export function locationScopeIds(locations: MarketLocation[], areaCode?: string): string[] {
  if (!areaCode) return locations.map((location) => location.locationId);

  const root = locations.find((location) => location.code === areaCode);
  if (!root) return [];

  const scope = new Set<string>([root.locationId]);
  let added = true;
  while (added) {
    added = false;
    for (const location of locations) {
      if (location.parentId && scope.has(location.parentId) && !scope.has(location.locationId)) {
        scope.add(location.locationId);
        added = true;
      }
    }
  }

  return [...scope];
}

/**
 * PostgREST splits `.or()` on commas and parentheses, so an unescaped query string
 * can rewrite the filter rather than just fail it. Strip the syntax characters and
 * cap the length; a service description is never 80 characters of punctuation.
 */
function sanitiseQuery(raw: string): string {
  return raw.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80);
}

export async function searchMarketProviders(input: ProviderSearchInput): Promise<ProviderSearchResult> {
  const { market, locations, services, acceptingOnly, sort = 'readiness' } = input;

  const scopeIds = locationScopeIds(locations, input.areaCode);
  if (scopeIds.length === 0) return { providers: [], unavailable: false };

  const serviceFilter = input.serviceKey
    ? services.find((service) => service.canonicalKey === input.serviceKey)?.serviceEntityId
    : undefined;
  // An unknown category is an empty result, not an unfiltered one.
  if (input.serviceKey && !serviceFilter) return { providers: [], unavailable: false };

  const supabase = await createSupabaseServerClient();

  try {
    let eligibility = supabase
      .from('provider_matching_eligibility')
      .select('provider_id,service_entity_id,location_id,eligibility_score')
      .eq('is_eligible', true)
      .in('location_id', scopeIds);

    if (serviceFilter) eligibility = eligibility.eq('service_entity_id', serviceFilter);

    const { data: eligibleRows, error: eligibilityError } = await eligibility;
    if (eligibilityError) return { providers: [], unavailable: true };
    if (!eligibleRows?.length) return { providers: [], unavailable: false };

    const providerIds = [...new Set(eligibleRows.map((row) => row.provider_id as string))];

    let profileQuery = supabase
      .from('provider_public_profiles')
      .select(
        'provider_id,slug,headline,public_description,years_experience,accepts_new_work,verification_summary,readiness_score,trust_score,published_at',
      )
      .in('provider_id', providerIds);

    if (acceptingOnly) profileQuery = profileQuery.eq('accepts_new_work', true);

    // No full-text index exists, so this is a sequential scan over the candidate
    // profiles. Correct at this size; it is written down here because it will not
    // stay correct once there is real supply.
    const query = input.query ? sanitiseQuery(input.query) : '';
    if (query) {
      profileQuery = profileQuery.or(`headline.ilike.%${query}%,public_description.ilike.%${query}%`);
    }

    const { data: profiles, error: profileError } = await profileQuery;
    if (profileError) return { providers: [], unavailable: true };

    const serviceNames = new Map(services.map((service) => [service.serviceEntityId, service.displayName]));
    const areaNames = new Map(locations.map((location) => [location.locationId, location.name]));

    const grouped = new Map<string, { services: Set<string>; areas: Set<string>; score: number }>();
    for (const row of eligibleRows) {
      const id = row.provider_id as string;
      const entry = grouped.get(id) ?? { services: new Set<string>(), areas: new Set<string>(), score: 0 };
      const serviceName = serviceNames.get(row.service_entity_id as string);
      const areaName = areaNames.get(row.location_id as string);
      if (serviceName) entry.services.add(serviceName);
      if (areaName) entry.areas.add(areaName);
      entry.score = Math.max(entry.score, Number(row.eligibility_score ?? 0));
      grouped.set(id, entry);
    }

    const providers: MarketProvider[] = (profiles ?? []).map((row) => {
      const providerId = row.provider_id as string;
      const group = grouped.get(providerId);
      const verification = (row.verification_summary ?? {}) as Record<string, unknown>;

      return {
        slug: row.slug as string,
        headline: (row.headline as string | null) ?? null,
        description: (row.public_description as string | null) ?? null,
        yearsExperience: (row.years_experience as number | null) ?? null,
        acceptsNewWork: Boolean(row.accepts_new_work),
        // The one convention the rest of the app uses for this opaque column.
        verified: Boolean(verification.verified),
        readinessScore: Number(row.readiness_score ?? 0),
        trustScore: Number(row.trust_score ?? 0),
        services: [...(group?.services ?? [])],
        areas: [...(group?.areas ?? [])],
      };
    });

    providers.sort((a, b) => {
      if (sort === 'experience') return (b.yearsExperience ?? 0) - (a.yearsExperience ?? 0);
      return b.readinessScore - a.readinessScore;
    });

    return { providers, unavailable: false };
  } catch {
    return { providers: [], unavailable: true };
  }

  // `market` is part of the input contract for scoping callers, and is used by the
  // pages for copy. Referenced here so a future contributor sees why it is threaded
  // through rather than re-derived: the location ids above already belong to it.
  void market;
}
