import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin } from 'lucide-react';
import {
  HubHero,
  IndexabilityNotice,
  ProviderGrid,
  ServiceChips,
} from '@/components/discovery/HubSections';
import { OutcomePageView } from '@/components/discovery/IntentSections';
import { MarketDataNotice, NoticePanel } from '@/components/discovery/MarketSections';
import {
  CARD,
  CTA_AMBER,
  LINK_ARROW,
  PUBLIC_SHELL,
} from '@/components/discovery/tokens';
import { MetaChip, TaxonomyHero } from '@/components/discovery/TaxonomySections';
import {
  CONTEXTUAL_VARIANT_ROBOTS,
  intentCanonicalHref,
} from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
import { resolveOutcome } from '@/features/discovery/data/intent-taxonomy';
import { getMarket, getMarketLocations, type Market } from '@/features/discovery/data/market-catalog';
import { getLocalityHub } from '@/features/discovery/data/mock-locations';
import { regionSegment, resolveLocationChain, type LocationChain } from '@/features/discovery/data/route-segments';
import {
  getLocalityServiceLinks,
  type LocalityServiceLink,
} from '@/features/discovery/data/service-taxonomy';

/**
 * Region-level route — /{market}/{region}/{X}
 *
 * e.g. /ng/niger-state/stop-a-leak  ·  /ng/abuja/gwarinpa
 *
 * TWO PAGE TYPES AT ONE DEPTH, plus a legacy third. Next.js allows a single dynamic name per
 * path level, so a locality hub (…/{region}/{locality}) and a region-scoped outcome
 * (…/{region}/{outcome-slug}) are the same shape to the router — the same constraint the leaf
 * route lives with. What a URL is has to be asked of the catalogue, and the order is
 * deliberate:
 *
 *   1. A REAL LOCALITY. A place page beats an intent page, because if a location row carries
 *      this slug then that is the thing the visitor named; letting a goal page occupy the
 *      path would make the place unreachable at its own URL. It is also the more specific
 *      answer to the more specific question.
 *   2. A REAL REGION plus an outcome slug. The region has to exist for the page to claim
 *      anything about anywhere: /ng/lagos/stop-a-leak is a 404 on purpose, because this
 *      catalogue has no Lagos, and a region-scoped page for a region the platform does not
 *      serve is the most convincing kind of wrong.
 *   3. THE MOCK HUBS, last. They remain for the demo cities the catalogue does not carry
 *      (Lagos, Port Harcourt) and are unchanged. The catalogue wins wherever it has a row, so
 *      a real locality now gets a real page — which is what makes /ng/niger-state/minna work
 *      at the hub level, having worked at the leaf level since the discovery routes landed.
 *
 * `[region]` HOLDS REGIONS AND CITIES, as everywhere else in this hierarchy: the level below
 * the market has one row here called Niger State (typed 'region') and two typed 'city'. The
 * URL does not encode the difference and neither does this file.
 *
 * THE CATALOGUE HUB IS DELIBERATELY PLAIN. It is a navigation page: it lists the trades that
 * have a page in this locality and links them. It does not repeat the providers, the guidance
 * or the price conversation that belong to the trade pages below it, and it does not carry the
 * mock hubs' featured providers — those rows carry ratings and completion counts that no table
 * holds, and they are not reproduced here (see mock-locations.ts's own header).
 *
 * NOINDEX, FOLLOW: a hub is a list of links to pages whose own indexability was evaluated
 * individually, so indexing the list would index a navigation aid rather than an answer.
 */

type Params = Promise<{ market: string; region: string; locality: string }>;

/**
 * The catalogue's own locality hub.
 *
 * A trade is linked to its locality page ONLY when the registry holds a route for that trade in
 * THIS locality; otherwise it links to search with the trade pre-filled. That is the same rule
 * the mock hubs apply with their hand-maintained `live` flag, except this one is derived — so
 * it cannot claim a page that does not exist, and it starts linking the day supply arrives
 * without anyone editing a fixture.
 */
function CatalogueLocalityHub({
  market,
  chain,
  links,
  unavailable,
}: {
  market: Market;
  chain: LocationChain;
  links: LocalityServiceLink[];
  unavailable: boolean;
}) {
  const { region, locality } = chain;
  const registered = links.filter((link) => link.handle !== null);

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={discoveryTrail({
          market,
          region,
          // The locality IS this page, so it is the last crumb: passing it as `locality`
          // as well would print it twice and leave the trail with no current page.
          leaf: locality.name,
        })}
        eyebrow={
          <>
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            Locality · {market.code}
          </>
        }
        title={`Services in ${locality.name}, ${region.name}`}
        lede={`The trades the platform can match in ${locality.name}. Each one opens the ${locality.name} page for that trade, which carries what the work covers and who is verified to do it there.`}
        chips={
          <>
            <MetaChip>
              {registered.length} trade{registered.length === 1 ? '' : 's'} with a page here
            </MetaChip>
            <MetaChip>{links.length} in the catalogue</MetaChip>
          </>
        }
        actions={
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request in {locality.name}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      <div className={PUBLIC_SHELL}>
        <div className="grid gap-12">
          <section aria-labelledby="locality-trades">
            <h2 id="locality-trades" className="text-2xl font-bold tracking-tight text-slate-900">
              Trades in {locality.name}
            </h2>

            {unavailable ? (
              <div className="mt-5">
                <NoticePanel tone="amber">
                  The service catalogue did not respond, so this list cannot be shown right now.
                  Reload in a moment — this says nothing about which trades operate here.
                </NoticePanel>
              </div>
            ) : links.length === 0 ? (
              <div className="mt-5">
                <NoticePanel tone="slate">
                  No service is configured for this market yet, so there is nothing to list here.
                </NoticePanel>
              </div>
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {links.map((link) => (
                  <li key={link.service.serviceEntityId}>
                    <Link
                      href={
                        link.handle
                          ? `/${market.slug}/${region.code}/${locality.code}/${link.handle}`
                          : `/${market.slug}/search?q=${encodeURIComponent(link.service.displayName)}`
                      }
                      className={`${CARD} block p-5 no-underline transition-shadow hover:shadow-md`}
                    >
                      <span className="block text-base font-bold text-slate-900">
                        {link.service.displayName}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                        {link.handle
                          ? `Local page for ${locality.name} — scope, verification and how to post a request.`
                          : `No local page is registered for this trade yet, so this opens a search in ${market.displayName} instead of a page that would not exist.`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-slate-500">
              A trade appears here when the catalogue carries it, not when the platform has
              supply in this area — the count of verified providers lives on each trade page, and
              today it is zero everywhere.
            </p>
          </section>

          <section className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Not sure which trade you need?
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                Describe the problem in your own words. You do not need to know the professional
                terminology, and matching runs on the request rather than on the trade you picked.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/requests/new" className={CTA_AMBER}>
                Post a request
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href={`/${market.slug}/services`} className={LINK_ARROW}>
                All services in {market.displayName}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <MarketDataNotice />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market: marketSlug, region: regionSlug, locality: segment } = await params;

  const market = await getMarket(marketSlug);
  const locations = market ? await getMarketLocations(market.marketId) : [];

  if (market) {
    const chain = resolveLocationChain(locations, regionSlug, segment);
    if (chain) {
      return {
        title: `Services in ${chain.locality.name}, ${chain.region.name} — ${market.displayName}`,
        description: `The trades the platform can match in ${chain.locality.name}, ${chain.region.name}, and a link to each local trade page that exists.`,
        alternates: { canonical: `/${market.slug}/${chain.region.code}/${chain.locality.code}` },
        robots: { index: false, follow: true },
      };
    }

    const region = regionSegment(locations, regionSlug);
    if (region) {
      const resolved = await resolveOutcome(marketSlug, segment, { region, locality: null });
      if (resolved) {
        return {
          title: `${resolved.outcome.displayName} in ${region.name} — ${market.displayName}`,
          description: resolved.outcome.definition,
          // Canonical is the FLAT outcome page: this regional URL is a contextual variant.
          alternates: {
            canonical: intentCanonicalHref(market.slug, 'solutions', resolved.outcome.slug),
          },
          robots: CONTEXTUAL_VARIANT_ROBOTS,
        };
      }
    }
  }

  // The mock hubs, which have no database row to describe them.
  const found = getLocalityHub(marketSlug, regionSlug, segment);
  if (!found) return {};

  const { country: countryHub, city: cityHub, locality: localityHub } = found;
  return {
    title: `${localityHub.name}, ${cityHub.name} — services and providers`,
    description: localityHub.intro,
    alternates: { canonical: `/${countryHub.slug}/${cityHub.slug}/${localityHub.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function RegionLevelPage({ params }: { params: Params }) {
  const { market: marketSlug, region: regionSlug, locality: segment } = await params;

  const market = await getMarket(marketSlug);
  const locations = market ? await getMarketLocations(market.marketId) : [];

  if (market) {
    /* ---------------------------------------- 1. a real locality in the catalogue */
    const chain = resolveLocationChain(locations, regionSlug, segment);
    if (chain) {
      const { links, unavailable } = await getLocalityServiceLinks(
        market,
        locations,
        chain.locality.locationId,
      );
      return (
        <CatalogueLocalityHub
          market={market}
          chain={chain}
          links={links}
          unavailable={unavailable}
        />
      );
    }

    /* ------------------------------------- 2. a real region and an outcome slug */
    const region = regionSegment(locations, regionSlug);
    if (region) {
      const resolved = await resolveOutcome(marketSlug, segment, { region, locality: null });
      if (resolved) {
        return (
          <OutcomePageView
            market={resolved.market}
            outcome={resolved.outcome}
            catalog={resolved.catalog}
            localized={{ region, locality: null, locations }}
            breadcrumbs={discoveryTrail({
              market: resolved.market,
              region,
              // The family label, because there is no /solutions index to link to. It also
              // tells the reader why a goal slug is sitting where a locality usually is.
              family: 'Solutions',
              leaf: resolved.outcome.displayName,
            })}
          />
        );
      }
    }
  }

  /* ------------------------------------------- 3. the mock hubs, unchanged */
  const found = getLocalityHub(marketSlug, regionSlug, segment);
  if (!found) notFound();

  const { country: countryHub, city: cityHub, locality: localityHub } = found;
  const countryPath = `/${countryHub.slug}`;
  const cityPath = `${countryPath}/${cityHub.slug}`;
  const basePath = `${cityPath}/${localityHub.slug}`;

  return (
    <>
      <HubHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: countryHub.name, href: countryPath },
          { label: cityHub.name, href: cityPath },
          { label: localityHub.name },
        ]}
        badge={`LOCALITY · ${localityHub.name}`}
        title={`Services in ${localityHub.name}, ${cityHub.name}`}
        lede={localityHub.intro}
        marketSlug={countryHub.slug}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
        <ServiceChips
          heading={`Services in ${localityHub.name}`}
          description="Pick a service to see local availability and provider detail."
          services={localityHub.popularServices}
          marketSlug={countryHub.slug}
          leafBasePath={basePath}
        />

        <ProviderGrid
          heading={`Providers in ${localityHub.name}`}
          description="A preview of providers building reputation on 101GlobalWork."
          providers={localityHub.featuredProviders}
        />

        <IndexabilityNotice />
      </div>
    </>
  );
}
