import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'For providers',
  robots: { index: false, follow: true },
};

export default function ProvidersPage() {
  return (
    <section className="content-shell">
      <p className="eyebrow">For providers</p>
      <h1>Build a trusted work profile</h1>
      <p className="lede left">Provider onboarding will focus on services, service area, verification and evidence of completed work. Public discoverability will be quality-gated.</p>
      <Link href="/" className="text-link">Back to 101GlobalWork →</Link>
    </section>
  );
}
