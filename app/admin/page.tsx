import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Platform overview', robots: { index: false, follow: false } };

type Overview = {
  accounts?: { active?: number; suspended?: number };
  providers?: { active?: number; pending_verifications?: number };
  work?: { open_requests?: number; completed?: number; disputed?: number };
  money?: { funded_obligations?: number; disputed_obligations?: number; eligible_payouts?: number };
  operations?: { unpublished_outbox?: number; rejected_provider_events?: number };
};

export default async function AdminHome() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('admin_overview_command');
  const o = (data ?? {}) as Overview;
  const alertCount = Number(o.providers?.pending_verifications ?? 0)
    + Number(o.work?.disputed ?? 0)
    + Number(o.money?.disputed_obligations ?? 0)
    + Number(o.operations?.rejected_provider_events ?? 0);

  return <div className="admin-page">
    <header className="admin-page-header">
      <div>
        <p className="eyebrow">Platform overview</p>
        <h1>What needs your attention today?</h1>
        <p>A calm operational view of users, work, trust, money and system exceptions.</p>
      </div>
      <div className={`admin-health ${alertCount ? 'attention' : ''}`}>
        <strong>{alertCount}</strong>
        <span>{alertCount ? 'items need attention' : 'no critical alerts'}</span>
      </div>
    </header>

    <section className="admin-stat-grid" aria-label="Platform summary">
      <article><span>Active accounts</span><strong>{o.accounts?.active ?? 0}</strong><small>{o.accounts?.suspended ?? 0} suspended</small></article>
      <article><span>Active providers</span><strong>{o.providers?.active ?? 0}</strong><small>{o.providers?.pending_verifications ?? 0} awaiting review</small></article>
      <article><span>Open work</span><strong>{o.work?.open_requests ?? 0}</strong><small>{o.work?.completed ?? 0} completed</small></article>
      <article><span>Eligible payouts</span><strong>{o.money?.eligible_payouts ?? 0}</strong><small>{o.money?.funded_obligations ?? 0} funded obligations</small></article>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading">
        <div><h2>Attention</h2><p>Only exceptions that may need a decision.</p></div>
      </div>
      <div className="admin-action-grid">
        <Link href="/admin/verifications"><strong>Verification reviews</strong><span>{o.providers?.pending_verifications ?? 0} pending</span></Link>
        <Link href="/admin/work"><strong>Work disputes</strong><span>{o.work?.disputed ?? 0} open</span></Link>
        <Link href="/admin/money"><strong>Financial disputes</strong><span>{o.money?.disputed_obligations ?? 0} open</span></Link>
        <Link href="/admin/operations"><strong>Provider events</strong><span>{o.operations?.rejected_provider_events ?? 0} rejected</span></Link>
      </div>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading">
        <div><h2>Control areas</h2><p>Open the area you need; permissions stay capability-driven.</p></div>
      </div>
      <div className="admin-module-grid">
        <Link href="/admin/access"><strong>Users & access</strong><span>Owners, administrators, roles and permissions</span></Link>
        <Link href="/admin/verifications"><strong>Trust & safety</strong><span>Verification and provider trust</span></Link>
        <Link href="/admin/work"><strong>Work</strong><span>Requests, assignments and interventions</span></Link>
        <Link href="/admin/money"><strong>Money</strong><span>Obligations, payouts, refunds and disputes</span></Link>
        <Link href="/admin/discovery"><strong>Discovery & SEO</strong><span>Taxonomy, public pages and indexability</span></Link>
        <Link href="/admin/operations"><strong>Operations</strong><span>Events, failures and system health</span></Link>
        <Link href="/admin/audit"><strong>Audit</strong><span>Who changed what, when and why</span></Link>
      </div>
    </section>
  </div>;
}
