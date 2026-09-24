'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { RECURRING_PATH } from '@/features/recurring/paths';
import type { RecurringFailureCode } from '@/features/recurring/copy';

/**
 * The recurring workspace's writes.
 *
 * ⚠️ NOTHING HERE TOUCHES MONEY, AND THAT IS THE DESIGN RATHER THAN A GAP. Creating a plan records an agreed
 * price; pausing, resuming and changing a cadence change a calendar. The platform has no card on file and no
 * mandate, so there is no action on this page that could take a payment — and none is offered.
 *
 * ⚠️ THE CADENCE IN FORCE DOES NOT CHANGE UNTIL THE OTHER SIDE ANSWERS. Requesting an adjustment writes a
 * request and nothing else; accepting one is a separate command that the person who asked cannot call.
 */

function failureCode(message: string): RecurringFailureCode {
  if (message.includes('has ended')) return 'ended';
  if (message.includes('worked with')) return 'no_history';
  if (message.includes('already been decided')) return 'already_decided';
  if (message.includes('already the cadence') || message.includes('one open')) return 'pending_request';
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('not found')) return 'not_found';
  return 'bad_request';
}

function backWith(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${RECURRING_PATH}?${encoded}` : RECURRING_PATH;
}

async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: RECURRING_PATH }));
  return supabase;
}

/**
 * Money arrives from a form in major units — what somebody would write on a quote — and is stored in minor
 * units, which is what the column holds. The conversion is here rather than in the form so that every write
 * path rounds the same way, and a value that is not a number is refused rather than quietly becoming zero.
 */
function toMinor(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  if (text.length === 0) return null;
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function createRecurringPlanAction(formData: FormData) {
  const supabase = await requireSession();

  const amountMinor = toMinor(formData.get('amount'));
  if (amountMinor === null) redirect(backWith({ failed: 'bad_request' }));

  const assetId = String(formData.get('asset_id') ?? '').trim();
  const projectId = String(formData.get('assignment_id') ?? '').trim();
  const startOn = String(formData.get('starts_on') ?? '').trim();

  const { error } = await supabase.rpc('create_recurring_plan_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_title: String(formData.get('title') ?? '').trim(),
    p_cadence: String(formData.get('cadence') ?? 'monthly'),
    p_billing_basis: String(formData.get('billing_basis') ?? 'per_visit'),
    p_amount_minor: amountMinor,
    p_currency_code: String(formData.get('currency_code') ?? 'NGN').trim(),
    p_starts_on: startOn.length > 0 ? startOn : null,
    p_location_label: String(formData.get('location_label') ?? '').trim(),
    p_asset_id: assetId.length > 0 ? assetId : null,
    p_notes: String(formData.get('notes') ?? '').trim() || null,
    p_assignment_id: projectId.length > 0 ? projectId : null,
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'created' }));
}

export async function pauseRecurringPlanAction(formData: FormData) {
  const supabase = await requireSession();
  const planId = String(formData.get('plan_id') ?? '');

  const { error } = await supabase.rpc('pause_my_recurring_plan_command', {
    p_plan_id: planId,
    p_reason: String(formData.get('pause_reason') ?? '').trim() || null,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: 'paused' }));
}

export async function resumeRecurringPlanAction(formData: FormData) {
  const supabase = await requireSession();
  const planId = String(formData.get('plan_id') ?? '');
  const nextDate = String(formData.get('next_execution_on') ?? '').trim();

  const { error } = await supabase.rpc('resume_my_recurring_plan_command', {
    p_plan_id: planId,
    p_next_execution_on: nextDate.length > 0 ? nextDate : null,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: 'resumed' }));
}

export async function endRecurringPlanAction(formData: FormData) {
  const supabase = await requireSession();
  const planId = String(formData.get('plan_id') ?? '');

  const { error } = await supabase.rpc('end_my_recurring_plan_command', {
    p_plan_id: planId,
    p_reason: String(formData.get('end_reason') ?? '').trim() || null,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: 'ended' }));
}

export async function requestCadenceChangeAction(formData: FormData) {
  const supabase = await requireSession();
  const planId = String(formData.get('plan_id') ?? '');
  const startOn = String(formData.get('requested_start_on') ?? '').trim();

  const { error } = await supabase.rpc('request_recurring_cadence_change_command', {
    p_plan_id: planId,
    p_requested_cadence: String(formData.get('requested_cadence') ?? 'monthly'),
    p_requested_start_on: startOn.length > 0 ? startOn : null,
    p_reason: String(formData.get('reason') ?? '').trim(),
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: 'requested' }));
}

export async function decideCadenceChangeAction(formData: FormData) {
  const supabase = await requireSession();
  const accept = String(formData.get('accept') ?? '') === 'true';

  const { error } = await supabase.rpc('decide_recurring_cadence_change_command', {
    p_request_id: String(formData.get('request_id') ?? ''),
    p_accept: accept,
    p_note: String(formData.get('decision_note') ?? '').trim() || null,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: accept ? 'accepted' : 'declined' }));
}
