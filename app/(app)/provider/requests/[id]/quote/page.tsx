import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { QuotePricingFields } from '@/components/provider/QuotePricingFields';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { submitQuoteAction } from './actions';

export const metadata = { title: 'Submit quote', robots: { index: false, follow: false } };

/**
 * ⚠️ A FIXED VOCABULARY, NOT THE TEXT THAT CAME BACK. The refusal is carried in the query string, so putting
 * the server's own words there would let anyone type a message that renders inside the platform's notice
 * styling. The action maps every refusal onto one of these codes and everything it does not recognise becomes
 * `failed`.
 */
const QUOTE_FAILURES: Record<string, string> = {
  price: 'Every line needs a description and an amount, and the total must be greater than zero.',
  summary: 'Describe what is included in at least 20 characters.',
  validity: 'Quote validity must be a future date and time.',
  taxes: 'Taxes and fees must be a whole amount of money, and they cannot be negative.',
  timeline: 'A timeline has to be a whole number of days greater than zero.',
  terms: 'One of the terms was too long. Keep each note under 2,000 characters.',
  eligibility: 'This quote could not be submitted. Check the request, the price and the scope, and that your provider account is still eligible to quote — then try again.',
  failed: 'That did not work and nothing was saved. Try again.',
};

export default async function ProviderQuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ provider?: string; error?: string; sent?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const providerId = query.provider ?? '';
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/provider/requests/${id}/quote?provider=${providerId}`)}`);
  if (!providerId) notFound();

  const { data: opportunity } = await supabase.rpc('get_provider_quote_opportunity', { p_request_id: id, p_provider_id: providerId });
  const item = opportunity?.[0];
  if (!item) notFound();

  const [{ data: market }, { data: service }, { data: location }, { data: existing }] = await Promise.all([
    supabase.from('public_market_catalog').select('default_currency_code').eq('market_id', item.market_id).maybeSingle(),
    supabase.from('public_service_catalog').select('display_name').eq('service_entity_id', item.service_entity_id).maybeSingle(),
    supabase.from('public_location_catalog').select('display_name').eq('location_id', item.location_id).maybeSingle(),
    supabase.from('quotes').select('id,status,currency_code,total_minor,summary,valid_until,submitted_at,version_label').eq('request_id', id).eq('provider_id', providerId).order('submitted_at', { ascending: false }),
  ]);
  const currency = market?.default_currency_code ?? 'USD';

  return <section className="content-shell">
    <p className="eyebrow">Provider quote</p>
    <h1>Quote this work</h1>
    <p className="lede left">Price only the work you can actually deliver. The accepted quote becomes part of the authoritative work and payment baseline.</p>
    {query.error ? <p className="notice" role="alert">{QUOTE_FAILURES[query.error] ?? QUOTE_FAILURES.failed}</p> : null}
    {query.sent ? <p className="notice" role="status"><strong>Quote submitted.</strong><br />The customer can now review it from their request. Do not start work unless the quote is accepted and any required payment is funded.</p> : null}

    <section className="provider-progress-card" aria-label="Quote opportunity">
      <div><span>Service</span><strong>{service?.display_name ?? 'Matched service'}</strong></div>
      <div><span>Work area</span><strong>{location?.display_name ?? 'Matched area'}</strong></div>
      <div><span>Currency</span><strong>{currency}</strong></div>
    </section>

    <section className="action-panel">
      <p className="eyebrow">Customer request</p>
      <h2>{item.need_text}</h2>
      <p className="hint">This opportunity exists because your accepted provider records currently match this service and work area.</p>
    </section>

    {!query.sent ? <form action={submitQuoteAction} className="stack-form action-panel">
      <input type="hidden" name="request_id" value={id} />
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="currency_code" value={currency} />
      <h2>Price and scope</h2>

      {/* The price is the itemisation, not a number beside it. See components/provider/QuotePricingFields.tsx. */}
      <QuotePricingFields currency={currency} />
      <p className="hint">Currency comes from the request market configuration and cannot be changed on this quote.</p>

      <label htmlFor="summary">What is included?</label>
      <textarea id="summary" name="summary" rows={6} minLength={20} maxLength={2000} required placeholder="Describe the work included, important materials or assumptions, and anything excluded from this price." />
      <p className="hint">Be specific. The customer will rely on this description when deciding whether to accept the quote.</p>

      <h2>Terms the customer compares</h2>
      <p className="hint">The customer sees these beside every other quote, so a blank field reads as &ldquo;this provider did not say&rdquo;. Fill in what you can honestly answer.</p>

      <label htmlFor="materials">Materials</label>
      <select id="materials" name="materials" defaultValue="">
        <option value="">Not stated</option>
        <option value="included">Included in the price</option>
        <option value="excluded">Charged on top / supplied by the customer</option>
      </select>

      <label htmlFor="materials_note">Materials note <span className="hint">(optional)</span></label>
      <input id="materials_note" name="materials_note" type="text" maxLength={2000} placeholder="e.g. Standard fittings included; a ceramic cartridge would be extra." />

      <label htmlFor="exclusions">What this price does <em>not</em> cover <span className="hint">(optional)</span></label>
      <textarea id="exclusions" name="exclusions" rows={3} maxLength={2000} placeholder="e.g. Does not include re-tiling, or any work inside the wall cavity." />

      <label htmlFor="timeline_days">How many working days does the work take? <span className="hint">(optional)</span></label>
      <input id="timeline_days" name="timeline_days" type="number" min="1" step="1" inputMode="numeric" placeholder="e.g. 2" />

      <label htmlFor="timeline_note">Timeline note <span className="hint">(optional)</span></label>
      <input id="timeline_note" name="timeline_note" type="text" maxLength={2000} placeholder="e.g. Starts within three days of acceptance." />

      <label htmlFor="inspection">Before the quoted work can proceed</label>
      <select id="inspection" name="inspection" defaultValue="">
        <option value="">Not stated</option>
        <option value="required">An inspection is required first</option>
        <option value="not_required">No inspection needed</option>
      </select>

      <label htmlFor="warranty">Warranty you are offering <span className="hint">(optional)</span></label>
      <textarea id="warranty" name="warranty" rows={3} maxLength={2000} placeholder="e.g. Twelve months on the parts I supply and the workmanship. Say so in your own words — the platform records this, it does not enforce it." />

      <label htmlFor="valid_until">Quote valid until <span className="hint">(optional)</span></label>
      <input id="valid_until" name="valid_until" type="datetime-local" />
      <button type="submit">Submit quote</button>
    </form> : <p><Link className="button-link" href="/provider">Back to provider workspace</Link></p>}

    {existing?.length ? <section className="action-panel"><h2>Your quotes for this request</h2><div className="quote-list">{existing.map(q => <article className="quote-card" key={q.id}>
      <div><strong>{q.currency_code} {(Number(q.total_minor) / 100).toFixed(2)}</strong><br /><span className="hint">version {q.version_label} · {q.status.replaceAll('_',' ')}{q.valid_until ? ` · valid until ${new Date(q.valid_until).toLocaleString()}` : ''}</span></div>
      {q.summary ? <p>{q.summary}</p> : null}
    </article>)}</div></section> : null}
  </section>;
}
