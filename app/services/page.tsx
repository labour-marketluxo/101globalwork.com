import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Services',
  robots: { index: false, follow: true },
};

export default function ServicesPage() {
  return (
    <section className="content-shell">
      <p className="eyebrow">Services</p>
      <h1>Find the work you need done</h1>
      <p className="lede left">Service pages will only become indexable after they pass supply, usefulness and uniqueness checks.</p>
      <Link href="/" className="text-link">Describe what you need instead →</Link>
    </section>
  );
}
