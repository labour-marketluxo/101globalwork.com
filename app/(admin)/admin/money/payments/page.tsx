import Link from 'next/link';
import { ArrowRight } from '@/components/ui/icons';
import { AnomalyTags, Money, StatusPill } from '@/components/admin/MoneySections';
import { PAYMENT_ANOMALY_FILTERS, PAYMENT_ANOMALY_FILTER_COPY, PAYMENT_ATTEMPT_STATUSES } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getPaymentOperations, readNumber, readObject, readRows, readText } from '@/features/admin/money';

export const metadata = { title: 'Payments and reconciliation', robots: { index: false, follow: false } };

/**
 * /admin/money/payments — the payment and reconciliation monitor.
 *
 * ⚠️ RECONCILED PROVIDER RECORDS ARE THE CANONICAL TRUTH, AND THE ROW SHOWS THEM AS SUCH. Our attempt, the
 * provider's event and the ledger are three records; this list exists to show where they disagree, named, and to
 * link to the trace that explains each one. Nothing here edits a payment.
 */
export default async function PaymentOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; anomaly?: string; q?: string }>;
}) {
  const query = await searchParams;
  const anomaly = PAYMENT_ANOMALY_FILTERS.includes(query.anomaly as (typeof PAYMENT_ANOMALY_FILTERS)[number])
    ? query.anomaly
    : 'any';
  const status = PAYMENT_ATTEMPT_STATUSES.includes(query.status as (typeof PAYMENT_ATTEMPT_STATUSES)[number])
    ? query.status
    : undefined;

  const [context, operations] = await Promise.all([
    getAdminContext(),
    getPaymentOperations({ status, anomaly, search: query.q }),
  ]);
  const canRead = Boolean(context?.has('platform.money.read') || context?.has('platform.money.reconcile') || context?.has('platform.admin.manage'));

  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>Payments and reconciliation are behind the finance capability. Nothing has changed.</p>
        </section>
      </div>
    );
  }

  const counts = operations.data.counts;
  const filtered = Boolean(status || anomaly !== 'any' || query.q);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Money · payments</p>
          <h1>Payments and reconciliation.</h1>
          <p>
            Every internal attempt beside the provider events that answer it and the reconciliation verdict that
            followed. A reconciled provider record is the canonical financial truth; this page is where the three
            records are compared.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/money">Financial overview</Link>
          <Link className="secondary-button" href="/admin/money/payouts">Payouts</Link>
          <Link className="secondary-button" href="/admin/money/cases">Refunds &amp; disputes</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Reconciliation state">
        <article><span>Attempts</span><strong>{readNumber(counts.attempts) ?? 0}</strong><small>{readNumber(counts.unreconciled) ?? 0} with unreconciled events</small></article>
        <article><span>Mismatched</span><strong>{readNumber(counts.mismatched) ?? 0}</strong><small>The event did not match the attempt</small></article>
        <article><span>Rejected events</span><strong>{readNumber(counts.rejected) ?? 0}</strong><small>Failed an integrity check</small></article>
        <article><span>Stuck mid-funding</span><strong>{readNumber(counts.stuck_funding) ?? 0}</strong><small>{readNumber(counts.missing_event) ?? 0} awaiting a provider event</small></article>
      </section>
      <p className="admin-incident-meta">
        <span>Whole-platform counts over the same predicates the rows carry. The filters below narrow the list, not these numbers.</span>
      </p>

      <form method="get" action="/admin/money/payments" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="reference, project or provider" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="anomaly">Reconciliation state</label>
          <select id="anomaly" name="anomaly" defaultValue={anomaly} className="admin-field">
            {PAYMENT_ANOMALY_FILTERS.map(value => (
              <option key={value} value={value}>{PAYMENT_ANOMALY_FILTER_COPY[value] ?? value}</option>
            ))}
          </select>
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="status">Attempt status</label>
          <select id="status" name="status" defaultValue={query.status ?? ''} className="admin-field">
            <option value="">Every status</option>
            {PAYMENT_ATTEMPT_STATUSES.map(value => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="secondary-button">Filter payments</button>
        {filtered ? <Link className="text-button" href="/admin/money/payments">Clear</Link> : null}
      </form>

      {!operations.allowed ? (
        <p className="empty-admin">
          {operations.unavailable ? 'The monitor could not be read. Nothing has changed — reload to try again.' : 'Your role cannot read payments.'}
        </p>
      ) : operations.data.payments.length === 0 ? (
        <p className="empty-admin">
          No payment matches that filter. Attempts appear here the moment a customer starts a checkout.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Payment attempts with their provider events and reconciliation state</caption>
            <thead>
              <tr>
                <th scope="col">Attempt</th>
                <th scope="col">Project</th>
                <th scope="col">Amount</th>
                <th scope="col">Provider events</th>
                <th scope="col">Reconciliation</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {operations.data.payments.map(payment => {
                const attemptId = readText(payment.attempt_id) ?? '';
                const project = readObject(payment.project);
                const events = readObject(payment.events);
                const reconciliation = readObject(payment.reconciliation);
                const anomalies = Array.isArray(payment.anomalies) ? payment.anomalies.filter((value): value is string => typeof value === 'string') : [];
                return (
                  <tr key={attemptId}>
                    <td>
                      <strong><StatusPill status={readText(payment.status) ?? 'unknown'} /></strong>
                      <small>Internal {readText(payment.checkout_reference) ?? 'no checkout reference'}</small>
                      <small>
                        Provider {readText(payment.provider_reference) ?? 'none recorded'} · {readText(payment.provider_adapter) ?? 'adapter unknown'}
                      </small>
                      <small>
                        {readNumber(payment.attempt_count) ?? 0} attempt(s) on this obligation
                        {readText(payment.created_at) ? ` · started ${new Date(String(payment.created_at)).toLocaleString('en-GB')}` : ''}
                      </small>
                    </td>
                    <td>
                      <small>{readText(project.title) ?? 'Request'} · {readText(project.state)?.replaceAll('_', ' ') ?? 'unknown'}</small>
                      <small>{readText(payment.obligation_status)?.replaceAll('_', ' ') ?? 'unknown obligation'}</small>
                    </td>
                    <td><Money minor={readNumber(payment.amount_minor)} currency={readText(payment.currency_code)} /></td>
                    <td>
                      <small>{readNumber(events.count) ?? 0} received · last {readText(events.last_event_type)?.replaceAll('_', ' ') ?? 'none'}</small>
                      <small>{readNumber(events.unreconciled) ?? 0} not yet reconciled</small>
                    </td>
                    <td>
                      {reconciliation.result ? (
                        <>
                          <span><StatusPill status={String(reconciliation.result)} /></span>
                          <small>{readText(reconciliation.reconciled_at) ? new Date(String(reconciliation.reconciled_at)).toLocaleString('en-GB') : ''}</small>
                        </>
                      ) : (
                        <small>No reconciliation has run for this attempt yet</small>
                      )}
                      <div className="mt-1"><AnomalyTags anomalies={anomalies} /></div>
                    </td>
                    <td>
                      <Link className="text-button" href={`/admin/money/payments/${attemptId}`}>
                        Open ledger detail <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin-incident-meta">
        <span>
          {readRows([]).length === 0 && operations.data.payments.some(payment => (readNumber(payment.attempt_count) ?? 0) > 1)
            ? 'At least one obligation here has been attempted more than once — check which attempt the provider is answering.'
            : null}
        </span>
      </p>
    </div>
  );
}
