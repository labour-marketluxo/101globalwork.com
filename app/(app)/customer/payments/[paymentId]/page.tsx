import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Download, ShieldCheck } from '@/components/ui/icons';
import { CARD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  DisputeRequestPanel,
  PaymentNotice,
  PaymentStatusTimeline,
  PaymentUnavailable,
  ReconciledBadge,
  type DisputeRequest,
} from '@/components/customer/PaymentSections';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  RECONCILED_COPY,
  formatMoney,
  getCustomerPayment,
  getCustomerPaymentActivity,
  isPayable,
} from '@/features/customer/payments';

export const metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

/**
 * One payment's record — `/customer/payments/[paymentId]`.
 *
 * ⚠️ `paymentId` IS AN OBLIGATION ID, AND THAT IS THE ONLY IDENTITY A PAYMENT HAS HERE. The brief's route
 * shape is kept, and the record it points at is the `payment_obligations` row: the one durable thing. Attempts
 * come and go — a failed card, a second try, a resumed session — and none of them is "the payment".
 *
 * ⚠️ THE REFERENCE SHOWN IS THE GATEWAY'S, NOT AN INTERNAL ROW ID. `provider_reference` is what the customer
 * can quote to the provider or to their bank, and it is the same string the gateway's own receipt carries. The
 * attempt's uuid never appears on this page; it identifies a row in this database and nothing else.
 */
export default async function CustomerPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ failed?: string; requested?: string; payment_error?: string }>;
}) {
  const { paymentId } = await params;
  const query = await searchParams;

  const { row, unavailable } = await getCustomerPayment(paymentId);
  // ⚠️ A FAILED READ IS NOT A MISSING PAYMENT. `notFound()` here only when the read SUCCEEDED and the payment
  // is not the caller's, so an id cannot be probed and a transient error cannot tell somebody their payment has
  // vanished.
  if (unavailable) {
    return (
      <section>
        <PaymentUnavailable />
      </section>
    );
  }
  // Another account's payment and a payment that does not exist get the same answer: telling a stranger that
  // an id is real is itself a disclosure.
  if (!row) notFound();

  const [{ attempts }, disputeRequests] = await Promise.all([
    getCustomerPaymentActivity(paymentId),
    loadDisputeRequests(paymentId),
  ]);

  const reconciledCopy = RECONCILED_COPY[row.reconciledState];

  return (
    <section>
      <PaymentNotice failed={query.failed} requested={query.requested} paymentError={query.payment_error} />

      <nav aria-label="Payment" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href="/customer/payments" className={LINK_ARROW}>
          ← All payments
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className={`${CARD} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Payment record
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {formatMoney(row.amountMinor, row.currencyCode)}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {row.providerName} ·{' '}
                  <Link href={`/customer/requests/${row.requestId}`} className={LINK_ARROW}>
                    {row.requestLabel}
                  </Link>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <ReconciledBadge state={row.reconciledState} />
                <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  {row.obligationStatus.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              {reconciledCopy.explanation}
            </p>

            <dl className="mt-5 grid gap-4 border-t border-solid border-slate-200 pt-5 sm:grid-cols-2">
              <div>
                <dt className={LABEL}>Payment reference</dt>
                <dd className="font-sans text-sm break-all text-slate-800">
                  {row.paymentReference ?? 'No payment has been started'}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Created</dt>
                <dd className="text-sm text-slate-800">
                  {new Date(row.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Confirmed against the ledger</dt>
                <dd className="text-sm text-slate-800">
                  {row.settledAt
                    ? new Date(row.settledAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Not yet — no matched ledger transaction exists for this payment.'}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Released to the provider</dt>
                <dd className="text-sm text-slate-800">
                  {row.releasedAt
                    ? new Date(row.releasedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : row.payoutStatus
                      ? `Not yet — payout is ${row.payoutStatus.replace(/_/g, ' ')}.`
                      : 'Not yet. Money is held until you approve the finished work.'}
                </dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-solid border-slate-200 pt-5">
              <h2 className={LABEL}>Itemised</h2>
              <ul className="space-y-1.5">
                <li className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-700">Agreed price for the work</span>
                  <span className="font-medium text-slate-900">
                    {formatMoney(row.amountMinor, row.currencyCode)}
                  </span>
                </li>
                <li className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-700">Platform fee</span>
                  <span className="text-slate-500">{formatMoney(0, row.currencyCode)} (no schedule in force)</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 border-t border-solid border-slate-200 pt-2 text-sm">
                  <span className="font-bold text-slate-900">Charged in total</span>
                  <span className="text-lg font-bold text-primary">
                    {formatMoney(row.amountMinor, row.currencyCode)}
                  </span>
                </li>
                {row.refundedMinor > 0 ? (
                  <li className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-slate-700">Refunded</span>
                    <span className="font-medium text-slate-900">
                      −{formatMoney(row.refundedMinor, row.currencyCode)}
                    </span>
                  </li>
                ) : null}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                These are the same figures the gateway was asked for. Reconciliation refuses any provider event
                whose amount or currency differs from them, so a charge that did not match would be recorded
                without being posted.
              </p>
            </div>
          </section>

          <PaymentStatusTimeline row={row} attempts={attempts} />

          {unavailable ? (
            <p className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
              The payment activity could not be read just now, so the timeline above may be incomplete. This is a
              read failure, not an empty history.
            </p>
          ) : null}

          <DisputeRequestPanel row={row} requests={disputeRequests} />
        </div>

        <aside className="space-y-4">
          {isPayable(row) ? (
            <section className={`${CARD} p-5`}>
              <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Still to pay
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This payment is waiting for you. It is held when it is made, and released to the provider only
                after you approve the finished work.
              </p>
              <Link
                href={`/customer/payments/${row.paymentId}/checkout`}
                className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-sans text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
              >
                Pay {formatMoney(row.amountMinor, row.currencyCode)} Safely
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </section>
          ) : null}

          <section className={`${CARD} p-5`}>
            <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <Download aria-hidden="true" className="h-4 w-4 text-slate-400" />
              Keep a copy
            </h2>
            <a
              href={`/customer/payments/${row.paymentId}/receipt`}
              className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Download receipt PDF
            </a>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Generated from this record, including whether it has been reconciled. Before reconciliation it is
              headed as an unpaid record, not a receipt.
            </p>
          </section>

          <section className={`${CARD} p-5`}>
            <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-slate-400" />
              How this money is held
            </h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>· Nothing reaches the provider when you pay. It is held against this job.</li>
              <li>
                · It is released only after you approve the work — and your approval is a separate action, on the
                request page.
              </li>
              <li>
                · If the work is cancelled before you pay, the obligation is cancelled and nothing is charged.
              </li>
              <li>
                · Once money has moved, a refund is raised by the platform team, not from this page. The panel on
                the left is how you ask.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

/**
 * The customer's own dispute requests for this payment.
 *
 * ⚠️ READ THROUGH RLS, NOT THROUGH A FUNCTION. `payment_dispute_requests` has a policy that returns the
 * caller's own rows, so the customer client can read them directly and no definer function is needed — unlike
 * the ledger tables, which are revoked outright and are read through the projection instead.
 */
async function loadDisputeRequests(paymentId: string): Promise<DisputeRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('payment_dispute_requests')
    .select('id,kind,message,status,created_at')
    .eq('obligation_id', paymentId)
    .order('created_at', { ascending: false });

  return (data ?? []).map(row => ({
    id: row.id,
    kind: row.kind === 'refund' ? 'refund' : 'dispute',
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }));
}
