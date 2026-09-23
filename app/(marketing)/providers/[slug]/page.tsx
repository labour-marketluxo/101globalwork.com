import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicProfileView from '@/components/providers/PublicProfileView';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import { getPublicProviderProfile } from '@/lib/providers/public-profile';

type Params = Promise<{ slug: string }>;

/**
 * The public provider page.
 *
 * ⚠️ THE BODY IS A SHARED COMPONENT, NOT A COPY. The provider workspace's Preview renders
 * `PublicProfileView` too, from the same projection this page reads, so what a provider is shown as
 * "what customers see" is literally the same code path. Only the metadata differs — this page has to
 * decide indexability, and the preview must never be indexed at all.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProviderProfile(slug);
  if (!profile) return {};
  const serviceArea = [profile.service_name, profile.location_name].filter(Boolean).join(' in ');
  const description = profile.public_description ?? (serviceArea ? `${serviceArea} provider on 101GlobalWork.` : undefined);
  return {
    title: profile.headline ?? profile.service_name ?? 'Service provider',
    description,
    alternates: { canonical: `/providers/${slug}/` },
    robots: { index: profile.readiness_score >= 60, follow: true },
  };
}

export default async function PublicProviderPage({ params }: { params: Params }) {
  const { slug } = await params;
  const profile = await getPublicProviderProfile(slug);
  if (!profile) notFound();

  return (
    <div className={PAGE_SHELL}>
      <PublicProfileView profile={profile} />
    </div>
  );
}
