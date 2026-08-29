import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addProviderAreaAction, addProviderServiceAction, createProviderAction, publishProviderProfileAction, submitVerificationAction, updateProviderProfileAction } from './actions';

export const metadata = { title: 'Provider onboarding', robots: { index: false, follow: false } };
type Search = Promise<{ provider?: string; error?: string; success?: string; welcome?: string; signed_in?: string; new?: string }>;

type OwnedProvider = { id: string; display_name: string; status: string };

function nextActionLabel(value?: string | null) {
  switch (value) {
    case 'add_service': return 'Choose the service customers should hire you for.';
    case 'add_service_area': return 'Choose where you can actually perform the work.';
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

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/sign-in?error=Account%20setup%20is%20not%20ready&next=/provider/onboarding');

  const [{ data: markets }, { data: services }, { data: locations }, { data: ownedProviderRows }] = await Promise.all([
    supabase.from('public_market_catalog').select('*').order('display_name'),
    supabase.from('public_service_catalog').select('*').order('display_name'),
    supabase.from('public_location_catalog').select('*').order('display_name'),
    supabase.from('providers').select('id,display_name,status').eq('owner_account_id', account.id).order('created_at'),
  ]);
  const ownedProviders = (ownedProviderRows ?? []) as OwnedProvider[];

  if (!params.provider && !params.new && ownedProviders.length === 1) {
    redirect(`/provider/onboarding?provider=${encodeURIComponent(ownedProviders[0].id)}${params.welcome ? '&welcome=1' : ''}${params.signed_in ? '&signed_in=1' : ''}`);
  }

  let provider = null, progress = null, verifications = null, profile = null, readiness = null, currentService = null, currentArea = null;
  if (params.provider) {
    if (!ownedProviders.some(item => item.id === params.provider)) {
      if (ownedProviders.length) redirect(`/provider/onboarding?provider=${encodeURIComponent(ownedProviders[0].id)}&error=${encodeURIComponent('That provider profile is not available to this account.')}`);
      redirect(`/provider/onboarding?error=${encodeURIComponent('That provider profile is not available to this account.')}`);
    }
    ({ data: provider } = await supabase.from('providers').select('id,display_name,status,public_description').eq('id', params.provider).maybeSingle());
    ({ data: progress } = await supabase.from('provider_onboarding_progress').select('*').eq('provider_id', params.provider).maybeSingle());
    ({ data: verifications } = await supabase.from('provider_verifications').select('id,kind,status,jurisdiction_code,reference_label,created_at,reviewed_at').eq('provider_id', params.provider).order('created_at', { ascending: false }));
    ({ data: profile } = await supabase.from('provider_public_profiles').select('headline,public_description,years_experience,accepts_new_work,is_public,published_at').eq('provider_id', params.provider).maybeSingle());
    ({ data: readiness } = await supabase.from('provider_search_readiness').select('total_score,readiness,reasons').eq('provider_id', params.provider).maybeSingle());
    ({ data: currentService } = await supabase.from('provider_services').select('service_entity_id,is_primary').eq('provider_id', params.provider).eq('is_active', true).order('is_primary', { ascending: false }).limit(1).maybeSingle());
    ({ data: currentArea } = await supabase.from('provider_service_areas').select('location_id,is_primary').eq('provider_id', params.provider).eq('is_active', true).order('is_primary', { ascending: false }).limit(1).maybeSingle());
  }

  const currentServiceName = services?.find(item => item.service_entity_id === currentService?.service_entity_id)?.display_name;
  const currentAreaName = locations?.find(item => item.location_id === currentArea?.location_id)?.display_name;
  const identityVerified = Boolean(verifications?.some(v => v.kind === 'identity' && v.status === 'verified'));
  const identityPending = Boolean(verifications?.some(v => v.kind === 'identity' && v.status === 'pending'));
  const setupComplete = Boolean(progress?.services_complete && progress?.service_area_complete && progress?.profile_complete);
  const canPublish = Boolean(provider && identityVerified && setupComplete && !profile?.is_public);
  const showCreateForm = !provider && (ownedProviders.length === 0 || params.new === '1');

  return <section className="content-shell">
    <p className="eyebrow">Provider setup</p>
    <h1>Build your work profile</h1>
    <p className="lede left">See what is done, what is waiting, and the single next step required before customers can discover you.</p>
    {params.welcome ? <p className="notice" role="status"><strong>Account created and signed in.</strong><br />Your account is ready. Continue with provider setup below.</p> : null}
    {params.signed_in ? <p className="notice" role="status"><strong>Signed in successfully.</strong><br />You are continuing your provider setup.</p> : null}
    {params.success ? <p className="notice" role="status">{params.success}</p> : null}
    {params.error ? <p className="notice" role="alert">{params.error}</p> : null}

    {!provider && ownedProviders.length > 1 && !params.new ? <section className="action-panel">
      <h2>Choose a provider profile</h2>
      <p>You already manage more than one provider identity. Continue the one you want to update.</p>
      <div className="quote-list">{ownedProviders.map(item => <article className="quote-card" key={item.id}><div><strong>{item.display_name}</strong><br /><span className="hint">{item.status.replaceAll('_',' ')}</span></div><Link className="button-link" href={`/provider/onboarding?provider=${item.id}`}>Continue setup</Link></article>)}</div>
      <p className="hint"><Link href="/provider/onboarding?new=1">Create another provider identity</Link></p>
    </section> : null}

    {showCreateForm ? <form action={createProviderAction} className="stack-form action-panel">
      <h2>1. Provider identity</h2>
      <p className="hint">This creates the public business/service identity attached to your signed-in account. You will see a confirmation immediately after it is saved.</p>
      <label htmlFor="display_name">Public name</label><input id="display_name" name="display_name" required minLength={2} />
      <label htmlFor="market_id">Primary market</label><select id="market_id" name="market_id" required defaultValue=""><option value="" disabled>Choose a market</option>{markets?.map(m => <option key={m.market_id} value={m.market_id}>{m.display_name}</option>)}</select>
      <label htmlFor="slug">Profile URL name</label><input id="slug" name="slug" required minLength={3} placeholder="amina-plumbing" />
      <label htmlFor="description">What work do you do?</label><textarea id="description" name="description" rows={5} />
      <button type="submit">Create provider profile</button>
    </form> : null}

    {provider ? <>
      <section className="provider-progress-card" aria-label="Provider setup status">
        <div><span>Setup</span><strong>{progress?.completion_percent ?? 0}%</strong></div>
        <div><span>Verification</span><strong>{identityVerified ? 'Verified' : identityPending ? 'In review' : 'Needed'}</strong></div>
        <div><span>Visibility</span><strong>{profile?.is_public ? 'Published' : 'Not live'}</strong></div>
      </section>

      <div className="notice">
        <strong>Next step</strong><br />
        {profile?.is_public ? 'Your profile is live. Keep your service, area, availability and payout details accurate.' : canPublish ? 'Everything required is complete. Publish now to become eligible for matching.' : identityPending ? 'Verification is being reviewed. You can finish the rest of your profile while you wait.' : nextActionLabel(progress?.next_action)}
      </div>

      {canPublish ? <form action={publishProviderProfileAction} className="notice provider-ready-notice">
        <input type="hidden" name="provider_id" value={provider.id} />
        <strong>You are ready to go live.</strong>
        <p>Publishing makes this provider eligible for matching; normal service, geography and market rules still apply.</p>
        <button type="submit">Publish and become discoverable</button>
      </form> : null}

      <form action={addProviderServiceAction} className="stack-form action-panel">
        <h2>2. Service {progress?.services_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <p className="hint">Current service: <strong>{currentServiceName ?? 'Not chosen'}</strong>. This must match what customers can actually hire you for.</p>
        <label htmlFor="service_entity_id">What do you offer?</label><select id="service_entity_id" name="service_entity_id" required defaultValue={currentService?.service_entity_id ?? ''}><option value="" disabled>Choose a service</option>{services?.map(s => <option key={s.service_entity_id} value={s.service_entity_id}>{s.display_name}</option>)}</select>
        <button type="submit">{progress?.services_complete ? 'Save service choice' : 'Add service'}</button>
      </form>

      <form action={addProviderAreaAction} className="stack-form action-panel">
        <h2>3. Service area {progress?.service_area_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <p className="hint">Current area: <strong>{currentAreaName ?? 'Not chosen'}</strong>.</p>
        <label htmlFor="location_id">Where can you work?</label><select id="location_id" name="location_id" required defaultValue={currentArea?.location_id ?? ''}><option value="" disabled>Choose an area</option>{locations?.map(l => <option key={l.location_id} value={l.location_id}>{l.display_name}</option>)}</select>
        <button type="submit">{progress?.service_area_complete ? 'Save service area' : 'Add service area'}</button>
      </form>

      <form action={updateProviderProfileAction} className="stack-form action-panel">
        <h2>4. Public profile {progress?.profile_complete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        {!progress?.profile_complete ? <p className="hint">Add a clear description of at least 80 characters so customers understand what you do, where you add value and when to hire you.</p> : null}
        <label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={profile?.headline ?? ''} placeholder="Residential plumber serving Gwarinpa" />
        <label htmlFor="description">Public description</label><textarea id="description" name="description" required minLength={80} rows={6} defaultValue={profile?.public_description ?? provider.public_description ?? ''} />
        <label htmlFor="years_experience">Years of experience</label><input id="years_experience" name="years_experience" type="number" min={0} max={80} defaultValue={profile?.years_experience ?? ''} />
        <label><input name="accepts_new_work" type="checkbox" defaultChecked={profile?.accepts_new_work ?? true} /> Accepting new work</label>
        <button type="submit">Save public profile</button>
      </form>

      <form action={submitVerificationAction} className="stack-form action-panel">
        <h2>5. Verification {identityVerified ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        {identityVerified ? <p className="hint">Identity verified. The decision remains in your history below.</p> : identityPending ? <p className="hint">Identity verification is in review. Do not submit the same check again while it is pending.</p> : <>
          <label htmlFor="kind">Verification type</label><select id="kind" name="kind"><option value="identity">Identity</option><option value="business">Business</option><option value="address">Address</option><option value="credential">Credential</option><option value="insurance">Insurance</option><option value="licence">Licence</option></select>
          <label htmlFor="jurisdiction_code">Jurisdiction</label><input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-FCT" />
          <label htmlFor="reference_label">Reference label</label><input id="reference_label" name="reference_label" />
          <button type="submit">Submit for review</button>
        </>}
      </form>

      {verifications?.length ? <section className="action-panel"><h2>Verification history</h2><ul>{verifications.map(v => <li key={v.id}>{v.kind}: <strong>{v.status}</strong>{v.reviewed_at ? ` · reviewed ${new Date(v.reviewed_at).toLocaleString()}` : ` · submitted ${new Date(v.created_at).toLocaleString()}`}</li>)}</ul></section> : null}

      {!profile?.is_public ? <form action={publishProviderProfileAction} className="action-panel">
        <input type="hidden" name="provider_id" value={provider.id} />
        <h2>6. Publish</h2>
        <p>{canPublish ? 'Everything required is ready.' : 'Publishing unlocks only after identity verification, a service, a service area and a complete public profile.'}</p>
        <button type="submit" disabled={!canPublish}>Publish provider profile</button>
        {!canPublish ? <p className="hint">Search readiness: {readiness?.total_score ?? 0}/100. {nextActionLabel(progress?.next_action)}</p> : null}
      </form> : null}
    </> : null}
  </section>;
}
