import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicProviderProfile } from '@/lib/providers/public-profile';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProviderProfile(slug);
  if (!profile) return {};
  return {
    title: profile.headline ?? 'Service provider',
    description: profile.public_description ?? undefined,
    alternates: { canonical: `/providers/${slug}/` },
    robots: { index: profile.readiness_score >= 60, follow: true },
  };
}

export default async function PublicProviderPage({ params }: { params: Params }) {
  const { slug } = await params;
  const profile = await getPublicProviderProfile(slug);
  if (!profile) notFound();

  const verified = Boolean(profile.verification_summary?.verified);

  return (
    <article className="content-shell">
      <p className="eyebrow">Provider profile</p>
      <h1>{profile.headline ?? 'Service provider'}</h1>
      {profile.public_description ? <p className="lede left">{profile.public_description}</p> : null}
      <section className="profile-facts" aria-label="Provider trust information">
        <div><strong>{profile.years_experience ?? '—'}</strong><span>Years experience</span></div>
        <div><strong>{verified ? 'Verified' : 'Not yet verified'}</strong><span>Verification</span></div>
        <div><strong>{profile.accepts_new_work ? 'Available' : 'Unavailable'}</strong><span>New work</span></div>
      </section>
      <section className="action-panel">
        <h2>Need work done?</h2>
        <p>Describe the job first. 101GlobalWork will keep the request structured and match only eligible providers.</p>
        <Link className="button-link" href="/">Start a request</Link>
      </section>
    </article>
  );
}
