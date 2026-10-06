import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CircleCheck } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EligibilityPanel, HelpPanel, OnboardingSteps, type OnboardingStep } from '@/components/provider/OnboardingSections';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_PATHS, PROVIDER_FAILURE_COPY, providerFailureCode } from '@/features/provider-workspace/paths';
import {
  createProviderAction,
  publishProfileAction,
  setPrimaryAreaAction,
  setPrimaryServiceAction,
  submitVerificationAction,
  updateProviderProfileAction,
} from '@/features/provider-workspace/actions';

/**
 * /provider/onboarding — the setup flow.
 *
 * ⚠️ THE FOUR STEPS ARE FOUR FACTS ABOUT THE RECORDS, NOT FOUR SCREENS. A wizard that advances on a
 * "Continue" click tells a provider they are finished when they have typed a value the platform will
 * refuse to publish on. The progress list here is derived from the same rows the publish command reads,
 * so "3 of 4" means three things are actually true.
 *
 * ⚠️ NOTHING IS LOST BY LEAVING. Every step saves itself; "Save & exit" is a link back to the workspace,
 * not a command, because there is no unsaved state to protect. The page says that where a visitor would
 * expect a save button, because the alternative is somebody staying on a form they do not want to fill
 * in out of fear of losing it.
 *
 * ⚠️ IT IS STILL A LONG SINGLE PAGE, DELIBERATELY. The brief asks for a step bar, not a wizard; a real
 * multi-route wizard would mean four server round trips and four ways to lose a half-filled form. The
 * steps are anchors into this document.
 */
export const metadata: Metadata = {
  title: 'Provider setup',
  description: 'Business info, services, coverage, verification and payouts.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  provider?: string;
  new?: string;
  edit?: string;
  welcome?: string;
  signed_in?: string;
  created?: string;
  saved?: string;
  published?: string;
  failed?: string;
}>;

type OwnedProvider = { id: string; display_name: string; status: string };

export default async function ProviderOnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(PROVIDER_PATHS.onboarding)}`);

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/auth/sign-in?error=account_not_ready&next=/provider/onboarding');

  const [{ data: markets }, { data: services }, { data: locations }, { data: ownedProviderRows }] = await Promise.all([
    supabase.from('public_market_catalog').select('market_id,display_name').order('display_name'),
    supabase.from('public_service_catalog').select('service_entity_id,display_name').order('display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name').order('display_name'),
    supabase.from('providers').select('id,display_name,status').eq('owner_account_id', account.id).order('created_at'),
  ]);
  const ownedProviders = (ownedProviderRows ?? []) as OwnedProvider[];

  // A single owned profile needs no chooser: go straight to it, and send a finished one to the workspace
  // unless they explicitly asked to edit it.
  if (!params.provider && !params.new && ownedProviders.length === 1) {
    const onlyProvider = ownedProviders[0];
    if (onlyProvider.status === 'active' && params.edit !== '1') redirect(PROVIDER_PATHS.today);
    redirect(
      `/provider/onboarding?provider=${encodeURIComponent(onlyProvider.id)}${params.created ? '&created=1' : ''}`,
    );
  }

  /** A provider the form names, but only when this account owns it. */
  const providerId = params.provider && ownedProviders.some(item => item.id === params.provider) ? params.provider : null;
  if (params.provider && !providerId) {
    return (
      <div className="grid gap-6">
        <WorkspaceNotice tone="amber" role="alert" title="That provider profile is not available to this account.">
          <p>
            Nothing was changed. Open the workspace to see the profiles this account does own.
          </p>
          <p className="mt-1">
            <Link href={PROVIDER_PATHS.today} className={LINK_ARROW}>
              Back to the workspace
            </Link>
          </p>
        </WorkspaceNotice>
      </div>
    );
  }

  const setup = providerId ? await loadSetup(providerId) : null;
  const provider = setup?.provider ?? null;
  const profileRow = setup?.profile ?? null;

  // A published profile has nothing to set up. The workspace is where it is edited.
  if (profileRow?.is_public && params.edit !== '1') redirect(PROVIDER_PATHS.today);

  const identityVerified = (setup?.verifications ?? []).some(row => row.kind === 'identity' && row.status === 'verified');
  const identityPending = (setup?.verifications ?? []).some(row => row.kind === 'identity' && row.status === 'pending');
  const description = String(profileRow?.public_description ?? provider?.public_description ?? '').trim();
  const serviceComplete = Boolean(setup?.progress?.services_complete);
  const areaComplete = Boolean(setup?.progress?.service_area_complete);
  const businessComplete = Boolean(provider && provider.display_name.trim().length >= 2 && description.length >= 80);
  const payoutComplete = Boolean(setup?.payout);
  const readinessScore = Number(setup?.readiness?.total_score ?? 0);
  const canPublish = Boolean(provider && identityVerified && serviceComplete && areaComplete && businessComplete && readinessScore >= 60 && !profileRow?.is_public);
  const showCreateForm = !provider && (ownedProviders.length === 0 || params.new === '1');
  const failure = providerFailureCode(params.failed);

  const steps: OnboardingStep[] = [
    {
      key: 'identity',
      done: businessComplete,
      detail: businessComplete
        ? `Public name and a ${description.length}-character description saved.`
        : 'A public name, a market and a description of at least 80 characters. This is the text customers read.',
      href: provider ? '#profile' : '#create',
      cta: businessComplete ? 'Review business info' : 'Fix missing item',
    },
    {
      key: 'services',
      done: serviceComplete && areaComplete,
      detail:
        serviceComplete && areaComplete
          ? 'A service and a coverage area are both active — matching reads exactly these two records.'
          : 'One service category and one coverage area. Without both, matching cannot reach you at all.',
      href: '#services',
      cta: serviceComplete && areaComplete ? 'Review services and coverage' : 'Fix missing item',
    },
    {
      key: 'verification',
      done: identityVerified,
      detail: identityVerified
        ? 'Identity verified. This is what publication depends on.'
        : identityPending
          ? 'In review. Nothing is needed from you while a reviewer reads it.'
          : 'Identity checks are reviewed by hand. Submit it and keep going with the rest.',
      href: '#verification',
      cta: identityVerified ? 'View verification' : 'Fix missing item',
    },
    {
      key: 'payout',
      done: payoutComplete,
      detail: payoutComplete
        ? 'A verified payout destination is on file, so cleared money has somewhere to go.'
        : 'Not required to publish. Required before any cleared money can be sent to you.',
      href: PROVIDER_PATHS.payouts,
      cta: payoutComplete ? 'View payout account' : 'Set up payouts',
    },
  ];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Setup</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Build your work profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Four steps, in any order. Every step saves on its own — leaving the page loses nothing, so
            fill in what you can and come back.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Link href={PROVIDER_PATHS.today} className={LINK_ARROW}>
            Save &amp; exit to the workspace
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
          {provider ? (
            <Link href={PROVIDER_PATHS.profile} className={LINK_ARROW}>
              Open the full profile editor
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That step did not save.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.created ? (
        <WorkspaceNotice tone="teal" role="status" title="Provider profile created.">
          <p>Credentials and details below are saved against it from now on.</p>
        </WorkspaceNotice>
      ) : null}
      {params.saved ? (
        <WorkspaceNotice tone="teal" role="status" title="Saved.">
          <p>The step is stored on the profile and the readiness score has been recalculated.</p>
        </WorkspaceNotice>
      ) : null}
      {params.published === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Published.">
          <p>You are in the marketplace. The workspace is where you run the day-to-day from here.</p>
        </WorkspaceNotice>
      ) : null}
      {params.welcome || params.signed_in ? (
        <WorkspaceNotice tone="slate" role="status">
          <p>
            {params.welcome ? 'Account created and signed in. ' : 'Signed in. '}
            Provider setup is the next step, and nothing here needs to be finished in one sitting.
          </p>
        </WorkspaceNotice>
      ) : null}

      <OnboardingSteps steps={steps} />

      {ownedProviders.length > 1 && !params.new ? (
        <section className={`${CARD} p-5`} aria-labelledby="choose-provider-heading">
          <h2 id="choose-provider-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Which profile are you setting up?
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            This account owns more than one provider identity. Each has its own services, verification and
            payouts.
          </p>
          <ul className="mt-3 grid gap-2">
            {ownedProviders.map(item => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="text-sm font-semibold text-slate-800">
                  {item.display_name}
                  <span className="ml-2 align-middle">
                    <span className={item.status === 'active' ? BADGE_SLATE : BADGE_AMBER}>{item.status}</span>
                  </span>
                </span>
                <Link
                  href={item.status === 'active' ? `${PROVIDER_PATHS.onboarding}?provider=${item.id}&edit=1` : `${PROVIDER_PATHS.onboarding}?provider=${item.id}`}
                  className={LINK_ARROW}
                >
                  {item.status === 'active' ? 'Edit it' : 'Continue setup'}
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <Link href={`${PROVIDER_PATHS.onboarding}?new=1`} className={LINK_ARROW}>
              Create another provider identity
            </Link>
          </p>
        </section>
      ) : null}

      {showCreateForm ? (
        <form id="create" action={createProviderAction} className={`${CARD} grid gap-4 p-5`}>
          <input type="hidden" name="next" value={PROVIDER_PATHS.onboarding} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">1. Business info</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              The public identity customers will see. The description requirement is enforced here, so you
              do not discover a hidden blocker three steps later.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="display_name" className={LABEL}>
                Public name
              </label>
              <input id="display_name" name="display_name" required minLength={2} className={FIELD} />
            </div>
            <div>
              <label htmlFor="slug" className={LABEL}>
                Profile URL name
              </label>
              <input id="slug" name="slug" required minLength={3} placeholder="amina-tailoring" className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="market_id" className={LABEL}>
              Primary market
            </label>
            <select id="market_id" name="market_id" required defaultValue="" className={FIELD}>
              <option value="" disabled>
                Choose a market
              </option>
              {(markets ?? []).map(market => (
                <option key={market.market_id} value={market.market_id}>
                  {market.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="description" className={LABEL}>
              Describe the work you do
            </label>
            <textarea id="description" name="description" rows={5} required minLength={80} aria-describedby="new-description-help" className={FIELD} />
            <p id="new-description-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
              At least 80 characters: the work, the customer problem you solve, and the kind of job you
              want to receive.
            </p>
          </div>
          <div className="border-t border-solid border-slate-200 pt-4">
            <PendingButton
              idle="Create provider profile"
              pending="Creating…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}

      {provider ? (
        <>
          <section className={`${CARD} p-5`} aria-labelledby="publish-status-heading">
            <h2 id="publish-status-heading" className="text-sm font-bold tracking-tight text-slate-900">
              Publication status
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Visibility</dt>
                <dd className="mt-0.5 text-sm font-bold text-slate-900">{profileRow?.is_public ? 'Published' : 'Not published'}</dd>
              </div>
              <div>
                <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Readiness</dt>
                <dd className="mt-0.5 text-sm font-bold text-slate-900">{readinessScore}/100</dd>
              </div>
              <div>
                <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Checklist</dt>
                <dd className="mt-0.5 text-sm font-bold text-slate-900">
                  {steps.slice(0, 3).filter(step => step.done).length}/3 required
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Publication requires identity verification, an active service, an active area, a description
              of 80 characters or more, and a readiness score of at least 60. The payout account is step
              four and is not part of that gate.
            </p>
            <div className="mt-4 border-t border-solid border-slate-200 pt-4">
              {profileRow?.is_public ? (
                <Link href={PROVIDER_PATHS.today} className={LINK_ARROW}>
                  Go to the workspace
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <form action={publishProfileAction}>
                  <input type="hidden" name="provider_id" value={provider.id} />
                  {/* Publishing from setup lands on the workspace, which is where the provider now works
                      from — not back on a setup page they have finished with. */}
                  <input type="hidden" name="next" value={PROVIDER_PATHS.today} />
                  <PendingButton
                    idle={canPublish ? 'Publish and go live' : 'Publish (requirements open)'}
                    pending="Publishing…"
                    className={`inline-flex items-center gap-2 rounded-lg border-0 px-5 py-2.5 font-sans text-xs font-bold tracking-wide uppercase shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                      canPublish ? 'bg-secondary text-white hover:bg-secondary-dark' : 'bg-slate-300 text-slate-600'
                    }`}
                  />
                </form>
              )}
            </div>
          </section>

          <form id="profile" action={updateProviderProfileAction} className={`${CARD} grid gap-4 p-5`}>
            <input type="hidden" name="provider_id" value={provider.id} />
            <input type="hidden" name="next" value={`${PROVIDER_PATHS.onboarding}?provider=${provider.id}`} />
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Business info</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                The description is the part customers read. Hours, languages and a coverage radius are in
                the full profile editor.
              </p>
            </div>
            <div>
              <label htmlFor="headline" className={LABEL}>
                Headline
              </label>
              <input
                id="headline"
                name="headline"
                defaultValue={profileRow?.headline ?? ''}
                placeholder="Tailor and alterations specialist"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="description" className={LABEL}>
                Public description
              </label>
              <textarea id="description" name="description" rows={6} required minLength={80} defaultValue={description} aria-describedby="description-help" className={FIELD} />
              <p id="description-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {description.length} characters saved. Minimum 80; the platform scores 120 as complete.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="years_experience" className={LABEL}>
                  Years of experience (optional)
                </label>
                <input
                  id="years_experience"
                  name="years_experience"
                  type="number"
                  min={0}
                  max={80}
                  defaultValue={profileRow?.years_experience ?? ''}
                  className={FIELD}
                />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
                <input name="accepts_new_work" type="checkbox" defaultChecked={profileRow?.accepts_new_work ?? true} />
                Accepting new work
              </label>
            </div>
            <div className="border-t border-solid border-slate-200 pt-4">
              <PendingButton
                idle="Save business info"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </form>

          <div id="services" className="grid gap-4 sm:grid-cols-2">
            <form action={setPrimaryServiceAction} className={`${CARD} grid gap-3 p-5`}>
              <input type="hidden" name="provider_id" value={provider.id} />
              <input type="hidden" name="next" value={`${PROVIDER_PATHS.onboarding}?provider=${provider.id}`} />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Services and coverage</h2>
              <p className="text-xs leading-relaxed text-slate-600">
                The service customers can hire you for. Matching reads this exact record. More than one
                category can be added in the full profile editor.
              </p>
              <div>
                <label htmlFor="service_entity_id" className={LABEL}>
                  What do you offer?
                </label>
                <select id="service_entity_id" name="service_entity_id" required defaultValue={setup?.currentService?.service_entity_id ?? ''} className={FIELD}>
                  <option value="" disabled>
                    Choose a service
                  </option>
                  {(services ?? []).map(service => (
                    <option key={service.service_entity_id} value={service.service_entity_id}>
                      {service.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {serviceComplete ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Service selected
                </p>
              ) : null}
              <div>
                <PendingButton
                  idle={serviceComplete ? 'Save service choice' : 'Add service'}
                  pending="Saving…"
                  className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </form>

            <form action={setPrimaryAreaAction} className={`${CARD} grid gap-3 p-5`}>
              <input type="hidden" name="provider_id" value={provider.id} />
              <input type="hidden" name="next" value={`${PROVIDER_PATHS.onboarding}?provider=${provider.id}`} />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Coverage</h2>
              <p className="text-xs leading-relaxed text-slate-600">
                Where you can actually perform the work. The platform matches area to area — it holds no
                street address for you or for the customer.
              </p>
              <div>
                <label htmlFor="location_id" className={LABEL}>
                  Where can you work?
                </label>
                <select id="location_id" name="location_id" required defaultValue={setup?.currentArea?.location_id ?? ''} className={FIELD}>
                  <option value="" disabled>
                    Choose an area
                  </option>
                  {(locations ?? []).map(location => (
                    <option key={location.location_id} value={location.location_id}>
                      {location.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {areaComplete ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Area selected
                </p>
              ) : null}
              <div>
                <PendingButton
                  idle={areaComplete ? 'Save coverage' : 'Add coverage'}
                  pending="Saving…"
                  className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </form>
          </div>

          {!identityVerified && !identityPending ? (
            <form id="verification" action={submitVerificationAction} className={`${CARD} grid gap-4 p-5`}>
              <input type="hidden" name="provider_id" value={provider.id} />
              <input type="hidden" name="kind" value="identity" />
              <input type="hidden" name="next" value={`${PROVIDER_PATHS.onboarding}?provider=${provider.id}`} />
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900">Identity verification</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Reviewed by hand. It is the one requirement publication cannot proceed without, and it
                  can be submitted at any point in setup.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="jurisdiction_code" className={LABEL}>
                    Jurisdiction (optional)
                  </label>
                  <input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-LA" className={FIELD} />
                </div>
                <div>
                  <label htmlFor="reference_label" className={LABEL}>
                    Reference you have (optional)
                  </label>
                  <input id="reference_label" name="reference_label" className={FIELD} />
                </div>
              </div>
              <div className="border-t border-solid border-slate-200 pt-4">
                <PendingButton
                  idle="Submit identity for review"
                  pending="Submitting…"
                  className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </form>
          ) : (
            <section id="verification" className={`${CARD} p-5`}>
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Identity verification</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {identityVerified
                  ? 'Verified. Publication is not blocked by verification any more.'
                  : 'In review. Nothing is needed from you while a reviewer reads it — keep setting the rest up.'}
              </p>
              <p className="mt-3">
                <Link href={PROVIDER_PATHS.verification} className={LINK_ARROW}>
                  Open the verification centre
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </p>
            </section>
          )}
        </>
      ) : null}

      <EligibilityPanel />
      <HelpPanel providerName={provider?.display_name ?? null} />
    </div>
  );
}

/**
 * The eight reads the setup page needs, in one pass.
 *
 * ⚠️ A NAMED FUNCTION RATHER THAN EIGHT DESTRUCTURED RESULTS AT THE TOP OF THE PAGE, because the page
 * also has to cope with "there is no provider yet": threading eight nullable variables through the JSX
 * is how a page like this grows a `?.` on every field, and eventually on the wrong one.
 */
async function loadSetup(providerId: string) {
  const supabase = await createSupabaseServerClient();
  const [provider, progress, verifications, profile, readiness, currentService, currentArea, payout] = await Promise.all([
    supabase.from('providers').select('id,display_name,status,public_description,primary_market_id').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_onboarding_progress')
      .select('services_complete,service_area_complete,profile_complete,completion_percent,next_action,updated_at')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase
      .from('provider_verifications')
      .select('id,kind,status,created_at,reviewed_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('provider_public_profiles')
      .select('slug,headline,public_description,years_experience,accepts_new_work,is_public,published_at')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase.from('provider_search_readiness').select('total_score,readiness').eq('provider_id', providerId).maybeSingle(),
    // The current primary choice, so a provider editing later sees what is selected rather than an
    // empty dropdown that looks like nothing was ever chosen.
    supabase
      .from('provider_services')
      .select('service_entity_id')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('provider_service_areas')
      .select('location_id')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('provider_payout_destinations')
      .select('id,verification_status')
      .eq('provider_id', providerId)
      .eq('verification_status', 'verified')
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    provider: provider.data,
    progress: progress.data,
    verifications: verifications.data ?? [],
    profile: profile.data,
    readiness: readiness.data,
    currentService: currentService.data,
    currentArea: currentArea.data,
    payout: payout.data,
  };
}
