import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Account details', robots: { index: false, follow: false } };

type Role = { key: string; name: string; status: string; granted_at?: string | null; revoked_at?: string | null };
type Provider = { id: string; display_name: string; status: string; is_public: boolean; published_at?: string | null; readiness_score?: number | null; readiness?: string | null; setup_percent?: number | null; next_action?: string | null; created_at: string };
type Verification = { id: string; provider_id: string; provider_name: string; kind: string; status: string; jurisdiction_code?: string | null; reference_label?: string | null; created_at: string; reviewed_at?: string | null; review_note?: string | null };
type RequestRecord = { id: string; need_text: string; state: string; created_at: string };
type AccountDetail = {
  account_id: string;
  display_name: string;
  email?: string | null;
  email_confirmed: boolean;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  account_status: string;
  created_at: string;
  admin_roles: Role[];
  providers: Provider[];
  verifications: Verification[];
  requests: RequestRecord[];
};

function status(value?: string | null) { return (value ?? 'unknown').replaceAll('_',' '); }

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_user_detail_command', { p_account_id: id });
  if (error || !data) notFound();
  const account = data as AccountDetail;

  return <div className="admin-page">
    <header className="admin-page-header">
      <div><p className="eyebrow">Users & access · account</p><h1>{account.display_name}</h1><p>One place to understand this person’s authentication state, customer activity, provider identities, verification history and platform access.</p></div>
      <Link className="secondary-button" href="/admin/access">Back to Users & access</Link>
    </header>

    <section className="admin-stat-grid">
      <article><span>Account</span><strong>{status(account.account_status)}</strong><small>Created {new Date(account.created_at).toLocaleDateString()}</small></article>
      <article><span>Email</span><strong>{account.email_confirmed ? 'Confirmed' : 'Not confirmed'}</strong><small>{account.email ?? 'No email'}</small></article>
      <article><span>Provider identities</span><strong>{account.providers.length}</strong><small>{account.providers.some(item=>item.is_public) ? 'At least one is live' : 'None live'}</small></article>
      <article><span>Customer requests</span><strong>{account.requests.length}</strong><small>Most recent 20 shown</small></article>
    </section>

    <section className="admin-section two-column-admin">
      <div className="admin-panel">
        <div className="admin-section-heading"><div><h2>Sign-in state</h2><p>Authentication facts are read from the auth system, not inferred from profile UI.</p></div></div>
        <p><strong>Email:</strong> {account.email ?? 'Not available'}</p>
        <p><strong>Email confirmation:</strong> {account.email_confirmed ? `confirmed${account.email_confirmed_at ? ` ${new Date(account.email_confirmed_at).toLocaleString()}` : ''}` : 'not confirmed'}</p>
        <p><strong>Last sign-in:</strong> {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : 'Never'}</p>
        <details className="identity-details"><summary>Canonical account ID</summary><code>{account.account_id}</code></details>
      </div>
      <div className="admin-panel">
        <div className="admin-section-heading"><div><h2>Platform access</h2><p>Marketplace identity and administrator authority are separate.</p></div></div>
        {account.admin_roles.length ? <ul>{account.admin_roles.map(role=><li key={`${role.key}:${role.status}`}><strong>{role.name}</strong> · {status(role.status)}</li>)}</ul> : <p className="hint">No platform administrator role. This is an ordinary marketplace account unless a role is explicitly granted.</p>}
      </div>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Provider identities</h2><p>Setup and search readiness are shown separately so operators can see why a provider is not live.</p></div><span>{account.providers.length}</span></div>
      {account.providers.length ? <div className="admin-list">{account.providers.map(provider=><article key={provider.id}>
        <div><strong>{provider.display_name}</strong><span>Provider status: {status(provider.status)}</span><span>Setup: {provider.setup_percent ?? 0}% · Search readiness: {provider.readiness_score ?? 0}/100 ({status(provider.readiness)})</span><span>Visibility: {provider.is_public ? 'published' : 'not live'}</span>{provider.next_action ? <span>Next action: {status(provider.next_action)}</span> : null}</div>
        <details className="identity-details"><summary>Provider ID</summary><code>{provider.id}</code></details>
      </article>)}</div> : <p className="empty-admin">This account has not created a provider identity.</p>}
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Verification history</h2><p>Approved and rejected records remain visible after the queue decision.</p></div><Link className="text-button" href="/admin/verifications">Open Trust & safety</Link></div>
      {account.verifications.length ? <div className="admin-list">{account.verifications.map(item=><article key={item.id}><div><strong>{item.provider_name} · {item.kind}</strong><span>{status(item.status)} · {item.jurisdiction_code ?? 'jurisdiction not supplied'}</span>{item.review_note ? <span>Review note: {item.review_note}</span> : null}</div><small>{item.reviewed_at ? `Reviewed ${new Date(item.reviewed_at).toLocaleString()}` : `Submitted ${new Date(item.created_at).toLocaleString()}`}</small></article>)}</div> : <p className="empty-admin">No verification submissions for this account.</p>}
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Customer activity</h2><p>Recent requests created by this account.</p></div><span>{account.requests.length}</span></div>
      {account.requests.length ? <div className="admin-list">{account.requests.map(item=><article key={item.id}><div><strong>{item.need_text}</strong><span>{status(item.state)}</span></div><small>{new Date(item.created_at).toLocaleString()}</small></article>)}</div> : <p className="empty-admin">No customer requests recorded.</p>}
    </section>
  </div>;
}
