'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function acceptAdminInvitationAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/?error=invalid-invitation');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/admin/invitations/accept?token=${token}`)}`);
  const { error } = await supabase.rpc('accept_platform_admin_invitation_command', { p_token: token });
  if (error) redirect(`/admin/invitations/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent(error.message)}`);
  redirect('/admin?joined=1');
}
