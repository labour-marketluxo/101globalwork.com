import Link from 'next/link';
import { signInAction, signInWithGoogleAction } from '@/app/auth/actions';

export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next = '/' } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return <section className="content-shell auth-shell">
    <p className="eyebrow">101GlobalWork</p>
    <h1>Continue your work</h1>
    <p className="lede left">Sign in once, then continue exactly where you left off.</p>
    {error ? <p className="notice" role="alert">{error}</p> : null}

    <form action={signInWithGoogleAction} className="stack-form">
      <input type="hidden" name="next" value={safeNext} />
      <button type="submit" className="secondary-button">Continue with Google</button>
    </form>

    <div className="auth-divider" aria-hidden="true"><span>or</span></div>

    <form action={signInAction} className="stack-form">
      <input type="hidden" name="next" value={safeNext} />
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
    <p className="hint"><Link href={`/forgot-password`}>Forgot password?</Link></p>
    <p className="hint">New to 101GlobalWork? <Link href={`/sign-up?next=${encodeURIComponent(safeNext)}`}>Create an account</Link>.</p>
  </section>;
}
