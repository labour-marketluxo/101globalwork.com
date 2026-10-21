import type { MarketLocation } from '@/features/discovery/data/market-catalog';

/**
 * Route segment parsing — the one place a URL segment is turned into a catalogue row.
 *
 * WHY THIS FILE EXISTS
 *
 * The platform's public URL shapes overlap on purpose, and Next.js gives us no choice
 * about it: at any one path level, sibling dynamic segments MUST share a name, so
 * /{market}/problems/{slug} and /{market}/{region}/{locality}/{problem-slug} cannot be
 * two directories — the leaf segment of the second is `[service]` as far as the router
 * is concerned, and a `[problem-slug]` sibling would be a hard "different slug names
 * for the same dynamic path" error.
 *
 * The consequence is that a route file can no longer assume what its segment means. It
 * has to ASK. `/[region]` holds a region row in one market and a city row in another
 * (this catalogue has Niger State as a region and Abuja as a city, both one level under
 * Nigeria); `/[service]` holds a trade in one URL and a problem in another. Each of
 * those questions is answered here, once, so four route files cannot drift into four
 * different ideas of what "region" means.
 *
 * WHAT A SEGMENT IS *NOT* USED FOR
 *
 * Nothing here reads `location_type`. The type strings ('country', 'region', 'city',
 * 'locality') are a catalogue detail that the public URL deliberately does not encode —
 * a visitor does not care whether Minna is a city or a locality, only that it is the
 * level below Niger State. Position in the tree (parent_id) is the authority, and it is
 * also what makes the hub chain work when a market adds a level.
 */

/** URL segments are matched case-insensitively and by slug spelling. */
export function slugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Percent-decode a segment, tolerating a malformed escape.
 *
 * `decodeURIComponent('%')` throws, and a route that throws while parsing its own URL
 * returns a 500 for a URL that should simply be a 404. A segment that cannot be decoded
 * is matched as-is and fails to resolve, which is the correct outcome.
 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The market's country row — the parent-less location every chain starts from. */
export function countryOf(locations: MarketLocation[]): MarketLocation | null {
  return locations.find((location) => location.parentId === null) ?? null;
}

/** The child of `parentId` whose code matches a URL segment, or null. */
export function locationBySegment(
  locations: MarketLocation[],
  parentId: string,
  segment: string,
): MarketLocation | null {
  const needle = slugKey(safeDecode(segment));
  if (!needle) return null;
  return (
    locations.find(
      (location) => location.parentId === parentId && slugKey(location.code) === needle,
    ) ?? null
  );
}

/**
 * The `[region]` segment on its own — the level directly below the market.
 *
 * Separate from `resolveLocationChain` because the region-scoped routes
 * (/{market}/{region}/{outcome-slug}) have no locality segment to resolve, and inventing
 * a placeholder locality to reuse the chain would be a lie about the URL.
 */
export function regionSegment(locations: MarketLocation[], segment: string): MarketLocation | null {
  const country = countryOf(locations);
  if (!country) return null;
  return locationBySegment(locations, country.locationId, segment);
}

export type LocationChain = {
  country: MarketLocation;
  region: MarketLocation;
  locality: MarketLocation;
  /** Other localities under the same region — the coverage list. */
  siblings: MarketLocation[];
};

/**
 * Resolve the two location segments together, or null when either is not real.
 *
 * Both must exist and the locality must actually sit under the region: that check is
 * what makes a URL a location page rather than a keyword guess, and it is why
 * /ng/lagos/ikeja/... 404s — not because "Lagos" is an unreasonable thing to search
 * for, but because this catalogue has no such row.
 */
export function resolveLocationChain(
  locations: MarketLocation[],
  regionSlug: string,
  localitySlug: string,
): LocationChain | null {
  const country = countryOf(locations);
  if (!country) return null;

  const region = regionSegment(locations, regionSlug);
  if (!region) return null;

  const locality = locationBySegment(locations, region.locationId, localitySlug);
  if (!locality) return null;

  return {
    country,
    region,
    locality,
    siblings: locations.filter(
      (location) =>
        location.parentId === region.locationId && location.locationId !== locality.locationId,
    ),
  };
}

/** 'Gwarinpa, Abuja' / 'Gwarinpa, Niger State' — the label the pages put on a place. */
export function scopeLabel(region: MarketLocation, locality?: MarketLocation | null): string {
  return locality ? `${locality.name}, ${region.name}` : region.name;
}

/**
 * 'leaking-pipe-repair' → 'Leaking pipe repair', for a segment with no catalogue row.
 *
 * Only ever used for a URL the visitor typed themselves that resolved to a route without
 * a curated name. It never substitutes for a real name — a page that has one uses it.
 */
export function humaniseSegment(segment: string): string {
  const words = safeDecode(segment).replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : segment;
}
