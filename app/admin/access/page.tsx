import { createSupabaseServerClient } from '@/lib/supabase/server';
import { inviteAdminAction, revokeRoleAction } from './actions';

export const metadata = { title: 'Users & access', robots: { index: false, follow: false } };

type RosterItem = { account_id: string; display_name?: string | null; account_status: string; is_owner: boolean; roles: { key: string; name: string; status: string }[] };

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: roster }, { data: roles }, { data: invitations }] = await Promise.all([
    supabase.rpc('admin_access_roster_command'),
    supabase.from('platform_roles').select('role_key,display_name,description').eq('is_active', true).order('display_name'),
    supabase.from('platform_admin_invitations').select('id,email_normalized,status,expires_at,created_at,platform_roles(display_name,role_key)').eq('status','pending').order('created_at',{ ascending:false })
  ]);

  return <div className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">Users & access</p><h1>Give people only what they need.</h1><p>Roles keep setup simple. Capabilities remain the authorization authority underneath.</p></div></header>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.success ? <p className="notice">{query.success}</p> : null}

    <section className="admin-section two-column-admin">
      <div><div className="admin-section-heading"><div><h2>Invite administrator</h2><p>Existing accounts receive access immediately. New users receive a 72-hour invitation.</p></div></div>
        <form action={inviteAdminAction} className="stack-form compact-form">
          <label htmlFor="admin-email">Email</label><input id="admin-email" name="email" type="email" required placeholder="name@example.com" />
          <label htmlFor="role-key">Role</label><select id="role-key" name="role_key" required>{roles?.map(role => <option key={role.role_key} value={role.role_key}>{role.display_name}</option>)}</select>
          <button type="submit">Invite administrator</button>
        </form>
      </div>
      <aside className="admin-explainer"><strong>Protected owner</strong><p>The Platform Owner cannot be deleted or stripped by another administrator. Super Admin grants remain owner-controlled.</p><strong>Sensitive actions</strong><p>High-risk actions require stronger authentication and produce audit evidence.</p></aside>
    </section>

    <section className="admin-section"><div className="admin-section-heading"><div><h2>Platform administrators</h2><p>A clear view of who can operate the platform.</p></div><span>{(roster as RosterItem[] | null)?.length ?? 0} people</span></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Person</th><th>Access</th><th>Status</th><th></th></tr></thead><tbody>{((roster ?? []) as RosterItem[]).map(person => <tr key={person.account_id}><td><strong>{person.display_name || 'Unnamed account'}</strong><small>{person.account_id}</small></td><td>{person.is_owner ? <span className="pill strong">Platform Owner</span> : person.roles.map(role => <span className="pill" key={role.key}>{role.name}</span>)}</td><td><span className="status-dot">{person.account_status}</span></td><td>{!person.is_owner && person.roles[0] ? <form action={revokeRoleAction}><input type="hidden" name="account_id" value={person.account_id}/><input type="hidden" name="role_key" value={person.roles[0].key}/><input type="hidden" name="reason" value="Access removed from admin dashboard"/><button className="text-button" type="submit">Revoke</button></form> : null}</td></tr>)}</tbody></table></div>
    </section>

    <section className="admin-section"><div className="admin-section-heading"><div><h2>Pending invitations</h2><p>Invitations expire automatically and do not grant access until accepted.</p></div></div>
      {invitations?.length ? <div className="admin-list">{invitations.map(invite => <article key={invite.id}><div><strong>{invite.email_normalized}</strong><span>{(invite.platform_roles as {display_name?:string}|null)?.display_name ?? 'Administrator'}</span></div><small>Expires {new Date(invite.expires_at).toLocaleString()}</small></article>)}</div> : <p className="empty-admin">No pending invitations.</p>}
    </section>
  </div>;
}
