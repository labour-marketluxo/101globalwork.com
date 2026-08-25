'use server';

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function safeMessage(message: string) {
  return encodeURIComponent(message.replace(/[^a-zA-Z0-9 .,_-]/g, '').slice(0, 180));
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function inviteAdminAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const roleKey = String(formData.get('role_key') ?? 'support_admin');
  if (!validEmail(email)) redirect('/admin/access?error=Valid%20email%20required');

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
    redirect(`/admin/access?error=${safeMessage('Invitation email could not be sent. Use temporary access below instead.')}`);
  }
  redirect('/admin/access?success=Invitation%20sent');
}

export async function createAdminWithTemporaryPasswordAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const roleKey = String(formData.get('role_key') ?? 'auditor');
  if (!validEmail(email) || displayName.length < 2) redirect('/admin/access?error=Name%20and%20valid%20email%20required');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin/access');
  const { data: allowed, error: allowedError } = await supabase.rpc('platform_admin_manage_allowed_command');
  if (allowedError || !allowed) redirect('/admin/access?error=You%20cannot%20manage%20administrator%20access');

  // The temporary password is generated once, never persisted by the application,
  // and is shown only to the administrator who created it for a few minutes.
  const temporaryPassword = `Aa1!${crypto.randomBytes(18).toString('base64url')}`;
  const service = createSupabaseServiceClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes('already')
      ? 'An account already exists for this email. Use the normal role grant or email invitation.'
      : 'Temporary administrator access could not be created.';
    redirect(`/admin/access?error=${safeMessage(message)}`);
  }

  const { data: account } = await service.from('accounts').select('id').eq('auth_user_id', created.user.id).maybeSingle();
  if (!account) {
    await service.auth.admin.deleteUser(created.user.id);
    redirect('/admin/access?error=Administrator%20account%20bootstrap%20failed');
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: provisionError } = await supabase.rpc('provision_platform_admin_role_command', {
    p_account_id: account.id,
    p_role_key: roleKey,
    p_expires_at: expiresAt,
    p_reason: 'Temporary first-login credential created from Users & access',
  });
  if (provisionError) {
    await service.auth.admin.deleteUser(created.user.id);
    redirect(`/admin/access?error=${safeMessage(provisionError.message)}`);
  }

  const flash = Buffer.from(JSON.stringify({ email, password: temporaryPassword, expiresAt }), 'utf8').toString('base64url');
  const cookieStore = await cookies();
  cookieStore.set('admin_provisioned_access', flash, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/admin/access',
    maxAge: 5 * 60,
  });
  redirect('/admin/access?provisioned=1');
}

export async function clearProvisionedCredentialAction() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_provisioned_access');
  redirect('/admin/access?success=Temporary%20credential%20hidden');
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
