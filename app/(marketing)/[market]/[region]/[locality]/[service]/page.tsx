import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, MapPin, Tag } from 'lucide-react';
import type { BreadcrumbItem } from '@/components/ui/Breadcrumbs';
import { LocalPageBody } from '@/components/discovery/LocalServiceSections';
import { MetaChip, TaxonomyHero, TaxonomySkeleton } from '@/components/discovery/TaxonomySections';
import { CTA_AMBER, LINK_ARROW_DARK, PAGE_SHELL } from '@/components/discovery/tokens';
import { getCityHub, getLocalityHub } from '@/features/discovery/data/mock-locations';
import { resolveLocalService } from '@/features/discovery/data/local-service';
import { getPublicRouteDocument } from '@/features/discovery/data/service-taxonomy';

/**
 * Local service discovery — /{market}/{region}/{locality}/{service-plural}
 *
 * e.g. /ng/abuja/gwarinpa/plumbers
 *
 * The deepest public page in the discovery hierarchy, and the only one that answers a
 * where as well as a what. Everything it renders is scoped to one locality on purpose:
 * quoting accuracy depends on the provider being local to the job, so the page's central
 * section is local supply rather than a generic description of the service.
 *
 * THE SEGMENT IS `[service]`, NOT `[service-plural]`. The URL shape the PRD specifies is
 * exactly this, and a dynamic segment's NAME never appears in the URL — the handle is
 * whichever spelling the visitor used ("plumbers"). The name is read only in this file,
 * where the resolver treats the segment as a handle to match against the registry's
 * slug, the service's ordinary-language aliases, and finally its canonical key. Calling
 * the directory `[service-plural]` would assert "the plural trade noun and nothing else"
 * while the resolver behind it deliberately accepts several spellings.
 *
 * `[region]` DOES hold both regions and cities: this catalog has one region row (Niger
 * State) and two city rows (Abuja, Minna), all at the same level of the URL. The
 * directory was renamed from `[city]` for that reason — the old name was wrong about
 * half its own contents, and the router does not care what a segment is called as long
 * as siblings agree on one name.
 *
 * UNKNOWN MARKET, REGION, LOCALITY OR SERVICE → notFound(). Deliberately stricter than
 * the sibling `/{market}/services` and `/{market}/search` routes, which redirect an
 * unknown market to the homepage: this route sits inside the location hub chain, whose
 * own pages already 404 for the same inputs, and a four-segment URL that silently
 * becomes the homepage is a soft-404 a crawler remembers. Nothing is invented to fill a
 * gap — /ng/lagos/ikeja/plumbers 404s because this database has no Lagos, no Ikeja and
 * no route for them, even though the mock hub files beside it do.
 *
 * INDEXABILITY IS A POLICY DECISION, NOT A UI ONE. The page is `index, follow` only when
 * `public_routes.indexability` for THIS locality is `indexable` — a value written by
 * app_private.evaluate_route_indexability from the market's minimum supply and quality
 * thresholds. With no providers published anywhere, every local route evaluates to
 * `insufficient_supply`, so every local page is `noindex, follow` and says why. The
 * gates the PRD lists (supply, uniqueness, usefulness, duplication) are the inputs to
 * that function; this file reports its answer and never overrides it.
 *
 * NO SSG / ISR HERE, and that is a consequence rather than a choice: the header is
 * auth-aware and the Supabase client reads cookies, so the route is dynamically
 * rendered. The performance work that IS available is done instead — a streamed body
 * behind an in-page Suspense boundary, server-rendered with no client JavaScript, and
 * queries that are all indexed lookups.
 */

type Params = Promise<{ market: string; region: string; locality: string; service: string }>;
type SearchParams = Promise<{ preview?: string }>;

/** Dev-only UI preview; dead code in a production bundle. See LocalPageBody. */
function previewEnabled(value: string | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return value === '1' || value === 'true';
}

/** 'leaking-pipe-repair' → 'Leaking pipe repair', for a crumb with no better name. */
function humaniseSegment(segment: string): string {
  const words = segment.replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : segment;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { market, region, locality, service } = await params;

  const resolved = await resolveLocalService(market, region, locality, service);
  // A redirect has no page of its own; an unresolvable combination has no title.
  if (!resolved || resolved.kind === 'redirect') return {};

  const { context } = resolved;
  const document = await getPublicRouteDocument(`${context.canonicalHref}/`);
  const place = `${context.locality.name}, ${context.region.name}`;

  return {
    title: document?.title ?? `${context.service.displayName} in ${place}`,
    description:
      document?.metaDescription ??
      context.service.summary ??
      `${context.service.displayName} providers covering ${place}: what the service includes, how verification and payment work, and how to post a request.`,
    // The registry's path is canonical, emitted WITHOUT a trailing slash because
    // next.config.ts does not set `trailingSlash` — a trailing-slash canonical would
    // point at a URL that 308s.
    alternates: { canonical: context.canonicalHref },
    robots: { index: context.indexable, follow: true },
  };
}

export default async function LocalServicePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market, region, locality, service } = await params;
  const query = await searchParams;
  const preview = previewEnabled(query.preview);

  const resolved = await resolveLocalService(market, region, locality, service);

  // Retired handle: the redirect catalogue is consulted before anything renders, so a
  // URL the platform itself published once keeps working.
  if (resolved?.kind === 'redirect') permanentRedirect(resolved.toPath);
  if (!resolved) notFound();

  const { context } = resolved;

  // The visitor arrived on a handle that is not the registered one (an alias, or the
  // canonical key). Serving it as well would put two live URLs behind one page, so it is
  // moved permanently onto the registered path. Skipped in preview, and skipped when the
  // registry holds no route for this combination — then the requested handle is the only
  // one there is and there is nothing to redirect TO.
  const registeredHandle = context.route?.slug;
  if (
    !preview &&
    registeredHandle &&
    registeredHandle.toLowerCase() !== context.requestedSlug.toLowerCase()
  ) {
    permanentRedirect(context.canonicalHref);
  }

  const marketHub = `/${context.market.slug}`;
  const regionHubPath = `${marketHub}/${context.region.code}`;
  const localityHubPath = `${regionHubPath}/${context.locality.code}`;

  // The hub chain is still served from mock-locations.ts, which knows Abuja, Lagos and
  // Port Harcourt but not Niger State. A breadcrumb whose link 404s is worse than one
  // that is merely not a link, so each ancestor is linked only when its hub route
  // actually resolves (this is the defect the phase-0 audit reported).
  const regionHubExists = Boolean(getCityHub(context.market.slug, context.region.code));
  const localityHubExists = Boolean(
    getLocalityHub(context.market.slug, context.region.code, context.locality.code),
  );

  const document = await getPublicRouteDocument(`${context.canonicalHref}/`);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: context.market.displayName, href: marketHub },
    regionHubExists ? { label: context.region.name, href: regionHubPath } : { label: context.region.name },
    localityHubExists
      ? { label: context.locality.name, href: localityHubPath }
      : { label: context.locality.name },
    {
      label: document ? context.service.displayName : humaniseSegment(context.requestedSlug),
    },
  ];

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={breadcrumbs}
        eyebrow={
          <>
            <Tag aria-hidden="true" className="h-3.5 w-3.5" />
            Local service · {context.market.code}
          </>
        }
        title={
          document?.h1 ??
          `${context.service.displayName} in ${context.locality.name}, ${context.region.name}`
        }
        lede={
          document?.summary ??
          context.service.summary ??
          `What ${context.service.displayName.toLowerCase()} covers in ${context.locality.name}, who is verified to do it here, and how a request is scoped so the quotes you compare are for the same work.`
        }
        chips={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {context.locality.name} · {context.region.name}
            </span>
            {context.category ? <MetaChip>{context.category.displayName}</MetaChip> : null}
          </>
        }
        actions={
          <>
            <Link href="/requests/new" className={CTA_AMBER}>
              Start request in {context.locality.name}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            {/* "Change location" sits at the top because the most likely reason to leave
                this page immediately is that the visitor picked the wrong area. */}
            <Link
              href={localityHubExists ? localityHubPath : `/${context.market.slug}/search`}
              className={LINK_ARROW_DARK}
            >
              Change location
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      <div className={PAGE_SHELL}>
        <Suspense fallback={<TaxonomySkeleton count={2} />}>
          <LocalPageBody context={context} preview={preview} />
        </Suspense>
      </div>
    </div>
  );
}
