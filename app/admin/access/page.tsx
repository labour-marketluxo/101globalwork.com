import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clearProvisionedCredentialAction, createAdminWithTemporaryPasswordAction, inviteAdminAction, revokeInvitationAction, revokeRoleAction } from './actions';

export const metadata = { title: 'Users & access', robots: { index: false, follow: false } };

type RosterItem = {
  account_id: string;
  display_name?: string | null;
  account_status: string;
  is_owner: boolean;
  roles: { key: string; name: string; status: string }[];
};

type TempAccess = { email: string; password: string; expiresAt: string };

function readTemporaryAccess(raw?: string): TempAccess | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as TempAccess;
    if (!value.email || !value.password || !value.expiresAt) return null;
    return value;
  } catch { return null; }
}

function accessStatus(person: RosterItem) {
  if (person.is_owner) return 'Active';
  if (person.roles.some(role => role.status === 'active')) return 'Active';
  if (person.roles.some(role => role.status === 'invited')) return 'Pending first sign-in';
  if (person.roles.some(role => role.status === 'revoked')) return 'Revoked';
  return person.account_status.replaceAll('_', ' ');
}

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; provisioned?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: roster }, { data: roles }, { data: invitations }] = await Promise.all([
    supabase.rpc('admin_access_roster_command'),
    supabase.from('platform_roles').select('role_key,display_name,description').eq('is_active', true).order('display_name'),
    supabase.from('platform_admin_invitations').select('id,email_normalized,status,expires_at,created_at,platform_roles(display_name,role_key)').eq('status','pending').order('created_at',{ ascending:false })
  ]);
  const administrators = (roster ?? []) as RosterItem[];
  const cookieStore = await cookies();
  const temporaryAccess = query.provisioned ? readTemporaryAccess(cookieStore.get('admin_provisioned_access')?.value) : null;

  return <div className="admin-page">
    <header className="admin-page-header">
      <div>
        <p className="eyebrow">Users & access</p>
        <h1>Give people only the access they need.</h1>
        <p>Use a role as the starting point. Capabilities remain the authority underneath, and every consequential access change is audited.</p>
      </div>
      <span className="admin-quick-note">Least privilege by default</span>
    </header>

    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.success ? <p className="notice">{query.success}</p> : null}

    {temporaryAccess ? <section className="admin-section admin-panel" aria-labelledby="temporary-access-heading">
      <div className="admin-section-heading"><div><p className="eyebrow">One-time access</p><h2 id="temporary-access-heading">Temporary sign-in created</h2><p>Copy these details now. The password is not stored by 101GlobalWork and this view disappears after a few minutes.</p></div></div>
      <div className="admin-list">
        <article><div><strong>Email</strong><span>{temporaryAccess.email}</span></div></article>
        <article><div><strong>Temporary password</strong><code>{temporaryAccess.password}</code></div></article>
        <article><div><strong>Expires</strong><span>{new Date(temporaryAccess.expiresAt).toLocaleString()}</span></div></article>
      </div>
      <p className="hint">Share these details through a trusted channel. On first sign-in, the person must replace this password before administrator access becomes active.</p>
      <form action={clearProvisionedCredentialAction}><button type="submit" className="secondary-button">I saved these details</button></form>
    </section> : null}

    <section className="admin-section two-column-admin">
      <div className="admin-panel">
        <div className="admin-section-heading"><div><h2>Add an administrator</h2><p>Email invitation is preferred. If delivery is unreliable, create one-time temporary access and share it securely.</p></div></div>
        <form action={inviteAdminAction} className="stack-form compact-form">
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" name="email" type="email" required placeholder="name@example.com" />
          <label htmlFor="role-key">Role</label>
          <select id="role-key" name="role_key" required>{roles?.map(role => <option key={role.role_key} value={role.role_key}>{role.display_name}</option>)}</select>
          <button type="submit">Send email invitation</button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
          <h3>Email not arriving?</h3>
          <p className="hint">Create one-time temporary access. It creates only a platform administrator, never a customer or provider. An existing confirmed account is never given a new password.</p>
          <form action={createAdminWithTemporaryPasswordAction} className="stack-form compact-form">
            <label htmlFor="temporary-display-name">Name</label>
            <input id="temporary-display-name" name="display_name" required minLength={2} autoComplete="off" />
            <label htmlFor="temporary-admin-email">Email</label>
            <input id="temporary-admin-email" name="email" type="email" required autoComplete="off" />
            <label htmlFor="temporary-role-key">Role</label>
            <select id="temporary-role-key" name="role_key" required>{roles?.map(role => <option key={role.role_key} value={role.role_key}>{role.display_name}</option>)}</select>
            <button type="submit" className="secondary-button">Create one-time sign-in</button>
          </form>
        </div>
      </div>

      <aside className="admin-explainer">
        <strong>Protected owner</strong><p>The Platform Owner cannot be deleted or stripped by another administrator. Super Admin grants remain owner-controlled.</p>
        <strong>Sensitive actions</strong><p>High-risk actions require stronger authentication and produce audit evidence.</p>
        <strong>Ordinary users stay ordinary</strong><p>Customers and providers register through the normal product flow. This screen never manufactures marketplace identities.</p>
      </aside>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Platform administrators</h2><p>See who can operate the platform and what level of access they hold.</p></div><span>{administrators.length} {administrators.length === 1 ? 'person' : 'people'}</span></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Person</th><th>Access</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {administrators.map(person => <tr key={person.account_id}>
          <td><strong>{person.display_name || 'Profile not completed'}</strong></td>
          <td>{person.is_owner ? <span className="pill strong">Platform Owner</span> : person.roles.map(role => <span className="pill" key={role.key}>{role.name}</span>)}</td>
          <td><span className="status-dot">{accessStatus(person)}</span></td>
          <td><details className="identity-details"><summary>Details</summary><code>{person.account_id}</code></details>{!person.is_owner && person.roles[0] ? <form action={revokeRoleAction}><input type="hidden" name="account_id" value={person.account_id}/><input type="hidden" name="role_key" value={person.roles[0].key}/><input type="hidden" name="reason" value="Access removed from admin dashboard"/><button className="text-button" type="submit">Revoke access</button></form> : null}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Pending invitations</h2><p>Invitations expire automatically and grant nothing until accepted.</p></div></div>
      {invitations?.length ? <div className="admin-list">{invitations.map(invite => <article key={invite.id}><div><strong>{invite.email_normalized}</strong><span>{(invite.platform_roles as {display_name?:string}|null)?.display_name ?? 'Administrator'}</span></div><div><small>Expires {new Date(invite.expires_at).toLocaleString()}</small><form action={revokeInvitationAction}><input type="hidden" name="invitation_id" value={invite.id}/><button type="submit" className="text-button">Revoke invitation</button></form></div></article>)}</div> : <p className="empty-admin">No pending invitations.</p>}
    </section>
  </div>;
}
