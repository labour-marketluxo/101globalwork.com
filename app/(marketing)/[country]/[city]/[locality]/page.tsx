import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  HubHero,
  IndexabilityNotice,
  ProviderGrid,
  ServiceChips,
} from '@/components/discovery/HubSections';
import { getLocalityHub } from '@/features/discovery/data/mock-locations';

/**
 * Locality service hub — e.g. /ng/abuja/gwarinpa
 *
 * Deepest hub, and the immediate parent of the published leaf route. This is the
 * page that was 404'ing and breaking the leaf's breadcrumb trail.
 *
 * Its service chips are the only ones on the hierarchy that link to leaf routes,
 * and only for services where a published `public_routes` row actually exists —
 * everything else routes to /search rather than into a 404.
 *
 * Server component: no 'use client'. Rendered inside the (marketing) group, so
 * LandingLayout already wraps it.
 */


type Params = Promise<{ country: string; city: string; locality: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { country, city, locality } = await params;
  const found = getLocalityHub(country, city, locality);
  if (!found) return {};

  const { country: countryHub, city: cityHub, locality: localityHub } = found;
  return {
    title: `${localityHub.name}, ${cityHub.name} — services and providers`,
    description: localityHub.intro,
    alternates: { canonical: `/${countryHub.slug}/${cityHub.slug}/${localityHub.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function LocalityHubPage({ params }: { params: Params }) {
  const { country, city, locality } = await params;
  const found = getLocalityHub(country, city, locality);
  if (!found) notFound();

  const { country: countryHub, city: cityHub, locality: localityHub } = found;
  const countryPath = `/${countryHub.slug}`;
  const cityPath = `${countryPath}/${cityHub.slug}`;
  const basePath = `${cityPath}/${localityHub.slug}`;
  const searchLocation = `${localityHub.name}, ${cityHub.name}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-14 pb-24">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: countryHub.name, href: countryPath },
          { label: cityHub.name, href: cityPath },
          { label: localityHub.name },
        ]}
      />

      <HubHero
        eyebrow="Locality"
        title={`Services in ${localityHub.name}, ${cityHub.name}`}
        lede={localityHub.intro}
        searchLocation={searchLocation}
      />

      <IndexabilityNotice />

      <ServiceChips
        heading={`Services in ${localityHub.name}`}
        description="Pick a service to see local availability and provider detail."
        services={localityHub.popularServices}
        searchLocation={searchLocation}
        leafBasePath={basePath}
      />

      <ProviderGrid
        heading={`Providers in ${localityHub.name}`}
        description="A preview of providers building reputation on 101GlobalWork."
        providers={localityHub.featuredProviders}
      />
    </div>
  );
}
