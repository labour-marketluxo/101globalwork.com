'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { adminFailureCode } from '@/features/admin/copy';

/**
 * The money console's writes.
 *
 * ⚠️ NOTHING HERE TOUCHES A LEDGER ROW. The actions call commands; the commands post balanced transactions or
 * refuse. There is no update path to `ledger_entries` in this file because there is none in the database.
 *
 * ⚠️ THE PAYOUT SUBMISSION IS THE EXISTING ONE. "Retry allowed payout" posts to `queueAndSubmitPayoutAction` from
 * the financial record page rather than re-implementing the transfer sequence here — one implementation of
 * moving money, with one place for its revalidation and its failure handling.
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

function optional(formData: FormData, field: string): string | null {
  return String(formData.get(field) ?? '').trim() || null;
}

/** Re-run the reconciliation comparison for one provider event. */
export async function retryReconciliationAction(formData: FormData) {
  const attemptId = String(formData.get('attempt_id') ?? '');
  const next = attemptId ? `/admin/money/payments/${attemptId}` : '/admin/money/payments';
  const supabase = await authed(next);

  const { data, error } = await supabase.rpc('retry_payment_reconciliation_command', {
    p_provider_event_id: String(formData.get('provider_event_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_evidence_reference: String(formData.get('evidence_reference') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);

  const raw = (data ?? {}) as Record<string, unknown>;
  back(formData, { reconciled: String(raw.result ?? 'checked') }, next);
}

/** Post a balanced offset entry against an obligation. */
export async function postAdjustmentAction(formData: FormData) {
  const attemptId = String(formData.get('attempt_id') ?? '');
  const next = attemptId ? `/admin/money/payments/${attemptId}` : '/admin/money/payments';
  const supabase = await authed(next);
  const amount = Number(formData.get('amount') ?? NaN);
  if (!Number.isFinite(amount) || amount <= 0) back(formData, { failed: 'invalid' }, next);

  const { error } = await supabase.rpc('post_ledger_adjustment_command', {
    p_obligation_id: String(formData.get('obligation_id') ?? ''),
    p_amount_minor: Math.round(amount * 100),
    p_direction: String(formData.get('direction') ?? 'reduce_provider_payable'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_evidence_reference: String(formData.get('evidence_reference') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);
  back(formData, { adjusted: '1' }, next);
}

export async function placePayoutHoldAction(formData: FormData) {
  const supabase = await authed('/admin/money/payouts');
  const { error } = await supabase.rpc('place_payout_hold_command', {
    p_payout_id: String(formData.get('payout_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_evidence_reference: String(formData.get('evidence_reference') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, '/admin/money/payouts');
  back(formData, { held: String(formData.get('payout_id') ?? '') }, '/admin/money/payouts');
}

export async function releasePayoutHoldAction(formData: FormData) {
  const supabase = await authed('/admin/money/payouts');
  const { error } = await supabase.rpc('release_payout_hold_command', {
    p_hold_id: String(formData.get('hold_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, '/admin/money/payouts');
  back(formData, { released: '1' }, '/admin/money/payouts');
}

/** Decide a refund request, a dispute request or a provider chargeback. */
export async function decideMoneyCaseAction(formData: FormData) {
  const supabase = await authed('/admin/money/cases');
  const amount = String(formData.get('amount') ?? '').trim();

  const { error } = await supabase.rpc('decide_money_case_command', {
    p_case_kind: String(formData.get('case_kind') ?? ''),
    p_case_id: String(formData.get('case_id') ?? ''),
    p_action: String(formData.get('action') ?? ''),
    p_amount_minor: amount ? Math.round(Number(amount) * 100) : null,
    p_resolution: optional(formData, 'resolution'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_evidence_reference: optional(formData, 'evidence_reference'),
  });
  if (error) refuse(formData, error.message, '/admin/money/cases');
  back(formData, { decided: String(formData.get('action') ?? '') }, '/admin/money/cases');
}

/**
 * Escalate a payout failure into an owned case.
 *
 * ⚠️ IT OPENS A TRUST CASE RATHER THAN A NEW MONEY TABLE. A payout that keeps failing needs an owner, an SLA and
 * a place where evidence lives — which is exactly what the case store already is. The money record stays where
 * the money is.
 */
export async function escalatePayoutFailureAction(formData: FormData) {
  const supabase = await authed('/admin/money/payouts');
  const { error } = await supabase.rpc('create_trust_case_command', {
    p_case_type: String(formData.get('case_type') ?? 'other'),
    p_severity: String(formData.get('severity') ?? 'medium'),
    p_summary: String(formData.get('summary') ?? '').trim(),
    p_source: 'operator',
    p_subject_account_id: null,
    p_subject_provider_id: optional(formData, 'provider_id'),
    p_subject_request_id: optional(formData, 'request_id'),
    p_evidence_ids: [],
    p_sla_due_at: optional(formData, 'sla_due_at') ? `${String(formData.get('sla_due_at')).trim()}T23:59:59Z` : null,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, '/admin/money/payouts');
  back(formData, { escalated: '1' }, '/admin/money/payouts');
}
