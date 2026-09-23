import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CARD, FIELD, LABEL, PAGE_SHELL } from '@/components/discovery/tokens';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createOrganisationAction, saveOrganisationDraftAction } from '@/features/organisations/actions';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';

/**
 * /org/new — organisation setup.
 *
 * ⚠️ FOUR STEPS IN ONE DOCUMENT, AND THAT IS DELIBERATE. The brief asks for a wizard; the steps here are anchors into
 * one page because every one of them saves through a single command, and a four-route wizard would mean four ways to
 * lose a half-filled form on a flaky connection. The provider onboarding page makes the same trade for the same reason.
 *
 * ⚠️ THE DRAFT IS A PAYLOAD, NOT A HALF-CREATED ORGANISATION. Nothing exists until Create; Save Draft stores what was
 * typed so the next visit can resume it, and the row it lives on is the account's own draft.
 */
export const metadata: Metadata = {
  title: 'New organisation',
  description: 'Set up a business entity on 101GlobalWork.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; draft?: string }>;

export default async function NewOrganisationPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?next=/org/new');

  const [{ data: markets }, { data: locations }, { data: draftRows }] = await Promise.all([
    supabase.from('public_market_catalog').select('market_id,display_name,default_currency_code').order('display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name,parent_id').order('display_name'),
    supabase.from('organisations').select('draft_payload,display_name,legal_name,organisation_type,primary_market_id,currency_code,timezone,primary_contact_name,primary_contact_email,primary_contact_phone,subscription_plan,operational_policies').limit(1),
  ]);

  const draft = (draftRows?.[0]?.draft_payload ?? {}) as Record<string, string>;
  const draftLocations = String(draft.location_ids ?? '').split(',').filter(Boolean);
  const failure = organisationFailureCopy(query.failed);

  return (
    <div className={PAGE_SHELL}>
      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">New organisation</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Set up a business entity
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Four steps, in any order. Nothing is created until you press Create, and Save Draft keeps what you have typed
          so you can come back to it.
        </p>
        <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <li><a href="#step-1" className="underline underline-offset-2">1. Identity</a></li>
          <li><a href="#step-2" className="underline underline-offset-2">2. Locations and currency</a></li>
          <li><a href="#step-3" className="underline underline-offset-2">3. Policies and contacts</a></li>
          <li><a href="#step-4" className="underline underline-offset-2">4. Plan</a></li>
        </ol>
      </header>

      {failure ? (
        <div className="mt-5">
          <WorkspaceNotice tone="amber" role="alert" title="That organisation was not created.">
            <p>{failure}</p>
          </WorkspaceNotice>
        </div>
      ) : null}
      {query.draft === 'saved' ? (
        <div className="mt-5">
          <WorkspaceNotice tone="teal" role="status" title="Draft saved.">
            <p>Nothing was created. Your answers are stored on your account and load back into this form.</p>
          </WorkspaceNotice>
        </div>
      ) : null}

      <form action={createOrganisationAction} className={`${CARD} mt-5 grid gap-8 p-5 sm:p-6`}>
        <input type="hidden" name="next" value="/org/new" />

        <fieldset id="step-1" className="grid gap-4">
          <legend className="text-sm font-bold tracking-tight text-slate-900">1. Identity</legend>
          <p className="text-xs leading-relaxed text-slate-500">
            The display name is what your team and your providers see; the legal name is what goes on documents. A
            display name already in use is refused rather than silently duplicated.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="display_name" className={LABEL}>Display name</label>
              <input id="display_name" name="display_name" required minLength={2} maxLength={160} defaultValue={draft.display_name ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="legal_name" className={LABEL}>Legal name (optional)</label>
              <input id="legal_name" name="legal_name" maxLength={160} defaultValue={draft.legal_name ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="organisation_type" className={LABEL}>Business type</label>
              <select id="organisation_type" name="organisation_type" required defaultValue={draft.organisation_type ?? 'business_customer'} className={FIELD}>
                <option value="business_customer">Business customer — commissions work</option>
                <option value="service_company">Service company — also offers work</option>
                <option value="merchant">Merchant</option>
                <option value="institution">Institution</option>
              </select>
            </div>
            <div>
              <label htmlFor="market_id" className={LABEL}>Primary market</label>
              <select id="market_id" name="market_id" required defaultValue={draft.market_id ?? ''} className={FIELD}>
                <option value="" disabled>Choose a market</option>
                {(markets ?? []).map(market => (
                  <option key={market.market_id} value={market.market_id}>{market.display_name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                Only markets this platform operates in are listed, and the command refuses anything outside them.
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset id="step-2" className="grid gap-4 border-t border-solid border-slate-200 pt-6">
          <legend className="text-sm font-bold tracking-tight text-slate-900">2. Locations and currency</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="currency_code" className={LABEL}>Currency</label>
              <input id="currency_code" name="currency_code" required maxLength={3} placeholder="NGN" defaultValue={draft.currency_code ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="timezone" className={LABEL}>Timezone</label>
              <input id="timezone" name="timezone" placeholder="Africa/Lagos" defaultValue={draft.timezone ?? ''} className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="location_ids" className={LABEL}>Operating locations</label>
            <select id="location_ids" name="location_ids" multiple size={6} className={FIELD} defaultValue={draftLocations}>
              {(locations ?? []).map(location => (
                <option key={location.location_id} value={location.location_id}>{location.display_name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              These come from the platform&apos;s own area catalog, so a branch you add here can actually be matched to a
              provider later. The first one becomes your primary site.
            </p>
          </div>
        </fieldset>

        <fieldset id="step-3" className="grid gap-4 border-t border-solid border-slate-200 pt-6">
          <legend className="text-sm font-bold tracking-tight text-slate-900">3. Policies and contacts</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact_name" className={LABEL}>Primary contact</label>
              <input id="contact_name" name="contact_name" maxLength={120} defaultValue={draft.contact_name ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="contact_email" className={LABEL}>Contact email</label>
              <input id="contact_email" name="contact_email" type="email" maxLength={160} defaultValue={draft.contact_email ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="contact_phone" className={LABEL}>Contact phone (optional)</label>
              <input id="contact_phone" name="contact_phone" maxLength={40} defaultValue={draft.contact_phone ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="approvals_above" className={LABEL}>Approvals above (in your currency)</label>
              <input id="approvals_above" name="approvals_above" type="number" min="0" step="0.01" defaultValue={draft.approvals_above ?? ''} className={FIELD} />
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                The dashboard flags items above this figure. It is a threshold your team reads, not a permission the
                platform enforces — the platform has no per-member spending limits to enforce.
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="safety_notes" className={LABEL}>Operational or safety notes (optional)</label>
            <textarea id="safety_notes" name="safety_notes" rows={3} maxLength={2000} defaultValue={draft.safety_notes ?? ''} className={FIELD} />
          </div>
        </fieldset>

        <fieldset id="step-4" className="grid gap-4 border-t border-solid border-slate-200 pt-6">
          <legend className="text-sm font-bold tracking-tight text-slate-900">4. Plan</legend>
          <div>
            <label htmlFor="subscription_plan" className={LABEL}>Subscription plan</label>
            <select id="subscription_plan" name="subscription_plan" required defaultValue={draft.subscription_plan ?? 'standard'} className={FIELD}>
              <option value="standard">Standard</option>
              <option value="portfolio">Portfolio — multiple sites and budgets</option>
              <option value="enterprise">Enterprise — invoicing and reporting</option>
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              The platform charges no fee of its own on these plans today: no fee schedule is in force, and choosing one
              does not change what you are billed.
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-5">
          <PendingButton
            idle="Create organisation"
            pending="Creating…"
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-6 py-3 font-mono text-sm font-bold tracking-wide text-white shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-70"
          />
          <PendingButton
            idle="Save draft"
            pending="Saving…"
            formAction={saveOrganisationDraftAction}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-xs leading-relaxed text-slate-500">
            Team invitations happen after the entity exists, on its dashboard — an invitation needs an organisation to
            invite somebody to.
          </p>
        </div>
      </form>
    </div>
  );
}
