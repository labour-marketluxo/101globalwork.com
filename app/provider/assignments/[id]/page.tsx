import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { scheduleAssignmentAction, startAssignmentAction, submitEvidenceAction } from './actions';

export const metadata = { title: 'Assigned work', robots: { index: false, follow: false } };

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}

export default async function ProviderAssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; scheduled?: string; started?: string; submitted?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/provider/assignments/${id}`)}`);

  const { data: assignment } = await supabase.from('assignments').select('id,request_id,provider_id,status,assigned_at').eq('id', id).maybeSingle();
  if (!assignment) notFound();
  const [{ data: request }, { data: schedule }, { data: evidence }, { data: obligation }] = await Promise.all([
    supabase.from('requests').select('id,state,need_text,timezone').eq('id', assignment.request_id).maybeSingle(),
    supabase.from('assignment_schedules').select('scheduled_start,scheduled_end,timezone,note').eq('assignment_id', id).maybeSingle(),
    supabase.from('work_evidence').select('id,kind,note,external_url,submitted_at').eq('assignment_id', id).order('submitted_at', { ascending: false }),
    supabase.from('payment_obligations').select('id,status,currency_code,amount_minor').eq('assignment_id', id).maybeSingle(),
  ]);
  if (!request) notFound();

  const paymentFunded = !obligation || obligation.status === 'funded';
  const canStart = request.state === 'scheduled' && paymentFunded;

  return <section className="content-shell">
    <p className="eyebrow">Assigned work</p>
    <h1>{request.need_text}</h1>
    <p className="lede left">The next action is determined by the accepted work state and, for paid assignments, verified payment funding.</p>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.scheduled ? <p className="notice">Schedule saved.</p> : null}
    {query.started ? <p className="notice">Work marked as started.</p> : null}
    {query.submitted ? <p className="notice">Completion evidence submitted to the customer.</p> : null}

    <section className="provider-progress-card" aria-label="Assignment status">
      <div><span>Work state</span><strong>{request.state.replaceAll('_', ' ')}</strong></div>
      <div><span>Payment</span><strong>{obligation ? obligation.status.replaceAll('_', ' ') : 'Not required'}</strong></div>
      <div><span>Assignment</span><strong>{assignment.status.replaceAll('_', ' ')}</strong></div>
    </section>

    {obligation ? <section className="action-panel">
      <p className="eyebrow">Payment protection</p>
      <h2>{money(Number(obligation.amount_minor), obligation.currency_code)}</h2>
      {obligation.status === 'funded' ? <p className="notice"><strong>Payment confirmed.</strong><br />The obligation is funded from reconciled payment records. Work can proceed when scheduled.</p> : <p className="notice"><strong>Waiting for customer payment.</strong><br />You may agree and save the schedule, but paid work cannot be started until the payment obligation is funded from a verified provider event.</p>}
    </section> : null}

    {request.state === 'accepted' ? <form action={scheduleAssignmentAction} className="stack-form action-panel">
      <h2>Schedule the work</h2>
      <p className="hint">Scheduling reserves the agreed time. It does not bypass the payment gate for paid work.</p>
      <input type="hidden" name="assignment_id" value={id} />
      <label htmlFor="scheduled_start">Start</label><input id="scheduled_start" name="scheduled_start" type="datetime-local" required />
      <label htmlFor="scheduled_end">Expected finish (optional)</label><input id="scheduled_end" name="scheduled_end" type="datetime-local" />
      <label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" required defaultValue={request.timezone ?? 'Africa/Lagos'} />
      <label htmlFor="schedule_note">Note (optional)</label><textarea id="schedule_note" name="note" rows={3} />
      <button type="submit">Confirm schedule</button>
    </form> : null}

    {schedule ? <section className="action-panel"><h2>Schedule</h2><p>{new Date(schedule.scheduled_start).toLocaleString()} ({schedule.timezone}){schedule.scheduled_end ? ` to ${new Date(schedule.scheduled_end).toLocaleString()}` : ''}</p>{schedule.note ? <p>{schedule.note}</p> : null}</section> : null}

    {request.state === 'scheduled' && !paymentFunded ? <section className="action-panel"><h2>Start is locked</h2><p>Waiting for the customer payment to be confirmed. Refresh this page after payment; the Start work action appears only when the authoritative obligation state is funded.</p></section> : null}

    {canStart ? <form action={startAssignmentAction} className="action-panel"><input type="hidden" name="assignment_id" value={id} /><h2>Ready to begin?</h2><p>Payment and schedule requirements are satisfied. Start only when the work is actually beginning.</p><button type="submit">Start work</button></form> : null}

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
