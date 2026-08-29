import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Eligible providers', robots: { index: false, follow: false } };

type Params = Promise<{ id: string }>;

export default async function RequestMatchesPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: request } = await supabase.from('requests').select('id,need_text,state,service_entity_id,location_id').eq('id', id).maybeSingle();
  if (!request) notFound();

  let matches: Array<{ provider_id: string; slug: string; headline: string | null; public_description: string | null; readiness_score: number; trust_score: number }> = [];
  if (request.service_entity_id && request.location_id) {
    const { data } = await supabase.rpc('find_eligible_providers', {
      p_service_entity_id: request.service_entity_id,
      p_location_id: request.location_id,
      p_limit: 20,
    });
    matches = (data ?? []) as typeof matches;
  }

  return <section className="content-shell">
    <p className="eyebrow">Request created</p><h1>Eligible providers</h1>
    <p className="lede left">For “{request.need_text}”. Only providers that currently meet service, area, availability, readiness and identity-verification rules are shown.</p>
    {matches.length === 0 ? <div className="notice"><strong>No eligible providers yet.</strong><br />Your request is saved. We will not weaken verification or matching rules just to fill the list.</div> : <div className="provider-grid">{matches.map(match => <article key={match.provider_id} className="provider-card">
      <h2>{match.headline ?? 'Service provider'}</h2>
      {match.public_description ? <p>{match.public_description}</p> : null}
      <p className="hint">Readiness {Math.round(Number(match.readiness_score))}% · Trust {Math.round(Number(match.trust_score))}%</p>
      <Link className="button-link" href={`/providers/${match.slug}/`}>View provider</Link>
    </article>)}</div>}
    <div className="action-panel" style={{ marginTop: '1.5rem' }}>
      <h2>What happens next?</h2>
      <p>Eligible providers can quote this request. Your request page is where quotes, assignment, payment and completion will appear.</p>
      <Link className="button-link" href={`/requests/${id}`}>Open request & quotes</Link>
    </div>
    <p className="hint">Request state: {request.state}</p>
  </section>;
}
