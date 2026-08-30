import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Payment processing', robots: { index: false, follow: false } };

function safeReturnTo(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/work';
  return value;
}

export default async function PaystackReturnPage({ searchParams }: { searchParams: Promise<{ attempt?: string; returnTo?: string }> }) {
  const { attempt, returnTo } = await searchParams;
  const destination = safeReturnTo(returnTo);
  const supabase = await createSupabaseServerClient();
  const { data: paymentAttempt } = attempt
    ? await supabase.from('payment_attempts').select('id,status,provider_adapter,created_at').eq('id', attempt).maybeSingle()
    : { data: null };

  const status = paymentAttempt?.status ?? 'pending_provider';
  const confirmed = status === 'succeeded';
  const failed = status === 'failed';

  return <section className="content-shell">
    <p className="eyebrow">Payment</p>
    <h1>{confirmed ? 'Payment confirmed' : failed ? 'Payment was not completed' : 'We’re confirming your payment'}</h1>
    <p className="lede left">Returning from Paystack never marks work as funded by itself. 101GlobalWork changes financial state only after a verified Paystack event is reconciled against the internal payment and ledger records.</p>

    <section className="provider-progress-card" aria-label="Payment confirmation state">
      <div><span>Provider</span><strong>{paymentAttempt?.provider_adapter ?? 'Paystack'}</strong></div>
      <div><span>Payment state</span><strong>{status.replaceAll('_', ' ')}</strong></div>
      <div><span>Financial truth</span><strong>{confirmed ? 'Confirmed' : failed ? 'Not funded' : 'Waiting for reconciliation'}</strong></div>
    </section>

    {confirmed
      ? <p className="notice"><strong>Payment is reconciled.</strong><br />Return to the request to continue the work flow.</p>
      : failed
        ? <p className="notice" role="alert"><strong>No funded payment is recorded.</strong><br />Return to the request to retry securely if payment is still required.</p>
        : <p className="notice"><strong>Confirmation is still in progress.</strong><br />A verified webhook may arrive shortly. Return to the request and refresh; the payment status there is authoritative.</p>}

    <Link className="button-link" href={destination}>Back to your request</Link>
    <p className="hint">Payment attempt reference: {attempt ?? 'pending'}</p>
  </section>;
}
