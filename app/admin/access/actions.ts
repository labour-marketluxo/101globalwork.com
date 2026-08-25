'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function safeMessage(message: string) {
  return encodeURIComponent(message.replace(/[^a-zA-Z0-9 .,_-]/g, '').slice(0, 180));
}

export async function inviteAdminAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const roleKey = String(formData.get('role_key') ?? 'support_admin');
  if (!email || !email.includes('@')) redirect('/admin/access?error=Valid%20email%20required');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin/access');

  const service = createSupabaseServiceClient();
  const { data: existingUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email);

  if (existing) {
    const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', existing.id).maybeSingle();
    if (!account) redirect('/admin/access?error=Account%20is%20not%20ready');
    const { error } = await supabase.rpc('grant_platform_role_command', { p_account_id: account.id, p_role_key: roleKey, p_reason: 'Granted from admin access dashboard' });
    if (error) redirect(`/admin/access?error=${safeMessage(error.message)}`);
    redirect('/admin/access?success=Access%20granted');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { data: invitationId, error: invitationError } = await supabase.rpc('create_platform_admin_invitation_command', { p_email: email, p_role_key: roleKey, p_token_hash: tokenHash, p_expires_at: expiresAt });
  if (invitationError || !invitationId) redirect(`/admin/access?error=${safeMessage(invitationError?.message ?? 'Unable to create invitation')}`);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';
  const next = `/admin-invite/accept?token=${encodeURIComponent(token)}`;
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error: emailError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (emailError) {
    await supabase.rpc('revoke_platform_admin_invitation_command', { p_invitation_id: invitationId, p_reason: 'Authentication invitation delivery failed' });
    redirect(`/admin/access?error=${safeMessage('Invitation email could not be sent')}`);
  }
  redirect('/admin/access?success=Invitation%20sent');
}

export async function revokeRoleAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '');
  const roleKey = String(formData.get('role_key') ?? '');
  const reason = String(formData.get('reason') ?? 'Access no longer required').trim();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('revoke_platform_role_command', { p_account_id: accountId, p_role_key: roleKey, p_reason: reason });
  if (error) redirect(`/admin/access?error=${safeMessage(error.message)}`);
  redirect('/admin/access?success=Access%20revoked');
}
