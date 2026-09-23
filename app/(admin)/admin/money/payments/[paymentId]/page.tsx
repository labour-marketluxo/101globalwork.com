import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { DecisionList, Money, StatusPill } from '@/components/admin/MoneySections';
import { adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getPaymentLedger, readNumber, readObject, readRows, readText } from '@/features/admin/money';
import { postAdjustmentAction, retryReconciliationAction } from '@/features/admin/money-actions';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Ledger detail', robots: { index: false, follow: false } };

/**
 * /admin/money/payments/[paymentId] — the immutable ledger inspector.
 *
 * ⚠️ NOTHING ON THIS PAGE CAN EDIT A LEDGER LINE, AND THERE IS NO PATH THAT COULD. `ledger_entries` carries no
 * writable grant for an authenticated caller, and the only money-moving control is a command that posts a NEW
 * balanced transaction. "Immutable" is a property of the database here, not a promise on a screen.
 *
 * ⚠️ THE TWO INTERVENTIONS ARE BOTH RE-CHECKS, NOT OVERRIDES. Retrying reconciliation re-runs the same
 * comparison and refuses to bless a mismatch; an adjustment posts an offset entry within bounds the command
 * enforces (never above the obligation, never below a zero payable, never once money has left).
 */
export default async function PaymentLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ failed?: string; step_up?: string; reconciled?: string; adjusted?: string }>;
}) {
  const [{ paymentId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const [context, ledger, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getPaymentLedger(paymentId),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (!ledger.allowed) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>The ledger inspector is behind the finance capability. Nothing has changed.</p>
        </section>
      </div>
    );
  }
  if (ledger.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>That payment could not be loaded</h1>
          <p>Nothing has changed. Reload the page to try again.</p>
        </section>
      </div>
    );
  }
  if (!ledger.found || !ledger.data) notFound();

  const data = ledger.data;
  const attempt = readObject(data.attempt);
  const obligation = readObject(data.obligation);
  const project = readObject(data.project);
  const entries = readRows(data.entries);
  const balances = readRows(data.balances);
  const events = readRows(data.events);
  const reconciliations = readRows(data.reconciliations);
  const adjustments = readRows(data.adjustments);
  const refunds = readRows(data.refunds);
  const payouts = readRows(data.payouts);
  const disputes = readRows(data.disputes);
  const transactionBalance = readRows(data.transaction_balance);

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = Boolean(hasFactor && levels?.currentLevel !== 'aal2');
  const canReconcile = Boolean(context?.has('platform.money.reconcile') || context?.has('platform.admin.manage'));
  const failure = adminFailureCopy(query.failed);
  const next = `/admin/money/payments/${paymentId}`;
  const unreconciledEvents = events.filter(event => ['received', 'verified'].includes(readText(event.status) ?? ''));
  const reconcileReason = stepUpPending
    ? 'Confirm it is you on this session first.'
    : 'Your role cannot reconcile payments.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Money · ledger detail</p>
          <h1>{readText(project.title) ?? 'Payment trace'}</h1>
          <p>
            Internal attempt {readText(attempt.checkout_reference) ?? 'without a checkout reference'} · provider{' '}
            {readText(attempt.provider_reference) ?? 'no reference yet'} · obligation{' '}
            {readText(obligation.status)?.replaceAll('_', ' ') ?? 'unknown'}
          </p>
        </div>
        <div className="admin-row-actions">
          <StatusPill status={readText(attempt.status) ?? 'unknown'} />
          <Link className="secondary-button" href="/admin/money/payments">Back to the monitor</Link>
          <a className="secondary-button" href={`/admin/money/payments/${paymentId}/export`} download>Export transaction trace</a>
        </div>
      </header>

      {failure ? (
        <p className="notice" role="alert"><strong>That did not run.</strong><br />{failure}</p>
      ) : null}
      {query.step_up === '1' ? (
        <p className="notice" role="status">This session is now confirmed with your second factor. Try the command again — nothing was saved by the attempt that was refused.</p>
      ) : null}
      {query.reconciled ? (
        <p className="notice" role="status">
          Reconciliation re-ran: <strong>{query.reconciled}</strong>. {query.reconciled === 'mismatch'
            ? 'It still does not match, and nothing was written to the ledger.'
            : 'The result is recorded with your reason and reference.'}
        </p>
      ) : null}
      {query.adjusted ? (
        <p className="notice" role="status">
          Adjustment posted as a new balanced transaction. No existing entry was changed — that is what an offset
          entry is for.
        </p>
      ) : null}

      {stepUpPending ? (
        <p className="notice" role="alert">
          <strong>This session has not passed your second factor.</strong> Money interventions need one.{' '}
          <Link href={`/auth/challenge?redirect=${encodeURIComponent(`${next}?step_up=1`)}`}>Confirm it is you</Link> and come back.
        </p>
      ) : null}

      <section className="admin-section" aria-labelledby="ledger-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="ledger-heading">Ledger</h2>
            <p>Every entry written against this obligation, with the transaction that carried it. Nothing here can be edited or deleted.</p>
          </div>
          <span>{entries.length} entries</span>
        </div>
        {entries.length === 0 ? (
          <p className="empty-admin">No ledger entry exists for this obligation yet — nothing has been funded.</p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="sr-only">Immutable double-entry ledger lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Written</th>
                    <th scope="col">Transaction</th>
                    <th scope="col">Account</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Idempotency key</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={readText(entry.entry_id)}>
                      <td><small>{readText(entry.created_at) ? new Date(String(entry.created_at)).toLocaleString('en-GB') : 'unknown'}</small></td>
                      <td><small>{readText(entry.transaction_type) ?? 'transaction'} · {String(readText(entry.transaction_id) ?? '').slice(0, 8)}</small></td>
                      <td>
                        <small>{readText(entry.account_code)}</small>
                        <small>{readText(entry.account_kind)} · {readText(entry.account_owner_kind)}</small>
                      </td>
                      <td><Money minor={readNumber(entry.amount_minor)} currency={readText(entry.currency_code)} /></td>
                      <td><small>{readText(entry.idempotency_key) ?? '—'}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-incident-meta">
              <span>
                {transactionBalance.every(transaction => transaction.balanced === true)
                  ? 'Every transaction above sums to zero for its currency — checked in the read, not assumed.'
                  : 'A transaction does NOT balance. Escalate this before anything else on this page.'}
              </span>
            </p>
          </>
        )}

        {balances.length > 0 ? (
          <>
            <div className="admin-section-heading" style={{ marginTop: 18 }}>
              <div><h3>Account balances from these entries</h3><p>Net movement per account, for this obligation only.</p></div>
            </div>
            <ul className="admin-facts">
              {balances.map(balance => (
                <li key={readText(balance.account_code) ?? 'account'}>
                  <strong>{readText(balance.account_code)}</strong>
                  <span>
                    <Money minor={readNumber(balance.net_minor)} currency={readText(balance.currency_code)} />
                    {' · '}{readNumber(balance.entry_count) ?? 0} entries · {readText(balance.account_kind)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div><h2>Provider webhook events</h2><p>The raw history, with the payload hash and whether the signature was verified.</p></div>
            <span>{events.length}</span>
          </div>
          {events.length === 0 ? (
            <p className="empty-admin">No provider event has arrived for this attempt.</p>
          ) : (
            <ul className="admin-session-list">
              {events.map(event => (
                <li key={readText(event.id) ?? 'event'}>
                  <strong>{readText(event.event_type)?.replaceAll('_', ' ')} · {readText(event.status)}</strong>
                  <span>
                    {readText(event.provider_event_id)}
                    {' · signature '}{event.signature_verified === true ? 'verified' : 'NOT verified'}
                    {readText(event.rejection_reason) ? ` · rejected: ${readText(event.rejection_reason)}` : ''}
                  </span>
                  <small>
                    received {readText(event.received_at) ? new Date(String(event.received_at)).toLocaleString('en-GB') : 'unknown'}
                    {readText(event.reconciled_at) ? ` · reconciled ${new Date(String(event.reconciled_at)).toLocaleString('en-GB')}` : ''}
                    {readText(event.payload_sha256) ? ` · sha256 ${String(readText(event.payload_sha256)).slice(0, 16)}…` : ''}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div><h2>Reconciliation</h2><p>The verdict recorded for this attempt, and why.</p></div>
            <span>{reconciliations.length}</span>
          </div>
          {reconciliations.length === 0 ? (
            <p className="empty-admin">No reconciliation has run for this attempt.</p>
          ) : (
            <DecisionList
              decisions={reconciliations.map(reconciliation => ({
                action: String(readText(reconciliation.result) ?? 'checked'),
                reasonCode: String(readText(readObject(reconciliation.details).reason) ?? 'recorded'),
                note: JSON.stringify(readObject(reconciliation.details)),
                decidedBy: 'The reconciliation command',
                decidedAt: readText(reconciliation.reconciled_at),
              }))}
            />
          )}

          <div className="admin-section-heading" style={{ marginTop: 18 }}>
            <div><h2>Retry reconciliation</h2><p>Re-runs the same comparison. It will not turn a mismatch into a match.</p></div>
          </div>
          {unreconciledEvents.length === 0 ? (
            <p className="empty-admin">
              Nothing is waiting to be reconciled on this attempt. A retry is only offered for an event the platform
              has received but not resolved.
            </p>
          ) : (
            <div className="admin-list">
              {unreconciledEvents.map(event => (
                <article key={readText(event.id) ?? 'event'}>
                  <div>
                    <strong>{readText(event.event_type)?.replaceAll('_', ' ')}</strong>
                    <span>{readText(event.provider_event_id)} · {readText(event.status)}</span>
                  </div>
                  <form action={retryReconciliationAction}>
                    <input type="hidden" name="attempt_id" value={paymentId} />
                    <input type="hidden" name="provider_event_id" value={readText(event.id) ?? ''} />
                    <input type="hidden" name="next" value={next} />
                    <ReasonCodeControl
                      triggerLabel="Retry reconciliation"
                      triggerClassName="admin-trigger-quiet"
                      title="Re-run the reconciliation for this event"
                      description="The same adapter, amount and currency comparison runs again. If it still disagrees, the mismatch stays and nothing is posted to the ledger."
                      confirmLabel="Re-run the check"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons.reconciliation_retry}
                      noteLabel="What changed since it did not match"
                      tone="standard"
                      disabled={!canReconcile || stepUpPending}
                      disabledReason={reconcileReason}
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`evidence-${readText(event.id)}`}>Support ticket or case reference</label>
                          <input id={`evidence-${readText(event.id)}`} name="evidence_reference" required minLength={3} maxLength={200} placeholder="e.g. SUP-4821" className="admin-field" />
                        </>
                      }
                    />
                  </form>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div><h2>Approved offset entry</h2><p>The only way an operator moves a balance. It posts a new balanced transaction.</p></div>
          </div>
          <p className="admin-incident-meta">
            <span>
              Bounds the command enforces: never more than the obligation, never below a zero provider payable, and
              never once a payout has been paid — that is a refund or a chargeback, and each has its own path.
            </span>
          </p>
          <form action={postAdjustmentAction} className="admin-row-actions">
            <input type="hidden" name="attempt_id" value={paymentId} />
            <input type="hidden" name="obligation_id" value={readText(obligation.id) ?? ''} />
            <input type="hidden" name="next" value={next} />
            <ReasonCodeControl
              triggerLabel="Initiate approved adjustment"
              triggerClassName="admin-confirm-danger"
              title="Post an approved offset entry"
              description="This writes two entries that sum to zero: one against the provider's payable account and one against the platform's adjustment account. Existing entries are never touched."
              confirmLabel="Post the adjustment"
              confirmClassName="admin-confirm-danger"
              reasons={reasons.ledger_adjustment}
              noteLabel="What is being corrected, and why an adjustment is right"
              disabled={!canReconcile || stepUpPending}
              disabledReason={reconcileReason}
              extraFields={
                <>
                  <label className="admin-field-label" htmlFor="adjustment-direction">Direction</label>
                  <select id="adjustment-direction" name="direction" defaultValue="reduce_provider_payable" className="admin-field">
                    <option value="reduce_provider_payable">Reduce what the provider is owed</option>
                    <option value="increase_provider_payable">Increase what the provider is owed</option>
                  </select>
                  <label className="admin-field-label" htmlFor="adjustment-amount">Amount (major units)</label>
                  <input id="adjustment-amount" name="amount" type="number" min="0.01" step="0.01" required className="admin-field" />
                  <label className="admin-field-label" htmlFor="adjustment-evidence">Support ticket or case reference</label>
                  <input id="adjustment-evidence" name="evidence_reference" required minLength={3} maxLength={200} className="admin-field" />
                </>
              }
            />
          </form>
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div><h2>What surrounds this payment</h2><p>The other records this obligation carries.</p></div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Refunds</dt>
              <dd>{refunds.length === 0 ? 'None' : refunds.map(refund => `${readText(refund.status)} ${readText(refund.amount_minor) ?? ''}`).join(' · ')}</dd>
            </div>
            <div>
              <dt>Payouts</dt>
              <dd>{payouts.length === 0 ? 'None raised' : payouts.map(payout => `${readText(payout.status)} · ${readText(payout.provider_reference) ?? 'no reference'}`).join(' · ')}</dd>
            </div>
            <div>
              <dt>Chargebacks</dt>
              <dd>{disputes.length === 0 ? 'None' : disputes.map(dispute => `${readText(dispute.status)} · ${readText(dispute.resolution) ?? 'no resolution'}`).join(' · ')}</dd>
            </div>
            <div>
              <dt>Adjustments on this obligation</dt>
              <dd>{adjustments.length === 0 ? 'None posted' : `${adjustments.length} posted`}</dd>
            </div>
          </dl>
          {adjustments.length > 0 ? (
            <DecisionList
              decisions={adjustments.map(adjustment => ({
                action: `${readText(adjustment.direction)?.replaceAll('_', ' ')} · ${readText(adjustment.amount_minor)}`,
                reasonCode: String(readText(adjustment.reason_code) ?? ''),
                note: String(readText(adjustment.note) ?? ''),
                evidenceReference: readText(adjustment.evidence_reference),
                decidedBy: String(readText(adjustment.executed_by) ?? ''),
                decidedAt: readText(adjustment.executed_at),
              }))}
            />
          ) : null}
          <p className="admin-row-actions">
            <Link className="text-button" href={`/admin/money/${readText(obligation.id) ?? ''}`}>
              The financial console record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <Link className="text-button" href={`/admin/projects/${readText(project.request_id) ?? ''}`}>
              Project diagnostics
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
