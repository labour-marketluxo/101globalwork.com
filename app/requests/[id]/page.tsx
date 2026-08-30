import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptQuoteAction, approveCompletionAction } from './actions';

export const metadata = { title: 'Your request', robots: { index: false, follow: false } };

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}

function requestStatus(state: string) {
  const labels: Record<string, string> = {
    submitted: 'Waiting for provider quotes',
    matching: 'Finding eligible providers',
    quoted: 'Quotes available',
    accepted: 'Provider assigned',
    scheduled: 'Work scheduled',
    in_progress: 'Work in progress',
    submitted_for_approval: 'Completion needs your approval',
    completed: 'Completed',
    cancelled: 'Closed',
  };
  return labels[state] ?? state.replaceAll('_', ' ');
}

function paymentErrorMessage(code?: string) {
  if (!code) return null;
  const messages: Record<string, string> = {
    authentication_required: 'Please sign in again before starting payment.',
    obligation_not_found: 'This payment obligation is no longer available.',
    obligation_not_payable: 'This payment no longer needs to be started.',
    payment_already_confirmed: 'This payment has already been confirmed.',
    unable_to_create_payment_attempt: 'A payment is already in progress or cannot be started right now.',
    unable_to_bind_checkout: 'The secure checkout session could not be saved. Please try again shortly.',
    payment_provider_unavailable: 'Paystack is temporarily unavailable. No payment was recorded. Please try again shortly.',
    invalid_request: 'The payment request could not be understood.',
    obligation_required: 'The payment request is incomplete.',
  };
  return messages[code] ?? 'Payment could not be started. Please try again.';
}

export default async function RequestPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; accepted?: string; completed?: string; payment_error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/requests/${id}`)}`);

  const { data: request } = await supabase.from('requests').select('id,state,need_text,service_entity_id,location_id,created_at').eq('id', id).maybeSingle();
  if (!request) notFound();

  const [{ data: service }, { data: location }, { data: quotes }] = await Promise.all([
    request.service_entity_id ? supabase.from('public_service_catalog').select('display_name').eq('service_entity_id', request.service_entity_id).maybeSingle() : Promise.resolve({ data: null }),
    request.location_id ? supabase.from('public_location_catalog').select('display_name').eq('location_id', request.location_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('quotes').select('id,provider_id,status,currency_code,total_minor,summary,valid_until,submitted_at').eq('request_id', id).order('submitted_at', { ascending: true }),
  ]);

  const providerIds = [...new Set((quotes ?? []).map(q => q.provider_id))];
  const { data: profiles } = providerIds.length ? await supabase.from('provider_public_profiles').select('provider_id,slug,headline,verification_summary').in('provider_id', providerIds) : { data: [] };
  const profileByProvider = new Map((profiles ?? []).map(p => [p.provider_id, p]));
  const { data: assignment } = await supabase.from('assignments').select('id,provider_id,status,assigned_at,accepted_quote_id').eq('request_id', id).in('status', ['active','completed']).maybeSingle();
  const { data: schedule } = assignment ? await supabase.from('assignment_schedules').select('scheduled_start,scheduled_end,timezone,note').eq('assignment_id', assignment.id).maybeSingle() : { data: null };
  const { data: evidence } = assignment ? await supabase.from('work_evidence').select('id,kind,note,external_url,submitted_at').eq('assignment_id', assignment.id).order('submitted_at', { ascending: false }) : { data: [] };
  const { data: obligation } = assignment ? await supabase.from('payment_obligations').select('id,status,currency_code,amount_minor').eq('assignment_id', assignment.id).maybeSingle() : { data: null };
  const { data: attempts } = obligation ? await supabase.from('payment_attempts').select('id,status,provider_adapter,created_at').eq('obligation_id', obligation.id).order('created_at', { ascending: false }).limit(3) : { data: [] };
  const latestAttempt = attempts?.[0];
  const canStartPayment = Boolean(obligation && ['pending', 'funding'].includes(obligation.status) && latestAttempt?.status !== 'succeeded');
  const paymentButtonLabel = latestAttempt?.status === 'pending_provider' ? 'Continue secure payment' : latestAttempt?.status === 'failed' ? 'Try payment again' : 'Pay securely';
  const paymentError = paymentErrorMessage(query.payment_error);

  return <section className="content-shell">
    <p className="eyebrow">Your request</p>
    <h1>{request.need_text}</h1>
    <p className="lede left">{requestStatus(request.state)}</p>

    <section className="provider-progress-card" aria-label="Request summary">
      <div><span>Service</span><strong>{service?.display_name ?? 'Not set'}</strong></div>
      <div><span>Work area</span><strong>{location?.display_name ?? 'Not set'}</strong></div>
      <div><span>Status</span><strong>{requestStatus(request.state)}</strong></div>
    </section>

    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {paymentError ? <p className="notice" role="alert">{paymentError}</p> : null}
    {query.accepted ? <p className="notice"><strong>Quote accepted.</strong><br />The provider is assigned. A payment obligation has been created, but no payment is considered funded until a verified Paystack event is reconciled.</p> : null}
    {query.completed ? <p className="notice">Completion approved. This work is now recorded as completed.</p> : null}

    {assignment ? <section className="action-panel">
      <h2>Assigned work</h2>
      <p>Your accepted quote is the authoritative assignment for this request.</p>
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

    {obligation ? <section className="action-panel payment-panel">
      <div className="payment-panel-heading">
        <div><p className="eyebrow">Payment</p><h2>{money(Number(obligation.amount_minor), obligation.currency_code)}</h2></div>
        <span className="pill">{obligation.status.replaceAll('_', ' ')}</span>
      </div>
      {obligation.status === 'funded'
        ? <p><strong>Payment confirmed.</strong> The obligation is funded from a verified Paystack event and reconciled financial records.</p>
        : <p className="hint">A browser return never marks this as paid. 101GlobalWork changes financial state only after a verified Paystack webhook is reconciled.</p>}

      {canStartPayment ? <form action="/api/payments/paystack/checkout" method="post" className="payment-action-form">
        <input type="hidden" name="obligationId" value={obligation.id} />
        <input type="hidden" name="returnTo" value={`/requests/${id}`} />
        <button type="submit">{paymentButtonLabel}</button>
        <span>Secure checkout by Paystack</span>
      </form> : null}

      {attempts?.length ? <details className="identity-details payment-history"><summary>Payment activity</summary><ul>{attempts.map(a => <li key={a.id}>{a.provider_adapter}: {a.status.replaceAll('_', ' ')} · {new Date(a.created_at).toLocaleString()}</li>)}</ul></details> : null}
    </section> : null}

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Quotes</p><h2>{quotes?.length ? 'Compare and choose' : 'Waiting for providers'}</h2></div><span className="pill">{quotes?.length ?? 0}</span></div>
      {!quotes?.length ? <p>No quotes yet. The request remains open to providers who pass the service, geography, verification and readiness rules.</p> : <div className="quote-list">
        {quotes.map(q => {
          const profile = profileByProvider.get(q.provider_id);
          const verified = Boolean((profile?.verification_summary as { verified?: boolean } | null)?.verified);
          const available = q.status === 'submitted' && (!q.valid_until || new Date(q.valid_until) > new Date()) && !assignment;
          return <article className="quote-card" key={q.id}>
            <div>
              <strong>{profile?.headline ?? 'Service provider'}</strong><br />
              <span>{money(Number(q.total_minor), q.currency_code)}</span>
              {verified ? <><br /><span className="hint">Identity verified</span></> : null}
            </div>
            {q.summary ? <p><strong>Included:</strong> {q.summary}</p> : <p className="hint">No scope summary was saved for this older quote.</p>}
            <p className="hint">Status: {q.status.replaceAll('_',' ')}{q.valid_until ? ` · valid until ${new Date(q.valid_until).toLocaleString()}` : ''}</p>
            {profile?.slug ? <p><Link href={`/providers/${profile.slug}/`}>View provider profile</Link></p> : null}
            {available ? <div>
              <p className="hint">Accepting creates the assignment and payment obligation. It does not mark payment as funded or allow paid work to bypass the payment gate.</p>
              <form action={acceptQuoteAction}><input type="hidden" name="request_id" value={id} /><input type="hidden" name="quote_id" value={q.id} /><button type="submit">Accept quote</button></form>
            </div> : null}
          </article>;
        })}
      </div>}
    </section>
  </section>;
}
