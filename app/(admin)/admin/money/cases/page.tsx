import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { DecisionList, Money, ResolutionLabel, StatusPill } from '@/components/admin/MoneySections';
import { CHARGEBACK_RESOLUTIONS, CHARGEBACK_RESOLUTION_COPY, adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getMoneyCases, readNumber, readObject, readRows, readText } from '@/features/admin/money';
import { decideMoneyCaseAction } from '@/features/admin/money-actions';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Refunds and disputes', robots: { index: false, follow: false } };

/**
 * /admin/money/cases — chargeback and reversal resolution.
 *
 * ⚠️ A CUSTOMER REQUEST AND A PROVIDER CHARGEBACK ARE DIFFERENT CASES, AND THE CONTROLS DIFFER WITH THEM. A
 * request is a person asking; a chargeback is a bank asserting, with a deadline. Approving a refund goes through
 * the platform's existing refund command with a case-derived idempotency key, so pressing the button twice
 * produces one refund — and rejecting a claim moves no money while being recorded just as fully.
 */
export default async function MoneyCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; q?: string; failed?: string; step_up?: string; decided?: string }>;
}) {
  const query = await searchParams;
  const kind = ['customer_request', 'provider_dispute'].includes(query.kind ?? '') ? query.kind : 'any';

  const supabase = await createSupabaseServerClient();
  const [context, cases, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getMoneyCases({ kind, status: query.status, search: query.q }),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const canDecide = Boolean(
    context?.has('platform.money.dispute_manage') || context?.has('platform.money.refund') || context?.has('platform.admin.manage'),
  );
  const levels = assurance.data;
  const stepUpPending = Boolean(levels?.nextLevel === 'aal2' && levels?.currentLevel !== 'aal2');
  const failure = adminFailureCopy(query.failed);

  if (!cases.allowed && !cases.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>Refunds and disputes are behind the finance capability. Nothing has changed.</p>
        </section>
      </div>
    );
  }

  const counts = cases.data.counts;
  const disabledReason = stepUpPending
    ? 'Confirm it is you on this session first.'
    : 'Your role cannot decide a money case.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Money · refunds &amp; disputes</p>
          <h1>Chargebacks and reversals.</h1>
          <p>
            Customer refund and dispute requests beside the provider&apos;s own chargebacks, each with its payment
            reference, the hold it creates on the money, and every decision recorded against it.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/money">Financial overview</Link>
          <Link className="secondary-button" href="/admin/money/payments">Payments</Link>
          <Link className="secondary-button" href="/admin/money/payouts">Payouts</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Case state">
        <article><span>Customer requests open</span><strong>{readNumber(counts.customer_open) ?? 0}</strong><small>{readNumber(counts.awaiting_evidence) ?? 0} awaiting evidence</small></article>
        <article><span>Chargebacks unresolved</span><strong>{readNumber(counts.provider_open) ?? 0}</strong><small>Each one holds the payout</small></article>
        <article><span>Refunds in flight</span><strong>{readNumber(counts.refunds_in_flight) ?? 0}</strong><small>Also holding the payout</small></article>
        <article><span>Cases shown</span><strong>{cases.data.cases.length}</strong><small>Filtered list below</small></article>
      </section>

      {failure ? <p className="notice" role="alert"><strong>That did not save.</strong><br />{failure}</p> : null}
      {query.step_up === '1' ? (
        <p className="notice" role="status">This session is now confirmed with your second factor. Try the decision again — nothing was saved by the attempt that was refused.</p>
      ) : null}
      {query.decided ? (
        <p className="notice" role="status">
          Decision recorded: <strong>{query.decided.replaceAll('_', ' ')}</strong>. It is in the case history and in
          the audit stream, with your reason code and note.
        </p>
      ) : null}

      <form method="get" action="/admin/money/cases" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="reference, reason or party" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="kind">Case type</label>
          <select id="kind" name="kind" defaultValue={kind} className="admin-field">
            <option value="any">Both kinds</option>
            <option value="customer_request">Customer requests</option>
            <option value="provider_dispute">Provider chargebacks</option>
          </select>
        </div>
        <button type="submit" className="secondary-button">Filter cases</button>
        {query.q || (query.kind && query.kind !== 'any') ? <Link className="text-button" href="/admin/money/cases">Clear</Link> : null}
      </form>

      {cases.unavailable ? (
        <p className="empty-admin">The case queue could not be read. Nothing has changed — reload to try again.</p>
      ) : cases.data.cases.length === 0 ? (
        <p className="empty-admin">
          Nothing matches that filter. Customer requests are raised from their own payment page; chargebacks arrive
          from the provider&apos;s signed webhook.
        </p>
      ) : (
        cases.data.cases.map(item => {
          const caseId = readText(item.id) ?? '';
          const caseKind = readText(item.kind) ?? 'customer_request';
          const provider = readObject(item.provider);
          const customer = readObject(item.customer);
          const decisions = readRows(item.decisions).map(decision => ({
            action: readText(decision.action) ?? 'decision',
            reasonCode: readText(decision.reason_code) ?? 'recorded',
            note: readText(decision.note) ?? '',
            evidenceReference: readText(decision.evidence_reference),
            decidedBy: readText(decision.decided_by) ?? 'An operator',
            decidedAt: readText(decision.decided_at),
          }));
          const resolved = caseKind === 'customer_request' ? readText(item.status) === 'reviewed' : null;
          return (
            <article key={`${caseKind}-${caseId}`} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <span className="admin-severity" data-severity={caseKind === 'provider_dispute' ? 'high' : 'low'}>
                      {caseKind === 'provider_dispute' ? 'Provider chargeback' : `Customer ${readText(item.claim_kind) ?? 'request'}`}
                    </span>
                    {caseKind === 'provider_dispute' ? <StatusPill status={readText(item.status) ?? 'unknown'} /> : <StatusPill status={readText(item.status) ?? 'open'} />}
                    {readText(item.hold_reason) ? <span className="admin-severity" data-severity="high">Holding the money: {readText(item.hold_reason)}</span> : null}
                  </div>
                  <h3>{readText(item.request_title) ?? 'Request'} · <Money minor={readNumber(item.amount_minor)} currency={readText(item.currency_code)} /></h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">
                    {readText(item.due_at)
                      ? `Provider response due ${new Date(String(item.due_at)).toLocaleDateString('en-GB')}`
                      : 'No provider deadline recorded'}
                  </span>
                  <span className="admin-incident-meta">
                    {readText(item.created_at) ? `Raised ${new Date(String(item.created_at)).toLocaleString('en-GB')}` : ''}
                  </span>
                </div>
              </div>

              <div className="admin-incident-meta">
                <span>Payment reference {readText(item.payment_reference) ?? 'not recorded'} · obligation {readText(item.obligation_status)?.replaceAll('_', ' ')}</span>
                <span>Provider {readText(provider.name) ?? 'unknown'}</span>
                {customer.account_id ? (
                  <span>
                    Customer {readText(customer.name)}
                    {readText(customer.contact_masked) ? ` · ${readText(customer.contact_masked)}` : ''}
                  </span>
                ) : null}
                {readText(item.provider_dispute_id) ? <span>Provider dispute {readText(item.provider_dispute_id)}</span> : null}
              </div>

              <p>{readText(item.message) ?? readText(item.reason) ?? 'No claim text recorded.'}</p>
              {caseKind === 'provider_dispute' ? <p className="admin-incident-meta"><ResolutionLabel resolution={readText(item.resolution)} /></p> : null}
              {readText(item.evidence_requested_at) ? (
                <p className="admin-incident-meta">
                  <span>Evidence requested {new Date(String(item.evidence_requested_at)).toLocaleDateString('en-GB')} — {readText(item.evidence_request_note) ?? 'no note recorded'}</span>
                </p>
              ) : null}

              {decisions.length > 0 ? (
                <details className="identity-details">
                  <summary>Decisions ({decisions.length})</summary>
                  <DecisionList decisions={decisions} />
                </details>
              ) : null}

              <div className="admin-row-actions">
                <Link className="text-button" href={`/admin/money/${readText(item.obligation_id) ?? ''}`}>
                  Open the financial record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>

                {caseKind === 'customer_request' && !resolved ? (
                  <>
                    <form action={decideMoneyCaseAction}>
                      <input type="hidden" name="case_kind" value={caseKind} />
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="action" value="approve_refund" />
                      <input type="hidden" name="next" value="/admin/money/cases" />
                      <ReasonCodeControl
                        triggerLabel="Approve refund"
                        triggerClassName="admin-confirm-amber"
                        title="Approve this refund"
                        description="Creates a refund through the platform's refund command with a key derived from this case, so a second press produces one refund rather than two. The refund still has to be submitted to the provider afterwards from the financial record."
                        confirmLabel="Approve the refund"
                        confirmClassName="admin-confirm-amber"
                        reasons={reasons.money_case_decision}
                        noteLabel="Why the refund is right"
                        tone="standard"
                        disabled={!canDecide || stepUpPending}
                        disabledReason={disabledReason}
                        extraFields={
                          <>
                            <label className="admin-field-label" htmlFor={`amount-${caseId}`}>Refund amount (major units)</label>
                            <input id={`amount-${caseId}`} name="amount" type="number" min="0.01" step="0.01" required className="admin-field" />
                          </>
                        }
                      />
                    </form>

                    <form action={decideMoneyCaseAction}>
                      <input type="hidden" name="case_kind" value={caseKind} />
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="action" value="reject_claim" />
                      <input type="hidden" name="next" value="/admin/money/cases" />
                      <ReasonCodeControl
                        triggerLabel="Reject claim"
                        triggerClassName="admin-trigger-danger"
                        title="Reject this claim"
                        description="Moves no money. The claim is marked reviewed with your reason and note, and the customer sees the decision as final unless they raise a new one."
                        confirmLabel="Reject the claim"
                        confirmClassName="admin-confirm-danger"
                        reasons={reasons.money_case_decision}
                        noteLabel="Why the claim is refused"
                        disabled={!canDecide || stepUpPending}
                        disabledReason={disabledReason}
                      />
                    </form>
                  </>
                ) : null}

                <form action={decideMoneyCaseAction}>
                  <input type="hidden" name="case_kind" value={caseKind} />
                  <input type="hidden" name="case_id" value={caseId} />
                  <input type="hidden" name="action" value="request_evidence" />
                  <input type="hidden" name="next" value="/admin/money/cases" />
                  <ReasonCodeControl
                    triggerLabel="Request additional evidence"
                    triggerClassName="admin-trigger-quiet"
                    title="Ask for more evidence"
                    description="Records that the case is waiting on somebody else, with the note saying exactly what is needed. The platform stores the request, not an attachment — evidence still lives with the project it belongs to."
                    confirmLabel="Record the request"
                    confirmClassName="admin-confirm-amber"
                    reasons={reasons.money_case_decision}
                    noteLabel="What is needed, and from whom"
                    tone="standard"
                    disabled={!canDecide || stepUpPending}
                    disabledReason={disabledReason}
                  />
                </form>

                {caseKind === 'provider_dispute' ? (
                  <form action={decideMoneyCaseAction}>
                    <input type="hidden" name="case_kind" value={caseKind} />
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="action" value="record_chargeback_result" />
                    <input type="hidden" name="next" value="/admin/money/cases" />
                    <ReasonCodeControl
                      triggerLabel="Record provider result"
                      triggerClassName="admin-trigger-danger"
                      title="Record the provider's chargeback result"
                      description="The provider's own answer to this chargeback. Clearing it for payout releases the hold the chargeback placed on the money; any other outcome keeps it held."
                      confirmLabel="Record the result"
                      confirmClassName="admin-confirm-danger"
                      reasons={reasons.money_case_decision}
                      noteLabel="What the provider decided, and on what evidence"
                      disabled={!canDecide || stepUpPending}
                      disabledReason={disabledReason}
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`resolution-${caseId}`}>Provider result</label>
                          <select id={`resolution-${caseId}`} name="resolution" required defaultValue="" className="admin-field">
                            <option value="" disabled>Choose the result</option>
                            {CHARGEBACK_RESOLUTIONS.map(value => (
                              <option key={value} value={value}>{CHARGEBACK_RESOLUTION_COPY[value]}</option>
                            ))}
                          </select>
                        </>
                      }
                    />
                  </form>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
