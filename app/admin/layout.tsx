import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin');
  const { data: context, error } = await supabase.rpc('admin_context_command');
  if (error || !context) redirect('/');
  const caps = new Set<string>((context.capabilities ?? []) as string[]);
  const can = (prefix: string) => context.is_owner || [...caps].some(c => c === prefix || c.startsWith(`${prefix}.`));

  return <div className="admin-frame">
    <aside className="admin-sidebar">
      <div><Link className="admin-brand" href="/admin">101GlobalWork</Link><p>Platform control</p></div>
      <nav>
        <Link href="/admin">Overview</Link>
        {can('platform.admin') ? <Link href="/admin/access">Users & access</Link> : null}
        {can('platform.trust') ? <Link href="/admin/verifications">Trust & safety</Link> : null}
        {can('platform.money') ? <Link href="/admin/money">Money</Link> : null}
        {can('platform.seo') || can('platform.taxonomy') ? <Link href="/admin/discovery">Discovery & SEO</Link> : null}
        {can('platform.projects') ? <Link href="/admin/work">Work</Link> : null}
        {can('platform.operations') ? <Link href="/admin/operations">Operations</Link> : null}
        {can('platform.admin') ? <Link href="/admin/audit">Audit</Link> : null}
      </nav>
      <div className="admin-identity"><span>{context.is_owner ? 'Platform Owner' : ((context.roles?.[0]?.name as string) ?? 'Administrator')}</span><small>Least-privilege access</small></div>
    </aside>
    <section className="admin-main">{children}</section>
  </div>;
}
