import type { MarketProvider } from '@/features/discovery/data/market-catalog';

/**
 * ⚠️ SAMPLE DATA FOR THE DEV-ONLY UI PREVIEW. NOT A DATA SOURCE. NEVER IMPORT THIS
 * OUTSIDE THE `?preview=1` BRANCH IN /{market}/search.
 *
 * WHY THIS FILE EXISTS
 *
 * The market search page renders its empty state every single time today, because
 * `provider_public_profiles` and `provider_matching_eligibility` hold zero rows —
 * nothing is published yet. That makes the *result card* impossible to look at, which
 * is a real problem when the card is the thing being reviewed.
 *
 * So the page accepts `?preview=1` and renders these rows instead of a query. The
 * guard is `process.env.NODE_ENV !== 'production'`, which Next inlines at build time,
 * so the branch is dead code in a production bundle: the param does nothing on a
 * deployed site. That is the whole safety argument, and it is why this file must never
 * be wired into the real search path — a sample provider rendered as a result on the
 * public site would be fabricated supply, which is the one thing this codebase
 * refuses to do (see the removed proof-metrics in components/landing, and
 * fee-policy.ts).
 *
 * Names are drawn from the same invented pool the older mock hubs use, so the two
 * previews look like the same product. Every card rendered from this list also
 * carries a SAMPLE chip, and the page shows a banner above them, so a screenshot
 * cannot be mistaken for real inventory.
 *
 * The values below are structurally real — every field exists in the type because
 * every field exists as a public column. Nothing here is a rating: `readinessScore`
 * is the platform's own 0-100 discoverability score.
 */
export const PREVIEW_PROVIDERS: MarketProvider[] = [
  {
    slug: 'bright-plumb-services',
    headline: 'Emergency leaks, pipework and bathroom fittings',
    description:
      'Sample row. Same-day callouts around the city, with the scope written down before any work starts.',
    yearsExperience: 11,
    acceptsNewWork: true,
    verified: true,
    readinessScore: 82,
    trustScore: 74,
    services: ['Plumbing'],
    areas: ['Gwarinpa', 'Abuja'],
  },
  {
    slug: 'riverbend-plumbing',
    headline: 'Water tanks, pumps and drainage',
    description: 'Sample row. Tanks, pumps and drainage, including the parts list up front.',
    yearsExperience: 6,
    acceptsNewWork: true,
    verified: false,
    readinessScore: 61,
    trustScore: 58,
    services: ['Plumbing'],
    areas: ['Minna'],
  },
  {
    slug: 'sahel-facilities',
    headline: 'Multi-trade maintenance for estates and landlords',
    description: 'Sample row. Maintenance across several trades, priced as one itemized scope.',
    yearsExperience: 18,
    acceptsNewWork: false,
    verified: true,
    readinessScore: 90,
    trustScore: 88,
    services: ['Plumbing', 'Tailoring & alterations'],
    areas: ['Gwarinpa', 'Abuja', 'Minna'],
  },
];
