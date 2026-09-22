'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completionFailureFromMessage } from '@/features/customer/completion';

/**
 * The three answers a customer can give about submitted work, and the withdrawal of a dispute.
 *
 * ⚠️ NOTHING HERE CAN APPROVE BY ACCIDENT. There is no default, no timeout and no "assumed accepted" path: the
 * approval is a POST from a form the customer fills in, the checklist items have to be present, and the
 * database command re-checks the assignment, the ownership, the request state, the evidence and the funding
 * before it writes anything. A GET, a page view or a returning browser proves nothing.
 *
 * ⚠️ REFUSALS ARE CODES, NOT THE DATABASE'S TEXT. These travel in the query string, so a database message
 * echoed into the URL would let anyone type a sentence into the platform's own notice styling.
 */

const completionPath = (assignmentId: string) => `/customer/projects/${assignmentId}/completion`;

/**
 * The ticked criteria, read from the checkboxes themselves.
 *
 * ⚠️ ONLY A CHECKED BOX SUBMITS ITS VALUE, WHICH IS THE WHOLE POINT. Carrying the keys in hidden inputs beside
 * each box would submit every criterion whether or not it was ticked, and the record would then say the
 * customer confirmed things they never looked at. Each box carries its own key and label as JSON in its value,
 * so the form can only ever send what was actually confirmed.
 */
function criteriaFrom(formData: FormData): { key: string; label: string }[] {
  const criteria: { key: string; label: string }[] = [];
  for (const raw of formData.getAll('criterion')) {
    try {
      const parsed = JSON.parse(String(raw)) as { key?: unknown; label?: unknown };
      if (typeof parsed?.key !== 'string' || typeof parsed?.label !== 'string') continue;
      const key = parsed.key.trim();
      const label = parsed.label.trim();
      if (!key || !label) continue;
      criteria.push({ key, label: label.slice(0, 300) });
    } catch {
      // A value that is not the JSON this form writes is not a criterion; skipping it is the only safe answer.
    }
  }
  return criteria;
}

export async function approveProjectCompletionAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const back = completionPath(assignmentId);

  // The checklist is required by the form (`required` on each box) and re-checked here, because a `required`
  // attribute is a property of a browser and this is a property of the record.
  const criteria = criteriaFrom(formData);
  if (criteria.length === 0) redirect(`${back}?failed=criteria_required`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('approve_assignment_completion_command', {
    p_assignment_id: assignmentId,
    p_note: String(formData.get('note') ?? '').trim() || null,
    p_acknowledged_criteria: criteria,
  });

  if (error) redirect(`${back}?failed=${completionFailureFromMessage(error.message)}`);
  redirect(`${completionPath(assignmentId)}?approved=1`);
}

export async function requestCompletionCorrectionAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const back = completionPath(assignmentId);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('request_completion_correction_command', {
    p_assignment_id: assignmentId,
    p_message: String(formData.get('message') ?? ''),
  });

  if (error) redirect(`${back}?failed=${completionFailureFromMessage(error.message)}`);
  redirect(`${completionPath(assignmentId)}?corrected=1`);
}

export async function raiseCompletionDisputeAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const back = completionPath(assignmentId);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('raise_completion_dispute_command', {
    p_assignment_id: assignmentId,
    p_reason: String(formData.get('reason') ?? ''),
  });

  if (error) redirect(`${back}?failed=${completionFailureFromMessage(error.message)}`);
  redirect(`${completionPath(assignmentId)}?disputed=1`);
}

export async function withdrawCompletionDisputeAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const disputeId = String(formData.get('dispute_id') ?? '');
  const back = completionPath(assignmentId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('withdraw_completion_dispute_command', {
    p_dispute_id: disputeId,
  });

  if (error) redirect(`${back}?failed=${completionFailureFromMessage(error.message)}`);
  redirect(`${completionPath(assignmentId)}?disputed=withdrawn`);
}
