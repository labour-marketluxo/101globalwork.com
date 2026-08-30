import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicProviderProfile } from '@/lib/providers/public-profile';

type Params = Promise<{ slug: string }>;

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

  const verified = Boolean(profile.verification_summary?.verified);
  const requestQuery = profile.service_name ? `?q=${encodeURIComponent(profile.service_name)}` : '';

  return (
    <article className="content-shell">
      <p className="eyebrow">Provider profile</p>
      <h1>{profile.headline ?? profile.service_name ?? 'Service provider'}</h1>
      {profile.public_description ? <p className="lede left">{profile.public_description}</p> : null}

      <section className="profile-facts" aria-label="Provider service and trust information">
        <div><strong>{profile.service_name ?? '—'}</strong><span>Service</span></div>
        <div><strong>{profile.location_name ?? '—'}</strong><span>Serves</span></div>
        <div><strong>{verified ? 'Verified' : 'Not yet verified'}</strong><span>Identity</span></div>
        <div><strong>{profile.accepts_new_work ? 'Available' : 'Unavailable'}</strong><span>New work</span></div>
      </section>

      {profile.years_experience != null ? <p className="hint">Experience: {profile.years_experience} year{profile.years_experience === 1 ? '' : 's'}.</p> : null}

      <section className="action-panel">
        <h2>Need this kind of work?</h2>
        <p>Start with what you need done. 101GlobalWork will check the request against the provider’s accepted service area and the marketplace eligibility rules before any hire.</p>
        <Link className="button-link" href={`/requests/new${requestQuery}`}>Start a request</Link>
      </section>
    </article>
  );
}
