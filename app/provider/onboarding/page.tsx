import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addProviderAreaAction, addProviderServiceAction, createProviderAction, submitVerificationAction } from './actions';

export const metadata = { title: 'Provider onboarding', robots: { index: false, follow: false } };

type Search = Promise<{ provider?: string; error?: string }>;

export default async function ProviderOnboardingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [{ data: markets }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('public_market_catalog').select('*').order('display_name'),
    supabase.from('public_service_catalog').select('*').order('display_name'),
    supabase.from('public_location_catalog').select('*').order('display_name'),
  ]);

  let provider = null;
  let progress = null;
  let verifications = null;
  if (params.provider) {
    const { data } = await supabase.from('providers').select('id,display_name,status,public_description').eq('id', params.provider).maybeSingle();
    provider = data;
    const { data: p } = await supabase.from('provider_onboarding_progress').select('*').eq('provider_id', params.provider).maybeSingle();
    progress = p;
    const { data: v } = await supabase.from('provider_verifications').select('id,kind,status,jurisdiction_code,reference_label,created_at').eq('provider_id', params.provider).order('created_at', { ascending: false });
    verifications = v;
  }

  return <section className="content-shell">
    <p className="eyebrow">Provider setup</p><h1>Build your work profile</h1>
    <p className="lede left">Add only what is needed now. Services, service area and verification unlock matching progressively.</p>
    {params.error ? <p className="notice" role="alert">{params.error}</p> : null}

    {!provider ? <form action={createProviderAction} className="stack-form action-panel">
      <h2>1. Provider identity</h2>
      <label htmlFor="display_name">Public name</label><input id="display_name" name="display_name" required minLength={2} />
      <label htmlFor="market_id">Primary market</label><select id="market_id" name="market_id" required>{markets?.map(m => <option key={m.market_id} value={m.market_id}>{m.display_name}</option>)}</select>
      <label htmlFor="slug">Profile URL name</label><input id="slug" name="slug" required minLength={3} placeholder="amina-plumbing" />
      <label htmlFor="description">What work do you do?</label><textarea id="description" name="description" rows={5} placeholder="Describe your services, experience and the customers you help." />
      <button type="submit">Create provider profile</button>
    </form> : <>
      <div className="notice"><strong>{provider.display_name}</strong> · {progress?.completion_percent ?? 0}% setup complete · Next: {progress?.next_action ?? 'continue setup'}</div>

      <form action={addProviderServiceAction} className="stack-form action-panel">
        <h2>2. Service</h2><input type="hidden" name="provider_id" value={provider.id} />
        <label htmlFor="service_entity_id">What do you offer?</label><select id="service_entity_id" name="service_entity_id" required>{services?.map(s => <option key={s.service_entity_id} value={s.service_entity_id}>{s.display_name}</option>)}</select>
        <button type="submit">Add service</button>
      </form>

      <form action={addProviderAreaAction} className="stack-form action-panel">
        <h2>3. Service area</h2><input type="hidden" name="provider_id" value={provider.id} />
        <label htmlFor="location_id">Where can you work?</label><select id="location_id" name="location_id" required>{locations?.map(l => <option key={l.location_id} value={l.location_id}>{l.display_name}</option>)}</select>
        <button type="submit">Add service area</button>
      </form>

      <form action={submitVerificationAction} className="stack-form action-panel">
        <h2>4. Verification</h2><input type="hidden" name="provider_id" value={provider.id} />
        <label htmlFor="kind">Verification type</label><select id="kind" name="kind"><option value="identity">Identity</option><option value="business">Business</option><option value="address">Address</option><option value="credential">Credential</option><option value="insurance">Insurance</option><option value="licence">Licence</option></select>
        <label htmlFor="jurisdiction_code">Jurisdiction</label><input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-FCT" />
        <label htmlFor="reference_label">Reference label</label><input id="reference_label" name="reference_label" placeholder="Document or credential reference" />
        <button type="submit">Submit for review</button>
      </form>

      {verifications?.length ? <section className="action-panel"><h2>Verification submissions</h2><ul>{verifications.map(v => <li key={v.id}>{v.kind}: <strong>{v.status}</strong></li>)}</ul></section> : null}
    </>}
  </section>;
}
