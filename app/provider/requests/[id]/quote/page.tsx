import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { submitQuoteAction } from './actions';

export const metadata = { title: 'Submit quote', robots: { index: false, follow: false } };

export default async function ProviderQuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ provider?: string; error?: string; sent?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const providerId = query.provider ?? '';
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/provider/requests/${id}/quote?provider=${providerId}`)}`);
  if (!providerId) notFound();

  const { data: opportunity } = await supabase.rpc('get_provider_quote_opportunity', { p_request_id: id, p_provider_id: providerId });
  const item = opportunity?.[0];
  if (!item) notFound();
  const { data: market } = await supabase.from('public_market_catalog').select('default_currency_code').eq('market_id', item.market_id).maybeSingle();
  const currency = market?.default_currency_code ?? 'USD';
  const { data: existing } = await supabase.from('quotes').select('id,status,currency_code,total_minor,summary,submitted_at').eq('request_id', id).eq('provider_id', providerId).order('submitted_at', { ascending: false });

  return <section className="content-shell">
    <p className="eyebrow">Provider quote</p>
    <h1>Quote this work</h1>
    <p className="lede left">{item.need_text}</p>
    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.sent ? <p className="notice">Quote submitted. The customer can now review it.</p> : null}

    <form action={submitQuoteAction} className="stack-form action-panel">
      <input type="hidden" name="request_id" value={id} />
      <input type="hidden" name="provider_id" value={providerId} />
      <h2>Price and terms</h2>
      <label htmlFor="amount">Total amount</label>
      <input id="amount" name="amount" type="number" min="0" step="0.01" required inputMode="decimal" />
      <label htmlFor="currency_code">Currency</label>
      <input id="currency_code" name="currency_code" defaultValue={currency} maxLength={3} minLength={3} required />
      <label htmlFor="summary">What is included?</label>
      <textarea id="summary" name="summary" rows={5} maxLength={2000} placeholder="Describe the work, materials or exclusions clearly." />
      <label htmlFor="valid_until">Quote valid until</label>
      <input id="valid_until" name="valid_until" type="datetime-local" />
      <button type="submit">Submit quote</button>
    </form>

    {existing?.length ? <section className="action-panel"><h2>Your submitted quotes</h2><ul>{existing.map(q => <li key={q.id}>{q.currency_code} {(Number(q.total_minor) / 100).toFixed(2)} · <strong>{q.status}</strong></li>)}</ul></section> : null}
  </section>;
}
