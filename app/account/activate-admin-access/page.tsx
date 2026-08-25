import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { activateAdminAccessAction } from './actions';

export const metadata = { title: 'Activate administrator access', robots: { index: false, follow: false } };

export default async function ActivateAdminAccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/account/activate-admin-access');
  const { data: required } = await supabase.rpc('platform_admin_activation_required_command');
  if (!required) redirect('/');

  return <section className="content-shell auth-shell">
    <p className="eyebrow">Secure first sign-in</p>
    <h1>Choose your own password</h1>
    <p className="lede left">The temporary password only gets you to this step. Administrator access stays inactive until you replace it.</p>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    <form action={activateAdminAccessAction} className="stack-form action-panel">
      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" aria-describedby="admin-password-help" />
      <p id="admin-password-help" className="hint">Use at least 12 characters. A password manager is recommended for administrator accounts.</p>
      <label htmlFor="confirm_password">Confirm new password</label>
      <input id="confirm_password" name="confirm_password" type="password" minLength={12} required autoComplete="new-password" />
      <button type="submit">Activate administrator access</button>
    </form>
  </section>;
}
