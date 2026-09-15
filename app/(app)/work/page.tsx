import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'My work', robots: { index: false, follow: false } };

type RequestRow = {
  id: string;
  need_text: string;
  state: string;
  service_entity_id: string | null;
  location_id: string | null;
  created_at: string;
  updated_at: string;
};

function nextAction(request: RequestRow, quoteCount: number, assignmentStatus?: string | null, obligationStatus?: string | null) {
  if (request.state === 'completed') return { label: 'Completed', detail: 'Work is complete and recorded.', tone: 'done' };
  if (request.state === 'cancelled') return { label: 'Closed', detail: 'This request is no longer active.', tone: 'quiet' };
  if (request.state === 'submitted_for_approval') return { label: 'Approve completion', detail: 'Review the provider evidence and approve only when the work is satisfactory.', tone: 'action' };
  if (obligationStatus && ['pending', 'funding'].includes(obligationStatus)) return { label: 'Complete payment', detail: 'Your provider is assigned. Fund the work through the secure payment flow.', tone: 'action' };
  if (obligationStatus === 'funded' && assignmentStatus === 'active') return { label: 'Work in progress', detail: 'Payment is confirmed and the provider can proceed with the accepted work.', tone: 'progress' };
  if (assignmentStatus === 'active') return { label: 'Assigned', detail: 'Your accepted provider is preparing or managing this work.', tone: 'progress' };
  if (quoteCount > 0) return { label: 'Review quotes', detail: `${quoteCount} provider quote${quoteCount === 1 ? '' : 's'} available to review.`, tone: 'action' };
  return { label: 'Waiting for quotes', detail: 'The request is open to providers who pass the current eligibility rules.', tone: 'quiet' };
}

export default async function MyWorkPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/work');

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/sign-in?error=Account%20setup%20is%20not%20ready&next=/work');

  const { data: requests } = await supabase
    .from('requests')
    .select('id,need_text,state,service_entity_id,location_id,created_at,updated_at')
    .eq('customer_account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (requests ?? []) as RequestRow[];
  const requestIds = rows.map(item => item.id);

  const [{ data: quotes }, { data: assignments }, { data: obligations }, { data: serviceCatalog }, { data: locationCatalog }] = await Promise.all([
    requestIds.length ? supabase.from('quotes').select('id,request_id,status').in('request_id', requestIds) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from('assignments').select('id,request_id,status').in('request_id', requestIds).in('status', ['active', 'completed']) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from('payment_obligations').select('id,request_id,status,currency_code,amount_minor').in('request_id', requestIds) : Promise.resolve({ data: [] }),
    supabase.from('public_service_catalog').select('service_entity_id,display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name'),
  ]);

  const quoteCounts = new Map<string, number>();
  for (const quote of quotes ?? []) {
    if (['submitted', 'accepted'].includes(quote.status)) quoteCounts.set(quote.request_id, (quoteCounts.get(quote.request_id) ?? 0) + 1);
  }
  const assignmentByRequest = new Map((assignments ?? []).map(item => [item.request_id, item]));
  const obligationByRequest = new Map((obligations ?? []).map(item => [item.request_id, item]));
  const serviceName = new Map((serviceCatalog ?? []).map(item => [item.service_entity_id, item.display_name]));
  const locationName = new Map((locationCatalog ?? []).map(item => [item.location_id, item.display_name]));

  const viewRows = rows.map(request => {
    const assignment = assignmentByRequest.get(request.id);
    const obligation = obligationByRequest.get(request.id);
    const quoteCount = quoteCounts.get(request.id) ?? 0;
    return { request, quoteCount, assignment, obligation, action: nextAction(request, quoteCount, assignment?.status, obligation?.status) };
  });
  const needsYou = viewRows.filter(item => item.action.tone === 'action');
  const otherWork = viewRows.filter(item => item.action.tone !== 'action');
  const openCount = rows.filter(item => !['completed', 'cancelled'].includes(item.state)).length;
  const completedCount = rows.filter(item => item.state === 'completed').length;

  const renderCard = ({ request, action }: (typeof viewRows)[number]) => <article className="quote-card" key={request.id}>
    <div>
      <strong>{request.need_text}</strong><br />
      <span className="hint">{request.service_entity_id ? serviceName.get(request.service_entity_id) ?? 'Service' : 'Service not set'} · {request.location_id ? locationName.get(request.location_id) ?? 'Area' : 'Area not set'}</span>
    </div>
    <div>
      <strong>{action.label}</strong>
      <p className="hint">{action.detail}</p>
    </div>
    <Link className="button-link" href={`/requests/${request.id}`}>{action.tone === 'action' ? 'Continue' : 'View'}</Link>
  </article>;

  return <section className="content-shell">
    <div className="section-heading-row">
      <div>
        <p className="eyebrow">My work</p>
        <h1>Your work</h1>
        <p className="lede left">The things waiting on you appear first. Everything else stays visible without making a simple request feel like project-management software.</p>
      </div>
      <Link className="button-link" href="/requests/new">Request new work</Link>
    </div>

    <section className="provider-progress-card" aria-label="Work summary">
      <div><span>Open</span><strong>{openCount}</strong></div>
      <div><span>Needs you</span><strong>{needsYou.length}</strong></div>
      <div><span>Completed</span><strong>{completedCount}</strong></div>
    </section>

    {needsYou.length ? <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">Needs you</p><h2>Take the next action</h2></div><span className="pill">{needsYou.length}</span></div>
      <div className="quote-list">{needsYou.map(renderCard)}</div>
    </section> : null}

    <section className="action-panel">
      <div className="section-heading-row"><div><p className="eyebrow">All work</p><h2>{needsYou.length ? 'Waiting, active and completed' : 'Current and recent work'}</h2></div><span className="pill">{rows.length}</span></div>
      {rows.length ? <div className="quote-list">{(needsYou.length ? otherWork : viewRows).map(renderCard)}</div> : <div className="empty-admin"><strong>No requests yet.</strong><p>Tell 101GlobalWork what you need done and we will take you into the matching flow.</p><Link className="button-link" href="/requests/new">Create your first request</Link></div>}
    </section>
  </section>;
}
