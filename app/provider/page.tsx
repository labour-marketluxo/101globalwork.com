import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Provider workspace', robots: { index: false, follow: false } };

type Opportunity = {
  provider_id: string;
  request_id: string;
  need_text: string;
  request_state: string;
  request_created_at: string;
  quote_id: string | null;
  quote_status: string | null;
};

export default async function ProviderWorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/provider');

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/provider/onboarding');

  const { data: providers } = await supabase.from('providers').select('id,display_name,status').eq('owner_account_id', account.id).order('created_at', { ascending: true });
  if (!providers?.length) redirect('/provider/onboarding');

  const providerIds = providers.map(p => p.id);
  const [{ data: profiles }, { data: readinessRows }, { data: progressRows }, { data: verifications }, { data: opportunities }, { data: quotes }, { data: assignments }, { data: payoutDestinations }] = await Promise.all([
    supabase.from('provider_public_profiles').select('provider_id,headline,public_description,is_public,published_at,accepts_new_work').in('provider_id', providerIds),
    supabase.from('provider_search_readiness').select('provider_id,total_score,readiness,reasons').in('provider_id', providerIds),
    supabase.from('provider_onboarding_progress').select('provider_id,services_complete,service_area_complete,profile_complete,next_action').in('provider_id', providerIds),
    supabase.from('provider_verifications').select('provider_id,kind,status,created_at').in('provider_id', providerIds).order('created_at', { ascending: false }),
    supabase.rpc('list_my_provider_opportunities_command', { p_limit: 25 }),
    supabase.from('quotes').select('id,request_id,provider_id,status,currency_code,total_minor,submitted_at').in('provider_id', providerIds).order('submitted_at', { ascending: false }).limit(20),
    supabase.from('assignments').select('id,request_id,provider_id,status,assigned_at').in('provider_id', providerIds).order('assigned_at', { ascending: false }).limit(20),
    supabase.from('provider_payout_destinations').select('provider_id,verification_status,is_default').in('provider_id', providerIds).eq('verification_status','verified').eq('is_default',true),
  ]);

  const profileByProvider = new Map((profiles ?? []).map(p => [p.provider_id, p]));
  const readinessByProvider = new Map((readinessRows ?? []).map(r => [r.provider_id, r]));
  const progressByProvider = new Map((progressRows ?? []).map(r => [r.provider_id, r]));
  const latestIdentityByProvider = new Map<string, { status: string }>();
  for (const verification of verifications ?? []) {
    if (verification.kind === 'identity' && !latestIdentityByProvider.has(verification.provider_id)) latestIdentityByProvider.set(verification.provider_id, verification);
  }
  const opps = (opportunities ?? []) as Opportunity[];
  const activeAssignments = (assignments ?? []).filter(a => a.status === 'active');
  const payoutReady = new Set((payoutDestinations ?? []).map(item => item.provider_id));

  return <section className="content-shell">
    <div className="section-heading-row">
      <div>
        <p className="eyebrow">Provider workspace</p>
        <h1>Work you can act on.</h1>
        <p className="lede left">See the exact publication gate, matching opportunities, accepted work and payout readiness without translating percentages into tasks.</p>
      </div>
      <Link className="secondary-link" href="/provider/payouts">Payout account</Link>
    </div>

    <div className="provider-grid">
      {providers.map(provider => {
        const profile = profileByProvider.get(provider.id);
        const readiness = readinessByProvider.get(provider.id);
        const progress = progressByProvider.get(provider.id);
        const identity = latestIdentityByProvider.get(provider.id);
        const identityVerified = identity?.status === 'verified';
        const serviceComplete = Boolean(progress?.services_complete);
        const areaComplete = Boolean(progress?.service_area_complete);
        const profileComplete = Boolean(progress?.profile_complete);
        const publishRequirements = [serviceComplete, areaComplete, profileComplete, identityVerified].filter(Boolean).length;
        const descriptionLength = String(profile?.public_description ?? '').trim().length;
        const descriptionRemaining = Math.max(0, 80 - descriptionLength);
        const live = provider.status === 'active' && Boolean(profile?.is_public && profile?.published_at);
        const blocker = !serviceComplete ? 'Choose the service customers can hire you for.'
          : !areaComplete ? 'Choose where you can perform the work.'
          : !profileComplete ? `Add at least ${descriptionRemaining} more characters to your public description.`
          : !identityVerified ? identity?.status === 'pending' ? 'Identity review is still pending.' : 'Submit identity verification.'
          : 'All publication requirements are complete. Publish your profile.';

        return <article className="provider-card" key={provider.id}>
          <p className="eyebrow">{live ? 'Live provider' : `${publishRequirements}/4 publish requirements`}</p>
          <h2>{profile?.headline ?? provider.display_name}</h2>
          <div className="admin-list">
            <div><strong>Publication</strong><span>{live ? 'live' : `${publishRequirements}/4 complete`}</span></div>
            <div><strong>Identity</strong><span>{identity?.status?.replaceAll('_',' ') ?? 'not submitted'}</span></div>
            <div><strong>Search readiness</strong><span>{Math.round(Number(readiness?.total_score ?? 0))}/100 · {(readiness?.readiness ?? 'not_ready').replaceAll('_',' ')}</span></div>
            <div><strong>Payout account</strong><span>{payoutReady.has(provider.id) ? 'verified' : 'not verified yet'}</span></div>
          </div>
          {!live ? <div className="notice"><strong>Next action</strong><br />{blocker}</div> : null}
          {!live ? <Link className="button-link" href={`/provider/onboarding?provider=${provider.id}`}>Finish publication</Link> : null}
          {live && !payoutReady.has(provider.id) ? <Link className="secondary-link" href="/provider/payouts">Verify payout account</Link> : null}
        </article>;
      })}
    </div>

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Opportunities</p><h2>Requests you are eligible to quote</h2></div><span className="pill">{opps.length}</span></div>
      {opps.length ? <div className="quote-list">{opps.map(item => <article className="quote-card" key={`${item.provider_id}:${item.request_id}`}>
        <div><strong>{item.need_text}</strong><br /><span className="hint">{item.request_state.replaceAll('_',' ')} · {new Date(item.request_created_at).toLocaleString()}</span></div>
        {item.quote_id ? <p>Your latest quote is <strong>{item.quote_status?.replaceAll('_',' ')}</strong>.</p> : <p>No quote submitted yet.</p>}
        <Link className="button-link" href={`/provider/requests/${item.request_id}/quote?provider=${item.provider_id}`}>{item.quote_id ? 'Review / quote again' : 'Send quote'}</Link>
      </article>)}</div> : <p className="notice">No matching opportunities right now. A provider appears here only after publication and when the request passes service, area, verification and market eligibility rules.</p>}
    </section>

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Accepted work</p><h2>Active assignments</h2></div><span className="pill">{activeAssignments.length}</span></div>
      {activeAssignments.length ? <div className="quote-list">{activeAssignments.map(item => <article className="quote-card" key={item.id}>
        <div><strong>Assigned work</strong><br /><span className="hint">Accepted {new Date(item.assigned_at).toLocaleString()}</span></div>
        <Link className="button-link" href={`/provider/assignments/${item.id}`}>Manage work</Link>
      </article>)}</div> : <p className="hint">Accepted quotes will appear here so you can schedule, start work, submit evidence and request completion approval.</p>}
    </section>

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Quotes</p><h2>Recent offers</h2></div><span className="pill">{quotes?.length ?? 0}</span></div>
      {quotes?.length ? <ul>{quotes.slice(0,8).map(q => <li key={q.id}><strong>{q.currency_code} {(Number(q.total_minor)/100).toFixed(2)}</strong> · {q.status.replaceAll('_',' ')}</li>)}</ul> : <p className="hint">Your submitted quotes will appear here.</p>}
    </section>
  </section>;
}
