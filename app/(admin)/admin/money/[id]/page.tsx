import crypto from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clearDisputeForPayoutAction, queueAndSubmitPayoutAction, requestRefundAction, submitRefundAction } from './actions';

export const metadata = { title: 'Financial record', robots: { index: false, follow: false } };

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}

function status(value?: string | null) {
  return (value ?? 'unknown').replaceAll('_', ' ');
}

export default async function MoneyDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: obligation } = await supabase.from('payment_obligations').select('*').eq('id', id).maybeSingle();
  if (!obligation) notFound();

  const [requestResult, assignmentResult, attemptsResult, reconciliationsResult, payoutResult, refundsResult, disputesResult, entriesResult] = await Promise.all([
    supabase.from('requests').select('id,need_text,state,created_at,completed_at').eq('id', obligation.request_id).maybeSingle(),
    supabase.from('assignments').select('id,status,provider_id,assigned_at').eq('id', obligation.assignment_id).maybeSingle(),
    supabase.from('payment_attempts').select('id,status,provider_adapter,provider_reference,checkout_reference,amount_minor,currency_code,created_at,updated_at').eq('obligation_id', id).order('created_at', { ascending: false }),
    supabase.from('payment_reconciliations').select('id,provider_event_id,payment_attempt_id,ledger_transaction_id,result,details,reconciled_at').eq('obligation_id', id).order('reconciled_at', { ascending: false }),
    supabase.from('payouts').select('*').eq('obligation_id', id).maybeSingle(),
    supabase.from('payment_refunds').select('*').eq('obligation_id', id).order('created_at', { ascending: false }),
    supabase.from('payment_disputes').select('*').eq('obligation_id', id).order('created_at', { ascending: false }),
    supabase.from('ledger_entries').select('id,transaction_id,ledger_account_id,currency_code,amount_minor,created_at').eq('obligation_id', id).order('created_at', { ascending: true }),
  ]);

  const request = requestResult.data;
  const assignment = assignmentResult.data;
  const attempts = attemptsResult.data ?? [];
  const reconciliations = reconciliationsResult.data ?? [];
  const payout = payoutResult.data;
  const refunds = refundsResult.data ?? [];
  const disputes = disputesResult.data ?? [];
  const entries = entriesResult.data ?? [];

  const transactionIds = [...new Set(entries.map(entry => entry.transaction_id))];
  const accountIds = [...new Set(entries.map(entry => entry.ledger_account_id))];
  const [{ data: transactions }, { data: ledgerAccounts }] = await Promise.all([
    transactionIds.length ? supabase.from('ledger_transactions').select('id,transaction_type,external_reference,idempotency_key,occurred_at,created_at').in('id', transactionIds) : Promise.resolve({ data: [] }),
    accountIds.length ? supabase.from('ledger_accounts').select('id,account_code,account_kind,currency_code').in('id', accountIds) : Promise.resolve({ data: [] }),
  ]);
  const transactionById = new Map((transactions ?? []).map(item => [item.id, item]));
  const accountById = new Map((ledgerAccounts ?? []).map(item => [item.id, item]));
  const transactionGroups = transactionIds.map(transactionId => {
    const txEntries = entries.filter(entry => entry.transaction_id === transactionId);
    return { transactionId, tx: transactionById.get(transactionId), entries: txEntries, balance: txEntries.reduce((sum, entry) => sum + Number(entry.amount_minor), 0) };
  });

  const successfulRefundMinor = refunds.filter(item => item.status === 'succeeded').reduce((sum, item) => sum + Number(item.amount_minor), 0);
  const committedRefundMinor = refunds.filter(item => !['failed','cancelled'].includes(item.status)).reduce((sum, item) => sum + Number(item.amount_minor), 0);
  const remainingRefundMinor = Math.max(0, Number(obligation.amount_minor) - committedRefundMinor);
  const successfulAttempt = attempts.find(item => item.status === 'succeeded');

  const payoutReconciliationsResult = payout
    ? await supabase.from('payout_reconciliations').select('*').eq('payout_id', payout.id).order('reconciled_at', { ascending: false })
    : { data: [] };
  const payoutReconciliations = payoutReconciliationsResult.data ?? [];

  const destinationResult = assignment
    ? await supabase.from('provider_payout_destinations').select('id,account_name,account_last4,currency_code,verification_status,is_default').eq('provider_id', assignment.provider_id).eq('currency_code', obligation.currency_code).eq('verification_status', 'verified').eq('is_default', true).maybeSingle()
    : { data: null };
  const destination = destinationResult.data;

  return <div className="admin-page">
    <header className="admin-page-header">
      <div><p className="eyebrow">Money · financial record</p><h1>{request?.need_text ?? 'Payment obligation'}</h1><p>Trace the payment from customer obligation to provider events, ledger entries, refund/dispute holds and payout reconciliation.</p></div>
      <Link className="secondary-button" href="/admin/money">Back to Money</Link>
    </header>

    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.success ? <p className="notice">{query.success}</p> : null}

    <section className="admin-stat-grid">
      <article><span>Obligation</span><strong>{money(Number(obligation.amount_minor), obligation.currency_code)}</strong><small>{status(obligation.status)}</small></article>
      <article><span>Work state</span><strong>{status(request?.state)}</strong><small>{assignment ? `Assignment ${status(assignment.status)}` : 'No assignment'}</small></article>
      <article><span>Refunded</span><strong>{money(successfulRefundMinor, obligation.currency_code)}</strong><small>{refunds.length} refund record{refunds.length === 1 ? '' : 's'}</small></article>
      <article><span>Payout</span><strong>{payout ? money(Number(payout.amount_minor), payout.currency_code) : '—'}</strong><small>{payout ? status(payout.status) : 'Not eligible yet'}</small></article>
    </section>

    <section className="admin-section admin-panel">
      <div className="admin-section-heading"><div><h2>Customer payment</h2><p>Only a verified provider event and reconciliation can fund this obligation.</p></div></div>
      {attempts.length ? <div className="admin-list">{attempts.map(item => <article key={item.id}><div><strong>{item.provider_adapter} · {status(item.status)}</strong><span>{item.checkout_reference || item.provider_reference || 'Reference pending'}</span></div><small>{new Date(item.created_at).toLocaleString()}</small></article>)}</div> : <p className="empty-admin">No payment attempts yet. The customer will see Pay securely after accepting a quote.</p>}
      {reconciliations.length ? <div className="admin-list" style={{ marginTop: '1rem' }}>{reconciliations.map(item => <article key={item.id}><div><strong>Reconciliation: {item.result}</strong><span>{item.ledger_transaction_id ? 'Ledger transaction recorded' : 'No ledger transaction'}</span></div><small>{new Date(item.reconciled_at).toLocaleString()}</small></article>)}</div> : null}
    </section>

    <section className="admin-section admin-panel">
      <div className="admin-section-heading"><div><h2>Ledger evidence</h2><p>Every transaction below must balance to zero in its currency.</p></div><span>{transactionGroups.length} transaction{transactionGroups.length === 1 ? '' : 's'}</span></div>
      {transactionGroups.length ? <div className="admin-list">{transactionGroups.map(group => <article key={group.transactionId}>
        <div style={{ width: '100%' }}>
          <strong>{group.tx?.transaction_type ?? 'Ledger transaction'} · {group.balance === 0 ? 'Balanced' : `IMBALANCE ${group.balance}`}</strong>
          <span>{group.tx?.external_reference ?? group.transactionId}</span>
          <ul>{group.entries.map(entry => <li key={entry.id}><code>{accountById.get(entry.ledger_account_id)?.account_code ?? entry.ledger_account_id}</code> · {entry.currency_code} {Number(entry.amount_minor)}</li>)}</ul>
        </div>
      </article>)}</div> : <p className="empty-admin">No ledger entries yet.</p>}
    </section>

    <section className="admin-section two-column-admin">
      <div className="admin-panel">
        <div className="admin-section-heading"><div><h2>Refund control</h2><p>Refunds create financial holds before provider payout and reconcile back into the ledger.</p></div></div>
        {successfulAttempt && remainingRefundMinor > 0 && ['funded','partially_refunded'].includes(obligation.status) ? <form action={requestRefundAction} className="stack-form compact-form">
          <input type="hidden" name="obligation_id" value={id}/><input type="hidden" name="nonce" value={crypto.randomUUID()}/>
          <label htmlFor="refund-amount">Refund amount ({obligation.currency_code})</label><input id="refund-amount" name="amount" type="number" min="0.01" max={(remainingRefundMinor / 100).toFixed(2)} step="0.01" required />
          <label htmlFor="refund-reason">Reason</label><textarea id="refund-reason" name="reason" rows={3} required placeholder="Why is this refund required?" />
          <button type="submit">Record refund request</button>
        </form> : <p className="hint">Refund controls appear after a reconciled payment and before the refundable amount is exhausted.</p>}
        {refunds.length ? <div className="admin-list" style={{ marginTop: '1rem' }}>{refunds.map(refund => <article key={refund.id}><div><strong>{money(Number(refund.amount_minor), refund.currency_code)} · {status(refund.status)}</strong><span>{refund.reason || 'No reason recorded'}</span></div><div><small>{new Date(refund.created_at).toLocaleString()}</small>{['requested','needs_attention'].includes(refund.status) ? <form action={submitRefundAction}><input type="hidden" name="obligation_id" value={id}/><input type="hidden" name="refund_id" value={refund.id}/><button type="submit" className="text-button">Submit to Paystack</button></form> : null}</div></article>)}</div> : null}
      </div>

      <div className="admin-panel">
        <div className="admin-section-heading"><div><h2>Provider payout</h2><p>Execution revalidates work, financial holds, amount and verified destination immediately before Paystack submission.</p></div></div>
        {payout ? <>
          <p><strong>{money(Number(payout.amount_minor), payout.currency_code)}</strong> · {status(payout.status)}</p>
          {payout.block_reason ? <p className="notice">Hold: {status(payout.block_reason)}</p> : null}
          <p className="hint">Destination: {destination ? `${destination.account_name || 'Bank account'} · •••• ${destination.account_last4}` : 'Verified payout account required'}</p>
          {destination && ['eligible','queued'].includes(payout.status) ? <form action={queueAndSubmitPayoutAction}><input type="hidden" name="obligation_id" value={id}/><input type="hidden" name="payout_id" value={payout.id}/><button type="submit">Submit TEST payout</button><p className="hint">Requires Finance payout capability and AAL2/MFA. Live Paystack execution is blocked unless explicitly enabled in server configuration.</p></form> : null}
          {payoutReconciliations.length ? <div className="admin-list" style={{ marginTop: '1rem' }}>{payoutReconciliations.map(item => <article key={item.id}><div><strong>{item.provider_event_type} · {item.result}</strong><span>{item.provider_reference}</span></div><small>{new Date(item.reconciled_at).toLocaleString()}</small></article>)}</div> : null}
        </> : <p className="hint">A payout appears only after the payment is funded and the customer approves completed work.</p>}
      </div>
    </section>

    <section className="admin-section admin-panel">
      <div className="admin-section-heading"><div><h2>Disputes</h2><p>An unresolved dispute blocks payout. Provider resolution alone does not release money; Finance must explicitly clear it.</p></div><span>{disputes.length}</span></div>
      {disputes.length ? <div className="admin-list">{disputes.map(dispute => <article key={dispute.id}><div><strong>{status(dispute.status)}</strong><span>{dispute.reason || dispute.provider_dispute_id}</span><small>Resolution: {dispute.resolution || 'not cleared'}</small></div>{dispute.resolution !== 'cleared_for_payout' ? <form action={clearDisputeForPayoutAction} className="compact-form"><input type="hidden" name="obligation_id" value={id}/><input type="hidden" name="dispute_id" value={dispute.id}/><input name="reason" required placeholder="Finance resolution reason"/><button type="submit" className="text-button">Clear for payout</button></form> : null}</article>)}</div> : <p className="empty-admin">No disputes recorded.</p>}
    </section>
  </div>;
}
