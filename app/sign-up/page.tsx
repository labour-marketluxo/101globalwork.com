import Link from 'next/link';
import { signUpAction } from '@/app/auth/actions';

export const metadata = { title: 'Create account', robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <section className="content-shell auth-shell">
    <p className="eyebrow">Get started</p><h1>Create your account</h1>
    <p className="lede left">Start as a customer, provider, or both. Capabilities are added as you need them.</p>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    <form action={signUpAction} className="stack-form">
      <label htmlFor="display_name">Name</label><input id="display_name" name="display_name" required minLength={2} autoComplete="name" />
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      <button type="submit">Create account</button>
    </form>
    <p className="hint">Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
  </section>;
}
