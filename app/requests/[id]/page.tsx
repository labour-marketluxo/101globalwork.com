import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptQuoteAction, approveCompletionAction } from './actions';

export const metadata = { title: 'Your request', robots: { index: false, follow: false } };

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; accepted?: string; completed?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/requests/${id}`)}`);

  const { data: request } = await supabase.from('requests').select('id,state,need_text,created_at').eq('id', id).maybeSingle();
  if (!request) notFound();

  const { data: quotes } = await supabase.from('quotes').select('id,provider_id,status,currency_code,total_minor,summary,valid_until,submitted_at').eq('request_id', id).order('submitted_at', { ascending: true });
  const providerIds = [...new Set((quotes ?? []).map(q => q.provider_id))];
  const { data: profiles } = providerIds.length ? await supabase.from('provider_public_profiles').select('provider_id,slug,headline').in('provider_id', providerIds) : { data: [] };
  const profileByProvider = new Map((profiles ?? []).map(p => [p.provider_id, p]));
  const { data: assignment } = await supabase.from('assignments').select('id,provider_id,status,assigned_at,accepted_quote_id').eq('request_id', id).in('status', ['active','completed']).maybeSingle();
  const { data: schedule } = assignment ? await supabase.from('assignment_schedules').select('scheduled_start,scheduled_end,timezone,note').eq('assignment_id', assignment.id).maybeSingle() : { data: null };
  const { data: evidence } = assignment ? await supabase.from('work_evidence').select('id,kind,note,external_url,submitted_at').eq('assignment_id', assignment.id).order('submitted_at', { ascending: false }) : { data: [] };

  return <section className="content-shell">
    <p className="eyebrow">Your request</p>
    <h1>{request.need_text}</h1>
    <p className="lede left">Status: <strong>{request.state.replaceAll('_', ' ')}</strong></p>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.accepted ? <p className="notice">Quote accepted. Your provider is now assigned to this request.</p> : null}
    {query.completed ? <p className="notice">Completion approved. This work is now recorded as completed.</p> : null}

    {assignment ? <section className="action-panel">
      <h2>Assigned work</h2>
      <p>Your accepted quote is the authoritative assignment. Payment has not been collected or released at this stage.</p>
      {schedule ? <p><strong>Scheduled:</strong> {new Date(schedule.scheduled_start).toLocaleString()} ({schedule.timezone}){schedule.scheduled_end ? ` to ${new Date(schedule.scheduled_end).toLocaleString()}` : ''}</p> : <p className="hint">The provider has not scheduled the work yet.</p>}
      {evidence?.length ? <div><h3>Completion evidence</h3><ul>{evidence.map(item => <li key={item.id}><strong>{item.kind}</strong>: {item.note ?? item.external_url ?? 'Evidence submitted'} · {new Date(item.submitted_at).toLocaleString()}</li>)}</ul></div> : null}
      {request.state === 'submitted_for_approval' ? <form action={approveCompletionAction} className="stack-form">
        <input type="hidden" name="request_id" value={id} />
        <input type="hidden" name="assignment_id" value={assignment.id} />
        <label htmlFor="completion-note">Completion note (optional)</label>
        <textarea id="completion-note" name="note" rows={3} placeholder="Add a note about the completed work." />
        <button type="submit">Approve completed work</button>
      </form> : null}
    </section> : null}

    <section className="action-panel">
      <h2>Quotes</h2>
      {!quotes?.length ? <p>No quotes yet. Eligible providers can submit offers when available.</p> : <div className="quote-list">
        {quotes.map(q => {
          const profile = profileByProvider.get(q.provider_id);
          const available = q.status === 'submitted' && (!q.valid_until || new Date(q.valid_until) > new Date()) && !assignment;
          return <article className="quote-card" key={q.id}>
            <div><strong>{profile?.headline ?? 'Verified provider'}</strong><br /><span>{money(Number(q.total_minor), q.currency_code)}</span></div>
            {q.summary ? <p>{q.summary}</p> : null}
            <p className="hint">Status: {q.status}{q.valid_until ? ` · valid until ${new Date(q.valid_until).toLocaleString()}` : ''}</p>
            {available ? <form action={acceptQuoteAction}><input type="hidden" name="request_id" value={id} /><input type="hidden" name="quote_id" value={q.id} /><button type="submit">Accept quote</button></form> : null}
          </article>;
        })}
      </div>}
    </section>
  </section>;
}
