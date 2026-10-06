import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, MapPin } from '@/components/ui/icons';
import { AreaQuickLinks, MarketDataNotice, NoticePanel } from '@/components/discovery/MarketSections';
import {
  DirectoryBody,
  PreviewNotice,
  TaxonomyHero,
  TaxonomySearchForm,
  TaxonomySkeleton,
} from '@/components/discovery/TaxonomySections';
import { CARD, CTA_AMBER, LINK_ARROW, PUBLIC_SHELL } from '@/components/discovery/tokens';
import { previewMode } from '@/features/discovery/data/preview-taxonomy';
import {
  getMarket,
  getMarketLocations,
  getMarketServices,
  searchMarketProviders,
} from '@/features/discovery/data/market-catalog';

/**
 * Service directory — /{market}/services
 *
 * The top of the canonical service taxonomy for one market: the curated categories
 * (when any exist), every service in the public catalog, the ordinary-language
 * phrases customers actually use, and the areas requests can be scoped to.
 *
 * WHAT IT IS FOR. Someone who needs work done does not necessarily know the trade
 * term for it. This page is the index that lets them start from a category or from
 * a phrase they would actually say ("leaking pipe repair") and end up on a service
 * page that explains the scope and offers a request. Category and service pages are
 * the two children of this route, and both live under ONE `[slug]` segment — see
 * app/(marketing)/[market]/services/[slug]/page.tsx for why that has to be one
 * segment and not two.
 *
 * UNKNOWN OR UNSUPPORTED MARKET → redirect('/'). The same trade-off this route has
 * always made: a 307 to the homepage is a soft-404 to a crawler, while the sibling
 * hub at /{market} 404s for the same input. Kept as-is rather than quietly changed
 * here; the alternative is one line (notFound()).
 *
 * NO `loading.tsx` ANYWHERE NEAR THIS ROUTE, and that is not an oversight. A
 * route-level loading file creates a Suspense boundary ABOVE the redirect above,
 * which flushes a 200 shell and turns the redirect (and every 404 below it) into a
 * soft-404. The skeleton the brief asks for is therefore rendered by an IN-PAGE
 * `<Suspense>` placed AFTER the guard, which streams identically without being able
 * to swallow it.
 *
 * SEO. Server-rendered from the public catalogs, canonical URL declared, and
 * `index: false` until the market has supply — the rule every hub page in this
 * project follows, and the reason there is no sitemap entry for it. The listing
 * becomes indexable when the platform's own policy says so, not when this file is
 * edited.
 */

type Params = Promise<{ market: string }>;
type SearchParams = Promise<{ preview?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) return {};

  return {
    title: `${found.displayName} — service directory`,
    description: `Every service category in ${found.displayName}, with the ordinary phrases people use for each one. Quotes in this market are priced in ${found.currencyCode}.`,
    alternates: { canonical: `/${found.slug}/services` },
    robots: { index: false, follow: true },
  };
}

export default async function MarketServicesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) redirect('/');

  const query = await searchParams;
  // Dev-only, and null in production: see previewMode() in preview-taxonomy.ts.
  // ?preview=1 shows the seeded taxonomy, ?preview=empty the unconfigured market.
  const preview = previewMode(query.preview);

  const [locations, services] = await Promise.all([
    getMarketLocations(found.marketId),
    getMarketServices(),
  ]);

  // Asked rather than asserted, exactly as before: the page states how many
  // providers this market actually has instead of claiming to have some.
  const { providers, unavailable } = await searchMarketProviders({
    market: found,
    locations,
    services,
  });

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: found.displayName, href: `/${found.slug}` },
          { label: 'Services' },
        ]}
        eyebrow={
          <>
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            Market · {found.code}
          </>
        }
        title={`Service categories in ${found.displayName}`}
        lede={`Browse the canonical service catalog for ${found.displayName}, grouped the way the work is described rather than the way it is invoiced. Every request is scoped the same way for every provider who quotes on it, and quotes here are priced in ${found.currencyCode}.`}
      >
        <TaxonomySearchForm
          marketSlug={found.slug}
          marketName={found.displayName}
          locations={locations}
        />
      </TaxonomyHero>

      <div className={PUBLIC_SHELL}>
        <div className="grid gap-10">
          {preview ? <PreviewNotice clearHref={`/${found.slug}/services`} /> : null}
          {!unavailable && providers.length === 0 ? (
            <NoticePanel tone="slate" title="No providers are published in this market yet.">
              The categories, services and areas below are real catalog rows; the supply behind them
              is not there yet. Nothing is listed for a market the platform cannot fill, because a
              list of unverified names would be worse than an empty list. Posting a request still
              records what you need.
            </NoticePanel>
          ) : null}

          {/* The brief's skeleton, streamed from an in-page boundary placed after
              the redirect guard — see the file header. */}
          <Suspense fallback={<TaxonomySkeleton />}>
            <DirectoryBody
              market={found}
              locations={locations}
              marketSlug={found.slug}
              preview={preview}
            />
          </Suspense>

          <AreaQuickLinks marketSlug={found.slug} locations={locations} />

          <MarketDataNotice />

          {/* The directory's own call to action: a job that spans categories, or one
              the catalog has no row for. Amber, because it is this page's single
              primary action and amber is the CTA colour. */}
          <section
            className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
          >
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Not in the list?</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                A job that spans several trades, or something this catalog has no row for yet. It
                becomes a request with an itemized scope rather than a guess.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/requests/new" className={CTA_AMBER}>
                Start request
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href={`/${found.slug}/search`} className={LINK_ARROW}>
                Search all providers
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <p className="text-sm text-slate-500">
            {locations.filter((location) => location.type !== 'country').length} area
            {locations.filter((location) => location.type !== 'country').length === 1 ? '' : 's'} and{' '}
            {services.length} service{services.length === 1 ? '' : 's'} in this market&rsquo;s
            catalog.
          </p>
        </div>
      </div>
    </div>
  );
}
