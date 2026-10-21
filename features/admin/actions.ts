'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { adminFailureCode, type AdminFailureCode } from '@/features/admin/copy';

/**
 * The administrator workspace's writes.
 *
 * ⚠️ EVERY AUTHORISATION RULE LIVES IN THE COMMAND, NOT HERE. Capability, second factor, the owner
 * guard, the self guard and the reason-code vocabulary are all checked in SQL, so a hand-made POST has
 * the same limits as the interface. What this module does is authenticate, translate a refusal into one
 * of the app's codes, and send the operator back where they were.
 *
 * ⚠️ A REFUSAL OF "STEP-UP REQUIRED" IS NOT AN ERROR MESSAGE — IT IS A REDIRECT. The command raises that
 * when the session is aal1; the honest response is to take the operator to the challenge that raises it
 * and bring them back, rather than printing "try again" at somebody who cannot make it work.
 */

async function authed(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function back(formData: FormData, params: Record<string, string>, fallback: string): never {
  const target = safeInternalPath(String(formData.get('next') ?? ''), fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

/**
 * A refusal, turned into either a sentence or a challenge.
 *
 * ⚠️ THE CHALLENGE DESTINATION CARRIES `step_up=1` so the page the operator returns to can tell them the
 * session is now confirmed and the action can be repeated. Without it they land back on the same screen
 * with no indication that anything changed.
 */
function refuse(formData: FormData, message: string, fallback: string): never {
  const code = adminFailureCode(message);
  if (code === 'step_up_required') {
    const destination = safeInternalPath(String(formData.get('next') ?? ''), fallback);
    const [path, existing] = destination.split('?');
    const query = new URLSearchParams(existing ?? '');
    query.set('step_up', '1');
    const target = `${path}?${query.toString()}`;
    redirect(`${AUTH_PATHS.challenge}?redirect=${encodeURIComponent(target)}`);
  }
  back(formData, { failed: code }, fallback);
}

// ── Incidents ──────────────────────────────────────────────────────────────────────────────────

export async function acknowledgeIncidentAction(formData: FormData) {
  const supabase = await authed('/admin');
  const { error } = await supabase.rpc('acknowledge_admin_incident_command', {
    p_incident_key: String(formData.get('incident_key') ?? ''),
    p_area: String(formData.get('area') ?? 'operations'),
    p_severity: String(formData.get('severity') ?? 'medium'),
    p_acknowledged_count: Number.parseInt(String(formData.get('count') ?? '0'), 10) || 0,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) refuse(formData, error.message, '/admin');

  const query = new URLSearchParams();
  for (const key of ['market', 'window', 'severity'] as const) {
    const value = formData.get(key);
    if (typeof value === 'string' && value.length > 0) query.set(key, value);
  }
  query.set('acknowledged', String(formData.get('incident_key') ?? ''));
  redirect(`/admin?${query.toString()}`);
}

// ── Accounts ───────────────────────────────────────────────────────────────────────────────────

export async function changeAccountStandingAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '');
  const next = `/admin/accounts/${accountId}`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('change_account_standing_command', {
    p_account_id: accountId,
    p_status: String(formData.get('status') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { changed: String(formData.get('status') ?? '') }, next);
}

export async function revokeAccountSessionsAction(formData: FormData) {
  const accountId = String(formData.get('account_id') ?? '');
  const next = `/admin/accounts/${accountId}`;
  const supabase = await authed(next);
  const { data, error } = await supabase.rpc('revoke_account_sessions_command', {
    p_account_id: accountId,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { sessions: String(typeof data === 'number' ? data : 0) }, next);
}

/**
 * The one read that returns raw contact details.
 *
 * ⚠️ IT RETURNS THE VALUE INSTEAD OF REDIRECTING, AND THAT IS THE PRIVACY DESIGN. A redirected page would
 * have to render the address into HTML that then sits in the operator's browser history and in any
 * intermediate cache — a URL is worse still. Returning it through `useActionState` means it exists only
 * in the response to the request that asked for it, and only after the database has written the audit
 * row.
 */
export type RevealState =
  | { status: 'idle' }
  | { status: 'ok'; email: string | null; phone: string | null }
  | { status: 'error'; code: AdminFailureCode };

export async function revealAccountContactAction(_previous: RevealState, formData: FormData): Promise<RevealState> {
  const accountId = String(formData.get('account_id') ?? '');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', code: 'not_authorized' };

  const { data, error } = await supabase.rpc('reveal_admin_account_contact_command', {
    p_account_id: accountId,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) return { status: 'error', code: adminFailureCode(error.message) };

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    status: 'ok',
    email: typeof raw.email === 'string' && raw.email.length > 0 ? raw.email : null,
    phone: typeof raw.phone === 'string' && raw.phone.length > 0 ? raw.phone : null,
  };
}

// ── Providers ──────────────────────────────────────────────────────────────────────────────────

export async function applyProviderRestrictionAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const queue = String(formData.get('queue') ?? '');
  const next = `/admin/providers${queue ? `?queue=${encodeURIComponent(queue)}` : ''}`;
  const supabase = await authed(next);
  const expiresAt = String(formData.get('expires_at') ?? '').trim();
  const { error } = await supabase.rpc('apply_provider_restriction_command', {
    p_provider_id: providerId,
    p_kind: String(formData.get('kind') ?? ''),
    p_severity: String(formData.get('severity') ?? 'medium'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    // An empty date field is "no expiry", not the epoch. Sending it through unchanged would be read as
    // a timestamp in the past and refused, which reads as a bug rather than as a choice.
    p_expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : null,
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { restricted: providerId }, next);
}

export async function liftProviderRestrictionAction(formData: FormData) {
  const queue = String(formData.get('queue') ?? '');
  const next = `/admin/providers${queue ? `?queue=${encodeURIComponent(queue)}` : ''}`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('lift_provider_restriction_command', {
    p_restriction_id: String(formData.get('restriction_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { lifted: '1' }, next);
}
