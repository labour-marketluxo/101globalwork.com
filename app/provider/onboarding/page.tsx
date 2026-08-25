import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addProviderAreaAction, addProviderServiceAction, createProviderAction, publishProviderProfileAction, submitVerificationAction, updateProviderProfileAction } from './actions';

export const metadata = { title: 'Provider onboarding', robots: { index: false, follow: false } };
type Search = Promise<{ provider?: string; error?: string }>;

function nextActionLabel(value?: string | null) {
  switch (value) {
    case 'add_service': return 'Add the service you offer.';
    case 'add_service_area': return 'Add where you can work.';
    case 'complete_public_profile': return 'Complete your public profile with enough useful detail.';
    case 'submit_verification': return 'Submit identity verification for review.';
    default: return 'Finish the remaining setup steps below.';
  }
}

export default async function ProviderOnboardingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/provider/onboarding');

  const [{ data: markets }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('public_market_catalog').select('*').order('display_name'),
    supabase.from('public_service_catalog').select('*').order('display_name'),
    supabase.from('public_location_catalog').select('*').order('display_name'),
  ]);

  let provider = null, progress = null, verifications = null, profile = null, readiness = null;
  if (params.provider) {
    ({ data: provider } = await supabase.from('providers').select('id,display_name,status,public_description').eq('id', params.provider).maybeSingle());
    ({ data: progress } = await supabase.from('provider_onboarding_progress').select('*').eq('provider_id', params.provider).maybeSingle());
    ({ data: verifications } = await supabase.from('provider_verifications').select('id,kind,status,jurisdiction_code,reference_label,created_at').eq('provider_id', params.provider).order('created_at', { ascending: false }));
    ({ data: profile } = await supabase.from('provider_public_profiles').select('headline,public_description,years_experience,accepts_new_work,is_public,published_at').eq('provider_id', params.provider).maybeSingle());
    ({ data: readiness } = await supabase.from('provider_search_readiness').select('total_score,readiness,reasons').eq('provider_id', params.provider).maybeSingle());
  }

  const identityVerified = Boolean(verifications?.some(v => v.kind === 'identity' && v.status === 'verified'));
  const identityPending = Boolean(verifications?.some(v => v.kind === 'identity' && v.status === 'pending'));
  const setupComplete = Boolean(progress?.services_complete && progress?.service_area_complete && progress?.profile_complete);
  const canPublish = Boolean(provider && identityVerified && setupComplete && !profile?.is_public);

  return <section className="content-shell">
    <p className="eyebrow">Provider setup</p>
    <h1>Build your work profile</h1>
    <p className="lede left">Complete the essentials, get verified, then publish. Only published providers can appear in matching.</p>
    {params.error ? <p className="notice" role="alert">{params.error}</p> : null}

    {!provider ? <form action={createProviderAction} className="stack-form action-panel">
      <h2>1. Provider identity</h2>
      <label htmlFor="display_name">Public name</label><input id="display_name" name="display_name" required minLength={2} />
      <label htmlFor="market_id">Primary market</label><select id="market_id" name="market_id" required>{markets?.map(m => <option key={m.market_id} value={m.market_id}>{m.display_name}</option>)}</select>
      <label htmlFor="slug">Profile URL name</label><input id="slug" name="slug" required minLength={3} placeholder="amina-plumbing" />
      <label htmlFor="description">What work do you do?</label><textarea id="description" name="description" rows={5} />
      <button>Create provider profile</button>
    </form> : <>
      <section className="provider-progress-card" aria-label="Provider setup status">
        <div><span>Setup</span><strong>{progress?.completion_percent ?? 0}%</strong></div>
        <div><span>Verification</span><strong>{identityVerified ? 'Verified' : identityPending ? 'In review' : 'Needed'}</strong></div>
        <div><span>Visibility</span><strong>{profile?.is_public ? 'Published' : 'Not live'}</strong></div>
      </section>

      {profile?.is_public ? <div className="notice"><strong>Your profile is live.</strong><br />You can appear in eligible matching while you are accepting new work.</div>
        : canPublish ? <form action={publishProviderProfileAction} className="notice provider-ready-notice">
          <input type="hidden" name="provider_id" value={provider.id} />
          <strong>You are ready to go live.</strong>
          <p>Your service, area, profile and identity verification are complete. Publish now to become eligible for matching.</p>
          <button type="submit">Publish and become discoverable</button>
        </form>
        : <div className="notice"><strong>Next step</strong><br />{identityPending ? 'Your identity verification is being reviewed. You can finish the rest of your profile while you wait.' : nextActionLabel(progress?.next_action)}</div>}

      <form action={addProviderServiceAction} className="stack-form action-panel">
        <h2>2. Service {progress?.services_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <label htmlFor="service_entity_id">What do you offer?</label><select id="service_entity_id" name="service_entity_id" required>{services?.map(s => <option key={s.service_entity_id} value={s.service_entity_id}>{s.display_name}</option>)}</select>
        <button>{progress?.services_complete ? 'Update service' : 'Add service'}</button>
      </form>

      <form action={addProviderAreaAction} className="stack-form action-panel">
        <h2>3. Service area {progress?.service_area_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <label htmlFor="location_id">Where can you work?</label><select id="location_id" name="location_id" required>{locations?.map(l => <option key={l.location_id} value={l.location_id}>{l.display_name}</option>)}</select>
        <button>{progress?.service_area_complete ? 'Update service area' : 'Add service area'}</button>
      </form>

      <form action={updateProviderProfileAction} className="stack-form action-panel">
        <h2>4. Public profile {progress?.profile_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        {!progress?.profile_complete ? <p className="hint">Add a clear description of at least 80 characters so customers understand what you do and when to hire you.</p> : null}
        <label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={profile?.headline ?? ''} placeholder="Residential plumber serving Gwarinpa" />
        <label htmlFor="description">Public description</label><textarea id="description" name="description" required minLength={80} rows={6} defaultValue={profile?.public_description ?? provider.public_description ?? ''} />
        <label htmlFor="years_experience">Years of experience</label><input id="years_experience" name="years_experience" type="number" min={0} max={80} defaultValue={profile?.years_experience ?? ''} />
        <label><input name="accepts_new_work" type="checkbox" defaultChecked={profile?.accepts_new_work ?? true} /> Accepting new work</label>
        <button>Save public profile</button>
      </form>

      <form action={submitVerificationAction} className="stack-form action-panel">
        <h2>5. Verification {identityVerified ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        {identityVerified ? <p className="hint">Identity verified. Additional verification can be added later when required by a service or market.</p> : <>
          <label htmlFor="kind">Verification type</label><select id="kind" name="kind"><option value="identity">Identity</option><option value="business">Business</option><option value="address">Address</option><option value="credential">Credential</option><option value="insurance">Insurance</option><option value="licence">Licence</option></select>
          <label htmlFor="jurisdiction_code">Jurisdiction</label><input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-FCT" />
          <label htmlFor="reference_label">Reference label</label><input id="reference_label" name="reference_label" />
          <button>Submit for review</button>
        </>}
      </form>

      {verifications?.length ? <section className="action-panel"><h2>Verification submissions</h2><ul>{verifications.map(v => <li key={v.id}>{v.kind}: <strong>{v.status}</strong></li>)}</ul></section> : null}

      {!profile?.is_public ? <form action={publishProviderProfileAction} className="action-panel">
        <input type="hidden" name="provider_id" value={provider.id} />
        <h2>6. Publish</h2>
        <p>{canPublish ? 'Everything required is ready.' : 'Publishing unlocks only after identity verification, a service, a service area and a complete public profile.'}</p>
        <button type="submit" disabled={!canPublish}>Publish provider profile</button>
        {!canPublish ? <p className="hint">Current readiness: {readiness?.total_score ?? 0}/100. {nextActionLabel(progress?.next_action)}</p> : null}
      </form> : null}
    </>}
  </section>;
}
