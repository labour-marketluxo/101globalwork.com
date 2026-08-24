import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Search readiness', robots: { index: false, follow: false } };

const reasonLabels: Record<string, string> = {
  add_service: 'Add at least one active service.',
  add_service_area: 'Add at least one active service area.',
  improve_public_description: 'Add a useful public description of the work you do.',
  provider_not_active: 'Complete onboarding before your provider profile can be active.',
};

export default async function ProviderSearchReadinessPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return <section className="content-shell"><h1>Search readiness</h1><p>Sign in to view provider discoverability readiness.</p></section>;
  }

  const { data: providers } = await supabase.from('providers').select('id,display_name,status').limit(1);
  const provider = providers?.[0];
  if (!provider) {
    return <section className="content-shell"><h1>Search readiness</h1><p>Create a provider profile before search readiness can be evaluated.</p></section>;
  }

  const { data: readiness } = await supabase
    .from('provider_search_readiness')
    .select('identity_score,service_score,location_score,trust_score,content_score,operations_score,total_score,readiness,reasons,evaluated_at')
    .eq('provider_id', provider.id)
    .maybeSingle();

  return (
    <section className="content-shell">
      <p className="eyebrow">Provider tools</p>
      <h1>Search readiness</h1>
      <p className="lede">This measures whether your profile is complete enough to participate in discovery. It does not promise or predict a search-engine ranking.</p>

      {!readiness ? (
        <div className="notice">Your readiness has not been evaluated yet. It will be recalculated when profile, service, location or trust information changes.</div>
      ) : (
        <>
          <div className="score-card">
            <strong>{readiness.total_score}/100</strong>
            <span>{readiness.readiness.replace('_', ' ')}</span>
          </div>
          <dl className="readiness-grid">
            <div><dt>Identity</dt><dd>{readiness.identity_score}</dd></div>
            <div><dt>Services</dt><dd>{readiness.service_score}</dd></div>
            <div><dt>Location</dt><dd>{readiness.location_score}</dd></div>
            <div><dt>Trust</dt><dd>{readiness.trust_score}</dd></div>
            <div><dt>Content</dt><dd>{readiness.content_score}</dd></div>
            <div><dt>Operations</dt><dd>{readiness.operations_score}</dd></div>
          </dl>
          {Array.isArray(readiness.reasons) && readiness.reasons.length ? (
            <div className="action-panel"><h2>Improve readiness</h2><ul>{readiness.reasons.map((reason: string) => <li key={reason}>{reasonLabels[reason] ?? reason}</li>)}</ul></div>
          ) : null}
        </>
      )}
    </section>
  );
}
