import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CARD, FIELD, LABEL } from '@/components/discovery/tokens';
import {
  ApprovalsWidget,
  BudgetWidgets,
  ExceptionsWidget,
  PortfolioStatusWidget,
  ProviderWidget,
} from '@/components/organisations/OrgSections';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getOrganisation } from '@/features/organisations/org';
import { addOrganisationLocationAction, setOrganisationBudgetAction } from '@/features/organisations/actions';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * /org/[orgId] — the executive dashboard.
 *
 * ⚠️ EVERY WIDGET COMES FROM ONE READ, so a count and the rows under it cannot disagree. The date picker, site and
 * type filters narrow that snapshot in the browser of the request — they do not re-query, because a filter that
 * changed the totals while leaving the rows would be worse than no filter at all. (The portfolio page, where the
 * filters matter most, re-reads with its own query parameters.)
 *
 * ⚠️ SITE ALERTS AND EXCEPTIONS ARE THE SAME ROWS, SHOWN ONCE. A blocked site appears in critical exceptions with its
 * reason; the alert feed would have been the same list with a different heading.
 */
export const metadata: Metadata = {
  title: 'Organisation overview',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; saved?: string; invite?: string }>;

export default async function OrganisationOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const { organisation, denied } = await getOrganisation(orgId);
  if (denied || !organisation) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: catalog } = await supabase.from('public_location_catalog').select('location_id,display_name').order('display_name');
  const failure = organisationFailureCopy(query.failed);
  const canAdminister = organisation.role === 'admin';

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {organisation.entity.displayName}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Work across {organisation.locations.length} site{organisation.locations.length === 1 ? '' : 's'}
            {organisation.entity.legalName ? ' · ' + organisation.entity.legalName : ''}
            {organisation.entity.currencyCode ? ' · reported in ' + organisation.entity.currencyCode : ''}
            {organisation.entity.status !== 'active' ? ' · entity status: ' + organisation.entity.status : ''}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
          {organisation.entity.subscriptionPlan} plan
        </span>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'location' ? (
        <WorkspaceNotice tone="teal" role="status" title="Location added.">
          <p>It is part of this entity now, and the portfolio can be filtered by it.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'budget' ? (
        <WorkspaceNotice tone="teal" role="status" title="Budget saved.">
          <p>The bar below compares it with funded work on the same site.</p>
        </WorkspaceNotice>
      ) : null}
      {query.invite === '1' ? (
        <WorkspaceNotice tone="slate" role="status" title="Invitations are not wired up yet.">
          <p>
            The platform has an invitation mechanism for platform staff, not for organisation members, and this page
            will not pretend otherwise. Until member invitations exist, add somebody by having them sign in and be added
            as a member by the platform.
          </p>
        </WorkspaceNotice>
      ) : null}

      <PortfolioStatusWidget organisation={organisation} />
      <ExceptionsWidget organisation={organisation} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ApprovalsWidget organisation={organisation} />
        <section className={`${CARD} p-5`} aria-labelledby="providers-heading">
          <h2 id="providers-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Provider performance
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Counts across this organisation&apos;s work, per provider.
          </p>
          <div className="mt-3">
            <ProviderWidget organisation={organisation} />
          </div>
        </section>
      </div>

      <section aria-labelledby="budgets-heading" className="grid gap-3">
        <h2 id="budgets-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Budget utilisation
        </h2>
        <BudgetWidgets organisation={organisation} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${CARD} p-5`} aria-labelledby="sites-heading">
          <h2 id="sites-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Sites and branches
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            The areas this entity works in. They come from the platform&apos;s own catalog, which is also what matching
            reads — there is no map because the platform holds no coordinates for its locations.
          </p>
          {organisation.locations.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No site recorded yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-xs">
              {organisation.locations.map(location => (
                <li key={location.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                  <span className="font-semibold text-slate-800">
                    {location.label ?? location.name}
                    {location.isPrimary ? ' · primary' : ''}
                  </span>
                  <span className="text-slate-500">{location.kind}</span>
                </li>
              ))}
            </ul>
          )}

          {canAdminister ? (
            <form action={addOrganisationLocationAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-solid border-slate-200 pt-4">
              <input type="hidden" name="organisation_id" value={orgId} />
              <input type="hidden" name="next" value={`/org/${orgId}`} />
              <div className="min-w-0 flex-1">
                <label htmlFor="location_id" className={LABEL}>Add a site or branch</label>
                <select id="location_id" name="location_id" required defaultValue="" className={FIELD}>
                  <option value="" disabled>Choose an area</option>
                  {(catalog ?? []).map(entry => (
                    <option key={entry.location_id} value={entry.location_id}>{entry.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="kind" className={LABEL}>Kind</label>
                <select id="kind" name="kind" defaultValue="site" className={FIELD}>
                  <option value="site">Site</option>
                  <option value="branch">Branch</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="label" className={LABEL}>Your own label (optional)</label>
                <input id="label" name="label" maxLength={120} placeholder="e.g. Depot 4" className={FIELD} />
              </div>
              <PendingButton
                idle="Add site"
                pending="Adding…"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          ) : null}
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="members-heading">
          <h2 id="members-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Members
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Everyone who can act for this entity. A project&apos;s internal owner has to be one of them.
          </p>
          <ul className="mt-3 grid gap-2 text-xs">
            {organisation.members.map(member => (
              <li key={member.accountId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="font-semibold text-slate-800">{member.name}</span>
                <span className="text-slate-500">
                  {member.role.replaceAll('_', ' ')}
                  {member.joinedAt ? ' · joined ' + new Date(member.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {canAdminister ? (
        <form action={setOrganisationBudgetAction} className={`${CARD} grid gap-4 p-5`}>
          <input type="hidden" name="organisation_id" value={orgId} />
          <input type="hidden" name="next" value={`/org/${orgId}`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Set a budget</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Committed is the plan; funded work is filled in by the platform from its own reconciled obligations, so a
              figure here that looks low means work not funded yet rather than a plan nobody priced.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="budget_location" className={LABEL}>Site</label>
              <select id="budget_location" name="location_id" defaultValue="" className={FIELD}>
                <option value="">Whole organisation</option>
                {organisation.locations.map(location => (
                  <option key={location.id} value={location.locationId}>{location.label ?? location.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="period_start" className={LABEL}>Period starts</label>
              <input id="period_start" name="period_start" type="date" required className={FIELD} />
            </div>
            <div>
              <label htmlFor="period_end" className={LABEL}>Period ends</label>
              <input id="period_end" name="period_end" type="date" required className={FIELD} />
            </div>
            <div>
              <label htmlFor="currency_code" className={LABEL}>Currency</label>
              <input id="currency_code" name="currency_code" maxLength={3} required defaultValue={organisation.entity.currencyCode ?? 'NGN'} className={FIELD} />
            </div>
            <div>
              <label htmlFor="committed" className={LABEL}>Committed</label>
              <input id="committed" name="committed" type="number" min="0" step="0.01" required className={FIELD} />
            </div>
            <div>
              <label htmlFor="actual" className={LABEL}>Funded work so far</label>
              <input id="actual" name="actual" type="number" min="0" step="0.01" defaultValue="0" className={FIELD} />
            </div>
          </div>
          <div>
            <PendingButton
              idle="Save the budget"
              pending="Saving…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </div>
  );
}
