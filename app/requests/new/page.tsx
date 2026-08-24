import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRequestAction } from './actions';

export const metadata = { title: 'Create request', robots: { index: false, follow: false } };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [{ data: markets }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('public_market_catalog').select('*').order('display_name'),
    supabase.from('public_service_catalog').select('*').order('display_name'),
    supabase.from('public_location_catalog').select('*').order('display_name'),
  ]);

  return <section className="content-shell">
    <p className="eyebrow">Create request</p><h1>What do you need done?</h1>
    <p className="lede left">Keep it simple. Choose the closest service and location; the scope can become more detailed only if the work needs it.</p>
    {params.error ? <p className="notice" role="alert">{params.error}</p> : null}
    <form action={createRequestAction} className="stack-form">
      <label htmlFor="need_text">Describe the work</label><textarea id="need_text" name="need_text" required minLength={5} rows={5} defaultValue={params.q ?? ''} />
      <label htmlFor="market_id">Market</label><select id="market_id" name="market_id" required>{markets?.map(m => <option key={m.market_id} value={m.market_id}>{m.display_name}</option>)}</select>
      <label htmlFor="service_entity_id">Service</label><select id="service_entity_id" name="service_entity_id" required>{services?.map(s => <option key={s.service_entity_id} value={s.service_entity_id}>{s.display_name}</option>)}</select>
      <label htmlFor="location_id">Location</label><select id="location_id" name="location_id" required>{locations?.map(l => <option key={l.location_id} value={l.location_id}>{l.display_name}</option>)}</select>
      <button type="submit">Create request and find providers</button>
    </form>
  </section>;
}
