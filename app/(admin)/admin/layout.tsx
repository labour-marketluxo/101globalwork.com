import Link from 'next/link';
import { ShieldAlert } from '@/components/ui/icons';
import { redirect } from 'next/navigation';
import { describeAdminEnvironment } from '@/features/admin/environment';
import { getAdminContext } from '@/features/admin/context';
import { getIncidentFeed } from '@/features/admin/incidents';
import { paystackExecutionMode } from '@/lib/payments/paystack-operations';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminNav, { type AdminNavItem } from './admin-nav';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The administrator shell.
 *
 * ⚠️ THE NAVIGATION LISTS ONLY WHAT EXISTS, PLUS ONE MARKED ABSENCE. The brief's list names Taxonomy,
 * Markets and Search SEO separately, but this platform has one surface for all three
 * (/admin/discovery) and inventing three pages that each re-cut the same public-route table would be
 * three places for the same number to disagree. "AI" is marked rather than omitted because there is no
 * artificial-intelligence surface in this codebase at all: a tab that silently does not exist is a
 * control people keep hunting for.
 *
 * ⚠️ THE INCIDENT STRIP READS THE SAME FEED THE OVERVIEW DOES, over a fixed 24-hour window. It is one
 * query on a layout, which is the price of the banner being true on every page rather than only on the
 * one that was loaded with the right filter. A role that cannot read the feed gets the environment
 * badge and no banner — not a zero, which would read as "nothing is wrong".
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?next=/admin');

  const context = await getAdminContext();
  if (!context) redirect('/');
  const can = context.can;

  const [feed] = await Promise.all([getIncidentFeed({ windowHours: 24 })]);
  let payments: string | null = null;
  try {
    payments = paystackExecutionMode();
  } catch {
    payments = null;
  }
  const environment = describeAdminEnvironment(payments);

  const navItems: AdminNavItem[] = [
    { href: '/admin', label: 'Overview' },
    ...(can('platform.support') || can('platform.admin') ? [{ href: '/admin/accounts', label: 'Accounts' }] : []),
    ...(can('platform.trust') || can('platform.operations') ? [{ href: '/admin/providers', label: 'Providers' }] : []),
    ...(can('platform.trust') ? [{ href: '/admin/trust', label: 'Trust & safety' }] : []),
    ...(can('platform.projects') ? [{ href: '/admin/projects', label: 'Projects' }] : []),
    ...(can('platform.money') ? [{ href: '/admin/money', label: 'Financials' }] : []),
    ...(can('platform.seo') || can('platform.taxonomy') || can('platform.markets') ? [{ href: '/admin/discovery', label: 'Discovery & SEO' }] : []),
    ...(can('platform.seo') ? [{ href: '/admin/search', label: 'Search presence' }] : []),
    ...(can('platform.taxonomy') ? [{ href: '/admin/taxonomy/services', label: 'Taxonomy' }] : []),
    ...(can('platform.markets') ? [{ href: '/admin/markets', label: 'Markets' }] : []),
    ...(can('platform.operations') ? [{ href: '/admin/operations', label: 'Operations' }] : []),
    ...(can('platform.operations') ? [{ href: '/admin/operations/flags', label: 'Feature flags' }] : []),
    ...(can('platform.operations') ? [{ href: '/admin/operations/incidents', label: 'Incidents' }] : []),
    ...(can('platform.admin') ? [{ href: '/admin/audit', label: 'Audit' }] : []),
    ...(can('platform.admin') ? [{ href: '/admin/access', label: 'Users & access' }] : []),
  ];

  const attention = feed.counts.critical + feed.counts.high;

  return <>
    <div className="admin-frame">
      <aside className="admin-sidebar" aria-label="Platform administration">
        <div className="admin-sidebar-head">
          <div>
            <Link className="admin-brand" href="/admin">101GlobalWork</Link>
            <p>Platform control</p>
          </div>
          <p className="admin-env-badge" data-tone={environment.tone}>
            {environment.label}
          </p>
        </div>

        <div>
          <p className="admin-nav-label">Workspace</p>
          <AdminNav items={navItems} />
        </div>

        <div className="admin-identity">
          <span>{context.isOwner ? 'Platform Owner' : (context.roles[0]?.name ?? 'Administrator')}</span>
          <small>Access is capability-based</small>
          <Link href="/account/security?next=/admin">Strong authentication</Link>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-strip">
          <div className="admin-strip-group">
            <span className="admin-env-badge" data-tone={environment.tone}>{environment.label}</span>
            {environment.dataStore ? <span className="admin-env-detail">data: {environment.dataStore}</span> : null}
            {environment.payments ? <span className="admin-env-detail">payments: {environment.payments}</span> : null}
          </div>

          {feed.allowed ? (
            feed.counts.outstanding === 0 ? (
              <p className="admin-incident-banner" role="status">
                Nothing outstanding in the last 24 hours.
              </p>
            ) : (
              <p className="admin-incident-banner" data-tone="attention" role="status">
                <ShieldAlert aria-hidden="true" className="h-4 w-4" />
                <strong>{attention} incident{attention === 1 ? '' : 's'} at critical or high severity</strong>
                {' '}
                <span>
                  · {feed.counts.outstanding} outstanding · {feed.counts.unacknowledged} unacknowledged
                  {feed.counts.recurred > 0 ? ` · ${feed.counts.recurred} grown since acknowledgement` : ''}
                </span>
                {' '}
                <Link href="/admin">Open the overview</Link>
              </p>
            )
          ) : (
            <p className="admin-incident-banner" role="status">
              {feed.unavailable
                ? 'The incident feed could not be read — this strip is not reporting an all-clear.'
                : 'Your role can see the environment, not the incident feed.'}
            </p>
          )}
        </div>
        {children}
      </main>
    </div>
  </>;
}
