import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { CostCentreCards } from '@/components/organisations/OrgGovernance';
import { PendingButton } from '@/components/provider/ProviderControls';
import { EmptyState, WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';
import { getBudgets } from '@/features/organisations/governance';
import { assignProjectCostCentreAction, createCostCentreAction } from '@/features/organisations/governance-actions';
import { getOrganisation } from '@/features/organisations/org';
import { formatMoney } from '@/features/provider-workspace/format';

/**
 * /org/[orgId]/budgets — allocations, the ledger behind them, and the two links a manager needs.
 *
 * ⚠️ ONE TYPED NUMBER, THE REST COMPUTED. The allocation is what somebody sets; committed is the sum of funded
 * obligations on the projects linked to the centre and paid is the sum of the payouts the ledger actually sent. The
 * page prints all three rather than a single "spend", because collapsing them would hide whether the money has left.
 *
 * ⚠️ THE LEDGER IS A VIEW OF ROWS, NOT A SECOND SET OF FIGURES. Each line is one obligation and its payout, so a
 * number in a card can be traced to the lines under it. The centre filter is a query parameter so a filtered ledger is
 * a link somebody can send, and the CSV export takes the same parameter — a different set of rows from the one on
 * screen would be a worse export than none.
 */
export const metadata: Metadata = {
  title: 'Budgets and cost centres',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ centre?: string; saved?: string; failed?: string }>;

export default async function OrganisationBudgetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const [budgets, { organisation }] = await Promise.all([getBudgets(orgId), getOrganisation(orgId)]);
  if (budgets.denied || budgets.unavailable) notFound();

  const currencyCode = organisation?.entity.currencyCode ?? 'NGN';
  const canAdminister = budgets.role === 'admin';
  const failure = organisationFailureCopy(query.failed);

  // The link a card carries is the cost centre's id; the ledger rows name their centre. Resolve one to the other here
  // rather than in SQL, because the alternative is a second column of ids on a page nobody reads raw ids from.
  const selected = query.centre ? budgets.centres.find(centre => centre.id === query.centre) ?? null : null;
  const ledger = selected ? budgets.transactions.filter(entry => entry.costCentre === selected.name) : budgets.transactions;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Budgets and cost centres</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
            A cost centre is a department or site with an allocation. Its committed and paid figures are computed from
            the funded obligations and the payouts of the projects linked to it, in {currencyCode}.
          </p>
        </div>
        <a
          href={`/org/${orgId}/budgets/export${selected ? `?centre=${selected.id}` : ''}`}
          className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
          download
        >
          Export ledger breakdown
        </a>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'centre' ? (
        <WorkspaceNotice tone="teal" role="status" title="Cost centre created.">
          <p>Link projects to it below; until something is linked it has no committed or paid figure.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'allocation' ? (
        <WorkspaceNotice tone="teal" role="status" title="Allocation adjusted.">
          <p>The previous figure and the new one are both in the audit record, with your reason if you gave one.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'project_centre' ? (
        <WorkspaceNotice tone="teal" role="status" title="Project linked.">
          <p>The centre&apos;s committed and paid figures now include that project&apos;s funded work.</p>
        </WorkspaceNotice>
      ) : null}

      <CostCentreCards budgets={budgets} organisationId={orgId} />

      <section className={`${CARD} p-5`} aria-labelledby="periods-heading">
        <h2 id="periods-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Budget periods
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Whole-organisation plans by period. Committed is the plan; actual is the funded work the platform has
          reconciled for the same window, and remaining is the difference — floored at zero so a period cannot read as
          negative spending.
        </p>
        {budgets.periods.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No budget period is set for this organisation yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <caption className="sr-only">Budget periods for this organisation</caption>
              <thead>
                <tr className="border-b border-solid border-slate-200 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th scope="col" className="py-2 pr-4">Site</th>
                  <th scope="col" className="py-2 pr-4">Period</th>
                  <th scope="col" className="py-2 pr-4">Committed</th>
                  <th scope="col" className="py-2 pr-4">Funded work</th>
                  <th scope="col" className="py-2">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {budgets.periods.map(period => (
                  <tr key={period.id} className="border-b border-solid border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-700">{period.locationName ?? 'Whole organisation'}</td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {period.periodStart.slice(0, 10)} – {period.periodEnd.slice(0, 10)}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">{formatMoney(period.committedMinor, period.currencyCode)}</td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">{formatMoney(period.actualMinor, period.currencyCode)}</td>
                    <td className="py-2.5 font-semibold text-primary">{formatMoney(period.remainingMinor, period.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="ledger" className={`${CARD} scroll-mt-6 p-5`} aria-labelledby="ledger-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ledger-heading" className="text-sm font-bold tracking-tight text-slate-900">
              Transaction log
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              One line per obligation behind the figures above, with the payout beside it. These are reconciled ledger
              records, not entries anybody typed in here.
            </p>
          </div>
          {selected ? (
            <Link href={`/org/${orgId}/budgets#ledger`} className={LINK_ARROW}>
              Show every cost centre
            </Link>
          ) : null}
        </div>
        {selected ? (
          <p className="mt-2 text-xs text-slate-500">
            Filtered to <strong className="font-semibold">{selected.name}</strong>. The export above carries the same
            filter.
          </p>
        ) : null}

        {ledger.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={selected ? 'No ledger lines for this cost centre' : 'No ledger lines yet'}>
              A line appears when a linked project has a payment obligation. Link a project to a cost centre below to
              see its funded work here.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <caption className="sr-only">Reconciled obligations and payouts for the selected cost centres</caption>
              <thead>
                <tr className="border-b border-solid border-slate-200 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th scope="col" className="py-2 pr-4">Reference</th>
                  <th scope="col" className="py-2 pr-4">Project</th>
                  <th scope="col" className="py-2 pr-4">Cost centre</th>
                  <th scope="col" className="py-2 pr-4">Project state</th>
                  <th scope="col" className="py-2 pr-4">Obligation</th>
                  <th scope="col" className="py-2 pr-4">Amount</th>
                  <th scope="col" className="py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(entry => (
                  <tr key={`${entry.requestId}-${entry.costCentre ?? 'none'}`} className="border-b border-solid border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-slate-500">{entry.reference}</td>
                    <td className="py-2.5 pr-4 text-slate-800">{entry.title}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{entry.costCentre ?? 'Unlinked'}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{entry.state.replaceAll('_', ' ')}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{entry.obligationStatus ?? 'none'}</td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">
                      {formatMoney(entry.amountMinor, entry.currencyCode ?? currencyCode, 'Not funded')}
                    </td>
                    <td className="py-2.5 font-semibold text-slate-900">
                      {formatMoney(entry.paidMinor, entry.currencyCode ?? currencyCode, entry.payoutStatus ?? 'No payout')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canAdminister ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <form action={createCostCentreAction} className={`${CARD} grid gap-4 p-5`}>
            <input type="hidden" name="organisation_id" value={orgId} />
            <input type="hidden" name="next" value={`/org/${orgId}/budgets`} />
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Create a cost centre</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Give it an allocation and, if you like, the site it belongs to. Its committed and paid figures appear
                once you link a project to it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="centre_name" className={LABEL}>Name</label>
                <input id="centre_name" name="name" required minLength={2} maxLength={120} placeholder="e.g. Lekki depot" className={FIELD} />
              </div>
              <div>
                <label htmlFor="centre_code" className={LABEL}>Code</label>
                <input id="centre_code" name="code" required maxLength={16} placeholder="LEK-01" pattern="[A-Za-z0-9][A-Za-z0-9-]{1,15}" className={FIELD} />
              </div>
              <div>
                <label htmlFor="centre_currency" className={LABEL}>Currency</label>
                <input id="centre_currency" name="currency_code" required maxLength={3} defaultValue={currencyCode} className={FIELD} />
              </div>
              <div>
                <label htmlFor="centre_allocated" className={LABEL}>Allocation</label>
                <input id="centre_allocated" name="allocated" type="number" min="0" step="0.01" required defaultValue="0" className={FIELD} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="centre_location" className={LABEL}>Site (optional)</label>
                <select id="centre_location" name="location_id" defaultValue="" className={FIELD}>
                  <option value="">Every site</option>
                  {(organisation?.locations ?? []).map(location => (
                    <option key={location.id} value={location.locationId}>
                      {location.label ?? location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <PendingButton
                idle="Create cost centre"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </form>

          <form action={assignProjectCostCentreAction} className={`${CARD} grid gap-4 p-5`}>
            <input type="hidden" name="organisation_id" value={orgId} />
            <input type="hidden" name="next" value={`/org/${orgId}/budgets`} />
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Link a project to a cost centre</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                This is what anchors the centre&apos;s figures. A project has one cost centre; linking it again moves it.
              </p>
            </div>
            {budgets.centres.length === 0 || budgets.projects.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                {budgets.centres.length === 0
                  ? 'Create a cost centre first — there is nothing to link a project to yet.'
                  : 'This organisation has no projects to link yet.'}
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="assign_request" className={LABEL}>Project</label>
                  <select id="assign_request" name="request_id" required defaultValue="" className={FIELD}>
                    <option value="" disabled>Choose a project</option>
                    {budgets.projects.map(project => (
                      <option key={project.requestId} value={project.requestId}>{project.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="assign_centre" className={LABEL}>Cost centre</label>
                  <select id="assign_centre" name="cost_centre_id" required defaultValue="" className={FIELD}>
                    <option value="" disabled>Choose a cost centre</option>
                    {budgets.centres.map(centre => (
                      <option key={centre.id} value={centre.id}>
                        {centre.name} ({centre.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <PendingButton
                    idle="Link project"
                    pending="Saving…"
                    className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </>
            )}
          </form>
        </div>
      ) : (
        <WorkspaceNotice tone="slate" role="status" title="Viewing, not editing.">
          <p>
            Creating a cost centre, adjusting an allocation and linking a project are owner and administrator actions.
            Everything on this page is readable to you; the forms appear for the roles that can use them.
          </p>
        </WorkspaceNotice>
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        Individual requests, with their obligations, are on{' '}
        <Link href={`/org/${orgId}/projects`} className={LINK_ARROW}>
          the projects page
        </Link>
        .
      </p>
    </div>
  );
}
