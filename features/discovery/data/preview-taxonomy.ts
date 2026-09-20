import type {
  ServiceTaxonomy,
  TaxonomyCategory,
  TaxonomyResolution,
  TaxonomyService,
} from '@/features/discovery/data/service-taxonomy';
import type { Market } from '@/features/discovery/data/market-catalog';

/**
 * ⚠️ SAMPLE DATA FOR THE DEV-ONLY UI PREVIEW. NOT A DATA SOURCE. NEVER IMPORT THIS
 * OUTSIDE THE `?preview=1` BRANCH OF THE /{market}/services ROUTES.
 *
 * WHY THIS FILE EXISTS
 *
 * The taxonomy projection tables ship in
 * supabase/migrations/20260920120000_phase_3_public_service_taxonomy_catalog.sql,
 * and migrations are applied to the database separately from code. Until that
 * migration is pushed, `getServiceTaxonomy` returns an empty, unconfigured
 * taxonomy — which is the correct render, but it means the category card, the
 * service card, the availability chip and the sparse-category treatment cannot be
 * looked at at all.
 *
 * So the routes accept `?preview=1` and render these rows instead of a query. The
 * guard is `process.env.NODE_ENV !== 'production'` (see preview-taxonomy branch in
 * each route), which Next inlines at build time, so in a production bundle this
 * file is dead code: the parameter does nothing on a deployed site.
 *
 * THE CONTENT HERE MIRRORS THE MIGRATION'S SEED, deliberately. The category names,
 * definitions and service summaries are the same strings the migration inserts, so
 * the preview is showing what the real projection will hold rather than a second,
 * divergent design. The ONE exception is `providerCount`: the live market has zero
 * published providers, and a preview in which every availability chip reads the
 * same would not exercise the chip. Two of the services therefore carry a nonzero
 * sample count, which is exactly the kind of invented supply that must never reach
 * the real read path — hence the production guard above.
 *
 * Everything is structurally real: every field exists in the type because every
 * field exists as a public column.
 */

/** The aliases are the real `entity_synonyms` rows, transcribed. */
const PREVIEW_SERVICES: TaxonomyService[] = [
  {
    serviceEntityId: 'preview-plumbing',
    canonicalKey: 'plumbing_residential',
    displayName: 'Plumbing',
    slug: 'plumbing',
    canonicalPath: '/ng/services/plumbing/',
    summary:
      'Plumbing work in homes and small buildings: leaks, taps and mixers, pipework, drainage and fittings.',
    guidance: [
      'Describe the symptom rather than the fix you have in mind.',
      'Ask for an itemized quote, and compare the scope line by line.',
      'Payment is released only after you approve the finished work.',
    ],
    aliases: ['plumber', 'plumbers', 'plumbing repair', 'leaking pipe repair'],
    providerCount: 0,
    indexingThreshold: 3,
    indexability: 'insufficient_supply',
    languageCode: 'en',
    localeIsFallback: false,
  },
  {
    serviceEntityId: 'preview-tailoring',
    canonicalKey: 'tailoring_alterations',
    displayName: 'Tailoring & alterations',
    slug: 'tailoring-alterations',
    canonicalPath: '/ng/services/tailoring-alterations/',
    summary:
      'Alterations and tailoring: garments taken in, let out, hemmed and repaired, plus made-to-measure work.',
    guidance: [
      'Say whether the garment needs to be worn on the day it is collected.',
      'Bring the garment or accurate measurements to the quote, not after it.',
      'Payment is released only after you approve the finished work.',
    ],
    aliases: ['tailor', 'tailoring', 'clothing alterations', 'dressmaking', 'garment alterations'],
    providerCount: 3,
    indexingThreshold: 3,
    indexability: 'insufficient_supply',
    languageCode: 'en',
    localeIsFallback: false,
  },
];

/** A third service with no curated category, so the directory's uncategorised state is visible. */
const PREVIEW_UNCATEGORISED: TaxonomyService[] = [
  {
    serviceEntityId: 'preview-cleaning',
    canonicalKey: 'home_cleaning',
    displayName: 'Home cleaning',
    slug: null,
    canonicalPath: null,
    summary: null,
    guidance: [],
    aliases: [],
    providerCount: 0,
    indexingThreshold: null,
    indexability: null,
    // Published in a language the market does not default to — the state the
    // locale-fallback notice exists for. Sample data, but a real state.
    languageCode: 'pt',
    localeIsFallback: true,
  },
];

const PREVIEW_CATEGORIES: TaxonomyCategory[] = [
  {
    categoryId: 'preview-cat-home',
    canonicalKey: 'home_property_maintenance',
    slug: 'home-property',
    displayName: 'Home & property maintenance',
    definition:
      'Work on the fabric of a building and the services that keep it working — water, fittings and the repairs that follow ordinary wear.',
    guidance: [
      'Describe what is happening, and since when. A symptom narrows the scope faster than a diagnosis.',
      'Agree the scope in writing before work starts; a change is re-approved, never invoiced afterwards.',
      'Identity is checked before a provider can quote on your request.',
    ],
    services: [PREVIEW_SERVICES[0]],
    languageCode: 'en',
    localeIsFallback: false,
  },
  {
    categoryId: 'preview-cat-apparel',
    canonicalKey: 'apparel_alterations',
    slug: 'apparel-alterations',
    displayName: 'Apparel & alterations',
    definition:
      'Making, fitting and repairing clothing and other textile goods, from a hem to a made-to-measure piece.',
    guidance: [
      'Say when you need the garment back — turnaround changes what is possible.',
      'Bring the garment or exact measurements to the quote rather than after it.',
      'Payment is released only after you approve the finished work.',
    ],
    services: [PREVIEW_SERVICES[1]],
    languageCode: 'en',
    localeIsFallback: false,
  },
];

/**
 * `full` renders the seeded taxonomy; `empty` renders the market with no catalog
 * at all, which is the brief's "no configured services" state and is otherwise
 * unreachable while the dev database has two services in it.
 */
export type PreviewMode = 'full' | 'empty';

/**
 * Read the dev-only `?preview=` parameter. Returns null in production, always:
 * `process.env.NODE_ENV` is inlined at build time, so the branch below is dead
 * code in a deployed bundle and the parameter does nothing there.
 */
export function previewMode(value: string | undefined): PreviewMode | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (value === 'empty') return 'empty';
  if (value === '1' || value === 'true' || value === 'full') return 'full';
  return null;
}

const EMPTY_TAXONOMY: ServiceTaxonomy = {
  categories: [],
  services: [],
  uncategorised: [],
  categoriesConfigured: false,
  unavailable: false,
};

/** Shaped like the live read, so the pages take exactly one code path in preview. */
export function previewTaxonomy(market: Market, mode: PreviewMode = 'full'): ServiceTaxonomy {
  if (mode === 'empty') return EMPTY_TAXONOMY;

  // The rows are used VERBATIM. An earlier version rewrote every languageCode to the
  // market default "for consistency", which silently made the locale-fallback state
  // unreachable — the one row that exists to demonstrate it was localised away. The
  // fixture's languages are part of the state being previewed, not decoration.
  const categories = PREVIEW_CATEGORIES;

  return {
    categories,
    services: [...categories.flatMap((category) => category.services), ...PREVIEW_UNCATEGORISED],
    uncategorised: PREVIEW_UNCATEGORISED,
    categoriesConfigured: true,
    unavailable: false,
  };
}

/**
 * Resolution in preview: the same ORDER as the real resolver (category, service,
 * redirect, canonical key), against the fixture instead of the projections. Kept
 * beside the fixture so `?preview=1` exercises the routing logic and not just the
 * markup — a preview that took a different path through the page would hide
 * exactly the bugs it is meant to catch.
 */
export function previewResolveSegment(
  market: Market,
  segment: string,
  mode: PreviewMode = 'full',
): TaxonomyResolution {
  const taxonomy = previewTaxonomy(market, mode);
  const needle = segment.trim().toLowerCase();

  const category = taxonomy.categories.find((item) => item.slug.toLowerCase() === needle);
  if (category) return { kind: 'category', category };

  const service = taxonomy.services.find((item) => item.slug?.toLowerCase() === needle);
  if (service) {
    return {
      kind: 'service',
      service,
      category: taxonomy.categories.find((item) =>
        item.services.some((member) => member.serviceEntityId === service.serviceEntityId),
      ) ?? null,
    };
  }

  // A retired handle, so the redirect branch is reviewable without a database row.
  if (needle === 'plumbing-repair') {
    return { kind: 'redirect', toPath: `/${market.slug}/services/plumbing`, status: 301 };
  }

  const byKey = taxonomy.services.find((item) => item.canonicalKey.toLowerCase() === needle);
  if (byKey) {
    return {
      kind: 'service',
      service: byKey,
      category: taxonomy.categories.find((item) =>
        item.services.some((member) => member.serviceEntityId === byKey.serviceEntityId),
      ) ?? null,
    };
  }

  return null;
}
