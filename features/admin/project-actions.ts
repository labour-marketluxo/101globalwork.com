'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { adminFailureCode } from '@/features/admin/copy';

/**
 * The project console's writes — which are the platform's override commands and nothing else.
 *
 * ⚠️ THERE IS NO DIRECT UPDATE HERE, AND THERE IS NOWHERE FOR ONE TO GO. The admin tables have no writable
 * grant, and `run_project_override_command` is the only function that changes a project's state. That is the
 * brief's zero-direct-mutation rule expressed as a property of the code rather than a policy in a comment.
 *
 * ⚠️ A REFUSAL OF "STEP-UP REQUIRED" IS A REDIRECT. The operator cannot satisfy a second factor by reading
 * about it, so the refusal sends them to the challenge carrying the page they were on, and brings them back
 * with `step_up=1` so the page can tell them to try again.
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

/** Force a request's state machine, or retry one undelivered job — the same command, two shapes of form. */
export async function runProjectOverrideAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const next = `/admin/projects/${requestId}`;
  const supabase = await authed(next);

  const { data, error } = await supabase.rpc('run_project_override_command', {
    p_request_id: requestId,
    p_command_key: String(formData.get('command_key') ?? ''),
    p_target_state: optional(formData, 'target_state'),
    p_target_id: optional(formData, 'target_id'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
    p_evidence_reference: String(formData.get('evidence_reference') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);

  const command = String(formData.get('command_key') ?? '');
  back(
    formData,
    {
      overridden: typeof data === 'string' ? data : '1',
      command,
      ...(command === 'force_state' ? { to: String(formData.get('target_state') ?? '') } : {}),
    },
    next,
  );
}

/**
 * Escalate a project to a dispute.
 *
 * ⚠️ IT OPENS A TRUST CASE RATHER THAN SETTING A STATE, AND THAT IS THE HONEST PRIMITIVE. The platform's case
 * store is where a dispute gets an owner, an SLA, evidence references and a legal hold that actually freezes
 * payouts; setting `requests.state = 'disputed'` is a separate, deliberate override with its own reason code.
 * Doing both behind one button would hide which of the two an operator meant.
 */
export async function escalateProjectToDisputeAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const next = `/admin/projects/${requestId}`;
  const supabase = await authed(next);

  const { data, error } = await supabase.rpc('create_trust_case_command', {
    p_case_type: 'dispute',
    p_severity: String(formData.get('severity') ?? 'medium'),
    p_summary: String(formData.get('summary') ?? '').trim(),
    p_source: 'operator',
    p_subject_account_id: null,
    p_subject_provider_id: null,
    p_subject_request_id: requestId,
    p_evidence_ids: [],
    p_sla_due_at: optional(formData, 'sla_due_at') ? `${String(formData.get('sla_due_at')).trim()}T23:59:59Z` : null,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, next);

  back(formData, { escalated: typeof data === 'string' ? data : '1' }, next);
}
