import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Audit', robots: { index: false, follow: false } };

export default async function AuditPage() {
  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase.from('audit_events').select('id,occurred_at,actor_type,action,resource_type,resource_id,reason_code,metadata').order('occurred_at',{ ascending:false }).limit(100);
  return <div className="admin-page"><header className="admin-page-header"><div><p className="eyebrow">Audit</p><h1>Who changed what, and why.</h1><p>Recent consequential actions. Business state remains authoritative elsewhere; this timeline is evidence.</p></div></header>
    <section className="admin-section"><div className="admin-section-heading"><div><h2>Recent activity</h2><p>Newest first. Reason codes make exceptional actions reviewable.</p></div><span>{events?.length ?? 0} events</span></div>
      {events?.length ? <div className="audit-list">{events.map(event => <article key={event.id}><div className="audit-marker"/><div><div className="audit-title"><strong>{event.action.replaceAll('_',' ')}</strong><time>{new Date(event.occurred_at).toLocaleString()}</time></div><p>{event.resource_type}{event.resource_id ? ` · ${event.resource_id}` : ''}</p><div className="audit-meta"><span>Actor: {event.actor_type}</span>{event.reason_code ? <span>Reason: {event.reason_code}</span> : null}</div></div></article>)}</div> : <p className="empty-admin">No audit events yet.</p>}
    </section></div>;
}
