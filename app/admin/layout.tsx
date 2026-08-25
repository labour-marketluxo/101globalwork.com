import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminNav, { type AdminNavItem } from './admin-nav';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin');

  const { data: context, error } = await supabase.rpc('admin_context_command');
  if (error || !context) redirect('/');

  const caps = new Set<string>((context.capabilities ?? []) as string[]);
  const can = (prefix: string) => context.is_owner || [...caps].some(c => c === prefix || c.startsWith(`${prefix}.`));

  const navItems: AdminNavItem[] = [
    { href: '/admin', label: 'Overview' },
    ...(can('platform.admin') ? [{ href: '/admin/access', label: 'Users & access' }] : []),
    ...(can('platform.trust') ? [{ href: '/admin/verifications', label: 'Trust & safety' }] : []),
    ...(can('platform.projects') ? [{ href: '/admin/work', label: 'Work' }] : []),
    ...(can('platform.money') ? [{ href: '/admin/money', label: 'Money' }] : []),
    ...(can('platform.seo') || can('platform.taxonomy') ? [{ href: '/admin/discovery', label: 'Discovery & SEO' }] : []),
    ...(can('platform.operations') ? [{ href: '/admin/operations', label: 'Operations' }] : []),
    ...(can('platform.admin') ? [{ href: '/admin/audit', label: 'Audit' }] : []),
  ];

  return <>
    <style>{`.site-header, body > footer { display: none; } body > main { flex: 1; }`}</style>
    <div className="admin-frame">
      <aside className="admin-sidebar" aria-label="Platform administration">
        <div className="admin-sidebar-head">
          <div>
            <Link className="admin-brand" href="/admin">101GlobalWork</Link>
            <p>Platform control</p>
          </div>
        </div>

        <div>
          <p className="admin-nav-label">Workspace</p>
          <AdminNav items={navItems} />
        </div>

        <div className="admin-identity">
          <span>{context.is_owner ? 'Platform Owner' : ((context.roles?.[0]?.name as string) ?? 'Administrator')}</span>
          <small>Access is capability-based</small>
        </div>
      </aside>
      <section className="admin-main">{children}</section>
    </div>
  </>;
}
