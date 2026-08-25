import Link from 'next/link';
import { signUpAction, signInWithGoogleAction } from '@/app/auth/actions';

export const metadata = { title: 'Create account', robots: { index: false, follow: false } };

type SignUpSearch = Promise<{ error?: string; check_email?: string; next?: string; intent?: string }>;

export default async function SignUpPage({ searchParams }: { searchParams: SignUpSearch }) {
  const { error, check_email, next = '/', intent = 'customer' } = await searchParams;
  const providerIntent = intent === 'provider' || next === '/provider/onboarding';
  const fallback = providerIntent ? '/provider/onboarding' : '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : fallback;

  return <section className="content-shell auth-shell">
    <p className="eyebrow">{providerIntent ? 'Offer your services' : 'Get work done'}</p>
    <h1>{providerIntent ? 'Create your provider account' : 'Create your account'}</h1>
    <p className="lede left">{providerIntent
      ? 'Start with one secure account. After sign-up, add your services, service area and verification before your profile can appear in matching.'
      : 'Create one secure account to request work, compare providers and manage the work you hire. If you later want to offer services, the same account can become a provider.'}</p>

    <div className="intent-switch" aria-label="Choose account journey">
      <Link href="/sign-up?intent=customer&next=/" aria-current={!providerIntent ? 'page' : undefined}>I need work done</Link>
      <Link href="/sign-up?intent=provider&next=/provider/onboarding" aria-current={providerIntent ? 'page' : undefined}>I offer services</Link>
    </div>

    {error ? <p className="notice" role="alert">{error}</p> : null}
    {check_email ? <p className="notice" role="status">Check your email to confirm your account. After confirmation, you will return to the step you were completing.</p> : null}

    <form action={signInWithGoogleAction} className="stack-form">
      <input type="hidden" name="next" value={safeNext} />
      <button type="submit" className="secondary-button">Continue with Google</button>
    </form>

    <div className="auth-divider" aria-hidden="true"><span>or</span></div>

    <form action={signUpAction} className="stack-form">
      <input type="hidden" name="next" value={safeNext} />
      <label htmlFor="display_name">Name</label><input id="display_name" name="display_name" required minLength={2} autoComplete="name" />
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" aria-describedby="password-help" />
      <p id="password-help" className="hint">Use at least 10 characters. A password manager is recommended.</p>
      <button type="submit">{providerIntent ? 'Create provider account' : 'Create account'}</button>
    </form>
    <p className="hint">Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(safeNext)}`}>Sign in</Link>.</p>
  </section>;
}
