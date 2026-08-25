import Link from 'next/link';
import { signUpAction, signInWithGoogleAction } from '@/app/auth/actions';

export const metadata = { title: 'Create account', robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string; check_email?: string; next?: string }> }) {
  const { error, check_email, next = '/provider/onboarding' } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/provider/onboarding';

  return <section className="content-shell auth-shell">
    <p className="eyebrow">Get started</p><h1>Create your account</h1>
    <p className="lede left">One account works for customers, providers, and organisation members. We add capabilities only when you need them.</p>
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
      <button type="submit">Create account</button>
    </form>
    <p className="hint">Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(safeNext)}`}>Sign in</Link>.</p>
  </section>;
}
