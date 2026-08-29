import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'My work', robots: { index: false, follow: false } };

type RequestRow = {
  id: string;
  need_text: string;
  state: string;
  created_at: string;
  updated_at: string;
};

function nextAction(request: RequestRow, quoteCount: number, assignmentStatus?: string | null, obligationStatus?: string | null) {
  if (request.state === 'completed') return { label: 'Completed', detail: 'Work is complete and recorded.', tone: 'done' };
  if (request.state === 'cancelled') return { label: 'Closed', detail: 'This request is no longer active.', tone: 'quiet' };
  if (request.state === 'submitted_for_approval') return { label: 'Your approval needed', detail: 'Review the provider evidence and approve completion when the work is satisfactory.', tone: 'action' };
  if (obligationStatus && ['pending', 'funding'].includes(obligationStatus)) return { label: 'Payment needed', detail: 'Your provider is assigned. Complete secure payment to fund the work.', tone: 'action' };
  if (obligationStatus === 'funded') return { label: 'Payment confirmed', detail: assignmentStatus === 'active' ? 'The work is funded and active.' : 'Payment is reconciled and recorded.', tone: 'done' };
  if (assignmentStatus === 'active') return { label: 'Work in progress', detail: 'Your accepted provider is managing this work.', tone: 'progress' };
  if (quoteCount > 0) return { label: 'Review quotes', detail: `${quoteCount} provider quote${quoteCount === 1 ? '' : 's'} available to review.`, tone: 'action' };
  return { label: 'Waiting for quotes', detail: 'Eligible providers can respond when they are available.', tone: 'quiet' };
}

export default async function MyWorkPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/work');

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/sign-in?error=Account%20setup%20is%20not%20ready&next=/work');

  const { data: requests } = await supabase
    .from('requests')
    .select('id,need_text,state,created_at,updated_at')
    .eq('customer_account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (requests ?? []) as RequestRow[];
  const requestIds = rows.map(item => item.id);

  const [{ data: quotes }, { data: assignments }, { data: obligations }] = requestIds.length ? await Promise.all([
    supabase.from('quotes').select('id,request_id,status').in('request_id', requestIds),
    supabase.from('assignments').select('id,request_id,status').in('request_id', requestIds).in('status', ['active', 'completed']),
    supabase.from('payment_obligations').select('id,request_id,status,currency_code,amount_minor').in('request_id', requestIds),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const quoteCounts = new Map<string, number>();
  for (const quote of quotes ?? []) {
    if (['submitted', 'accepted'].includes(quote.status)) quoteCounts.set(quote.request_id, (quoteCounts.get(quote.request_id) ?? 0) + 1);
  }
  const assignmentByRequest = new Map((assignments ?? []).map(item => [item.request_id, item]));
  const obligationByRequest = new Map((obligations ?? []).map(item => [item.request_id, item]));
  const openCount = rows.filter(item => !['completed', 'cancelled'].includes(item.state)).length;
  const actionCount = rows.filter(item => {
    const a = nextAction(item, quoteCounts.get(item.id) ?? 0, assignmentByRequest.get(item.id)?.status, obligationByRequest.get(item.id)?.status);
    return a.tone === 'action';
  }).length;

  return <section className="content-shell">
    <div className="section-heading-row">
      <div>
        <p className="eyebrow">My work</p>
        <h1>Everything you asked to get done.</h1>
        <p className="lede left">See what is waiting, what needs you, and what has been completed without hunting through old links.</p>
      </div>
      <Link className="button-link" href="/requests/new">Request new work</Link>
    </div>

    <section className="provider-progress-card" aria-label="Work summary">
      <div><span>Open work</span><strong>{openCount}</strong></div>
      <div><span>Needs you</span><strong>{actionCount}</strong></div>
      <div><span>Completed</span><strong>{rows.filter(item => item.state === 'completed').length}</strong></div>
    </section>

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Requests</p><h2>Current and recent work</h2></div><span className="pill">{rows.length}</span></div>
      {rows.length ? <div className="quote-list">{rows.map(request => {
        const quotesForRequest = quoteCounts.get(request.id) ?? 0;
        const assignment = assignmentByRequest.get(request.id);
        const obligation = obligationByRequest.get(request.id);
        const action = nextAction(request, quotesForRequest, assignment?.status, obligation?.status);
        return <article className="quote-card" key={request.id}>
          <div>
            <strong>{request.need_text}</strong><br />
            <span className="hint">Created {new Date(request.created_at).toLocaleString()} · state {request.state.replaceAll('_', ' ')}</span>
          </div>
          <div>
            <strong>{action.label}</strong>
            <p className="hint">{action.detail}</p>
          </div>
          <Link className="button-link" href={`/requests/${request.id}`}>{action.tone === 'action' ? 'Continue' : 'View request'}</Link>
        </article>;
      })}</div> : <div className="empty-admin"><strong>No requests yet.</strong><p>Tell 101GlobalWork what you need done and we will take you into the matching flow.</p><Link className="button-link" href="/requests/new">Create your first request</Link></div>}
    </section>
  </section>;
}
