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
import { getCityHub } from '@/features/discovery/data/mock-locations';

/**
 * City service hub — e.g. /ng/abuja
 *
 * Middle of the public location hierarchy. Lists the localities beneath it and
 * completes the trail Home → Country → City.
 *
 * Server component: no 'use client'. Rendered inside the (marketing) group, so
 * LandingLayout already wraps it.
 */


type Params = Promise<{ country: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { country, city } = await params;
  const found = getCityHub(country, city);
  if (!found) return {};

  return {
    title: `${found.city.name}, ${found.country.name} — services and providers`,
    description: found.city.intro,
    alternates: { canonical: `/${found.country.slug}/${found.city.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function CityHubPage({ params }: { params: Params }) {
  const { country, city } = await params;
  const found = getCityHub(country, city);
  if (!found) notFound();

  const { country: countryHub, city: cityHub } = found;
  const countryPath = `/${countryHub.slug}`;
  const basePath = `${countryPath}/${cityHub.slug}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-14 pb-24">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: countryHub.name, href: countryPath },
          { label: cityHub.name },
        ]}
      />

      <HubHero
        eyebrow="City"
        title={`Services in ${cityHub.name}, ${countryHub.name}`}
        lede={cityHub.intro}
        searchLocation={`${cityHub.name}, ${countryHub.name}`}
      />

      <IndexabilityNotice />

      <LocationGrid
        heading={`Neighbourhoods in ${cityHub.name}`}
        description="Choose a neighbourhood to see which services are available and how well supplied it is."
        items={cityHub.localities.map((item) => ({ slug: item.slug, name: item.name }))}
        basePath={basePath}
      />

      <ServiceChips
        heading="Popular services"
        description="Tell us what needs doing and we will match you with eligible providers."
        services={cityHub.popularServices}
        searchLocation={`${cityHub.name}, ${countryHub.name}`}
      />

      <ProviderGrid
        heading={`Providers near ${cityHub.name}`}
        description="A preview of providers building reputation on 101GlobalWork."
        providers={cityHub.featuredProviders}
      />
    </div>
  );
}
