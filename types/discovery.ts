/**
 * Discovery domain types.
 *
 * These describe the presentation shapes used by the public location hubs
 * (app/(marketing)/[market]/...). They are deliberately separate from
 * `PublicDiscoveryDocument` in lib/discovery/public-page.ts, which remains the
 * server-side projection of a single published canonical route, and from
 * `PublicProviderProfile` in lib/providers/public-profile.ts.
 *
 * The hub pages currently read from the mock dataset in
 * features/discovery/data/mock-locations.ts. When the hub projections land in
 * SQL these types stay as they are and only the data source changes.
 */

/** A service offered within a location, e.g. "Plumbing". */
export type ServiceLink = {
  /** Canonical taxonomy slug — matches the leaf URL segment exactly. */
  slug: string;
  /** Human-readable name. */
  name: string;
  /**
   * Whether a published `public_routes` leaf exists for this service today.
   * Only live services link to a leaf route; everything else routes to /search,
   * so a hub can never send a visitor into a 404 while the catalogue is seeded.
   */
  live: boolean;
};

/** A child location: a city under a country, a locality under a city. */
export type LocationLink = {
  slug: string;
  name: string;
};

/** A compact provider card used in hub previews. */
export type ProviderPreview = {
  slug: string;
  displayName: string;
  headline: string;
  /** Mean rating out of 5. */
  rating: number;
  completedJobs: number;
  verified: boolean;
};

/** A locality hub — the deepest hub, at /[market]/[city]/[locality]. */
export type LocalityHub = {
  slug: string;
  name: string;
  intro: string;
  popularServices: ServiceLink[];
  featuredProviders: ProviderPreview[];
};

/** A city hub, at /[market]/[city]. */
export type CityHub = {
  slug: string;
  name: string;
  intro: string;
  /** Localities within this city. */
  localities: LocalityHub[];
  popularServices: ServiceLink[];
  featuredProviders: ProviderPreview[];
};

/** A country hub, at /[market]. */
export type CountryHub = {
  slug: string;
  name: string;
  /** Short code used for compact labels, e.g. "NG". */
  code: string;
  intro: string;
  /** Cities within this country. */
  cities: CityHub[];
  popularServices: ServiceLink[];
  featuredProviders: ProviderPreview[];
};
