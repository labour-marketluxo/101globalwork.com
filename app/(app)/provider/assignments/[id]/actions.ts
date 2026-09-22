'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function authOrRedirect(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  return supabase;
}

export async function scheduleAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authOrRedirect(`/provider/assignments/${assignmentId}`);
  const start = String(formData.get('scheduled_start') ?? '');
  const end = String(formData.get('scheduled_end') ?? '').trim() || null;
  const timezone = String(formData.get('timezone') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  const { error } = await supabase.rpc('schedule_assignment_command', {
    p_assignment_id: assignmentId,
    p_scheduled_start: new Date(start).toISOString(),
    p_scheduled_end: end ? new Date(end).toISOString() : null,
    p_timezone: timezone,
    p_note: note,
  });
  if (error) redirect(`/provider/assignments/${assignmentId}?error=${encodeURIComponent('Unable to schedule this work.')}`);
  redirect(`/provider/assignments/${assignmentId}?scheduled=1`);
}

export async function startAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authOrRedirect(`/provider/assignments/${assignmentId}`);
  const { error } = await supabase.rpc('start_assignment_command', { p_assignment_id: assignmentId });
  if (error) redirect(`/provider/assignments/${assignmentId}?error=${encodeURIComponent('Unable to start this work.')}`);
  redirect(`/provider/assignments/${assignmentId}?started=1`);
}

/**
 * Accept a time the customer proposed.
 *
 * ⚠️ IT GOES THROUGH THE ORDINARY SCHEDULE COMMAND, NOT AROUND IT. `accept_appointment_proposal_command`
 * calls `schedule_assignment_authoritatively`, so the actor check, the future-window check and the audit trail
 * are the same ones every other schedule passes — and the confirmation trigger resets the customer's answer,
 * because the time they confirmed is no longer the time on the booking.
 *
 * ⚠️ THE REFUSAL IS A FIXED SENTENCE. The provider pages elsewhere reflect the database's own message into the
 * query string, which the security audit flagged as a UI-spoofing surface. This one does not: everything the
 * caller can cause maps to one of the two reasons below.
 */
export async function acceptAppointmentProposalAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const proposalId = String(formData.get('proposal_id') ?? '');
  const supabase = await authOrRedirect(`/provider/assignments/${assignmentId}`);

  const { error } = await supabase.rpc('accept_appointment_proposal_command', { p_proposal_id: proposalId });
  if (error) {
    redirect(
      `/provider/assignments/${assignmentId}?error=${encodeURIComponent('That time could not be accepted. It may have been withdrawn, or it may no longer be in the future.')}`,
    );
  }
  redirect(`/provider/assignments/${assignmentId}?accepted=1`);
}

export async function submitEvidenceAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authOrRedirect(`/provider/assignments/${assignmentId}`);
  const note = String(formData.get('note') ?? '').trim();
  const externalUrl = String(formData.get('external_url') ?? '').trim() || null;
  const idempotencyKey = crypto.randomUUID();
  const { error } = await supabase.rpc('submit_work_evidence_command', {
    p_assignment_id: assignmentId,
    p_kind: externalUrl ? 'link' : 'note',
    p_note: note || null,
    p_storage_object_path: null,
    p_external_url: externalUrl,
    p_idempotency_key: idempotencyKey,
  });
  if (error) redirect(`/provider/assignments/${assignmentId}?error=${encodeURIComponent('Unable to submit completion evidence.')}`);
  redirect(`/provider/assignments/${assignmentId}?submitted=1`);
}
