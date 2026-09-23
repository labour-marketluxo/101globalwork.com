import Link from 'next/link';
import { ArrowRight, Building2, TriangleAlert } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import { NEXT_ACTION_COPY, ORG_STATE_COPY, SLA_COPY, type OrgProject, type Organisation } from '@/features/organisations/org';
import { assignProjectOwnerAction } from '@/features/organisations/actions';

/**
 * The organisation dashboard's widgets and the portfolio table.
 *
 * ⚠️ A BUDGET IS A PLAN AND A COMMITMENT IS A ROW, AND THE TWO ARE SHOWN SIDE BY SIDE. "Funded work" is money the
 * platform has reconciled against obligations, not an invoice somebody typed in, so a budget that looks unspent is
 * work that has not been funded yet rather than a plan nobody priced.
 */

function tone(t: 'teal' | 'amber' | 'slate') {
  return t === 'teal'
    ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
    : t === 'amber'
      ? BADGE_AMBER
      : BADGE_SLATE;
}

export function PortfolioStatusWidget({ organisation }: { organisation: Organisation }) {
  const { totals } = organisation;
  return (
    <section className={`${CARD} p-5`} aria-labelledby="portfolio-status-heading">
      <h2 id="portfolio-status-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Portfolio status
      </h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-solid border-slate-200 p-3.5">
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Projects</dt>
          <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{totals.projects}</dd>
        </div>
        <div className="rounded-xl border border-solid border-slate-200 p-3.5">
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Active</dt>
          <dd className="mt-1 text-lg font-extrabold tracking-tight text-primary">{totals.active}</dd>
        </div>
        <div className="rounded-xl border border-solid border-slate-200 p-3.5">
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Completed</dt>
          <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{totals.completed}</dd>
        </div>
        <div className="rounded-xl border border-solid border-slate-200 p-3.5">
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Funded, unfinished</dt>
          <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
            {formatMoney(totals.committedFundedMinor, organisation.entity.currencyCode ?? 'NGN')}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {totals.preWork} project{totals.preWork === 1 ? '' : 's'} have not reached a provider yet. The funded figure is
        money the platform has reconciled, not invoices copied in.
      </p>
    </section>
  );
}

export function ExceptionsWidget({ organisation }: { organisation: Organisation }) {
  const hasExceptions = organisation.exceptions.length > 0;
  return (
    <section
      className={`${CARD} p-5 ${hasExceptions ? 'border-secondary bg-secondary-light' : ''}`}
      aria-labelledby="exceptions-heading"
    >
      <h2 id="exceptions-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <TriangleAlert aria-hidden="true" className={`h-4 w-4 ${hasExceptions ? 'text-amber-800' : 'text-primary'}`} />
        Critical exceptions
      </h2>
      {hasExceptions ? (
        <ul className="mt-3 grid gap-2">
          {organisation.exceptions.map((exception, index) => (
            <li key={`${exception.kind}-${index}`} className="rounded-xl border border-solid border-amber-200 bg-white p-3">
              <p className="text-sm font-semibold text-amber-900">{exception.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
                {exception.detail ? exception.detail + ' · ' : ''}
                {exception.locationName ?? 'No site recorded'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Nothing is stopped, overdue or under a payout hold across these sites.
        </p>
      )}
    </section>
  );
}

export function ApprovalsWidget({ organisation }: { organisation: Organisation }) {
  const threshold = Number((organisation.entity.policies as { approvals_above_minor?: number }).approvals_above_minor ?? 0);
  return (
    <section className={`${CARD} p-5`} aria-labelledby="approvals-heading">
      <h2 id="approvals-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Waiting on your organisation
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Quotes to accept and completed work to approve, with the money attached to each.
        {threshold > 0
          ? ' Your policy requires an approver above ' + formatMoney(threshold, organisation.entity.currencyCode ?? 'NGN') + '.'
          : ' No approval threshold is set in your operational policy.'}
        {' '}Recording the organisation&apos;s decision is the inbox&apos;s job; accepting a quote and approving
        completed work stay with the account that commissioned the request.
      </p>
      {organisation.approvals.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">Nothing is waiting on a decision.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {organisation.approvals.map(item => (
            <li key={`${item.requestId}-${item.kind}`} className="rounded-xl border border-solid border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <span className={tone(threshold > 0 && (item.amountMinor ?? 0) >= threshold ? 'amber' : 'slate')}>
                  {item.kind === 'completion' ? 'Approve completion' : 'Accept a quote'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.amountMinor !== null ? formatMoney(item.amountMinor, item.currencyCode ?? 'NGN') : 'No amount yet'}
                {item.providerName ? ' · ' + item.providerName : ''}
              </p>
              <p className="mt-2">
                {/* ⚠️ /requests/[id], NOT the customer-scoped page: the approvals list is filtered to work somebody
                    ELSE asked for, and the customer page is scoped to the account that commissioned it. */}
                <Link href={`/requests/${item.requestId}`} className={LINK_ARROW}>
                  Open the request
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3">
        <Link href={`/org/${organisation.entity.id}/approvals`} className={LINK_ARROW}>
          Open the approvals inbox
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}

export function BudgetWidgets({ organisation }: { organisation: Organisation }) {
  if (organisation.budgets.length === 0) {
    return (
      <EmptyState title="No budgets set">
        A budget is a plan for a period, per branch or for the whole organisation. Set one below and it is compared with
        the funded work the platform has reconciled.
        <span className="mt-3 block">
          <Link href={`/org/${organisation.entity.id}/budgets`} className={LINK_ARROW}>
            Cost centres and the ledger
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </span>
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      {organisation.budgets.map(budget => {
        const remaining = Math.max(0, budget.committedMinor - budget.actualMinor);
        const ratio = budget.committedMinor > 0 ? Math.min(100, Math.round((budget.actualMinor / budget.committedMinor) * 100)) : 0;
        return (
          <article key={budget.id} className={`${CARD} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">
                {budget.locationName ?? 'Whole organisation'}
              </h3>
              <span className="font-mono text-[11px] tracking-wide text-slate-500 uppercase">
                {budget.periodStart} to {budget.periodEnd}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Committed</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{formatMoney(budget.committedMinor, budget.currencyCode)}</dd>
              </div>
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Funded work</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{formatMoney(budget.actualMinor, budget.currencyCode)}</dd>
              </div>
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Remaining</dt>
                <dd className="mt-0.5 font-semibold text-primary">{formatMoney(remaining, budget.currencyCode)}</dd>
              </div>
            </dl>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100" title={String(ratio) + '% of the budget is funded'}>
              <span className="block h-full rounded-full bg-primary" style={{ width: String(ratio) + '%' }} />
            </div>
          <p className="mt-1.5 text-xs text-slate-500">
              {ratio}% of this budget is covered by funded work. A bar short of the plan means work that has not been
              funded yet, not an unpriced plan.
            </p>
          </article>
        );
      })}
      <p>
        <Link href={`/org/${organisation.entity.id}/budgets`} className={LINK_ARROW}>
          Cost centres and the ledger
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}

export function ProviderWidget({ organisation }: { organisation: Organisation }) {
  if (organisation.providers.length === 0) {
    return (
      <EmptyState title="No provider has worked here yet">
        Counts appear once a quote has been accepted and the work has started.
      </EmptyState>
    );
  }
  return (
    <ul className={`${CARD} grid gap-2 p-5 text-xs`}>
      {organisation.providers.map(provider => (
        <li key={provider.providerId} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2 last:border-0">
          <span className="font-semibold text-slate-800">{provider.name}</span>
          <span className="text-slate-600">
            {provider.jobs} job{provider.jobs === 1 ? '' : 's'} · {provider.completed} completed · {provider.onTime} on time
            {provider.late > 0 ? ' · ' + provider.late + ' late' : ''}
          </span>
        </li>
      ))}
      <li className="pt-1 text-slate-500">
        Counts of rows, not a score: this platform does not rate providers, and a rating nobody can audit is worth less
        than a count somebody can check.
      </li>
    </ul>
  );
}

export function PortfolioTable({
  organisation,
  projects,
  canAssign,
}: {
  organisation: Organisation;
  projects: OrgProject[];
  canAssign: boolean;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState title="Nothing matches these filters">
        The portfolio holds every request this organisation commissioned, whatever its state. Widen a filter, or start a
        new project.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3">
      {projects.map(project => {
        const sla = SLA_COPY[project.sla];
        return (
          <article key={project.requestId} className={`${CARD} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold tracking-tight text-slate-900">{project.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                    {project.locationName ?? 'No site recorded'}
                  </span>
                  {project.serviceName ? <span>{project.serviceName}</span> : null}
                  <span>Owner: {project.ownerName ?? 'unassigned'}</span>
                </p>
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={tone('slate')}>{ORG_STATE_COPY[project.state] ?? project.state.replaceAll('_', ' ')}</span>
                <span className={tone(sla.tone)}>{sla.label}</span>
              </span>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Budget</dt>
                <dd className="mt-0.5 text-slate-700">
                  {project.budgetCommittedMinor !== null
                    ? formatMoney(project.budgetCommittedMinor, project.currencyCode ?? 'NGN')
                    : 'No budget for this site'}
                </dd>
              </div>
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Committed work</dt>
                <dd className="mt-0.5 text-slate-700">
                  {project.amountMinor !== null
                    ? formatMoney(project.amountMinor, project.currencyCode ?? 'NGN') + ' · ' + (project.obligationStatus ?? 'no obligation').replaceAll('_', ' ')
                    : 'No obligation yet'}
                </dd>
              </div>
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Due</dt>
                <dd className="mt-0.5 text-slate-700">
                  {project.scheduledEnd
                    ? new Date(project.scheduledEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'No date agreed'}
                </dd>
              </div>
              <div>
                <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Next action</dt>
                <dd className="mt-0.5 text-slate-700">{NEXT_ACTION_COPY[project.nextAction] ?? project.nextAction}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {/* The customer view is scoped to the commissioning account; an organisation member reads the request
                  itself, which is the same record with the controls they are not entitled to already absent. */}
              <Link href={`/requests/${project.requestId}`} className={LINK_ARROW}>
                Open the request
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
              {project.assignmentId ? (
                <Link href={`/projects/${project.assignmentId}`} className={LINK_ARROW}>
                  The project workspace
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
            {canAssign ? (
              <form action={assignProjectOwnerAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-solid border-slate-200 pt-3">
                <input type="hidden" name="organisation_id" value={organisation.entity.id} />
                <input type="hidden" name="request_id" value={project.requestId} />
                <input type="hidden" name="next" value={`/org/${organisation.entity.id}/projects`} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`owner_${project.requestId}`} className={LABEL}>
                    Assign an internal owner
                  </label>
                  <select id={`owner_${project.requestId}`} name="owner_account_id" required defaultValue={project.ownerAccountId ?? ''} className={FIELD}>
                    <option value="" disabled>
                      Choose a member
                    </option>
                    {organisation.members.map(member => (
                      <option key={member.accountId} value={member.accountId}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                </div>
                <PendingButton
                  idle="Assign owner"
                  pending="Saving…"
                  className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </form>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
