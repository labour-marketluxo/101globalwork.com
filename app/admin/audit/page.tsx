import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Audit', robots: { index: false, follow: false } };

export default async function AuditPage() {
  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase
    .from('audit_events')
    .select('id,occurred_at,actor_type,action,resource_type,resource_id,reason_code,metadata')
    .order('occurred_at',{ ascending:false })
    .limit(100);

  return <div className="admin-page">
    <header className="admin-page-header">
      <div>
        <p className="eyebrow">Audit</p>
        <h1>Who changed what, and why?</h1>
        <p>Consequential actions in plain language. Business records remain authoritative; this timeline is evidence.</p>
      </div>
      <span className="admin-quick-note">Append-oriented evidence</span>
    </header>

    <section className="admin-section">
      <div className="admin-section-heading">
        <div><h2>Recent activity</h2><p>Newest first. Technical identifiers stay available without dominating the view.</p></div>
        <span>{events?.length ?? 0} events</span>
      </div>

      {events?.length ? <div className="audit-list">
        {events.map(event => <article key={event.id}>
          <div className="audit-marker"/>
          <div>
            <div className="audit-title">
              <strong>{event.action.replaceAll('_',' ')}</strong>
              <time>{new Date(event.occurred_at).toLocaleString()}</time>
            </div>
            <p>{event.resource_type}</p>
            <div className="audit-meta">
              <span>Actor: {event.actor_type}</span>
              {event.reason_code ? <span>Reason: {event.reason_code}</span> : null}
            </div>
            {event.resource_id ? <details className="identity-details">
              <summary>Technical details</summary>
              <code>{event.resource_id}</code>
            </details> : null}
          </div>
        </article>)}
      </div> : <p className="empty-admin">No audit events yet.</p>}
    </section>
  </div>;
}
