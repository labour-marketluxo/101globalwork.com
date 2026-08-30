import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Eligible providers', robots: { index: false, follow: false } };

type Params = Promise<{ id: string }>;
type Match = {
  provider_id: string;
  slug: string;
  headline: string | null;
  public_description: string | null;
  readiness_score: number;
  verification_summary: { verified?: boolean } | null;
};

export default async function RequestMatchesPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: request } = await supabase.from('requests').select('id,need_text,state,service_entity_id,location_id').eq('id', id).maybeSingle();
  if (!request) notFound();

  const [{ data: service }, { data: location }] = await Promise.all([
    request.service_entity_id
      ? supabase.from('public_service_catalog').select('display_name').eq('service_entity_id', request.service_entity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    request.location_id
      ? supabase.from('public_location_catalog').select('display_name').eq('location_id', request.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let matches: Match[] = [];
  if (request.service_entity_id && request.location_id) {
    const { data } = await supabase.rpc('find_eligible_providers', {
      p_service_entity_id: request.service_entity_id,
      p_location_id: request.location_id,
      p_limit: 20,
    });
    matches = (data ?? []) as Match[];
  }

  return <section className="content-shell">
    <p className="eyebrow">Request created</p>
    <h1>Providers who can take this work</h1>
    <p className="lede left">Eligibility is checked before ranking. We only show providers whose accepted records currently match the requested service and service area and who also pass publication, availability and identity-verification rules.</p>

    <section className="provider-progress-card" aria-label="Request matching criteria">
      <div><span>Service</span><strong>{service?.display_name ?? 'Not set'}</strong></div>
      <div><span>Work area</span><strong>{location?.display_name ?? 'Not set'}</strong></div>
      <div><span>Eligible now</span><strong>{matches.length}</strong></div>
    </section>

    {matches.length === 0
      ? <div className="notice"><strong>No eligible providers yet.</strong><br />Your request is saved. We will not weaken service, geography, verification or readiness rules just to fill the list.</div>
      : <div className="provider-grid">{matches.map(match => <article key={match.provider_id} className="provider-card">
          <p className="eyebrow">Matched for {location?.display_name ?? 'this area'}</p>
          <h2>{match.headline ?? 'Service provider'}</h2>
          {match.public_description ? <p>{match.public_description}</p> : null}
          <div className="admin-list">
            <div><strong>Service area match</strong><span>{location?.display_name ?? 'Matched'}</span></div>
            <div><strong>Identity</strong><span>{match.verification_summary?.verified ? 'Verified' : 'Eligibility check passed'}</span></div>
            <div><strong>Search readiness</strong><span>{Math.round(Number(match.readiness_score))}/100</span></div>
          </div>
          <Link className="button-link" href={`/providers/${match.slug}/`}>View provider</Link>
        </article>)}</div>}

    <div className="action-panel" style={{ marginTop: '1.5rem' }}>
      <h2>What happens next?</h2>
      <p>Your request is saved. Eligible providers can submit quotes; the request page becomes the single place for quote review, hiring, payment, work progress and completion.</p>
      <Link className="button-link" href={`/requests/${id}`}>Open request & quotes</Link>
    </div>
  </section>;
}
