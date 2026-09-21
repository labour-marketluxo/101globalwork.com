import type { Metadata } from 'next';

/**
 * Canonical URL policy — one decision, written down once.
 *
 * THE PROBLEM THIS SOLVES
 *
 * The nested URL shapes make the same content reachable through several paths. A
 * provider profile is at /{market}/providers/{slug} AND at
 * /{market}/{region}/{locality}/{service}/{slug}; a problem is at
 * /{market}/problems/{slug} and at /{market}/{region}/{locality}/{slug}. Left alone,
 * each provider would have one URL per locality it could be listed in, and each problem
 * one per locality plus one per region — near-identical pages competing with each other
 * for the same query, which is the definition of the thin-duplication problem the
 * platform's own indexing gates exist to prevent.
 *
 * THE POLICY
 *
 *   1. An entity has ONE canonical URL: the shortest path that identifies it without
 *      context. A path that adds location is a CONTEXTUAL VARIANT — it renders a real
 *      page for a human (localised heading, localised scope, local supply) and declares
 *      the entity's own URL canonical.
 *
 *   2. A contextual variant is `noindex, follow`. This is not belt-and-braces: a page
 *      whose rel=canonical points at a different URL must not also ask to be indexed,
 *      because the two instructions contradict each other and crawlers resolve the
 *      contradiction inconsistently. `follow` stays on — the links out of the page are
 *      genuine, and the entity's own URL is reachable from it.
 *
 *   3. THE EXCEPTION IS THE SERVICE PAGE, and it is not really an exception: the
 *      location-scoped service page is a different page about the same service in a
 *      different place, not the same page with a different heading. It has its own row in
 *      public_service_route_catalog, its own handle, and its own indexability evaluation
 *      against that locality's supply — so it is canonical for itself, and it is the only
 *      route in this codebase whose indexability comes from the policy engine rather than
 *      from this file. That is why this module has no service case: the answer already
 *      exists, in the database.
 *
 * WHAT THIS FILE IS NOT
 *
 * It is not a redirect table. Contextual variants are served, not redirected — a visitor
 * who arrived at /ng/niger-state/leaking-pipe should get the page they asked for, with
 * Niger State in the heading. Redirects are reserved for RETIRED handles (see
 * public_route_redirect_catalog), where the requested URL no longer names anything.
 */

/**
 * The robots directive for every contextual variant.
 *
 * Spread into a page's metadata rather than retyped, so a new contextual route cannot
 * accidentally ship as `index, follow` while declaring a canonical that points elsewhere.
 */
export const CONTEXTUAL_VARIANT_ROBOTS: Metadata['robots'] = { index: false, follow: true };

/**
 * A registry path in canonical form.
 *
 * `public_routes.canonical_path` is stored with a trailing slash (`/ng/services/plumbing/`)
 * because the registry treats a path as a directory-like key. next.config.ts does not set
 * `trailingSlash`, so the URL a browser actually serves is the one without it — and a
 * canonical tag pointing at a URL that 308s is a canonical tag pointing at a redirect.
 * Every canonical HREF in the app goes through here.
 */
export function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** `/{market}` — the market hub, which always exists once the market resolves. */
export function marketHref(marketSlug: string): string {
  return `/${marketSlug}`;
}

/**
 * The canonical URL of a problem or an outcome: the flat, context-free path.
 *
 * `problems` and `solutions` are the two families the flat routes live under; the third
 * parameter is the entity's own slug, not the handle the visitor typed, so an alias URL
 * canonicalises to the curated slug.
 */
export function intentCanonicalHref(
  marketSlug: string,
  family: 'problems' | 'solutions',
  slug: string,
): string {
  return `/${marketSlug}/${family}/${slug}`;
}

/**
 * The canonical URL of a provider profile inside a market.
 *
 * NOT the global `/providers/{slug}` route — that route exists, predates this work, and
 * is deliberately left alone: changing its canonical tag from inside a market-scoped page
 * would settle a product decision in a code review. The open question is recorded here so
 * it is not rediscovered: one provider currently has two live URLs, `/providers/{slug}`
 * and `/{market}/providers/{slug}`, and both declare themselves canonical. That is a real
 * defect, and it is the platform's to resolve, not this route family's.
 */
export function providerCanonicalHref(marketSlug: string, slug: string): string {
  return `/${marketSlug}/providers/${slug}`;
}

/**
 * The nested provider path, for the contextual route to declare and the flat route to be
 * canonical against. Kept here so both shapes are built from one spelling.
 */
export function nestedProviderHref(
  marketSlug: string,
  regionCode: string,
  localityCode: string,
  serviceHandle: string,
  providerSlug: string,
): string {
  return `/${marketSlug}/${regionCode}/${localityCode}/${serviceHandle}/${providerSlug}`;
}

/**
 * The locality-scoped problem path.
 *
 * Emitted for the breadcrumb and for cross-links, never as a canonical: see the policy
 * above. The handle is the problem's own slug, so the URL this function builds is the one
 * the route resolves without a redirect.
 */
export function localProblemHref(
  marketSlug: string,
  regionCode: string,
  localityCode: string,
  problemSlug: string,
): string {
  return `/${marketSlug}/${regionCode}/${localityCode}/${problemSlug}`;
}

/** The region-scoped outcome path. Contextual variants again — see the policy above. */
export function regionalOutcomeHref(
  marketSlug: string,
  regionCode: string,
  outcomeSlug: string,
): string {
  return `/${marketSlug}/${regionCode}/${outcomeSlug}`;
}
