import Link from 'next/link';
import { ShieldAlert } from '@/components/ui/icons';
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/features/admin/context';
import { getIncidentFeed } from '@/features/admin/incidents';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminSidebar, { type AdminSidebarItem, type AdminSidebarSection } from './sidebar';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The administrator shell.
 *
 * ⚠️ THE NAVIGATION IS GROUPED BY JOB, NOT BY DATABASE TABLE. "Core workspace" is the work an operator
 * does every day, "Operations & growth" is the marketplace surface, and "Governance & system" is the
 * control plane. Every item is still capability-gated, so each role sees the sections it can actually
 * reach rather than a menu that advertises pages the database will refuse.
 *
 * ⚠️ THERE IS NO PERSISTENT NAVBAR IN THIS SHELL. A critical incident is the one announcement that
 * belongs above every admin page, and it is rendered as the first item in normal page flow — never as
 * a sticky bar. With nothing critical to report, the page starts with its own hero.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?next=/admin');

  const context = await getAdminContext();
  if (!context) redirect('/');
  const can = context.can;

  const [feed] = await Promise.all([getIncidentFeed({ windowHours: 24 })]);

  const coreItems: AdminSidebarItem[] = [
    { href: '/admin', label: 'Overview', icon: 'ph:squares-four-bold' },
  ];
  if (can('platform.support') || can('platform.admin')) {
    coreItems.push({ href: '/admin/accounts', label: 'Accounts', icon: 'ph:users-bold' });
  }
  if (can('platform.trust') || can('platform.operations')) {
    coreItems.push({ href: '/admin/providers', label: 'Providers', icon: 'ph:hard-hat-bold' });
  }
  if (can('platform.projects')) {
    coreItems.push({ href: '/admin/projects', label: 'Projects', icon: 'ph:briefcase-bold' });
  }
  if (can('platform.money')) {
    coreItems.push({ href: '/admin/money', label: 'Financials', icon: 'ph:currency-circle-dollar-bold' });
  }

  const operationsItems: AdminSidebarItem[] = [];
  if (can('platform.seo') || can('platform.taxonomy') || can('platform.markets')) {
    operationsItems.push({ href: '/admin/discovery', label: 'Discovery & SEO', icon: 'ph:compass-bold' });
  }
  if (can('platform.seo')) {
    operationsItems.push({ href: '/admin/search', label: 'Search presence', icon: 'ph:magnifying-glass-bold' });
  }
  if (can('platform.taxonomy')) {
    operationsItems.push({
      href: '/admin/taxonomy/services',
      match: '/admin/taxonomy',
      label: 'Taxonomy',
      icon: 'ph:tree-structure-bold',
    });
  }
  if (can('platform.markets')) {
    operationsItems.push({ href: '/admin/markets', label: 'Markets', icon: 'ph:globe-hemisphere-west-bold' });
  }
  if (can('platform.operations')) {
    operationsItems.push({ href: '/admin/operations', label: 'Operations', icon: 'ph:sliders-horizontal-bold' });
  }
  if (can('platform.operations') || can('platform.admin')) {
    operationsItems.push({ href: '/admin/ai', label: 'AI operations', icon: 'ph:robot-bold' });
  }

  const governanceItems: AdminSidebarItem[] = [];
  if (can('platform.trust')) {
    governanceItems.push({ href: '/admin/trust', label: 'Trust & safety', icon: 'ph:shield-check-bold' });
  }
  if (can('platform.operations')) {
    governanceItems.push({ href: '/admin/operations/flags', label: 'Feature flags', icon: 'ph:toggle-right-bold' });
    governanceItems.push({
      href: '/admin/operations/incidents',
      label: 'Incidents',
      icon: 'ph:warning-circle-bold',
      badge: feed.allowed ? feed.counts.outstanding : undefined,
    });
  }
  if (can('platform.admin')) {
    governanceItems.push({ href: '/admin/audit', label: 'Audit', icon: 'ph:file-text-bold' });
    governanceItems.push({ href: '/admin/access', label: 'Users & access', icon: 'ph:user-gear-bold' });
  }

  const sections: AdminSidebarSection[] = [
    { label: 'CORE WORKSPACE', items: coreItems },
    { label: 'OPERATIONS & GROWTH', items: operationsItems },
    { label: 'GOVERNANCE & SYSTEM', items: governanceItems },
  ].filter(section => section.items.length > 0);

  const criticalItems = feed.allowed
    ? feed.items.filter(item => item.severity === 'critical' && item.count > 0)
    : [];
  const criticalCount = feed.allowed ? feed.counts.critical : 0;
  const leadCritical = criticalItems[0] ?? null;

  return <>
    <div className="admin-frame">
      <AdminSidebar
        sections={sections}
        roleLabel={context.isOwner ? 'Platform Owner' : (context.roles[0]?.name ?? 'Administrator')}
      />
      <main className="admin-main">
        {criticalCount > 0 ? (
          <div className="admin-critical-wrap">
            <div className="admin-critical-announcement" role="alert">
              <span className="admin-critical-icon" aria-hidden="true">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div className="admin-critical-copy">
                <strong>{leadCritical?.title ?? 'Critical attention required'}</strong>
                <span>
                  {criticalCount} critical · {feed.counts.outstanding} outstanding ·{' '}
                  {feed.counts.unacknowledged} unacknowledged
                </span>
              </div>
              <Link className="admin-critical-link" href={leadCritical?.deepLink ?? '/admin'}>
                Review now
              </Link>
            </div>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  </>;
}
