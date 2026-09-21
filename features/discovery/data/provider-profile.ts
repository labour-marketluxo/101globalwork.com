import {
  getPublicProviderProfile,
  type PublicProviderProfile,
} from '@/lib/providers/public-profile';
import type { MarketLocation } from '@/features/discovery/data/market-catalog';

/**
 * The provider profile as a page is allowed to read it.
 *
 * TWO LISTS, AND THE DIFFERENCE BETWEEN THEM IS THE POINT
 *
 * `get_public_provider_profile_command` returns thirteen columns. The database allowlist
 * is the security boundary — there is no phone, no email and no street address in that
 * projection, and none can be added to a page by accident because they are not read.
 *
 * But three of those thirteen are IDENTIFIERS: `provider_id`, `service_entity_id` and
 * `location_id`. They are in the projection because the platform needs them — matching a
 * provider to a market, to an area, to a service — and they are what a route uses to
 * decide whether a URL is telling the truth about where a provider works. They are not
 * content, and a public page must never render one: an id in markup is a database detail
 * leaked into the DOM, and it is a leak that happens by accident (a `key=`, a data
 * attribute, an aria-label), not on purpose.
 *
 * So the profile is split at the boundary:
 *
 *   `resolveProviderProfile` returns the view AND the two ids a caller may need to make a
 *   decision. The ids stay in the route.
 *   `ProviderProfileView` is what components accept. It has no id field at all, so a
 *   component cannot render one even by mistake — the type system refuses.
 *
 * A NEW COLUMN IN THE RPC IS NOT AUTOMATICALLY PUBLIC. Adding one requires adding it here
 * and to the view, which is a deliberate second step with a reviewer attached. That is the
 * whole reason this file exists rather than the page reading the row directly.
 */

/** Every field a public page may display. Ids are deliberately absent — see above. */
export const PROVIDER_RENDERABLE_FIELDS = [
  'slug',
  'headline',
  'public_description',
  'years_experience',
  'accepts_new_work',
  'verification_summary',
  'trust_score',
  'readiness_score',
  'service_name',
  'location_name',
] as const;

export type ProviderProfileView = {
  slug: string;
  /**
   * The name a page addresses the provider by. The catalogue has no `display_name`
   * column, so this is the documented fallback chain and it is applied in ONE place —
   * the flat route and the nested route would otherwise disagree about what a provider is
   * called, which is exactly the kind of difference that survives review.
   */
  displayName: string;
  headline: string | null;
  description: string | null;
  yearsExperience: number | null;
  serviceName: string | null;
  /** The locality on record. Never an address: the schema does not hold one. */
  locationName: string | null;
  acceptsNewWork: boolean;
  verified: boolean;
  /** Platform-computed, not a customer rating. See the section that renders it. */
  readinessScore: number;
  trustScore: number;
};

export type ResolvedProviderProfile = {
  /** Safe to pass to any component. Carries no identifiers. */
  view: ProviderProfileView;
  /**
   * Kept out of the view on purpose. `locationId` answers "does this provider work where
   * the URL says?"; `serviceEntityId` answers the same question about the trade.
   */
  locationId: string | null;
  serviceEntityId: string | null;
};

/** The projection, narrowed to the renderable fields. */
export function toProviderProfileView(profile: PublicProviderProfile): ProviderProfileView {
  const headline = typeof profile.headline === 'string' ? profile.headline.trim() : '';
  const serviceName = typeof profile.service_name === 'string' ? profile.service_name.trim() : '';

  return {
    slug: profile.slug,
    displayName: headline || serviceName || 'Service provider',
    headline: headline || null,
    description: profile.public_description ?? null,
    yearsExperience: profile.years_experience ?? null,
    serviceName: serviceName || null,
    locationName: profile.location_name ?? null,
    acceptsNewWork: Boolean(profile.accepts_new_work),
    verified: Boolean(profile.verification_summary?.verified),
    readinessScore: Number(profile.readiness_score ?? 0),
    trustScore: Number(profile.trust_score ?? 0),
  };
}

/**
 * Load a provider profile and confirm it works inside this market.
 *
 * The market guard is passed in as the market's own location rows rather than as an id:
 * membership is `profile.location_id ∈ market locations`, which is the only definition of
 * "serves this market" the schema supports, and it is the check that stops a profile being
 * served under a market it does not work in. The market is part of what the URL asserts.
 *
 * The RPC throws on a read error, which is correct for a page whose entire content is the
 * profile — but a route also has that market guard, and turning an unreadable row into a
 * 404 would blame the provider for the platform's read failure. Hence the try/catch,
 * narrowed to "there is no profile to show".
 *
 * AN EMPTY LOCATION LIST IS NOT "NO MATCH". It means the catalogue could not be read, so
 * membership cannot be established either way, and an unverifiable market claim is not
 * served — the same rule the search page applies when its reads fail. Returning null here
 * makes the caller 404, which is the honest answer to "does this provider work in Lagos?"
 * when the platform cannot currently say.
 */
export async function resolveMarketProviderProfile(
  locations: MarketLocation[],
  slug: string,
): Promise<ResolvedProviderProfile | null> {
  if (!locations.length) return null;

  let profile: PublicProviderProfile | null;
  try {
    profile = await getPublicProviderProfile(slug);
  } catch {
    return null;
  }
  if (!profile) return null;

  const inMarket = locations.some((location) => location.locationId === profile.location_id);
  if (!inMarket) return null;

  return {
    view: toProviderProfileView(profile),
    locationId: profile.location_id ?? null,
    serviceEntityId: profile.service_entity_id ?? null,
  };
}
