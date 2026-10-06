import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, Boxes, MapPin, Tag } from '@/components/ui/icons';
import { MarketDataNotice } from '@/components/discovery/MarketSections';
import {
  AvailabilityChip,
  CategoryBody,
  MetaChip,
  PreviewNotice,
  ServiceBody,
  TaxonomyHero,
  TaxonomySkeleton,
} from '@/components/discovery/TaxonomySections';
import { CTA_AMBER, PUBLIC_SHELL } from '@/components/discovery/tokens';
import { getMarket, getMarketLocations } from '@/features/discovery/data/market-catalog';
import { previewMode, previewResolveSegment } from '@/features/discovery/data/preview-taxonomy';
import {
  categoryHref,
  getPublicRouteDocument,
  resolveTaxonomySegment,
  serviceHref,
  type TaxonomyResolution,
} from '@/features/discovery/data/service-taxonomy';

/**
 * Service category AND service page — /{market}/services/{slug}
 *
 * WHY ONE ROUTE FILE FOR TWO PAGES
 *
 * The brief asks for `/{market}/services/{category}` and
 * `/{market}/services/{service-slug}`. Next refuses two sibling dynamic segments
 * with different names ("You cannot use different slug names for the same dynamic
 * path"), so the two URL shapes have to be ONE `[slug]` segment, and something has
 * to decide which of the two a given slug means. That decision is
 * `resolveTaxonomySegment`, and its documented order is:
 *
 *   1. a curated category (the broader grouping)
 *   2. a service, by its curated URL handle from the route registry
 *   3. the permanent-redirect history, for a handle that has been retired
 *   4. a service, by canonical key — the pre-curation fallback
 *   5. nothing, and the page 404s
 *
 * SLUGS ARE HANDLES, NOT IDENTIFIERS. The brief is explicit about this and the
 * schema already agrees: `public_routes` holds the mutable slug, `route_redirects`
 * holds what a retired path used to be, and the taxonomy entity id stays the
 * authority. Two consequences are implemented here rather than described:
 *
 *   - If a service is reached by anything other than its registered handle (the
 *     canonical-key fallback), the page PERMANENTLY REDIRECTS to the registered
 *     path. That is what stops two URLs for one service from both being live.
 *   - If a slug is not found at all, the retired-path catalogue is consulted before
 *     the 404 is raised, so a renamed handle keeps working.
 *
 * Next can only issue a 308 from a page (`permanentRedirect`); the catalogue also
 * allows 301. Both are permanent for a GET, which is all these routes serve, so a
 * recorded 301 is served as 308 rather than being ignored. Honouring the exact
 * status would need middleware or a route handler, and the column is kept in the
 * projection because the operator's choice should not be silently dropped by the
 * presentation layer.
 *
 * WHAT IS NOINDEX AND WHY. A service page declares `index: true` only when the
 * route registry's policy evaluation says `indexable` — that value is written by
 * `app_private.evaluate_route_indexability` from the market's own minimum supply
 * and quality thresholds, not by anything in this file. Category pages have no
 * registry row (categories are not taxonomy entities yet, so the enum has no kind
 * for them) and therefore no policy to consult; they stay `noindex, follow` and the
 * page says so rather than pretending the listing is a search result.
 *
 * SKELETONS. Rendered by an in-page `<Suspense>` placed AFTER the guards. A
 * route-level `loading.tsx` would create the boundary above them, flush a 200
 * shell, and turn the redirect and every 404 below it into a soft-404 — the exact
 * bug this project has already measured and written down.
 */

type Params = Promise<{ market: string; slug: string }>;
type SearchParams = Promise<{ preview?: string }>;

/** URL segments arrive percent-encoded; the catalogs are matched case-insensitively. */
function normaliseSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { market, slug } = await params;
  const found = await getMarket(market);
  if (!found) return {};

  const query = await searchParams;
  const preview = previewMode(query.preview);
  const segment = normaliseSegment(slug);

  // Locations are read on BOTH paths. The preview fixture replaces the taxonomy,
  // not the market catalog — the area list is real, needs no migration, and a
  // preview that showed "0 areas" would be reviewing a state that cannot exist.
  const locations = await getMarketLocations(found.marketId);
  const resolved: TaxonomyResolution = preview
    ? previewResolveSegment(found, segment, preview)
    : await resolveTaxonomySegment(found, locations, segment);

  // A redirect has no page of its own, and a missing slug has no title to declare.
  if (!resolved || resolved.kind === 'redirect') return {};

  if (resolved.kind === 'category') {
    return {
      title: `${resolved.category.displayName} in ${found.displayName}`,
      description:
        resolved.category.definition ||
        `Services grouped under ${resolved.category.displayName} in ${found.displayName}.`,
      alternates: { canonical: categoryHref(found.slug, resolved.category) },
      robots: { index: false, follow: true },
    };
  }

  const { service } = resolved;
  // The registry's own SEO document wins when it exists: title, description and
  // the indexing decision are curation, and they belong with the route rather than
  // in this file. Everything falls back to the taxonomy projection when the
  // document is absent (a route registered before its document was written).
  const doc = service.canonicalPath ? await getPublicRouteDocument(service.canonicalPath) : null;
  const indexability = doc?.indexability ?? service.indexability;

  return {
    title: doc?.title ?? `${service.displayName} in ${found.displayName}`,
    description:
      doc?.metaDescription ??
      service.summary ??
      `${service.displayName} in ${found.displayName}: what the service covers, how verification and payment work, and how to post a request.`,
    // The registry's path is the canonical one; `serviceHref` is the same value
    // with the trailing slash removed, because next.config.ts does not set
    // `trailingSlash` and a canonical that 308s is a canonical that points at a hop.
    alternates: {
      canonical: service.canonicalPath
        ? service.canonicalPath.replace(/\/$/, '')
        : serviceHref(found.slug, service),
    },
    // Policy, not opinion: `indexability` is written by
    // app_private.evaluate_route_indexability from the market's own minimum supply
    // and quality thresholds. Anything other than 'indexable' stays out of the
    // index, and the page says why.
    robots: { index: indexability === 'indexable', follow: true },
  };
}

export default async function TaxonomySegmentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market, slug } = await params;
  const found = await getMarket(market);
  if (!found) redirect('/');

  const query = await searchParams;
  const preview = previewMode(query.preview);
  const segment = normaliseSegment(slug);

  const locations = await getMarketLocations(found.marketId);
  const resolved: TaxonomyResolution = preview
    ? previewResolveSegment(found, segment, preview)
    : await resolveTaxonomySegment(found, locations, segment);

  // Step 3 of the resolver's order, and the answer to "what happens when a slug
  // changes": the old path is looked up in the redirect catalogue and sent on.
  if (resolved?.kind === 'redirect') permanentRedirect(resolved.toPath);

  if (!resolved) notFound();

  if (resolved.kind === 'service') {
    // Step 4 reached this service without its registered handle. Serving two live
    // URLs for one service is how duplicate content starts, so the unregistered
    // handle is a permanent redirect to the registered one. Skipped entirely in
    // preview, and skipped when the registry has no handle yet (in which case
    // there is nothing to redirect TO and the fallback URL is the only one).
    const handle = resolved.service.slug;
    if (!preview && handle && handle.toLowerCase() !== segment.toLowerCase()) {
      permanentRedirect(`/${found.slug}/services/${handle}`);
    }

    const { service, category } = resolved;
    const doc = service.canonicalPath ? await getPublicRouteDocument(service.canonicalPath) : null;

    return (
      <div className="w-full">
        <TaxonomyHero
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: found.displayName, href: `/${found.slug}` },
            { label: 'Services', href: `/${found.slug}/services` },
            ...(category ? [{ label: category.displayName, href: categoryHref(found.slug, category) }] : []),
            { label: service.displayName },
          ]}
          eyebrow={
            <>
              <Tag aria-hidden="true" className="h-3.5 w-3.5" />
              Service · {found.code}
            </>
          }
          title={doc?.h1 ?? service.displayName}
          lede={
            doc?.summary ??
            service.summary ??
            `The canonical catalog entry for ${service.displayName} in ${found.displayName}. The scope description has not been published yet — what follows is the platform's process and the state of supply, both of which are real.`
          }
          chips={
            <>
              <AvailabilityChip count={service.providerCount} />
              {category ? (
                <Link
                  href={categoryHref(found.slug, category)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase no-underline transition-colors hover:bg-white/20"
                >
                  <Boxes aria-hidden="true" className="h-3.5 w-3.5" />
                  {category.displayName}
                </Link>
              ) : null}
            </>
          }
          actions={
            // /requests/new is the customer destination; it bounces a signed-out
            // visitor through /auth/sign-in and returns them to the form, which is why
            // this does not link to /auth/sign-in directly.
            <Link href="/requests/new" className={CTA_AMBER}>
              Start request
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          }
        />

        <div className={PUBLIC_SHELL}>
          <div className="grid gap-10">
            {preview ? (
              <PreviewNotice clearHref={`/${found.slug}/services/${service.slug ?? segment}`} />
            ) : null}

            <Suspense fallback={<TaxonomySkeleton count={3} />}>
              <ServiceBody
                market={found}
                locations={locations}
                marketSlug={found.slug}
                service={service}
                category={category}
              />
            </Suspense>

            <MarketDataNotice />
          </div>
        </div>

        {/* Structured data, when the registry publishes a payload for this route.
            Escaped the same way the existing leaf route escapes it: a `</script>`
            inside a JSON string would otherwise close this tag early. */}
        {doc?.structuredData ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(doc.structuredData).replace(/</g, '\\u003c'),
            }}
          />
        ) : null}
      </div>
    );
  }

  const { category } = resolved;

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: found.displayName, href: `/${found.slug}` },
          { label: 'Services', href: `/${found.slug}/services` },
          { label: category.displayName },
        ]}
        eyebrow={
          <>
            <Boxes aria-hidden="true" className="h-3.5 w-3.5" />
            Category · {found.code}
          </>
        }
        title={category.displayName}
        lede={category.definition}
        chips={
          <>
            <MetaChip>
              {category.services.length} service{category.services.length === 1 ? '' : 's'}
            </MetaChip>
            <Link
              href={`/${found.slug}/search`}
              className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase no-underline transition-colors hover:bg-white/20"
            >
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              Search this market
            </Link>
          </>
        }
        actions={
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      <div className={PUBLIC_SHELL}>
        <div className="grid gap-10">
          {preview ? (
            <PreviewNotice clearHref={`/${found.slug}/services/${category.slug}`} />
          ) : null}

          <Suspense fallback={<TaxonomySkeleton />}>
            <CategoryBody
              market={found}
              locations={locations}
              marketSlug={found.slug}
              category={category}
              preview={preview}
            />
          </Suspense>

          <p className="text-sm text-slate-500">
            Not sure this is the right grouping?{' '}
            <Link
              href={`/${found.slug}/services`}
              className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
            >
              Browse every service in {found.displayName}
            </Link>{' '}
            instead, or start from the words you would actually use.
          </p>

          <MarketDataNotice />
        </div>
      </div>
    </div>
  );
}
