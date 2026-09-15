'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function activateAdminAccessAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  if (password.length < 12 || password !== confirm) {
    redirect(`/account/activate-admin-access?error=${encodeURIComponent('Use matching passwords of at least 12 characters.')}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/account/activate-admin-access');

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect(`/account/activate-admin-access?error=${encodeURIComponent('Your password could not be updated. Try again.')}`);

  const { data: roleKey, error: activationError } = await supabase.rpc('activate_provisioned_admin_command');
  if (activationError || !roleKey) {
    redirect(`/account/activate-admin-access?error=${encodeURIComponent('Password changed, but administrator access still needs activation. Submit again to finish.')}`);
  }
  redirect('/admin?activated=1');
}
