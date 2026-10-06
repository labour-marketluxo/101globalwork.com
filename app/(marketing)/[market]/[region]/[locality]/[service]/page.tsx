import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, MapPin, Tag } from '@/components/ui/icons';
import { ProblemPageView, placeOf, type LocalizedPlace } from '@/components/discovery/IntentSections';
import { LocalPageBody } from '@/components/discovery/LocalServiceSections';
import { MetaChip, TaxonomyHero, TaxonomySkeleton } from '@/components/discovery/TaxonomySections';
import { CTA_AMBER, LINK_ARROW_DARK, PUBLIC_SHELL } from '@/components/discovery/tokens';
import {
  CONTEXTUAL_VARIANT_ROBOTS,
  intentCanonicalHref,
} from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
import {
  resolveLocalLocation,
  resolveLocalService,
  type LocalServiceContext,
} from '@/features/discovery/data/local-service';
import type { Market } from '@/features/discovery/data/market-catalog';
import {
  resolveProblem,
  type IntentCatalog,
  type TaxonomyProblem,
} from '@/features/discovery/data/intent-taxonomy';
import { humaniseSegment } from '@/features/discovery/data/route-segments';
import { previewEnabled } from '@/features/discovery/data/preview-providers';
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
 * THE FINAL SEGMENT SERVES TWO PAGE TYPES, and that is forced rather than chosen. Next.js
 * allows one dynamic name per level, so /…/{locality}/plumbers (a trade) and
 * /…/{locality}/leaking-pipe (a problem) arrive here with an identical shape and only the
 * catalogue can tell them apart — see `resolveLeaf` below. The trade is tried first because
 * it is the common case and because its page carries the supply; a problem is then served
 * through the same page view the flat /{market}/problems/{slug} route renders, with the
 * locality attached. A third shape the brief describes — an outcome under a region — is NOT
 * served here: it belongs to the region-level route, and a locality-level copy of it would
 * add a name substitution and no differentiating content.
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

/**
 * What the final segment turned out to be.
 *
 * THREE OUTCOMES FROM ONE SEGMENT, because the router gives this level exactly one dynamic
 * name. /ng/abuja/gwarinpa/plumbers and /ng/abuja/gwarinpa/leaking-pipe are the same shape as
 * far as Next.js is concerned; only the catalogue can tell them apart. Both the metadata and
 * the page call this, so the two can never disagree about what a URL means.
 */
type LeafResolution =
  | { kind: 'service'; context: LocalServiceContext }
  | { kind: 'redirect'; toPath: string }
  | {
      kind: 'problem';
      market: Market;
      problem: TaxonomyProblem;
      catalog: IntentCatalog;
      localized: LocalizedPlace;
    };

/**
 * Resolve the final segment: a trade handle, a retired path, or a problem.
 *
 * THE ORDER IS THE DESIGN. The service lookup runs first and on its own, so the common case
 * (a trade page) never pays for the intent catalogue. Only a segment that is NOT a service
 * handle — and not a retired one — reaches the problem resolution, and only then is the
 * location chain read a second time (cached, so it is not a second query).
 *
 * Precedence matters when a segment could be both, and it is written down here rather than
 * left to whoever reads the code next: a trade wins. The service resolver matches aliases as
 * well as handles, and a trade page carries the supply, the price guidance and the request
 * flow — the more useful of the two answers. A problem page stays reachable at its own flat
 * URL, so nothing is lost.
 */
async function resolveLeaf(
  market: string,
  region: string,
  locality: string,
  segment: string,
): Promise<LeafResolution | null> {
  const service = await resolveLocalService(market, region, locality, segment);
  if (service) {
    return service.kind === 'redirect'
      ? { kind: 'redirect', toPath: service.toPath }
      : { kind: 'service', context: service.context };
  }

  const location = await resolveLocalLocation(market, region, locality);
  if (!location) return null;

  const problem = await resolveProblem(market, segment, {
    region: location.region,
    locality: location.locality,
  });
  if (!problem) return null;

  return {
    kind: 'problem',
    market: problem.market,
    problem: problem.problem,
    catalog: problem.catalog,
    localized: {
      region: location.region,
      locality: location.locality,
      locations: location.locations,
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { market, region, locality, service } = await params;

  const leaf = await resolveLeaf(market, region, locality, service);
  // A redirect has no page of its own; an unresolvable combination has no title.
  if (!leaf || leaf.kind === 'redirect') return {};

  // A PROBLEM REACHED THROUGH A LOCALITY URL. Its canonical is the FLAT problem page, not
  // this one: this URL is the problem read in one of the localities the market contains, and
  // one flat page plus N locality variants is the duplication the canonical policy exists to
  // prevent. The title still names the place, because that is the page the visitor asked
  // for — a canonical tag is an instruction to crawlers, not to the reader.
  if (leaf.kind === 'problem') {
    return {
      title: `${leaf.problem.displayName} in ${placeOf(leaf.localized)} — ${leaf.market.displayName}`,
      description: leaf.problem.definition,
      alternates: {
        canonical: intentCanonicalHref(leaf.market.slug, 'problems', leaf.problem.slug),
      },
      robots: CONTEXTUAL_VARIANT_ROBOTS,
    };
  }

  const { context } = leaf;
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

export default async function LocalLeafPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market, region, locality, service } = await params;
  const query = await searchParams;
  const preview = previewEnabled(query.preview);

  const leaf = await resolveLeaf(market, region, locality, service);

  // Retired handle: the redirect catalogue is consulted before anything renders, so a URL
  // the platform itself published once keeps working. One catalogue serves both kinds, so a
  // retired problem path resolves here too.
  if (leaf?.kind === 'redirect') permanentRedirect(leaf.toPath);
  if (!leaf) notFound();

  /* --------------------------------------------------- the segment was a problem */

  if (leaf.kind === 'problem') {
    return (
      <ProblemPageView
        market={leaf.market}
        problem={leaf.problem}
        catalog={leaf.catalog}
        localized={leaf.localized}
        breadcrumbs={discoveryTrail({
          market: leaf.market,
          region: leaf.localized.region,
          locality: leaf.localized.locality,
          localityHub: true,
          // The family label explains why a problem slug is sitting where a trade noun is
          // expected. There is no /problems index to link to, so it is a label, not a link.
          family: 'Problems',
          leaf: leaf.problem.displayName,
        })}
      />
    );
  }

  /* --------------------------------------------------- the segment was a service */

  const { context } = leaf;

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

  const localityHubPath = `/${context.market.slug}/${context.region.code}/${context.locality.code}`;

  const document = await getPublicRouteDocument(`${context.canonicalHref}/`);

  return (
    <div className="w-full">
      <TaxonomyHero
        // Ancestor links come from the trail builder, which links a crumb only where a page
        // exists: the region hub is still served from the mock hubs, so `regionHub` is left
        // to its own lookup, while the locality hub is real for every catalogue locality.
        breadcrumbs={discoveryTrail({
          market: context.market,
          region: context.region,
          locality: context.locality,
          localityHub: true,
          leaf: document ? context.service.displayName : humaniseSegment(context.requestedSlug),
        })}
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-slate-200 uppercase">
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
                this page immediately is that the visitor picked the wrong area. The hub page
                for the locality is now a real page for every locality in the catalogue,
                which is why this no longer falls back to search. */}
            <Link href={localityHubPath} className={LINK_ARROW_DARK}>
              Change location
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      <div className={PUBLIC_SHELL}>
        <Suspense fallback={<TaxonomySkeleton count={2} />}>
          <LocalPageBody context={context} preview={preview} />
        </Suspense>
      </div>
    </div>
  );
}
