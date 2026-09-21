import type { BreadcrumbItem } from '@/components/ui/Breadcrumbs';
import { marketHref } from '@/features/discovery/data/canonical-policy';
import { getCityHub, getLocalityHub } from '@/features/discovery/data/mock-locations';
import type { Market, MarketLocation } from '@/features/discovery/data/market-catalog';

/**
 * The breadcrumb trail for every nested discovery route.
 *
 * WHY IT IS BUILT FROM DATA RATHER THAN TYPED PER ROUTE
 *
 * Five route files now render the same hierarchy with different depths:
 *
 *   /{market}                                            1 crumb below Home
 *   /{market}/problems/{slug}                            3
 *   /{market}/{region}/{outcome-slug}                    4
 *   /{market}/{region}/{locality}/{problem-slug}         5
 *   /{market}/{region}/{locality}/{service}/{provider}   6
 *
 * Typed by hand, the trail becomes the thing that is wrong on exactly one page, and it is
 * the kind of wrong nobody notices — a crumb one level short still looks like a
 * breadcrumb. Built here, each route passes the segments it actually has and the trail is
 * arithmetic.
 *
 * TWO RULES THE BUILDER ENFORCES
 *
 *   A crumb is a LINK ONLY IF ITS PAGE EXISTS. This is the defect the phase-0 audit
 *   reported and it has already bitten twice: the provider profile linked to
 *   /{market}/providers, which has no page, and the leaf route linked to ancestor hubs
 *   that 404 for markets the mock hubs do not carry. A crumb that 404s is worse than a
 *   crumb that is plainly a label, so the href is omitted and Breadcrumbs renders a span.
 *   Only the LAST crumb is marked aria-current="page" — see Breadcrumbs.tsx.
 *
 *   NO IDENTIFIERS, EVER. Every label here comes from a display name (`location.name`,
 *   `market.displayName`, a service display name). Location ids, service entity ids and
 *   provider ids never enter a trail, a link, or the markup around them — a breadcrumb is
 *   a public surface and a uuid in it is a database detail leaked into the DOM.
 */

export type DiscoveryTrailInput = {
  market: Market;
  /** The `[region]` segment's row, when the URL has one. */
  region?: MarketLocation | null;
  /**
   * Whether /{market}/{region} is a real page for this region.
   *
   * Defaults to the mock hub lookup, which is what the region hubs are still served from.
   * A caller that has resolved the region out of the catalogue passes `true` explicitly,
   * because for those rows the database — not the mock — is the authority on whether a
   * page exists.
   */
  regionHub?: boolean;
  /** The `[locality]` segment's row, when the URL has one. */
  locality?: MarketLocation | null;
  /** Whether /{market}/{region}/{locality} is a real page. Defaults to the mock lookup. */
  localityHub?: boolean;
  /**
   * The trade, when the URL names one. `href` is supplied by the caller because only it
   * knows the registry handle for that locality — the one URL that will not redirect.
   */
  service?: { label: string; href?: string } | null;
  /**
   * The route family label, for the flat routes whose second segment IS the family
   * ('Problems', 'Solutions'). Rendered below any location crumbs, never linked: neither
   * family has an index page, and this codebase does not point a crumb at a 404.
   */
  family?: string;
  /** The current page. Never linked: it is the page being read. */
  leaf: string;
};

export function discoveryTrail({
  market,
  region,
  regionHub,
  locality,
  localityHub,
  service,
  family,
  leaf,
}: DiscoveryTrailInput): BreadcrumbItem[] {
  const trail: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: market.displayName, href: marketHref(market.slug) },
  ];

  if (region) {
    const regionPath = `${marketHref(market.slug)}/${region.code}`;
    const linked =
      regionHub ?? Boolean(getCityHub(market.slug, region.code));
    trail.push(linked ? { label: region.name, href: regionPath } : { label: region.name });

    if (locality) {
      const localityPath = `${regionPath}/${locality.code}`;
      const localityLinked =
        localityHub ?? Boolean(getLocalityHub(market.slug, region.code, locality.code));
      trail.push(
        localityLinked ? { label: locality.name, href: localityPath } : { label: locality.name },
      );
    }
  }

  if (family) trail.push({ label: family });

  if (service) {
    trail.push(service.href ? { label: service.label, href: service.href } : { label: service.label });
  }

  trail.push({ label: leaf });
  return trail;
}
