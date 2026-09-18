import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  HubHero,
  IndexabilityNotice,
  LocationGrid,
  ProviderGrid,
  ServiceChips,
} from '@/components/discovery/HubSections';
import { getCountryHub } from '@/features/discovery/data/mock-locations';

/**
 * Country service hub — e.g. /ng
 *
 * Top of the public location hierarchy. Previously this URL 404'd, which broke
 * the breadcrumb trail rendered by the leaf route
 * (app/(marketing)/[market]/[city]/[locality]/[service]/page.tsx).
 *
 * Server component: no 'use client'. It renders inside the (marketing) route
 * group, so LandingLayout already wraps it.
 *
 * Unknown countries call notFound(), which matters here — this dynamic segment
 * would otherwise swallow any unmatched single-segment URL and turn a 404 into a
 * fabricated hub.
 */


type Params = Promise<{ market: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market } = await params;
  const hub = getCountryHub(market);
  if (!hub) return {};

  return {
    title: `${hub.name} — services and providers`,
    description: hub.intro,
    // No trailing slash: next.config.ts does not set `trailingSlash`, so a
    // trailing-slash canonical would point at a URL that 308-redirects.
    alternates: { canonical: `/${hub.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function CountryHubPage({ params }: { params: Params }) {
  const { market } = await params;
  const hub = getCountryHub(market);
  if (!hub) notFound();

  const basePath = `/${hub.slug}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-14 pb-24">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: hub.name }]} />

      <HubHero
        eyebrow="Country"
        title={`Find trusted services across ${hub.name}`}
        lede={hub.intro}
        marketSlug={hub.slug}
      />

      <IndexabilityNotice />

      <LocationGrid
        heading={`Cities we cover in ${hub.name}`}
        description="Pick a city to see the neighbourhoods and services available there."
        items={hub.cities.map((city) => ({ slug: city.slug, name: city.name }))}
        basePath={basePath}
      />

      <ServiceChips
        heading="Popular services"
        description="Tell us what needs doing and we will match you with eligible providers."
        services={hub.popularServices}
        marketSlug={hub.slug}
      />

      <ProviderGrid
        heading="Featured providers"
        description="A preview of providers building reputation on 101GlobalWork."
        providers={hub.featuredProviders}
      />
    </div>
  );
}
