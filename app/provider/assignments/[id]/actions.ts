'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function authOrRedirect(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
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
