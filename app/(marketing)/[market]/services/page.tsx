import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  AreaQuickLinks,
  MarketDataNotice,
  MarketSearchBar,
  ServiceCategoryGrid,
} from '@/components/discovery/MarketSections';
import {
  getMarket,
  getMarketLocations,
  getMarketServices,
  searchMarketProviders,
} from '@/features/discovery/data/market-catalog';

/**
 * Market service directory — /{market}/services
 *
 * The market-scoped sibling of /services. Everything on it is scoped to the market
 * in the URL: the categories are the real `public_service_catalog`, the areas are the
 * real `public_location_catalog` rows for that market, and the currency is the
 * market's own (`default_currency_code`), which is the currency quotes in that market
 * are denominated in.
 *
 * UNKNOWN OR UNSUPPORTED MARKET → redirect('/').
 *
 * The brief asked for a graceful redirect rather than an error page, and there is
 * exactly one market in the catalog today, so anything else is unsupported by
 * definition. The trade-off is written down on purpose: this makes
 * `/{anything}/services` a 307 to the homepage instead of a 404, and a redirect to
 * the homepage is a soft-404 to a crawler. The sibling hub route at `/{market}`
 * still 404s for the same input, so the two disagree today. If the stricter
 * behaviour is wanted, `notFound()` replaces one line here.
 *
 * No `loading.tsx` anywhere near this route: a route-level Suspense boundary flushes
 * the shell with a 200 and would break the redirect above (documented in the repo's
 * own findings, and the reason the existing dynamic routes have none either).
 */

type Params = Promise<{ market: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) return {};

  return {
    title: `${found.displayName} — service categories`,
    description: `Service categories available in ${found.displayName}, with quotes priced in ${found.currencyCode}.`,
    alternates: { canonical: `/${found.slug}/services` },
    // Consistent with /services and every other hub page: useful to a visitor,
    // indexed only once supply and quality thresholds are met.
    robots: { index: false, follow: true },
  };
}

export default async function MarketServicesPage({ params }: { params: Params }) {
  const { market } = await params;
  const found = await getMarket(market);
  if (!found) redirect('/');

  const [locations, services] = await Promise.all([
    getMarketLocations(found.marketId),
    getMarketServices(),
  ]);

  // Asked rather than asserted: the page states how many providers this market
  // actually has instead of claiming to have some.
  const { providers, unavailable } = await searchMarketProviders({
    market: found,
    locations,
    services,
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-14 pb-24">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: found.displayName, href: `/${found.slug}` },
          { label: 'Services' },
        ]}
      />

      <header className="mb-10">
        <p className="eyebrow">Market · {found.code}</p>
        <h1 className="mt-3 mb-4 text-4xl leading-tight font-bold tracking-tight text-ink sm:text-5xl">
          Service categories in {found.displayName}
        </h1>
        <p className="lede left">
          Pick a category to see who can do the work, or describe the job in your own words and we
          will match it against the same scope for every provider. Quotes in this market are priced
          in {found.currencyCode}.
        </p>
        <MarketSearchBar marketSlug={found.slug} marketName={found.displayName} />
      </header>

      <MarketDataNotice />

      {!unavailable && providers.length === 0 ? (
        <div className="notice">
          <strong>No providers are published in this market yet.</strong> The categories and areas
          below are real; searching them will return an empty list until verified providers are
          published for {found.displayName}. Posting a request still records what you need.
        </div>
      ) : null}

      <ServiceCategoryGrid
        marketSlug={found.slug}
        marketName={found.displayName}
        currencyCode={found.currencyCode}
        services={services}
        locations={locations}
      />

      <AreaQuickLinks marketSlug={found.slug} locations={locations} />

      <section className="action-panel">
        <h2 className="text-lg font-bold text-ink">Request a custom service</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Not in the list? Describe what needs doing — a job that spans several trades, or something
          this catalog has no row for yet — and it becomes a request with an itemized scope rather
          than a guess.
        </p>
        <div className="entry-actions mt-4">
          <Link href="/requests/new" className="button-link">
            Request custom service
          </Link>
          <Link href={`/${found.slug}/search`} className="secondary-link">
            Search all providers in {found.displayName}
          </Link>
        </div>
      </section>

      <p className="hint">
        {locations.length} area{locations.length === 1 ? '' : 's'} and {services.length} service
        {services.length === 1 ? '' : 's'} in this market&rsquo;s catalog.
      </p>
    </div>
  );
}
