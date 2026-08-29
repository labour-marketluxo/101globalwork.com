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

async function findAuthUserByEmail(email: string) {
  const service = createSupabaseServiceClient();
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find(user => user.email?.toLowerCase() === email) ?? null;
}

export async function inviteAdminAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const roleKey = String(formData.get('role_key') ?? 'support_admin');
  if (!validEmail(email)) redirect('/admin/access?error=Valid%20email%20required');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin/access');

  const service = createSupabaseServiceClient();
  const existing = await findAuthUserByEmail(email);

  if (existing) {
    if (!existing.email_confirmed_at) {
      redirect('/admin/access?error=This%20email%20has%20an%20unconfirmed%20account.%20Use%20temporary%20access%20below%20to%20issue%20a%20fresh%20one-time%20credential.');
    }
    const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', existing.id).maybeSingle();
    if (!account) redirect('/admin/access?error=Account%20is%20not%20ready');
    const { error } = await supabase.rpc('grant_platform_role_command', { p_account_id: account.id, p_role_key: roleKey, p_reason: 'Granted from admin access dashboard' });
    if (error) redirect(`/admin/access?error=${safeMessage(error.message)}`);
    redirect('/admin/access?success=Existing%20confirmed%20account%20was%20granted%20access');
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
  redirect('/admin/access?success=Invitation%20requested.%20If%20email%20delivery%20is%20delayed%2C%20use%20temporary%20access%20instead.');
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

  const temporaryPassword = `Aa1!${crypto.randomBytes(18).toString('base64url')}`;
  const service = createSupabaseServiceClient();
  const existing = await findAuthUserByEmail(email);
  let authUser = existing;

  if (existing?.email_confirmed_at) {
    const { data: account } = await service.from('accounts').select('id').eq('auth_user_id', existing.id).maybeSingle();
    if (!account) redirect('/admin/access?error=Existing%20account%20is%20not%20ready');
    await service.from('profiles').upsert({ account_id: account.id, display_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
    const { error } = await supabase.rpc('grant_platform_role_command', { p_account_id: account.id, p_role_key: roleKey, p_reason: 'Existing confirmed account granted from temporary-access fallback' });
    if (error) redirect(`/admin/access?error=${safeMessage(error.message)}`);
    redirect('/admin/access?success=Existing%20confirmed%20account%20was%20granted%20access.%20No%20password%20was%20changed.');
  }

  if (existing) {
    const { data: updated, error: updateError } = await service.auth.admin.updateUserById(existing.id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), display_name: displayName },
    });
    if (updateError || !updated.user) redirect('/admin/access?error=Unconfirmed%20account%20could%20not%20be%20converted%20to%20temporary%20access');
    authUser = updated.user;
  } else {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createError || !created.user) redirect('/admin/access?error=Temporary%20administrator%20access%20could%20not%20be%20created');
    authUser = created.user;
  }

  if (!authUser) redirect('/admin/access?error=Administrator%20account%20creation%20failed');
  const { data: account } = await service.from('accounts').select('id').eq('auth_user_id', authUser.id).maybeSingle();
  if (!account) {
    if (!existing) await service.auth.admin.deleteUser(authUser.id);
    redirect('/admin/access?error=Administrator%20account%20bootstrap%20failed');
  }

  const { error: profileError } = await service.from('profiles').upsert({
    account_id: account.id,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id' });
  if (profileError) redirect('/admin/access?error=Administrator%20profile%20could%20not%20be%20saved');

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: provisionError } = await supabase.rpc('provision_platform_admin_role_command', {
    p_account_id: account.id,
    p_role_key: roleKey,
    p_expires_at: expiresAt,
    p_reason: 'Temporary first-login credential created from Users & access',
  });
  if (provisionError) {
    if (!existing) await service.auth.admin.deleteUser(authUser.id);
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

export async function revokeInvitationAction(formData: FormData) {
  const invitationId = String(formData.get('invitation_id') ?? '');
  if (!invitationId) redirect('/admin/access?error=Invitation%20not%20found');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('revoke_platform_admin_invitation_command', { p_invitation_id: invitationId, p_reason: 'Revoked from Users & access dashboard' });
  if (error) redirect(`/admin/access?error=${safeMessage(error.message)}`);
  redirect('/admin/access?success=Invitation%20revoked');
}
