'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { adminFailureCode } from '@/features/admin/copy';

/**
 * The trust console's writes.
 *
 * ⚠️ THE COMMANDS OWN EVERY RULE, AND THESE WRAPPERS ADD NONE. Capability, second factor, the reason-code
 * vocabulary, the legal-hold interlocks and the policy version are all checked in SQL, so a hand-made POST
 * has the same limits as the interface. What happens here is authentication, translation of a refusal into
 * the app's own code, and a redirect back to the record that was being reviewed.
 *
 * ⚠️ A REFUSAL OF "STEP-UP REQUIRED" IS A REDIRECT, NOT A MESSAGE. The operator cannot make a failed second
 * factor work by reading about it, so the refusal sends them to the challenge with the page they were on and
 * brings them back with `step_up=1`, which the page turns into "try it again".
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

function refuse(formData: FormData, message: string, fallback: string): never {
  const code = adminFailureCode(message);
  if (code === 'step_up_required') {
    const destination = safeInternalPath(String(formData.get('next') ?? ''), fallback);
    const [path, existing] = destination.split('?');
    const query = new URLSearchParams(existing ?? '');
    query.set('step_up', '1');
    redirect(`${AUTH_PATHS.challenge}?redirect=${encodeURIComponent(`${path}?${query.toString()}`)}`);
  }
  back(formData, { failed: code }, fallback);
}

/** An empty date input is "no expiry", not the epoch — the command would refuse the latter as a past date. */
function optionalDate(formData: FormData, field: string, endOfDay: boolean): string | null {
  const value = String(formData.get(field) ?? '').trim();
  if (!value) return null;
  return endOfDay ? `${value}T23:59:59Z` : value;
}

function optional(formData: FormData, field: string): string | null {
  return String(formData.get(field) ?? '').trim() || null;
}

// ── Verification decisions ─────────────────────────────────────────────────────────────────────

export async function decideVerificationAction(formData: FormData) {
  const verificationId = String(formData.get('verification_id') ?? '');
  const next = `/admin/trust/verifications/${verificationId}`;
  const supabase = await authed(next);

  const { error } = await supabase.rpc('decide_provider_verification_command', {
    p_verification_id: verificationId,
    p_decision: String(formData.get('decision') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_policy_version: String(formData.get('policy_version') ?? '').trim(),
    p_expires_at: optionalDate(formData, 'expires_at', true),
    p_assignee_account_id: optional(formData, 'assignee_account_id'),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { decided: String(formData.get('decision') ?? '') }, next);
}

// ── Credential decisions ───────────────────────────────────────────────────────────────────────

export async function decideCredentialAction(formData: FormData) {
  const credentialId = String(formData.get('credential_id') ?? '');
  const next = `/admin/trust/credentials/${credentialId}`;
  const supabase = await authed(next);

  const { error } = await supabase.rpc('decide_provider_credential_command', {
    p_credential_id: credentialId,
    p_decision: String(formData.get('decision') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_policy_version: String(formData.get('policy_version') ?? '').trim(),
    p_expires_at: optionalDate(formData, 'expires_at', false),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { decided: String(formData.get('decision') ?? '') }, next);
}

// ── Cases ──────────────────────────────────────────────────────────────────────────────────────

const CASES_PATH = '/admin/trust/cases';

export async function createTrustCaseAction(formData: FormData) {
  const supabase = await authed(CASES_PATH);
  const evidence = formData
    .getAll('evidence_ids')
    .map(value => String(value).trim())
    .filter(value => value.length > 0);

  const { data, error } = await supabase.rpc('create_trust_case_command', {
    p_case_type: String(formData.get('case_type') ?? 'other'),
    p_severity: String(formData.get('severity') ?? 'medium'),
    p_summary: String(formData.get('summary') ?? '').trim(),
    p_source: String(formData.get('source') ?? 'operator'),
    p_subject_account_id: optional(formData, 'subject_account_id'),
    p_subject_provider_id: optional(formData, 'subject_provider_id'),
    p_subject_request_id: optional(formData, 'subject_request_id'),
    p_evidence_ids: evidence,
    p_sla_due_at: optionalDate(formData, 'sla_due_at', true),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, CASES_PATH);
  back(formData, { opened: typeof data === 'string' ? data : '1' }, CASES_PATH);
}

export async function assignTrustCaseAction(formData: FormData) {
  const supabase = await authed(CASES_PATH);
  const { error } = await supabase.rpc('assign_trust_case_command', {
    p_case_id: String(formData.get('case_id') ?? ''),
    p_assignee_account_id: optional(formData, 'assignee_account_id'),
    p_state: String(formData.get('state') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, CASES_PATH);
  back(formData, { assigned: String(formData.get('case_id') ?? '') }, CASES_PATH);
}

export async function setLegalHoldAction(formData: FormData) {
  const supabase = await authed(CASES_PATH);
  const hold = String(formData.get('hold') ?? '') === 'true';
  const { error } = await supabase.rpc('set_trust_case_legal_hold_command', {
    p_case_id: String(formData.get('case_id') ?? ''),
    p_hold: hold,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, CASES_PATH);
  back(formData, { hold: hold ? 'placed' : 'lifted' }, CASES_PATH);
}

export async function closeTrustCaseAction(formData: FormData) {
  const supabase = await authed(CASES_PATH);
  const { error } = await supabase.rpc('close_trust_case_command', {
    p_case_id: String(formData.get('case_id') ?? ''),
    p_resolution: String(formData.get('resolution') ?? '').trim(),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, CASES_PATH);
  back(formData, { closed: String(formData.get('case_id') ?? '') }, CASES_PATH);
}

/**
 * Restrict the account a case is about.
 *
 * ⚠️ IT CALLS THE ACCOUNT STANDING COMMAND RATHER THAN A TRUST-SHAPED COPY OF IT. Suspending an account is
 * one operation with one set of rules — the owner guard, the self guard, the second factor, the session
 * teardown — and a second implementation living in the trust console would be a second place for those rules
 * to drift. The case id travels with the call, so the case records the restriction and the audit row says
 * which case asked for it.
 */
export async function restrictCaseSubjectAction(formData: FormData) {
  const supabase = await authed(CASES_PATH);
  const { error } = await supabase.rpc('change_account_standing_command', {
    p_account_id: String(formData.get('account_id') ?? ''),
    p_status: String(formData.get('status') ?? 'suspended'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_case_id: String(formData.get('case_id') ?? '') || null,
  });
  if (error) refuse(formData, error.message, CASES_PATH);
  back(formData, { restricted: String(formData.get('case_id') ?? '') }, CASES_PATH);
}
