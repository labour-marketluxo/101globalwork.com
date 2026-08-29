import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Operations', robots: { index: false, follow: false } };

export default async function OperationsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ count: pending }, { count: failed }, { data: events }] = await Promise.all([
    supabase.from('outbox_events').select('*', { count: 'exact', head: true }).is('published_at', null),
    supabase.from('payment_provider_events').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('outbox_events').select('id,event_type,aggregate_type,occurred_at,published_at,attempt_count,last_error').order('occurred_at', { ascending: false }).limit(12),
  ]);

  const pendingEvents = (events ?? []).filter(event => !event.published_at);
  const noDeliveryAttempts = pendingEvents.length > 0 && pendingEvents.every(event => Number(event.attempt_count ?? 0) === 0 && !event.last_error);

  return <div className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">Operations</p><h1>See failures before users feel them.</h1><p>Separate waiting work, retry failures and rejected external events so operators know what action is actually required.</p></div></header>

    {noDeliveryAttempts ? <section className="admin-section" role="alert">
      <div className="admin-section-heading"><div><h2>Outbox delivery is not yet proven</h2><p>{pendingEvents.length} recent event{pendingEvents.length === 1 ? '' : 's'} are waiting with zero delivery attempts and no recorded error. This is not a retry failure. Treat the publisher/delivery worker as not operational until a delivery attempt and successful publication are observed.</p></div></div>
    </section> : null}

    <section className="admin-stat-grid">
      <article><span>Waiting for delivery</span><strong>{pending ?? 0}</strong><small>Transactional outbox events not yet published</small></article>
      <article><span>Rejected provider events</span><strong>{failed ?? 0}</strong><small>External payment/event integrity checks</small></article>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Recent domain events</h2><p>Delivery evidence with status, attempts and the last recorded error.</p></div></div>
      {events?.length ? <div className="admin-list">{events.map(event => <article key={event.id}>
        <div><strong>{event.event_type}</strong><span>{event.published_at ? 'Published' : Number(event.attempt_count ?? 0) > 0 ? 'Retry pending' : 'Waiting — not attempted'} · attempts {event.attempt_count}</span>{event.last_error ? <span>Last error: {event.last_error}</span> : null}</div>
        <small>{event.aggregate_type} · {new Date(event.occurred_at).toLocaleString()}</small>
      </article>)}</div> : <p className="empty-admin">No domain events yet.</p>}
    </section>
  </div>;
}
