import Link from 'next/link';

export const metadata = {
  title: 'For providers',
  robots: { index: false, follow: true },
};

export default function ProvidersPage() {
  return (
    <section className="content-shell">
      <p className="eyebrow">For providers</p>
      <h1>Turn your skills into trusted work.</h1>
      <p className="lede left">Use the same 101GlobalWork account you use as a customer, or create one now. Add the services and areas you cover, complete the required verification, then publish when your profile is ready.</p>
      <div className="entry-actions">
        <Link href="/provider" className="button-link">Open provider workspace</Link>
        <Link href="/sign-up?intent=provider&next=/provider/onboarding" className="secondary-link">Create provider account</Link>
        <Link href="/sign-in?next=/provider" className="secondary-link">Sign in as provider</Link>
      </div>
      <p className="hint">Need someone to do work instead? <Link href="/sign-up?intent=customer&next=/">Create a customer account</Link>.</p>
      <section className="action-panel">
        <h2>What happens next</h2>
        <ol className="simple-steps">
          <li><strong>Tell us what you do.</strong> Add your service and where you work.</li>
          <li><strong>Build trust.</strong> Submit the verification required for your market and service.</li>
          <li><strong>Become discoverable.</strong> Publish only after readiness and trust checks pass.</li>
          <li><strong>Receive real opportunities.</strong> Your provider workspace shows requests that pass service, area, verification and readiness rules.</li>
          <li><strong>Get paid safely.</strong> Add a verified payout account only when you are ready to receive completed-work payouts.</li>
        </ol>
      </section>
    </section>
  );
}
