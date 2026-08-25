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
      <p className="lede left">Create one account, add the services and areas you cover, complete the required verification, then publish when your profile is ready. We do not weaken trust checks just to fill search results.</p>
      <div className="entry-actions">
        <Link href="/sign-up?next=/provider/onboarding" className="button-link">Create account</Link>
        <Link href="/sign-in?next=/provider/onboarding" className="secondary-link">Sign in to continue</Link>
      </div>
      <section className="action-panel">
        <h2>What happens next</h2>
        <ol className="simple-steps">
          <li><strong>Tell us what you do.</strong> Add your service and where you work.</li>
          <li><strong>Build trust.</strong> Submit the verification required for your market and service.</li>
          <li><strong>Become discoverable.</strong> Publish only after readiness and trust checks pass.</li>
          <li><strong>Receive real opportunities.</strong> Matching uses eligibility first, then fit and quality.</li>
        </ol>
      </section>
    </section>
  );
}
