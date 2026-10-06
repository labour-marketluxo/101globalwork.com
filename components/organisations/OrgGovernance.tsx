import Link from 'next/link';
import { ArrowRight, Coins, Gavel, Info, TriangleAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import { DECISION_COPY, type ApprovalsRead, type BudgetsRead } from '@/features/organisations/governance';
import { adjustCostCentreAction, decideApprovalAction } from '@/features/organisations/governance-actions';

/**
 * The approvals inbox and the cost-centre hub.
 *
 * ⚠️ A DECISION HERE IS THE ORGANISATION'S, AND THE PAGE SAYS WHAT IT IS NOT. Accepting a quote and approving
 * completed work remain platform commands bound to the account that commissioned the request; what this inbox records
 * is who inside the organisation approved, under which threshold, so the requester can act on a decision instead of a
 * conversation. The alternative — quietly claiming the platform had accepted something — would be a lie in the record.
 */

function badge(tone: 'teal' | 'amber' | 'slate', label: string) {
  return (
    <span
      className={
        tone === 'teal'
          ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase'
          : tone === 'amber'
            ? BADGE_AMBER
            : BADGE_SLATE
      }
    >
      {label}
    </span>
  );
}

export function ApprovalsInbox({
  approvals,
  organisationId,
  currencyCode,
}: {
  approvals: ApprovalsRead;
  organisationId: string;
  /** The organisation's reporting currency, used only where a figure carries no currency of its own. */
  currencyCode: string;
}) {
  const threshold = approvals.thresholdMinor;
  const mayApproveAbove = ['owner', 'admin', 'finance_approver'].includes(approvals.myRole ?? '');

  return (
    <div className="grid gap-5">
      <section className={`${CARD} p-5`} aria-labelledby="policy-heading">
        <h2 id="policy-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <Gavel aria-hidden="true" className="h-4 w-4 text-primary" />
          Your approval policy
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {threshold > 0
            ? 'Anything at or above ' + formatMoney(threshold, currencyCode) + ' needs an owner, an administrator or an approver.'
            : 'No spending threshold is set, so any active member of the organisation may decide these.'}
          {' '}
          Your role here is <strong className="font-semibold">{approvals.myRole ?? 'not a member'}</strong>
          {threshold > 0 && !mayApproveAbove ? ' — so items above the threshold are listed but not decidable by you.' : '.'}
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            The person who asked for the spend is not shown it here: the database refuses their decision, and the list
            is filtered for them as well, so a self-approval is impossible rather than merely discouraged.
          </span>
        </p>
      </section>

      {approvals.items.length === 0 ? (
        <EmptyState title="Nothing is waiting on your organisation">
          Quotes to accept and completed work to approve appear here as soon as a project reaches that state.
        </EmptyState>
      ) : (
        approvals.items.map(item => {
          const needsSenior = item.requiresSeniorRole;
          const blocked = needsSenior && !mayApproveAbove;
          return (
            <article key={`${item.requestId}-${item.kind}`} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.kind === 'completion' ? 'Milestone release' : 'Spend on a quote'}
                    {item.locationName ? ' · ' + item.locationName : ''}
                    {item.providerName ? ' · ' + item.providerName : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Requested by {item.requesterName}
                    {item.ownerName ? ' · internal owner ' + item.ownerName : ''}
                    {' · waiting ' + String(item.ageDays) + ' day' + (item.ageDays === 1 ? '' : 's')}
                    {' · ' + String(item.evidenceCount) + ' evidence item' + (item.evidenceCount === 1 ? '' : 's')}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-1.5">
                  {badge('slate', item.kind === 'completion' ? 'Milestone' : 'Spend')}
                  {item.amountMinor !== null ? badge('slate', formatMoney(item.amountMinor, item.currencyCode ?? currencyCode)) : null}
                  {needsSenior ? badge('amber', 'Above the threshold') : null}
                </span>
              </div>

              {blocked ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
                  This amount is at or above your organisation&apos;s threshold and your role cannot approve it. Delegate
                  it to an owner, an administrator or an approver below.
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 lg:grid-cols-2">
                <form action={decideApprovalAction} className="grid gap-2">
                  <input type="hidden" name="organisation_id" value={organisationId} />
                  <input type="hidden" name="request_id" value={item.requestId} />
                  <input type="hidden" name="kind" value={item.kind} />
                  <input type="hidden" name="decision" value="approved" />
                  <input type="hidden" name="next" value={`/org/${organisationId}/approvals`} />
                  <label htmlFor={`note_${item.requestId}`} className={LABEL}>
                    Approve — note (optional)
                  </label>
                  <input id={`note_${item.requestId}`} name="note" maxLength={2000} className={FIELD} />
                  <p className="text-xs leading-relaxed text-slate-500">
                    Approving records your organisation&apos;s decision
                    {item.amountMinor !== null ? ' for ' + formatMoney(item.amountMinor, item.currencyCode ?? currencyCode) : ''}.
                    The platform&apos;s own acceptance or approval of completed work is still performed by the account that
                    commissioned the request, and this page links you to it.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <PendingButton
                      idle="Approve Request"
                      pending="Saving…"
                      formAction={decideApprovalAction}
                      className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {/* ⚠️ /requests/[id], NOT /customer/requests/[id]: the customer page is scoped to the account
                        that commissioned the request, and the whole point of this inbox is that the decider is
                        somebody else. The reviewer page is readable by an active member of the organisation. */}
                    <Link href={`/requests/${item.requestId}`} className={LINK_ARROW}>
                      Open the request
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </form>
                <div className="grid gap-3">
                  <form action={decideApprovalAction} className="grid gap-2">
                    <input type="hidden" name="organisation_id" value={organisationId} />
                    <input type="hidden" name="request_id" value={item.requestId} />
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="next" value={`/org/${organisationId}/approvals`} />
                    <label htmlFor={`reject_${item.requestId}`} className={LABEL}>
                      Reject, or ask for more information — note (optional)
                    </label>
                    <input id={`reject_${item.requestId}`} name="note" maxLength={2000} className={FIELD} />
                    <div className="flex flex-wrap items-center gap-3">
                      <PendingButton
                        idle="Reject Request"
                        pending="Saving…"
                        formAction={decideApprovalAction}
                        name="decision"
                        value="rejected"
                        className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <PendingButton
                        idle="Request additional information"
                        pending="Saving…"
                        formAction={decideApprovalAction}
                        name="decision"
                        value="information_requested"
                        className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </form>
                  <form action={decideApprovalAction} className="grid gap-2">
                    <input type="hidden" name="organisation_id" value={organisationId} />
                    <input type="hidden" name="request_id" value={item.requestId} />
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="decision" value="delegated" />
                    <input type="hidden" name="next" value={`/org/${organisationId}/approvals`} />
                    <label htmlFor={`delegate_${item.requestId}`} className={LABEL}>
                      Delegate to
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                      <select id={`delegate_${item.requestId}`} name="delegate_account_id" required defaultValue="" className={`${FIELD} min-w-0 flex-1`}>
                        <option value="" disabled>
                          Choose a member
                        </option>
                        {approvals.members.map(member => (
                          <option key={member.accountId} value={member.accountId}>
                            {member.name}
                            {member.role === 'owner' || member.role === 'admin' || member.role === 'finance_approver' ? ' (can approve above the threshold)' : ''}
                          </option>
                        ))}
                      </select>
                      <PendingButton
                        idle="Delegate Approval"
                        pending="Saving…"
                        formAction={decideApprovalAction}
                        className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </form>
                </div>
              </div>
            </article>
          );
        })
      )}

      {approvals.history.length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="decisions-heading">
          <h2 id="decisions-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Decisions recorded
          </h2>
          <ul className="mt-3 grid gap-2 text-xs">
            {approvals.history.map(decision => {
              const copy = DECISION_COPY[decision.decision] ?? { label: decision.decision, tone: 'slate' as const };
              return (
                <li key={decision.id} className="rounded-xl border border-solid border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{decision.title}</span>
                    {badge(copy.tone, copy.label)}
                  </div>
                  <p className="mt-1 text-slate-600">
                    {decision.amountMinor !== null ? formatMoney(decision.amountMinor, decision.currencyCode ?? currencyCode) + ' · ' : ''}
                    {decision.decidedByName}
                    {decision.delegateName ? ' → ' + decision.delegateName : ''}
                    {decision.decidedAt ? ' · ' + new Date(decision.decidedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                  {decision.note ? <p className="mt-1 text-slate-500">{decision.note}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function CostCentreCards({ budgets, organisationId }: { budgets: BudgetsRead; organisationId: string }) {
  if (budgets.centres.length === 0) {
    return (
      <EmptyState title="No cost centres yet">
        A cost centre is a department or site with an allocation. Its committed and paid figures are computed from the
        funded obligations of the projects you link to it — the allocation is the only number you type.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4">
      {budgets.centres.map(centre => (
        <article key={centre.id} className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <Coins aria-hidden="true" className="h-4 w-4 text-primary" />
                {centre.name}
                <span className="font-sans text-[11px] font-normal tracking-wide text-slate-400 uppercase">{centre.code}</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {centre.locationName ?? 'Every site'}
                {' · ' + String(centre.activeProjectCount) + ' active of ' + String(centre.projectCount) + ' linked project' + (centre.projectCount === 1 ? '' : 's')}
              </p>
            </div>
            {badge(centre.varianceMinor >= 0 ? 'teal' : 'amber', centre.varianceMinor >= 0 ? 'Within allocation' : 'Over allocation')}
          </div>

          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-solid border-slate-200 p-3.5">
              <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Allocated</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{formatMoney(centre.allocatedMinor, centre.currencyCode)}</dd>
            </div>
            <div className="rounded-xl border border-solid border-slate-200 p-3.5">
              <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Committed (funded work)</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{formatMoney(centre.committedMinor, centre.currencyCode)}</dd>
            </div>
            <div className="rounded-xl border border-solid border-slate-200 p-3.5">
              <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Paid out</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{formatMoney(centre.paidMinor, centre.currencyCode)}</dd>
            </div>
            <div className="rounded-xl border border-solid border-slate-200 p-3.5">
              <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Variance</dt>
              <dd className={`mt-0.5 font-semibold ${centre.varianceMinor >= 0 ? 'text-primary' : 'text-amber-800'}`}>
                {centre.allocatedMinor === 0 && centre.variancePercent === null
                  ? 'No allocation set'
                  : formatMoney(centre.varianceMinor, centre.currencyCode) + (centre.variancePercent !== null ? ' · ' + String(centre.variancePercent) + '%' : '')}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Committed is money the platform has reconciled against obligations on these projects — not invoices copied
            in — and paid is what the ledger has actually sent. Both are exact figures; nothing here is rounded to a
            currency unit the platform cannot pay.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-3">
            <Link href={`/org/${organisationId}/budgets?centre=${centre.id}#ledger`} className={LINK_ARROW}>
              View the transaction log
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>

          {budgets.role === 'admin' ? (
            <form action={adjustCostCentreAction} className="mt-3 grid gap-2 border-t border-solid border-slate-200 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="organisation_id" value={organisationId} />
              <input type="hidden" name="cost_centre_id" value={centre.id} />
              <input type="hidden" name="next" value={`/org/${organisationId}/budgets`} />
              <div className="min-w-0 flex-1">
                <label htmlFor={`alloc_${centre.id}`} className={LABEL}>
                  Adjust the allocation ({centre.currencyCode})
                </label>
                <input id={`alloc_${centre.id}`} name="allocated" type="number" min="0" step="0.01" required className={FIELD} />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor={`reason_${centre.id}`} className={LABEL}>
                  Why (optional)
                </label>
                <input id={`reason_${centre.id}`} name="reason" maxLength={200} className={FIELD} />
              </div>
              <PendingButton
                idle="Adjust budget limit"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          ) : null}
        </article>
      ))}
    </div>
  );
}
