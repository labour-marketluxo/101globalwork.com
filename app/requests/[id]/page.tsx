import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptQuoteAction } from './actions';

export const metadata = { title: 'Your request', robots: { index: false, follow: false } };

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; accepted?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/requests/${id}`)}`);

  const { data: request } = await supabase.from('requests').select('id,state,need_text,created_at').eq('id', id).maybeSingle();
  if (!request) notFound();

  const { data: quotes } = await supabase.from('quotes').select('id,provider_id,status,currency_code,total_minor,summary,valid_until,submitted_at').eq('request_id', id).order('submitted_at', { ascending: true });
  const providerIds = [...new Set((quotes ?? []).map(q => q.provider_id))];
  const { data: profiles } = providerIds.length
    ? await supabase.from('provider_public_profiles').select('provider_id,slug,headline').in('provider_id', providerIds)
    : { data: [] };
  const profileByProvider = new Map((profiles ?? []).map(p => [p.provider_id, p]));
  const { data: assignment } = await supabase.from('assignments').select('id,provider_id,status,assigned_at,accepted_quote_id').eq('request_id', id).eq('status', 'active').maybeSingle();

  return <section className="content-shell">
    <p className="eyebrow">Your request</p>
    <h1>{request.need_text}</h1>
    <p className="lede left">Status: <strong>{request.state.replaceAll('_', ' ')}</strong></p>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.accepted ? <p className="notice">Quote accepted. Your provider is now assigned to this request.</p> : null}

    {assignment ? <section className="action-panel">
      <h2>Provider assigned</h2>
      <p>Your accepted quote is now the authoritative assignment for this request. Payment has not been collected or released at this stage.</p>
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
            {available ? <form action={acceptQuoteAction}>
              <input type="hidden" name="request_id" value={id} />
              <input type="hidden" name="quote_id" value={q.id} />
              <button type="submit">Accept quote</button>
            </form> : null}
          </article>;
        })}
      </div>}
    </section>
  </section>;
}
