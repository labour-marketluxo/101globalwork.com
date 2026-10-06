import Link from 'next/link';
import { ArrowRight } from '@/components/ui/icons';
import { PAGE_SHELL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  PaymentEmpty,
  PaymentLedger,
  PaymentNotice,
  ReconciledBadge,
} from '@/components/customer/PaymentSections';
import { getCustomerPaymentLedger } from '@/features/customer/payments';

export const metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
};

/**
 * The payments ledger — `/customer/payments`.
 *
 * ⚠️ THIS IS A LEDGER VIEW, NOT A LIST OF TRANSACTIONS. Every row is a `payment_obligations` record: the one
 * thing that exists because a quote was accepted. Attempts, gateway sessions and browser returns are not rows
 * here, because none of them is money — they are the things that either become a ledger entry or do not. The
 * grouping is by what the obligation means for the customer right now (owed, held, released, refunded,
 * disputed), and each row carries the reconciliation badge that says whether the platform's books agree.
 *
 * ⚠️ THE PAGE CANNOT SHOW A TOTAL THAT DISAGREES WITH THE LEDGER. Every figure comes from
 * `get_customer_payment_ledger`, which reads the obligations and their reconciliations in one place. There is
 * no client-side arithmetic over the list, so a "total spent" could not drift from the rows under it.
 */
export default async function CustomerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string; requested?: string; payment_error?: string }>;
}) {
  const query = await searchParams;
  const { rows, unavailable } = await getCustomerPaymentLedger();

  const reconciled = rows.filter(row => row.reconciledState === 'reconciled').length;
  const attention = rows.filter(row => row.reconciledState === 'attention').length;

  return (
    <section className={PAGE_SHELL}>
      <PaymentNotice failed={query.failed} requested={query.requested} paymentError={query.payment_error} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Payments</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Every payment for work you have agreed, grouped by what it means right now. Money is held until you
          approve the finished work, and only then released to the provider.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3">
        <h2 className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
          Reconciled ledger records are financial truth
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-primary-deep">
          A payment counts here when a verified event from the gateway has been matched to a balanced entry in
          the platform&apos;s own ledger. Until that happens, a payment is shown as awaiting reconciliation —
          whatever a gateway page or a browser return said. If an event arrives that does not match, it is shown
          as needing attention and nothing is posted from it.
        </p>
        {rows.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-primary-deep">
            <span className="inline-flex items-center gap-2">
              <ReconciledBadge state="reconciled" />
              {reconciled} of {rows.length}
            </span>
            {attention > 0 ? (
              <span className="inline-flex items-center gap-2">
                <ReconciledBadge state="attention" />
                {attention} needing a look
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      {unavailable ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          Your payments could not be read just now. This is a read failure, not an empty account — reload in a
          moment.
        </p>
      ) : rows.length === 0 ? (
        <PaymentEmpty />
      ) : (
        <>
          <PaymentLedger rows={rows} />
          <p className="mt-8 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Bookings and appointments are on
            <Link href="/customer/bookings" className={LINK_ARROW}>
              your bookings <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
