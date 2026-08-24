import Link from 'next/link';
import { signInAction } from '@/app/auth/actions';

export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <section className="content-shell auth-shell">
    <p className="eyebrow">Welcome back</p><h1>Sign in</h1>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    <form action={signInAction} className="stack-form">
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
    <p className="hint">New to 101GlobalWork? <Link href="/sign-up">Create an account</Link>.</p>
  </section>;
}
