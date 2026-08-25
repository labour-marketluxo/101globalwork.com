import { redirect } from 'next/navigation';
import { updatePasswordAction } from '@/app/auth/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Choose new password', robots: { index: false, follow: false } };

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/account/update-password');
  const { error } = await searchParams;

  return <section className="content-shell auth-shell">
    <p className="eyebrow">Account security</p>
    <h1>Choose a new password</h1>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    <form action={updatePasswordAction} className="stack-form">
      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
      <label htmlFor="confirm_password">Confirm new password</label>
      <input id="confirm_password" name="confirm_password" type="password" minLength={10} required autoComplete="new-password" />
      <button type="submit">Update password</button>
    </form>
  </section>;
}
