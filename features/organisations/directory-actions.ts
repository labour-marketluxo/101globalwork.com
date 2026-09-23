'use server';

import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';

/**
 * Directory writes.
 *
 * ⚠️ ROLE GRANTS AND REMOVALS GO THROUGH A STEP-UP. If the account has a verified second factor and this session has
 * not passed it, the action sends the caller to `/auth/challenge` and back before anything changes — the same gate the
 * payout page uses, and the same honest limit: an account with no factor has nothing to challenge, and the page says
 * so instead of implying a check that will not happen.
 */

async function authed(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

async function requireStepUp(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    redirect(hrefWith(AUTH_PATHS.challenge, { next }));
  }
}

function backTo(formData: FormData, params: Record<string, string>, fallback: string): never {
  const target = safeInternalPath(String(formData.get('next') ?? ''), fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

function fail(formData: FormData, message: string, section: string): never {
  const code = message.toLowerCase().includes('step') ? 'not_authorized' : message.toLowerCase().includes('not authorized') || message.toLowerCase().includes('only an owner') ? 'not_authorized' : message.toLowerCase().includes('valid') || message.toLowerCase().includes('required') ? 'bad_request' : 'unavailable';
  const fallback = String(formData.get('next') ?? '/');
  return backTo(formData, { failed: code, section }, fallback);
}

export async function updateMemberAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/members`;
  const supabase = await authed(next);
  await requireStepUp(next);
  const { error } = await supabase.rpc('update_organisation_member_command', {
    p_organisation_id: organisationId,
    p_account_id: String(formData.get('account_id') ?? ''),
    p_role: String(formData.get('role') ?? 'member'),
    p_scope_location_ids: formData.getAll('scope_location_ids').map(value => String(value)).filter(Boolean),
    p_scope_note: String(formData.get('scope_note') ?? '').trim() || null,
  });
  if (error) return fail(formData, error.message, 'members');
  backTo(formData, { saved: 'member' }, next);
}

export async function setMemberStatusAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/members`;
  const supabase = await authed(next);
  await requireStepUp(next);
  const { error } = await supabase.rpc('set_organisation_member_status_command', {
    p_organisation_id: organisationId,
    p_account_id: String(formData.get('account_id') ?? ''),
    p_status: String(formData.get('status') ?? 'suspended'),
  });
  if (error) return fail(formData, error.message, 'members');
  backTo(formData, { saved: 'member_status' }, next);
}

/** Invite by email. The token is generated here, stored hashed, and handed back to the inviter to pass on. */
export async function inviteMemberAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/members`;
  const supabase = await authed(next);
  await requireStepUp(next);

  const token = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const days = Math.min(30, Math.max(1, Number(String(formData.get('expires_in_days') ?? '7').trim() || '7')));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.rpc('invite_organisation_member_command', {
    p_organisation_id: organisationId,
    p_email: String(formData.get('email') ?? '').trim(),
    p_role: String(formData.get('role') ?? 'member'),
    p_scope_location_ids: formData.getAll('scope_location_ids').map(value => String(value)).filter(Boolean),
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) return fail(formData, error.message, 'members');
  // The raw token is shown once, to the inviter: nothing stores it, and the platform emails nobody.
  backTo(formData, { saved: 'invitation', token }, next);
}

export async function updateLocationAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/locations`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('update_organisation_location_command', {
    p_organisation_id: organisationId,
    p_location_row_id: String(formData.get('location_row_id') ?? ''),
    p_label: String(formData.get('label') ?? '').trim(),
    p_address_line1: String(formData.get('address_line1') ?? '').trim() || null,
    p_address_line2: String(formData.get('address_line2') ?? '').trim() || null,
    p_locality: String(formData.get('locality') ?? '').trim() || null,
    p_region: String(formData.get('region') ?? '').trim() || null,
    p_postal_code: String(formData.get('postal_code') ?? '').trim() || null,
    p_country_code: String(formData.get('country_code') ?? '').trim() || null,
    p_timezone: String(formData.get('timezone') ?? '').trim() || null,
    p_site_manager_name: String(formData.get('site_manager_name') ?? '').trim() || null,
    p_site_manager_phone: String(formData.get('site_manager_phone') ?? '').trim() || null,
    p_access_notes: String(formData.get('access_notes') ?? '').trim() || null,
    p_safety_notes: String(formData.get('safety_notes') ?? '').trim() || null,
  });
  if (error) return fail(formData, error.message, 'locations');
  backTo(formData, { saved: 'location' }, next);
}

export async function setLocationArchivedAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/locations`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('set_organisation_location_archived_command', {
    p_organisation_id: organisationId,
    p_location_row_id: String(formData.get('location_row_id') ?? ''),
    p_archived: String(formData.get('archived') ?? '1') === '1',
  });
  if (error) return fail(formData, error.message, 'locations');
  backTo(formData, { saved: String(formData.get('archived') ?? '1') === '1' ? 'location_archived' : 'location_restored' }, next);
}

export async function addPreferredProviderAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/providers`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('add_preferred_provider_command', {
    p_organisation_id: organisationId,
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_status: String(formData.get('status') ?? 'preferred'),
    p_contract_reference: String(formData.get('contract_reference') ?? '').trim() || null,
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, error.message, 'providers');
  backTo(formData, { saved: 'provider' }, next);
}

export async function removePreferredProviderAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/providers`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('remove_preferred_provider_command', {
    p_organisation_id: organisationId,
    p_provider_id: String(formData.get('provider_id') ?? ''),
  });
  if (error) return fail(formData, error.message, 'providers');
  backTo(formData, { saved: 'provider_removed' }, next);
}

/** Accept an invitation: the signed-in account's email must match the one it was sent to. */
export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const supabase = await authed(`/org/join/${token}`);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await supabase.rpc('accept_organisation_invitation_command', { p_token_hash: tokenHash });
  if (error) {
    redirect(`/org/join/${token}?failed=1`);
  }
  redirect(`/org/${String(data ?? '')}?joined=1`);
}
