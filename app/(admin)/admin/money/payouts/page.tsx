import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { BlockReason, Money, StatusPill } from '@/components/admin/MoneySections';
import { PAYOUT_STATUSES, adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getPayoutOperations, readNumber, readObject, readRows, readText } from '@/features/admin/money';
import { escalatePayoutFailureAction, placePayoutHoldAction, releasePayoutHoldAction } from '@/features/admin/money-actions';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { queueAndSubmitPayoutAction } from '@/app/(admin)/admin/money/[id]/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Payout operations', robots: { index: false, follow: false } };

/**
 * /admin/money/payouts — the transfer and earnings monitor.
 *
 * ⚠️ THE ELIGIBILITY VERDICT IS THE PLATFORM'S OWN, AND A POLICY HOLD IS OURS. `payout_execution_block_reason` is
 * the check the submission path runs, so the queue cannot claim "eligible" about a transfer that would be
 * refused. A hold placed here appears with its reason and author, and releasing it hands the payout back to that
 * same check rather than declaring it eligible.
 *
 * ⚠️ "RETRY ALLOWED PAYOUT" IS THE EXISTING SUBMISSION ACTION. It posts to `queueAndSubmitPayoutAction` from the
 * financial console — one implementation of moving money, with its own revalidation and ambiguity handling —
 * rather than a second transfer path written for this page.
 */
export default async function PayoutOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; failed?: string; step_up?: string; held?: string; released?: string; escalated?: string }>;
}) {
  const query = await searchParams;
  const status = PAYOUT_STATUSES.includes(query.status as (typeof PAYOUT_STATUSES)[number]) ? query.status : undefined;

  const supabase = await createSupabaseServerClient();
  const [context, operations, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getPayoutOperations({ status, search: query.q }),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const canRead = Boolean(context?.has('platform.money.read') || context?.has('platform.money.payout') || context?.has('platform.admin.manage'));
  const canHold = Boolean(context?.has('platform.money.payout') || context?.has('platform.money.dispute_manage') || context?.has('platform.admin.manage'));
  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = Boolean(hasFactor && levels?.currentLevel !== 'aal2');
  const failure = adminFailureCopy(query.failed);

  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>Payout operations are behind the finance capability. Nothing has changed.</p>
        </section>
      </div>
    );
  }

  const counts = operations.data.counts;
  const holdReason = stepUpPending ? 'Confirm it is you on this session first.' : 'Your role cannot hold a payout.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Money · payouts</p>
          <h1>Provider earnings and transfers.</h1>
          <p>
            Where each payout stands, what the platform&apos;s own eligibility check says about it, the masked
            destination it would go to, and every hold placed on it with its reason.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/money">Financial overview</Link>
          <Link className="secondary-button" href="/admin/money/payments">Payments</Link>
          <Link className="secondary-button" href="/admin/money/cases">Refunds &amp; disputes</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Payout state">
        <article><span>Eligible</span><strong>{readNumber(counts.eligible) ?? 0}</strong><small>{readNumber(counts.total) ?? 0} payouts recorded</small></article>
        <article><span>Under a policy hold</span><strong>{readNumber(counts.held) ?? 0}</strong><small>Placed by an operator</small></article>
        <article><span>Blocked by a rule</span><strong>{readNumber(counts.blocked_by_record) ?? 0}</strong><small>Unfunded, incomplete, refunded or disputed</small></article>
        <article><span>Failed or in flight</span><strong>{(readNumber(counts.failed) ?? 0) + (readNumber(counts.processing) ?? 0)}</strong><small>{readNumber(counts.paid) ?? 0} paid</small></article>
      </section>
      <p className="admin-incident-meta">
        <span>Whole-platform counts. The filters below narrow the list, not these numbers.</span>
      </p>

      {failure ? <p className="notice" role="alert"><strong>That did not run.</strong><br />{failure}</p> : null}
      {query.step_up === '1' ? (
        <p className="notice" role="status">This session is now confirmed with your second factor. Try the action again — nothing was saved by the attempt that was refused.</p>
      ) : null}
      {query.held ? <p className="notice" role="status">Hold placed. The payout is blocked at the execution path with the reason you chose, and the row records who placed it and under which reference.</p> : null}
      {query.released ? <p className="notice" role="status">Hold released. The payout went back to the platform&apos;s own eligibility check — if a refund or chargeback still blocks it, it stays blocked with that reason.</p> : null}
      {query.escalated ? <p className="notice" role="status">Escalated into a case. <Link href="/admin/trust/cases">Open the case queue</Link> to assign it.</p> : null}

      <form method="get" action="/admin/money/payouts" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="provider, project or reference" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={query.status ?? ''} className="admin-field">
            <option value="">Every status</option>
            {PAYOUT_STATUSES.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
          </select>
        </div>
        <button type="submit" className="secondary-button">Filter payouts</button>
        {query.q || query.status ? <Link className="text-button" href="/admin/money/payouts">Clear</Link> : null}
      </form>

      {!operations.allowed ? (
        <p className="empty-admin">
          {operations.unavailable ? 'The payout monitor could not be read. Nothing has changed — reload to try again.' : 'Your role cannot read payouts.'}
        </p>
      ) : operations.data.payouts.length === 0 ? (
        <p className="empty-admin">No payout matches that filter. One exists as soon as a funded project is completed.</p>
      ) : (
        operations.data.payouts.map(payout => {
          const payoutId = readText(payout.payout_id) ?? '';
          const project = readObject(payout.project);
          const provider = readObject(payout.provider);
          const destination = readObject(payout.destination);
          const hold = readObject(payout.hold);
          const holdId = readText(hold.id);
          return (
            <article key={payoutId} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <StatusPill status={readText(payout.status) ?? 'unknown'} />
                    <BlockReason reason={readText(payout.eligibility_block)} holdReason={holdId ? readText(hold.reason_code) : null} />
                    <span>{readText(provider.name) ?? 'Provider'}</span>
                  </div>
                  <h3><Money minor={readNumber(payout.amount_minor)} currency={readText(payout.currency_code)} /> · {readText(project.title) ?? 'Request'}</h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">
                    {readText(payout.updated_at) ? `Updated ${new Date(String(payout.updated_at)).toLocaleString('en-GB')}` : ''}
                  </span>
                  <span className="admin-incident-meta">{readText(payout.provider_reference) ?? 'no provider reference'}</span>
                </div>
              </div>

              <div className="admin-incident-meta">
                <span>Project {readText(project.state)?.replaceAll('_', ' ') ?? 'unknown'} · obligation {readText(payout.obligation_status)?.replaceAll('_', ' ') ?? 'unknown'}</span>
                {destination.destination_type ? (
                  <span>
                    Destination {readText(destination.destination_type)?.replaceAll('_', ' ')} ····{readText(destination.account_last4) ?? '****'}
                    {' · '}{readText(destination.verification_status) ?? 'unverified'}
                    {readText(destination.recipient_reference) ? ` · recipient ${readText(destination.recipient_reference)}…` : ''}
                  </span>
                ) : (
                  <span>No payout destination is recorded for this provider</span>
                )}
                {holdId ? (
                  <span>
                    Held: {readText(hold.reason_code)?.replaceAll('_', ' ')} · {readText(hold.note)}
                    {' · '}{readText(hold.placed_by) ?? 'an operator'}
                    {readText(hold.placed_at) ? ` on ${new Date(String(hold.placed_at)).toLocaleDateString('en-GB')}` : ''}
                    {' · reference '}{readText(hold.evidence_reference)}
                  </span>
                ) : null}
              </div>

              {readRows(payout.events).length > 0 ? (
                <details className="identity-details">
                  <summary>Payout history ({readRows(payout.events).length} recent)</summary>
                  <ul className="admin-session-list">
                    {readRows(payout.events).map((event, index) => (
                      <li key={`${readText(event.action)}-${index}`}>
                        <strong>{readText(event.action)?.replaceAll('_', ' ')}</strong>
                        <span>{readText(event.actor) ?? 'system'}{readText(event.reason_code) ? ` · ${readText(event.reason_code)?.replaceAll('_', ' ')}` : ''}</span>
                        <small>{readText(event.occurred_at) ? new Date(String(event.occurred_at)).toLocaleString('en-GB') : ''}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="admin-row-actions">
                <Link className="text-button" href={`/admin/money/${readText(payout.obligation_id) ?? ''}`}>
                  Open the financial record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>

                {holdId ? (
                  <form action={releasePayoutHoldAction}>
                    <input type="hidden" name="hold_id" value={holdId} />
                    <input type="hidden" name="next" value="/admin/money/payouts" />
                    <ReasonCodeControl
                      triggerLabel="Release payout hold"
                      triggerClassName="admin-trigger-quiet"
                      title="Release the policy hold on this payout"
                      description="Releasing hands the payout back to the platform's own eligibility check. If a refund is still in flight or a chargeback unresolved, it stays blocked — with that reason instead of yours."
                      confirmLabel="Release the hold"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons.payout_hold_release}
                      noteLabel="Why it can be released"
                      disabled={!canHold || stepUpPending}
                      disabledReason={holdReason}
                    />
                  </form>
                ) : (
                  <form action={placePayoutHoldAction}>
                    <input type="hidden" name="payout_id" value={payoutId} />
                    <input type="hidden" name="next" value="/admin/money/payouts" />
                    <ReasonCodeControl
                      triggerLabel="Place payout hold"
                      triggerClassName="admin-trigger-danger"
                      title="Hold this payout"
                      description="A policy hold blocks the transfer at the execution path and records who placed it, under which reference. It does not change the provider's own records."
                      confirmLabel="Place the hold"
                      confirmClassName="admin-confirm-danger"
                      reasons={reasons.payout_hold}
                      noteLabel="What this hold is for"
                      disabled={!canHold || stepUpPending || readText(payout.status) === 'paid'}
                      disabledReason={
                        readText(payout.status) === 'paid'
                          ? 'This payout has already been paid.'
                          : holdReason
                      }
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`evidence-${payoutId}`}>Support ticket or case reference</label>
                          <input id={`evidence-${payoutId}`} name="evidence_reference" required minLength={3} maxLength={200} className="admin-field" />
                        </>
                      }
                    />
                  </form>
                )}

                {readText(payout.eligibility_block) === null && !holdId && readText(payout.status) !== 'paid' ? (
                  <form action={queueAndSubmitPayoutAction}>
                    <input type="hidden" name="obligation_id" value={readText(payout.obligation_id) ?? ''} />
                    <input type="hidden" name="payout_id" value={payoutId} />
                    <button type="submit" className="admin-trigger-quiet">Retry allowed payout</button>
                  </form>
                ) : null}

                <form action={escalatePayoutFailureAction}>
                  <input type="hidden" name="provider_id" value={readText(provider.provider_id) ?? ''} />
                  <input type="hidden" name="request_id" value={readText(project.request_id) ?? ''} />
                  <input type="hidden" name="next" value="/admin/money/payouts" />
                  <ReasonCodeControl
                    triggerLabel="Escalate payout failure"
                    triggerClassName="admin-trigger-quiet"
                    title="Escalate this payout into a case"
                    description="Opens an owned case with an SLA against the provider and the project. The money record stays where the money is; the case is where the follow-up lives."
                    confirmLabel="Open the case"
                    confirmClassName="admin-confirm-amber"
                    reasons={reasons.trust_case_action}
                    noteLabel="What the reviewer will see first"
                    tone="standard"
                    disabled={stepUpPending}
                    disabledReason="Confirm it is you on this session first."
                    extraFields={
                      <>
                        <label className="admin-field-label" htmlFor={`case-summary-${payoutId}`}>Case summary</label>
                        <textarea id={`case-summary-${payoutId}`} name="summary" required minLength={10} maxLength={2000} rows={3} className="admin-field" />
                        <label className="admin-field-label" htmlFor={`case-type-${payoutId}`}>Case type</label>
                        <select id={`case-type-${payoutId}`} name="case_type" defaultValue="other" className="admin-field">
                          <option value="other">Operational</option>
                          <option value="dispute">Dispute</option>
                          <option value="fraud">Suspected fraud</option>
                        </select>
                        <label className="admin-field-label" htmlFor={`case-severity-${payoutId}`}>Severity</label>
                        <select id={`case-severity-${payoutId}`} name="severity" defaultValue="medium" className="admin-field">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="critical">Critical</option>
                        </select>
                      </>
                    }
                  />
                </form>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
