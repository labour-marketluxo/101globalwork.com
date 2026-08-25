'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function equalSecret(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function bootstrapOwnerAction(formData: FormData) {
  const supplied = String(formData.get('bootstrap_token') ?? '');
  const expected = process.env.PLATFORM_OWNER_BOOTSTRAP_TOKEN;
  if (!expected || !equalSecret(supplied, expected)) redirect('/admin-bootstrap?error=Invalid%20bootstrap%20token');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin-bootstrap');
  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/admin-bootstrap?error=Account%20not%20ready');

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('bootstrap_platform_owner_command', { p_account_id: account.id, p_reason: 'Initial production owner bootstrap' });
  if (error) redirect(`/admin-bootstrap?error=${encodeURIComponent(error.message)}`);
  redirect('/admin');
}
