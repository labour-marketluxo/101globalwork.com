import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckoutPanel,
  CheckoutStepUp,
  PaymentNotice,
  PaymentUnavailable,
} from '@/components/customer/PaymentSections';
import { CARD, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkoutBreakdown, getCheckoutAdapters, getCustomerPayment } from '@/features/customer/payments';

export const metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

type CheckoutState = {
  payable: boolean;
  step_up_required: boolean;
  auth_method: string;
  verified_at: string | null;
};

/**
 * Checkout — `/customer/payments/[paymentId]/checkout`.
 *
 * ⚠️ THE PAGE DECIDES NOTHING. Two reads tell it what to draw: the obligation (through the ledger projection)
 * and `get_customer_checkout_state`, which answers whether the payment is payable and whether this session has
 * authenticated recently enough. The payment itself is started by a server action that re-checks all of it
 * against the database. Everything here is presentation, and a crafted POST to the action changes none of the
 * rules — it only gets a different refusal.
 *
 * ⚠️ THE STEP-UP COMES FIRST. If the session is stale the form is not rendered at all, so the payer cannot
 * press Pay and then be told the press did not count. That is the same ordering the agreement acceptance uses,
 * and the same 15-minute window.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ failed?: string; verify?: string; verified?: string; payment_error?: string }>;
}) {
  const { paymentId } = await params;
  const query = await searchParams;

  const [{ row, unavailable }, state] = await Promise.all([
    getCustomerPayment(paymentId),
    loadCheckoutState(paymentId),
  ]);
  if (unavailable) {
    return (
      <section className={PAGE_SHELL}>
        <PaymentUnavailable />
      </section>
    );
  }
  if (!row || !state) notFound();

  const { adapters, unavailable: adaptersUnavailable } = await getCheckoutAdapters(row.currencyCode);
  // Derived once, in the module, so the fee line and the total on screen come from the published policy rather
  // than from a number typed into the component.
  const breakdown = checkoutBreakdown(row);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const stepUpRequired = state.step_up_required;
  const justVerified = query.verified === '1';

  return (
    <section className={PAGE_SHELL}>
      <PaymentNotice failed={query.failed} paymentError={query.payment_error} />

      <nav aria-label="Checkout" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/customer/payments/${paymentId}`} className={LINK_ARROW}>
          ← Back to the payment
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Secure checkout</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          You are paying towards work you have already agreed, with a provider you chose. The money is held and
          released against the work, and this platform handles no card details of its own — the payment happens
          on the provider&apos;s own secure page.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CheckoutPanel
          row={row}
          adapters={adapters}
          breakdown={breakdown}
          adaptersUnavailable={adaptersUnavailable}
        />

        <aside className="space-y-4">
          {stepUpRequired && !justVerified ? (
            <CheckoutStepUp
              paymentId={paymentId}
              email={user?.email ?? null}
              verify={query.verify === '1'}
              verified={false}
            />
          ) : (
            <CheckoutStepUp
              paymentId={paymentId}
              email={user?.email ?? null}
              verify={false}
              verified
            />
          )}

          <section className={`${CARD} p-5`}>
            <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What happens after you pay
            </h2>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>1. The gateway sends a signed event to the platform. A browser return on its own does nothing.</li>
              <li>
                2. The event is verified and matched to this payment. If the amount or currency differs, nothing
                is posted and the record says so.
              </li>
              <li>3. Only then is the payment shown as funded, and the work can proceed.</li>
              <li>4. The money is released to the provider after you approve the finished work.</li>
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              If you close the gateway page without paying, nothing is charged and this payment stays payable —
              come back and start again whenever you like.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

/**
 * The payability and step-up state, from the database.
 *
 * ⚠️ IT IS A SEPARATE READ BECAUSE THE PAGE MUST NOT INFER IT. Asking the pay endpoint and reading its refusal
 * would mean the customer learns they need to verify only after pressing Pay. The function asserts ownership in
 * its WHERE clause, so another account's payment returns no row and this page 404s like every other.
 */
async function loadCheckoutState(paymentId: string): Promise<CheckoutState | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_checkout_state', { p_payment_id: paymentId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read the checkout state: ${error.message}`);
    }
    return null;
  }
  const row = (data ?? [])[0] as CheckoutState | undefined;
  return row ?? null;
}
