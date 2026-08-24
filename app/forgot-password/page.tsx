import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/auth/actions';

export const metadata = { title: 'Reset password', robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return <section className="content-shell auth-shell">
    <p className="eyebrow">Account recovery</p>
    <h1>Reset your password</h1>
    <p className="lede left">Enter your email. If an account exists, we’ll send a secure recovery link.</p>
    {sent ? <p className="notice" role="status">If an account exists for that email, a recovery message is on its way.</p> : null}
    <form action={requestPasswordResetAction} className="stack-form">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email" />
      <button type="submit">Send recovery link</button>
    </form>
    <p className="hint"><Link href="/sign-in">Back to sign in</Link></p>
  </section>;
}
