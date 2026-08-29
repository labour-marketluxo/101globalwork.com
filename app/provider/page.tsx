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

  const { data: providers } = await supabase
    .from('providers')
    .select('id,display_name,status')
    .eq('owner_account_id', account.id)
    .order('created_at', { ascending: true });

  if (!providers?.length) redirect('/provider/onboarding');

  const providerIds = providers.map(p => p.id);
  const [{ data: profiles }, { data: opportunities }, { data: quotes }, { data: assignments }, { data: payoutDestinations }] = await Promise.all([
    supabase.from('provider_public_profiles').select('provider_id,headline,readiness_score,is_public,published_at,accepts_new_work').in('provider_id', providerIds),
    supabase.rpc('list_my_provider_opportunities_command', { p_limit: 25 }),
    supabase.from('quotes').select('id,request_id,provider_id,status,currency_code,total_minor,submitted_at').in('provider_id', providerIds).order('submitted_at', { ascending: false }).limit(20),
    supabase.from('assignments').select('id,request_id,provider_id,status,assigned_at').in('provider_id', providerIds).order('assigned_at', { ascending: false }).limit(20),
    supabase.from('provider_payout_destinations').select('provider_id,verification_status,is_default').in('provider_id', providerIds).eq('verification_status','verified').eq('is_default',true),
  ]);

  const profileByProvider = new Map((profiles ?? []).map(p => [p.provider_id, p]));
  const opps = (opportunities ?? []) as Opportunity[];
  const activeAssignments = (assignments ?? []).filter(a => a.status === 'active');
  const payoutReady = new Set((payoutDestinations ?? []).map(item => item.provider_id));

  return <section className="content-shell">
    <div className="section-heading-row">
      <div>
        <p className="eyebrow">Provider workspace</p>
        <h1>Work you can act on.</h1>
        <p className="lede left">Finish your profile, quote matching requests, manage accepted work, and keep your payout destination ready.</p>
      </div>
      <div className="entry-actions">
        <Link className="secondary-link" href="/provider/onboarding">Edit provider setup</Link>
        <Link className="secondary-link" href="/provider/payouts">Payout account</Link>
      </div>
    </div>

    <div className="provider-grid">
      {providers.map(provider => {
        const profile = profileByProvider.get(provider.id);
        const ready = provider.status === 'active' && profile?.is_public && profile?.published_at;
        return <article className="provider-card" key={provider.id}>
          <p className="eyebrow">{ready ? 'Discoverable' : 'Setup needs attention'}</p>
          <h2>{profile?.headline ?? provider.display_name}</h2>
          <p className="hint">Provider status: {provider.status} · Readiness {Math.round(Number(profile?.readiness_score ?? 0))}%</p>
          <p className="hint">Payout account: {payoutReady.has(provider.id) ? 'verified' : 'not verified yet'}</p>
          {!ready ? <Link className="button-link" href="/provider/onboarding">Finish setup and publish</Link> : null}
          {ready && !payoutReady.has(provider.id) ? <Link className="secondary-link" href="/provider/payouts">Verify payout account</Link> : null}
        </article>;
      })}
    </div>

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Opportunities</p><h2>Requests you are eligible to quote</h2></div><span className="pill">{opps.length}</span></div>
      {opps.length ? <div className="quote-list">{opps.map(item => <article className="quote-card" key={`${item.provider_id}:${item.request_id}`}>
        <div><strong>{item.need_text}</strong><br /><span className="hint">{item.request_state.replaceAll('_',' ')} · {new Date(item.request_created_at).toLocaleString()}</span></div>
        {item.quote_id ? <p>Your latest quote is <strong>{item.quote_status?.replaceAll('_',' ')}</strong>.</p> : <p>No quote submitted yet.</p>}
        <Link className="button-link" href={`/provider/requests/${item.request_id}/quote?provider=${item.provider_id}`}>{item.quote_id ? 'Review / quote again' : 'Send quote'}</Link>
      </article>)}</div> : <p className="notice">No matching opportunities right now. Only requests that pass the same service, area, verification, publication and readiness rules are shown here.</p>}
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
