import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { scheduleAssignmentAction, startAssignmentAction, submitEvidenceAction } from './actions';

export const metadata = { title: 'Assigned work', robots: { index: false, follow: false } };

export default async function ProviderAssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; scheduled?: string; started?: string; submitted?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/provider/assignments/${id}`)}`);

  const { data: assignment } = await supabase.from('assignments').select('id,request_id,provider_id,status,assigned_at').eq('id', id).maybeSingle();
  if (!assignment) notFound();
  const { data: request } = await supabase.from('requests').select('id,state,need_text,timezone').eq('id', assignment.request_id).maybeSingle();
  if (!request) notFound();
  const { data: schedule } = await supabase.from('assignment_schedules').select('scheduled_start,scheduled_end,timezone,note').eq('assignment_id', id).maybeSingle();
  const { data: evidence } = await supabase.from('work_evidence').select('id,kind,note,external_url,submitted_at').eq('assignment_id', id).order('submitted_at', { ascending: false });

  return <section className="content-shell">
    <p className="eyebrow">Assigned work</p>
    <h1>{request.need_text}</h1>
    <p className="lede left">Status: <strong>{request.state.replaceAll('_', ' ')}</strong></p>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.scheduled ? <p className="notice">Schedule saved.</p> : null}
    {query.started ? <p className="notice">Work marked as started.</p> : null}
    {query.submitted ? <p className="notice">Completion evidence submitted to the customer.</p> : null}

    {request.state === 'accepted' ? <form action={scheduleAssignmentAction} className="stack-form action-panel">
      <h2>Schedule the work</h2>
      <input type="hidden" name="assignment_id" value={id} />
      <label htmlFor="scheduled_start">Start</label><input id="scheduled_start" name="scheduled_start" type="datetime-local" required />
      <label htmlFor="scheduled_end">Expected finish (optional)</label><input id="scheduled_end" name="scheduled_end" type="datetime-local" />
      <label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" required defaultValue={request.timezone ?? 'Africa/Lagos'} />
      <label htmlFor="schedule_note">Note (optional)</label><textarea id="schedule_note" name="note" rows={3} />
      <button type="submit">Confirm schedule</button>
    </form> : null}

    {schedule ? <section className="action-panel"><h2>Schedule</h2><p>{new Date(schedule.scheduled_start).toLocaleString()} ({schedule.timezone}){schedule.scheduled_end ? ` to ${new Date(schedule.scheduled_end).toLocaleString()}` : ''}</p>{schedule.note ? <p>{schedule.note}</p> : null}</section> : null}

    {request.state === 'scheduled' ? <form action={startAssignmentAction} className="action-panel"><input type="hidden" name="assignment_id" value={id} /><h2>Ready to begin?</h2><p>Only start when work is actually beginning.</p><button type="submit">Start work</button></form> : null}

    {request.state === 'in_progress' ? <form action={submitEvidenceAction} className="stack-form action-panel">
      <h2>Submit completion evidence</h2>
      <input type="hidden" name="assignment_id" value={id} />
      <label htmlFor="evidence_note">What was completed?</label><textarea id="evidence_note" name="note" rows={5} required placeholder="Describe the work completed and anything the customer should know." />
      <label htmlFor="external_url">Evidence link (optional)</label><input id="external_url" name="external_url" type="url" placeholder="https://" />
      <button type="submit">Submit for customer approval</button>
    </form> : null}

    {evidence?.length ? <section className="action-panel"><h2>Evidence submitted</h2><ul>{evidence.map(item => <li key={item.id}><strong>{item.kind}</strong>: {item.note ?? item.external_url ?? 'Evidence'} · {new Date(item.submitted_at).toLocaleString()}</li>)}</ul></section> : null}

    {request.state === 'submitted_for_approval' ? <p className="notice">Waiting for the customer to approve completion.</p> : null}
    {request.state === 'completed' ? <p className="notice">This work has been approved as completed.</p> : null}
  </section>;
}
