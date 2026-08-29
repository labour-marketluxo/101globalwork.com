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
    case 'complete_public_profile': return 'Finish the public description, then save the profile.';
    case 'submit_verification':
    case 'start_verification': return 'Submit identity verification for review.';
    default: return 'Finish the remaining requirement shown below.';
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
  const description = String(profile?.public_description ?? provider?.public_description ?? '').trim();
  const descriptionLength = description.length;
  const descriptionRemaining = Math.max(0, 80 - descriptionLength);
  const serviceComplete = Boolean(progress?.services_complete);
  const areaComplete = Boolean(progress?.service_area_complete);
  const profileComplete = Boolean(progress?.profile_complete);
  const publicationChecks = [serviceComplete, areaComplete, profileComplete, identityVerified];
  const publicationComplete = publicationChecks.filter(Boolean).length;
  const setupComplete = serviceComplete && areaComplete && profileComplete;
  const canPublish = Boolean(provider && identityVerified && setupComplete && !profile?.is_public);
  const showCreateForm = !provider && (ownedProviders.length === 0 || params.new === '1');
  const nextTarget = !serviceComplete ? '#service' : !areaComplete ? '#service-area' : !profileComplete ? '#public-profile' : !identityVerified ? '#verification' : '#publish';

  return <section className="content-shell">
    <p className="eyebrow">Provider setup</p>
    <h1>Build your work profile</h1>
    <p className="lede left">Finish only what is missing. Every requirement below maps directly to the backend rule that controls whether customers can discover you.</p>
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
      <p className="hint">Create the public work identity attached to this account. The description requirement is enforced here so you do not discover a hidden blocker later.</p>
      <label htmlFor="display_name">Public name</label><input id="display_name" name="display_name" required minLength={2} />
      <label htmlFor="market_id">Primary market</label><select id="market_id" name="market_id" required defaultValue=""><option value="" disabled>Choose a market</option>{markets?.map(m => <option key={m.market_id} value={m.market_id}>{m.display_name}</option>)}</select>
      <label htmlFor="slug">Profile URL name</label><input id="slug" name="slug" required minLength={3} placeholder="amina-tailoring" />
      <label htmlFor="description">Describe the work you do</label><textarea id="description" name="description" rows={5} required minLength={80} aria-describedby="new-description-help" />
      <p id="new-description-help" className="hint">At least 80 characters. Explain the work, the customer problem you solve and the kind of job you want to receive.</p>
      <button type="submit">Create provider profile</button>
    </form> : null}

    {provider ? <>
      <section className="provider-progress-card" aria-label="Provider publication status">
        <div><span>Publish requirements</span><strong>{publicationComplete}/4</strong></div>
        <div><span>Search readiness</span><strong>{readiness?.total_score ?? 0}/100</strong></div>
        <div><span>Visibility</span><strong>{profile?.is_public ? 'Live' : 'Not live'}</strong></div>
      </section>

      {!profile?.is_public ? <section className="action-panel" aria-labelledby="publish-checklist-title">
        <h2 id="publish-checklist-title">What is stopping publication?</h2>
        <div className="admin-list">
          <article><div><strong>{serviceComplete ? '✓ Service selected' : 'Service needed'}</strong><span>{currentServiceName ?? 'Choose the service customers can hire you for.'}</span></div><small><a href="#service">{serviceComplete ? 'Review or change' : 'Choose service'}</a></small></article>
          <article><div><strong>{areaComplete ? '✓ Service area selected' : 'Service area needed'}</strong><span>{currentAreaName ?? 'Choose where you can actually perform the work.'}</span></div><small><a href="#service-area">{areaComplete ? 'Review or change' : 'Choose area'}</a></small></article>
          <article><div><strong>{profileComplete ? '✓ Public profile complete' : 'Public description needs more detail'}</strong><span>{profileComplete ? `${descriptionLength} characters saved.` : `${descriptionLength}/80 characters saved — add at least ${descriptionRemaining} more.`}</span></div><small><a href="#public-profile">{profileComplete ? 'Review profile' : 'Finish description'}</a></small></article>
          <article><div><strong>{identityVerified ? '✓ Identity verified' : identityPending ? 'Identity review in progress' : 'Identity verification needed'}</strong><span>{identityVerified ? 'Verification is complete and remains in your history.' : identityPending ? 'No action needed while the review is pending.' : 'Submit identity verification before publication.'}</span></div><small><a href="#verification">View verification</a></small></article>
        </div>
      </section> : null}

      <div className="notice">
        <strong>Next action</strong><br />
        {profile?.is_public ? 'Your profile is live. Keep service, area and availability accurate.' : canPublish ? 'All four publication requirements are complete. Publish now.' : !profileComplete ? `Add at least ${descriptionRemaining} more characters to your public description and save it.` : identityPending ? 'Your setup is complete; identity review is the only remaining gate.' : nextActionLabel(progress?.next_action)}
        {!profile?.is_public && !canPublish ? <><br /><a href={nextTarget}>Go to the required step ↓</a></> : null}
      </div>

      {canPublish ? <form action={publishProviderProfileAction} className="notice provider-ready-notice" id="publish-ready">
        <input type="hidden" name="provider_id" value={provider.id} />
        <strong>Ready to go live.</strong>
        <p>Publishing changes provider state to active and allows matching when service, geography and market rules also match.</p>
        <button type="submit">Publish and become discoverable</button>
      </form> : null}

      <form id="service" action={addProviderServiceAction} className="stack-form action-panel">
        <h2>2. Service {serviceComplete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <p className="hint">Current service: <strong>{currentServiceName ?? 'Not chosen'}</strong>. If this does not describe the work you sell, change it now; matching uses this exact service record.</p>
        <label htmlFor="service_entity_id">What do you offer?</label><select id="service_entity_id" name="service_entity_id" required defaultValue={currentService?.service_entity_id ?? ''}><option value="" disabled>Choose a service</option>{services?.map(s => <option key={s.service_entity_id} value={s.service_entity_id}>{s.display_name}</option>)}</select>
        <button type="submit">{serviceComplete ? 'Save service choice' : 'Add service'}</button>
      </form>

      <form id="service-area" action={addProviderAreaAction} className="stack-form action-panel">
        <h2>3. Service area {areaComplete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        <p className="hint">Current area: <strong>{currentAreaName ?? 'Not chosen'}</strong>. Matching uses this exact location record.</p>
        <label htmlFor="location_id">Where can you work?</label><select id="location_id" name="location_id" required defaultValue={currentArea?.location_id ?? ''}><option value="" disabled>Choose an area</option>{locations?.map(l => <option key={l.location_id} value={l.location_id}>{l.display_name}</option>)}</select>
        <button type="submit">{areaComplete ? 'Save service area' : 'Add service area'}</button>
      </form>

      <form id="public-profile" action={updateProviderProfileAction} className="stack-form action-panel">
        <h2>4. Public profile {profileComplete ? '✓' : ''}</h2><input type="hidden" name="provider_id" value={provider.id} />
        {!profileComplete ? <p className="notice" role="status"><strong>This is the current blocker.</strong><br />Your saved description is {descriptionLength}/80 characters. Add at least {descriptionRemaining} more characters, then save.</p> : null}
        <label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={profile?.headline ?? ''} placeholder="Tailor and alterations specialist in Minna" />
        <label htmlFor="description">Public description</label><textarea id="description" name="description" required minLength={80} rows={7} defaultValue={description} aria-describedby="description-help" />
        <p id="description-help" className="hint">Minimum 80 characters. Current saved length: {descriptionLength}. A strong description explains the work you perform, the jobs you accept and the area/customer you serve.</p>
        <label htmlFor="years_experience">Years of experience <span className="hint">(optional)</span></label><input id="years_experience" name="years_experience" type="number" min={0} max={80} defaultValue={profile?.years_experience ?? ''} />
        <label><input name="accepts_new_work" type="checkbox" defaultChecked={profile?.accepts_new_work ?? true} /> Accepting new work</label>
        <button type="submit">Save public profile and recheck readiness</button>
      </form>

      <section id="verification" className="action-panel">
        <h2>5. Verification {identityVerified ? '✓' : ''}</h2>
        {identityVerified ? <p className="hint">Identity verified. No further action is required for this publication gate.</p> : identityPending ? <p className="hint">Identity verification is in review. Do not submit the same check again while it is pending.</p> : <form action={submitVerificationAction} className="stack-form">
          <input type="hidden" name="provider_id" value={provider.id} />
          <label htmlFor="kind">Verification type</label><select id="kind" name="kind"><option value="identity">Identity</option><option value="business">Business</option><option value="address">Address</option><option value="credential">Credential</option><option value="insurance">Insurance</option><option value="licence">Licence</option></select>
          <label htmlFor="jurisdiction_code">Jurisdiction</label><input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-FCT" />
          <label htmlFor="reference_label">Reference label</label><input id="reference_label" name="reference_label" />
          <button type="submit">Submit for review</button>
        </form>}
      </section>

      {verifications?.length ? <section className="action-panel"><h2>Verification history</h2><ul>{verifications.map(v => <li key={v.id}>{v.kind}: <strong>{v.status}</strong>{v.reviewed_at ? ` · reviewed ${new Date(v.reviewed_at).toLocaleString()}` : ` · submitted ${new Date(v.created_at).toLocaleString()}`}</li>)}</ul></section> : null}

      {!profile?.is_public ? <form id="publish" action={publishProviderProfileAction} className="action-panel">
        <input type="hidden" name="provider_id" value={provider.id} />
        <h2>6. Publish</h2>
        {canPublish ? <p>All publication gates are satisfied. Search readiness will be recalculated after the provider becomes active.</p> : <p>Publication is locked because {4 - publicationComplete} of 4 required checks {4 - publicationComplete === 1 ? 'is' : 'are'} still incomplete.</p>}
        <button type="submit" disabled={!canPublish}>{canPublish ? 'Publish provider profile' : `Complete ${4 - publicationComplete} remaining requirement${4 - publicationComplete === 1 ? '' : 's'}`}</button>
        {!canPublish ? <p className="hint">Do not use the search-readiness score as the task list. The publication checklist above is the authoritative gate.</p> : null}
      </form> : null}
    </> : null}
  </section>;
}
