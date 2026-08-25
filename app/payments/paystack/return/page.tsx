import Link from 'next/link';

export const metadata = { title: 'Payment processing', robots: { index: false, follow: false } };

export default async function PaystackReturnPage({ searchParams }: { searchParams: Promise<{ attempt?: string }> }) {
  const { attempt } = await searchParams;
  return <section className="content-shell">
    <p className="eyebrow">Payment</p>
    <h1>We’re confirming your payment</h1>
    <p className="lede left">Returning from Paystack does not mark a payment as successful. 101GlobalWork waits for a verified Paystack event and reconciles it against the internal ledger.</p>
    <p className="hint">Reference: {attempt ?? 'pending'}</p>
    <Link href="/">Return home</Link>
  </section>;
}
