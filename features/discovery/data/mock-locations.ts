import type {
  CityHub,
  CountryHub,
  LocalityHub,
  ProviderPreview,
  ServiceLink,
} from '@/types/discovery';

/**
 * TEMPORARY mock data backing the public location hubs
 * (app/(marketing)/[country]/[city]/[locality]).
 *
 * WHY THIS EXISTS
 * The hub projections do not exist in SQL yet. `public_routes` currently holds
 * exactly one row — /ng/abuja/gwarinpa/plumbers/ — so there is nothing to query
 * for /ng, /ng/abuja or /ng/abuja/gwarinpa. These hubs are served from this file
 * so the breadcrumb hierarchy can be built and reviewed before the data lands.
 *
 * WHAT IS REAL
 * The `live` flag on each service mirrors the actual state of `public_routes`.
 * Only `plumbers` under Gwarinpa has a published leaf today. That is why every
 * other service chip routes to /search instead of to a leaf route that would
 * 404 — the hub must not invent inventory that does not exist.
 *
 * REPLACE BY
 * Querying the hub projection once it exists. The shapes in @/types/discovery
 * stay unchanged, so the page components should not need editing.
 *
 * Slugs are lowercase and match URL segments exactly. Nothing here — least of
 * all the provider names and ratings — represents real supply.
 */

/** The service catalogue shown on every hub. */
const SERVICE_CATALOGUE: readonly { slug: string; name: string }[] = [
  { slug: 'plumbers', name: 'Plumbing' },
  { slug: 'electricians', name: 'Electrical' },
  { slug: 'air-conditioning', name: 'Air Conditioning' },
  { slug: 'home-cleaning', name: 'Home Cleaning' },
];

/** Build the catalogue with the `live` flag applied for one location. */
function servicesFor(liveSlugs: readonly string[]): ServiceLink[] {
  return SERVICE_CATALOGUE.map((service) => ({
    slug: service.slug,
    name: service.name,
    live: liveSlugs.includes(service.slug),
  }));
}

/**
 * Placeholder providers.
 *
 * Deliberately NOT linked anywhere: /providers/[slug] is served from real data,
 * so pointing a card at a mock slug would 404.
 */
const PROVIDER_POOL: readonly ProviderPreview[] = [
  {
    slug: 'bright-plumb-services',
    displayName: 'Bright Plumb Services',
    headline: 'Emergency leaks, pipework and bathroom fittings',
    rating: 4.9,
    completedJobs: 284,
    verified: true,
  },
  {
    slug: 'crown-electrical-works',
    displayName: 'Crown Electrical Works',
    headline: 'Rewiring, inverters and fault finding',
    rating: 4.8,
    completedJobs: 191,
    verified: true,
  },
  {
    slug: 'harmattan-cooling',
    displayName: 'Harmattan Cooling',
    headline: 'Air conditioning installation, servicing and gas refills',
    rating: 4.7,
    completedJobs: 156,
    verified: true,
  },
  {
    slug: 'gwarinpa-home-care',
    displayName: 'Gwarinpa Home Care',
    headline: 'Deep cleaning for homes and small offices',
    rating: 4.6,
    completedJobs: 98,
    verified: false,
  },
  {
    slug: 'sahel-facilities',
    displayName: 'Sahel Facilities',
    headline: 'Multi-trade maintenance for estates and landlords',
    rating: 4.8,
    completedJobs: 342,
    verified: true,
  },
  {
    slug: 'riverbend-plumbing',
    displayName: 'Riverbend Plumbing',
    headline: 'Water tanks, pumps and drainage',
    rating: 4.5,
    completedJobs: 121,
    verified: false,
  },
  {
    slug: 'zenith-power-systems',
    displayName: 'Zenith Power Systems',
    headline: 'Solar, inverters and backup power',
    rating: 4.9,
    completedJobs: 207,
    verified: true,
  },
];

/** Deterministic window over the pool, so each hub shows a stable, distinct set. */
function previewProviders(offset: number, count: number): ProviderPreview[] {
  const picked: ProviderPreview[] = [];
  for (let i = 0; i < count; i += 1) {
    const provider = PROVIDER_POOL[(offset + i) % PROVIDER_POOL.length];
    if (provider) picked.push(provider);
  }
  return picked;
}

function locality(
  slug: string,
  name: string,
  intro: string,
  liveServices: readonly string[],
  providerOffset: number,
): LocalityHub {
  return {
    slug,
    name,
    intro,
    popularServices: servicesFor(liveServices),
    featuredProviders: previewProviders(providerOffset, 3),
  };
}

/* ------------------------------------------------------------------ Nigeria */

const ABUJA: CityHub = {
  slug: 'abuja',
  name: 'Abuja',
  intro:
    'The capital’s demand is concentrated in serviced estates and mid-rise offices, where response time matters more than headline price.',
  popularServices: servicesFor([]),
  featuredProviders: previewProviders(0, 4),
  localities: [
    locality(
      'gwarinpa',
      'Gwarinpa',
      'Nigeria’s largest planned estate, and the first 101GlobalWork market where plumbing supply and quality thresholds are being measured.',
      ['plumbers'],
      0,
    ),
    locality(
      'maitama',
      'Maitama',
      'Low-density residential streets with a steady flow of fittings, finishing and maintenance work.',
      [],
      1,
    ),
    locality(
      'wuse',
      'Wuse',
      'Commercial and residential mix, with work skewed towards retail fit-outs and repairs.',
      [],
      2,
    ),
  ],
};

const LAGOS: CityHub = {
  slug: 'lagos',
  name: 'Lagos',
  intro:
    'Density and traffic shape everything here. Quote accuracy depends on providers being local to the island or mainland job site.',
  popularServices: servicesFor([]),
  featuredProviders: previewProviders(2, 4),
  localities: [
    locality(
      'ikeja',
      'Ikeja',
      'Mainland hub with a broad mix of residential and light commercial work.',
      [],
      3,
    ),
    locality(
      'lekki',
      'Lekki',
      'Fast-growing corridor where new-build snagging and installations dominate demand.',
      [],
      4,
    ),
    locality(
      'victoria-island',
      'Victoria Island',
      'High-spec commercial premises where compliance and documentation are expected.',
      [],
      5,
    ),
  ],
};

const PORT_HARCOURT: CityHub = {
  slug: 'port-harcourt',
  name: 'Port Harcourt',
  intro:
    'Industrial and residential work overlap, so provider capability is checked more strictly before matching.',
  popularServices: servicesFor([]),
  featuredProviders: previewProviders(4, 4),
  localities: [
    locality(
      'gra',
      'GRA',
      'Established residential district with predictable, scheduled maintenance work.',
      [],
      6,
    ),
    locality(
      'rumuola',
      'Rumuola',
      'Mixed residential area where water and pump failures are the most common jobs.',
      [],
      0,
    ),
    locality(
      'woji',
      'Woji',
      'Growing residential belt on the eastern edge of the city.',
      [],
      1,
    ),
  ],
};

const NIGERIA: CountryHub = {
  slug: 'ng',
  name: 'Nigeria',
  code: 'NG',
  intro:
    '101GlobalWork opens one market at a time. Nigeria is the first, and coverage inside it grows when supply and quality thresholds are met rather than by schedule.',
  popularServices: servicesFor([]),
  featuredProviders: previewProviders(0, 4),
  cities: [ABUJA, LAGOS, PORT_HARCOURT],
};

const COUNTRIES: readonly CountryHub[] = [NIGERIA];

/* ------------------------------------------------------------------ lookups */

/** URL segments are matched case-insensitively, mirroring the leaf route. */
function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function getCountryHub(countrySlug: string): CountryHub | undefined {
  const slug = normalise(countrySlug);
  return COUNTRIES.find((country) => country.slug === slug);
}

export function getCityHub(
  countrySlug: string,
  citySlug: string,
): { country: CountryHub; city: CityHub } | undefined {
  const country = getCountryHub(countrySlug);
  if (!country) return undefined;
  const city = country.cities.find((candidate) => candidate.slug === normalise(citySlug));
  return city ? { country, city } : undefined;
}

export function getLocalityHub(
  countrySlug: string,
  citySlug: string,
  localitySlug: string,
): { country: CountryHub; city: CityHub; locality: LocalityHub } | undefined {
  const found = getCityHub(countrySlug, citySlug);
  if (!found) return undefined;
  const localityMatch = found.city.localities.find(
    (candidate) => candidate.slug === normalise(localitySlug),
  );
  return localityMatch ? { ...found, locality: localityMatch } : undefined;
}
