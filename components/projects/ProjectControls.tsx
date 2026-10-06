import Link from 'next/link';
import { ArrowRight, CircleCheck, Scale, ShieldAlert, TriangleAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import {
  CHANGE_KIND_COPY,
  CHANGE_STATUS_COPY,
  ISSUE_KIND_COPY,
  ISSUE_STATUS_COPY,
  type ChangeRequest,
  type IssueRead,
  type MilestonesRead,
} from '@/features/projects/controls';
import {
  createChangeRequestAction,
  decideChangeRequestAction,
  openProjectIssueAction,
  respondToIssueAction,
  setIssueStatusAction,
  withdrawChangeRequestAction,
} from '@/features/projects/actions';

/**
 * Change requests, the escrow checkpoint, and case hubs.
 *
 * ⚠️ AUTHORITY IS RENDERED FROM THE BACKEND'S ANSWER. A proposal is decided by the party who did not write it, the
 * escrow checkpoint is approved by the customer, and a case is investigated and closed by the platform — the buttons
 * below follow those rules and the commands enforce them again.
 *
 * ⚠️ NO OPTIMISTIC UI, AND NO SILENT MONEY. Every action is a server-action form and the page re-reads afterwards.
 * The approval button carries the amount it releases and the counts it is releasing against, because a financial
 * consequence that is not on the screen is one the person pressing the button has to guess at.
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

export function ChangesSection({
  changes,
  baselines,
  assignmentId,
  evidence,
  canPropose,
}: {
  changes: ChangeRequest[];
  baselines: { version: number; totalMinor: number | null; currencyCode: string | null; source: string; createdAt: string | null }[];
  assignmentId: string;
  evidence: { id: string; kind: string; note: string | null }[];
  canPropose: boolean;
}) {
  const current = baselines.length > 0 ? baselines[baselines.length - 1] : null;

  return (
    <div className="grid gap-5">
      <section className={`${CARD} p-5`} aria-labelledby="baseline-heading">
        <h2 id="baseline-heading" className="text-sm font-bold tracking-tight text-slate-900">
          The agreed baseline
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          What the job costs and when it is meant to happen, version by version. An accepted change APPENDS a version —
          the earlier ones stay, which is what makes a conversation about &ldquo;what we agreed&rdquo; answerable.
        </p>
        {baselines.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            No baseline version has been recorded yet. The first one is written when a change is accepted; until then
            the accepted quote is the baseline, and it is on the Documents tab.
          </p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {baselines.map(baseline => (
              <li key={`${baseline.version}-${baseline.createdAt ?? ''}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3 text-xs">
                <span className="text-slate-700">
                  <strong className="font-semibold">v{baseline.version}</strong> ·{' '}
                  {baseline.totalMinor !== null ? formatMoney(baseline.totalMinor, baseline.currencyCode ?? 'NGN') : 'no price recorded'} ·{' '}
                  {baseline.source === 'accepted_quote' ? 'from the accepted quote' : 'from an accepted change'}
                </span>
                <span className="text-slate-400">
                  {baseline.createdAt
                    ? new Date(baseline.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
        {current ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            The current baseline is v{current.version}. A change request compares itself against the baseline as it stood when the
            proposal was written, so a proposal cannot silently re-measure itself later.
          </p>
        ) : null}
      </section>

      {changes.length === 0 ? (
        <EmptyState title="No change requests">
          {canPropose
            ? 'A change is a proposed adjustment to the scope, the schedule or the price. Write one below and the other party decides it.'
            : 'Nobody has asked to change the agreed scope, schedule or price.'}
        </EmptyState>
      ) : (
        changes.map(change => {
          const status = CHANGE_STATUS_COPY[change.status] ?? { label: change.status, tone: 'slate' as const };
          const canDecide = change.status === 'draft' || change.status === 'proposed' ? !change.createdByMe : false;
          const canWithdraw = (change.status === 'draft' || change.status === 'proposed') && change.createdByMe;
          return (
            <article key={change.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold tracking-tight text-slate-900">{change.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {CHANGE_KIND_COPY[change.changeKind] ?? change.changeKind} · proposed by the {change.createdByRole}
                    {change.createdAt
                      ? ` · ${new Date(change.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </p>
                </div>
                {badge(status.tone, status.label)}
              </div>

              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{change.description}</p>

              {/* The diff: original against proposed, in the two dimensions a change can move. */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-solid border-slate-200 p-3 text-xs">
                  <p className="font-sans font-bold tracking-wider text-slate-500 uppercase">Price</p>
                  <p className="mt-1 text-slate-700">
                    Baseline {change.baselineTotalMinor !== null ? formatMoney(change.baselineTotalMinor, change.baselineCurrencyCode ?? 'NGN') : 'not recorded'}
                    {' → '}
                    {change.proposedTotalMinor !== null ? formatMoney(change.proposedTotalMinor, change.proposedCurrencyCode ?? 'NGN') : 'unchanged'}
                  </p>
                  {change.priceDeltaMinor !== null && change.priceDeltaMinor !== 0 ? (
                    <p className={`mt-1 font-semibold ${change.priceDeltaMinor > 0 ? 'text-amber-800' : 'text-primary'}`}>
                      {change.priceDeltaMinor > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(change.priceDeltaMinor), change.proposedCurrencyCode ?? 'NGN')}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-solid border-slate-200 p-3 text-xs">
                  <p className="font-sans font-bold tracking-wider text-slate-500 uppercase">Schedule</p>
                  <p className="mt-1 text-slate-700">
                    {change.baselineScheduledStart
                      ? new Date(change.baselineScheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : 'No baseline date'}
                    {' → '}
                    {change.proposedScheduledStart
                      ? new Date(change.proposedScheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : 'unchanged'}
                  </p>
                  {change.scheduleShiftDays !== null && change.scheduleShiftDays !== 0 ? (
                    <p className="mt-1 font-semibold text-amber-800">
                      {change.scheduleShiftDays > 0 ? `${change.scheduleShiftDays} day(s) later` : `${Math.abs(change.scheduleShiftDays)} day(s) earlier`}
                    </p>
                  ) : null}
                </div>
              </div>

              {change.evidenceIds.length > 0 ? (
                <p className="mt-3 text-xs text-slate-600">
                  Supporting evidence:{' '}
                  {change.evidenceIds
                    .map(id => evidence.find(item => item.id === id))
                    .filter(Boolean)
                    .map(item => `${item?.kind}${item?.note ? ` (${item.note})` : ''}`)
                    .join(', ') || `${change.evidenceIds.length} item(s) on the Evidence tab`}
                </p>
              ) : null}

              {change.decidedAt ? (
                <p className="mt-3 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {change.status === 'accepted' ? 'Accepted' : change.status === 'rejected' ? 'Rejected' : 'Withdrawn'} by the{' '}
                  {change.decidedByRole ?? change.createdByRole} on{' '}
                  {new Date(change.decidedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {change.decisionNote ? ` — ${change.decisionNote}` : ''}
                  {change.status === 'accepted'
                    ? '. A new baseline version was appended; the previous one is still above.'
                    : ''}
                </p>
              ) : null}

              {canDecide || canWithdraw ? (
                <div className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-2">
                  {canDecide ? (
                    <>
                      <form action={decideChangeRequestAction} className="grid gap-2">
                        <input type="hidden" name="assignment_id" value={assignmentId} />
                        <input type="hidden" name="change_id" value={change.id} />
                        <input type="hidden" name="decision" value="accepted" />
                        <input type="hidden" name="next" value={`/projects/${assignmentId}/changes`} />
                        <label htmlFor={`accept_note_${change.id}`} className={LABEL}>
                          Accept and adjust the baseline — note (optional)
                        </label>
                        <input id={`accept_note_${change.id}`} name="note" maxLength={2000} className={FIELD} />
                        <p className="text-xs leading-relaxed text-slate-500">
                          Accepting appends a new baseline version
                          {change.priceDeltaMinor ? ` and records a price change of ${formatMoney(change.priceDeltaMinor, change.proposedCurrencyCode ?? 'NGN')}` : ''}
                          . The money itself moves through the payment record, which this does not silently rewrite.
                        </p>
                        <div>
                          <PendingButton
                            idle="Accept & adjust baseline"
                            pending="Saving…"
                            icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
                            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                      </form>
                      <form action={decideChangeRequestAction} className="grid gap-2">
                        <input type="hidden" name="assignment_id" value={assignmentId} />
                        <input type="hidden" name="change_id" value={change.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <input type="hidden" name="next" value={`/projects/${assignmentId}/changes`} />
                        <label htmlFor={`reject_note_${change.id}`} className={LABEL}>
                          Reject — why (optional)
                        </label>
                        <input id={`reject_note_${change.id}`} name="note" maxLength={2000} className={FIELD} />
                        <div>
                          <PendingButton
                            idle="Reject proposal"
                            pending="Saving…"
                            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                      </form>
                    </>
                  ) : null}
                  {canWithdraw ? (
                    <form action={withdrawChangeRequestAction} className="grid gap-2">
                      <input type="hidden" name="assignment_id" value={assignmentId} />
                      <input type="hidden" name="change_id" value={change.id} />
                      <input type="hidden" name="next" value={`/projects/${assignmentId}/changes`} />
                      <PendingButton
                        idle="Withdraw my proposal"
                        pending="Withdrawing…"
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </form>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      )}

      {canPropose ? (
        <form action={createChangeRequestAction} className={`${CARD} grid gap-4 p-5`}>
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/changes`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Create a change proposal</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              The baseline is read from the job, not typed here: the comparison is only worth reading if the platform
              measured it. Leave the price or the date blank for a change that does not touch it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="change_title" className={LABEL}>
                Title
              </label>
              <input id="change_title" name="title" required minLength={4} maxLength={200} className={FIELD} />
            </div>
            <div>
              <label htmlFor="change_kind" className={LABEL}>
                What it changes
              </label>
              <select id="change_kind" name="change_kind" required defaultValue="scope" className={FIELD}>
                {Object.entries(CHANGE_KIND_COPY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="proposed_total_minor" className={LABEL}>
                Proposed price (leave blank if unchanged)
              </label>
              <input
                id="proposed_total_minor"
                name="proposed_total_minor"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="proposed_scheduled_start" className={LABEL}>
                Proposed start (leave blank if unchanged)
              </label>
              <input id="proposed_scheduled_start" name="proposed_scheduled_start" type="datetime-local" className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="change_description" className={LABEL}>
              What is changing and why
            </label>
            <textarea id="change_description" name="description" rows={5} required minLength={10} maxLength={4000} className={FIELD} />
          </div>
          {evidence.length > 0 ? (
            <div>
              <label htmlFor="evidence_ids" className={LABEL}>
                Supporting evidence (optional, choose one or more)
              </label>
              <select id="evidence_ids" name="evidence_ids" multiple size={4} className={FIELD}>
                {evidence.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.kind}
                    {item.note ? ` — ${item.note}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton
              idle="Propose the change"
              pending="Saving…"
              formAction={createChangeRequestAction}
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
            <PendingButton
              idle="Save as a draft"
              pending="Saving…"
              formAction={createChangeRequestAction}
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              A draft is visible to both parties but cannot be decided until it is proposed. The buttons differ only in
              that intent field.
            </p>
          </div>
          <input type="hidden" name="intent" value="propose" />
        </form>
      ) : null}
    </div>
  );
}

export function EscrowCheckpoint({ milestones, assignmentId, evidence }: { milestones: MilestonesRead; assignmentId: string; evidence: { id: string; kind: string }[] }) {
  const checkpoint = milestones.checkpoint;
  const amount = checkpoint.amountMinor !== null ? formatMoney(checkpoint.amountMinor, checkpoint.currencyCode ?? 'NGN') : 'no amount recorded';
  const funded = checkpoint.obligationStatus === 'funded';
  const approved = checkpoint.approvedAt !== null;
  const state = approved
    ? 'Approved and released'
    : checkpoint.correctionOpen
      ? 'Sent back for correction'
      : milestones.state === 'submitted_for_approval'
        ? 'Awaiting the customer’s approval'
        : milestones.state === 'in_progress'
          ? 'Work under way'
          : 'Not ready to submit';

  return (
    <section className={`${CARD} p-5`} aria-labelledby="checkpoint-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="checkpoint-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <CircleCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            Completion checkpoint — the one that releases money
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600">
            This platform releases escrow once per job, on the completion approval, against one funded obligation. The
            stages below are checkpoints of the plan and carry no money of their own.
          </p>
        </div>
        {badge(approved ? 'teal' : funded ? 'amber' : 'slate', state)}
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Payout on approval</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{amount}</dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Escrow</dt>
          <dd className="mt-0.5 text-slate-700">
            {checkpoint.obligationStatus ? checkpoint.obligationStatus.replaceAll('_', ' ') : 'no obligation'}
            {' · payout '}
            {checkpoint.payoutStatus ? checkpoint.payoutStatus.replaceAll('_', ' ') : 'not created'}
          </dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Required approver</dt>
          <dd className="mt-0.5 text-slate-700">
            The {checkpoint.requiredApprover} — the platform refuses anybody else, including the provider who did the work.
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-solid border-slate-200 p-3.5">
        <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Completion criteria</p>
        <ul className="mt-2 grid gap-1 text-xs text-slate-700">
          <li>
            {checkpoint.tasksDone}/{checkpoint.tasksTotal} plan tasks complete
            {checkpoint.tasksTotal === 0 ? ' (no plan written)' : ''}
          </li>
          <li>{checkpoint.evidenceCount} evidence item(s) submitted</li>
          <li>{funded ? 'The payment obligation is funded' : 'The payment obligation is not funded'}</li>
          <li>{checkpoint.payoutVerifiedDestination ? 'A verified default payout destination exists' : 'No verified payout destination'}</li>
        </ul>
        {evidence.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Evidence on this job:{' '}
            <Link href={`/projects/${assignmentId}/evidence`} className={LINK_ARROW}>
              open the gallery
            </Link>
          </p>
        ) : null}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
        <span>
          <strong className="font-semibold">What approval does:</strong> it approves the completed work and releases{' '}
          {amount} to the provider&apos;s payout account, after which the payout becomes eligible and can be requested.
          It cannot be undone here — a dispute is a separate case, and the money leaves through the payment provider on
          its own schedule.
        </span>
      </p>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Submitting for review happens where the work is recorded —{' '}
        <Link href={`/projects/${assignmentId}/work`} className={LINK_ARROW}>
          the plan
        </Link>{' '}
        and the provider&apos;s job page — and approving happens in the customer&apos;s completion review. The
        platform does not duplicate those actions into a second page that could disagree with them.
      </p>
    </section>
  );
}

export function CasesSection({
  milestones,
  assignmentId,
}: {
  milestones: MilestonesRead;
  assignmentId: string;
}) {
  const canOpen = milestones.role !== 'admin' && milestones.issues.every(issue => ['resolved', 'closed'].includes(issue.status));

  return (
    <div className="grid gap-4">
      {milestones.issues.length === 0 ? (
        <EmptyState title="No open cases">
          An issue or dispute is a case with its own hub: a kind, a status, deadlines, responses and, for safety,
          privacy and financial cases, a hold on the payout.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {milestones.issues.map(issue => {
            const status = ISSUE_STATUS_COPY[issue.status] ?? { label: issue.status, tone: 'slate' as const };
            return (
              <li key={issue.id} className={`${CARD} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold tracking-tight text-slate-900">
                      {ISSUE_KIND_COPY[issue.kind] ?? issue.kind}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{issue.summary}</p>
                  </div>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {badge(status.tone, status.label)}
                    {issue.legalHold ? badge('amber', 'Payout held') : null}
                  </span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <Link href={`/projects/${assignmentId}/issues/${issue.id}`} className={LINK_ARROW}>
                    Open the case
                  </Link>
                  {issue.responseDueAt ? (
                    <span>
                      Response due{' '}
                      {new Date(issue.responseDueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canOpen ? (
        <form action={openProjectIssueAction} className={`${CARD} grid gap-3 p-5`}>
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/milestones`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Raise a case</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              A safety, privacy or financial case starts under a legal hold: the provider cannot request a payout while
              it is open, and the platform investigates and closes it. Operational issues do not hold money.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="issue_kind" className={LABEL}>
                Type
              </label>
              <select id="issue_kind" name="kind" required defaultValue="operational" className={FIELD}>
                {Object.entries(ISSUE_KIND_COPY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="response_due_at" className={LABEL}>
                Response deadline (optional)
              </label>
              <input id="response_due_at" name="response_due_at" type="datetime-local" className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="issue_summary" className={LABEL}>
              What happened
            </label>
            <textarea id="issue_summary" name="summary" rows={4} required minLength={10} maxLength={2000} className={FIELD} />
          </div>
          <div>
            <PendingButton
              idle="Open the case"
              pending="Opening…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function IssueCase({ issue, assignmentId, evidence }: { issue: IssueRead; assignmentId: string; evidence: { id: string; kind: string; note: string | null }[] }) {
  const status = ISSUE_STATUS_COPY[issue.issue.status] ?? { label: issue.issue.status, tone: 'slate' as const };
  const finished = ['resolved', 'closed'].includes(issue.issue.status);
  const settlementOffered = issue.responses.some(response => response.kind === 'settlement');

  return (
    <div className="grid gap-5">
      <section className={`${CARD} p-5`} aria-labelledby="case-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="case-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
              <Scale aria-hidden="true" className="h-4 w-4 text-primary" />
              {ISSUE_KIND_COPY[issue.issue.kind] ?? issue.issue.kind}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Raised by {issue.issue.raisedByName} ({issue.issue.raisedByRole})
              {issue.issue.createdAt
                ? ` · ${new Date(issue.issue.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            {badge(status.tone, status.label)}
            {issue.issue.legalHold ? badge('amber', 'Legal hold — payout frozen') : null}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">{issue.issue.summary}</p>

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Response deadline</dt>
            <dd className="mt-0.5 text-slate-700">
              {issue.issue.responseDueAt
                ? new Date(issue.issue.responseDueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'None set'}
            </dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Money behind this case</dt>
            <dd className="mt-0.5 text-slate-700">
              {issue.money.amountMinor !== null
                ? `${formatMoney(issue.money.amountMinor, issue.money.currencyCode ?? 'NGN')} · obligation ${issue.money.obligationStatus?.replaceAll('_', ' ') ?? 'unknown'}`
                : 'No obligation on this job'}
            </dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Held right now</dt>
            <dd className={`mt-0.5 ${issue.money.heldMinor !== null ? 'font-semibold text-amber-800' : 'text-slate-700'}`}>
              {issue.money.heldMinor !== null
                ? `${formatMoney(issue.money.heldMinor, issue.money.currencyCode ?? 'NGN')} cannot be requested while the hold is on`
                : 'Nothing is being withheld'}
            </dd>
          </div>
        </dl>

        {issue.issue.resolution ? (
          <p className="mt-3 rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3 text-xs leading-relaxed text-slate-700">
            <strong className="font-semibold">Resolution:</strong> {issue.issue.resolution}
            {issue.issue.resolvedAt
              ? ` (${new Date(issue.issue.resolvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`
              : ''}
          </p>
        ) : null}
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="case-thread-heading">
        <h2 id="case-thread-heading" className="text-sm font-bold tracking-tight text-slate-900">
          The case record
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Separate from the project chat on purpose: a case is a formal channel, and platform decisions appear here as
          decisions rather than as one more comment.
        </p>
        {issue.responses.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Nothing has been added to this case yet.</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {issue.responses.map(response => (
              <li
                key={response.id}
                className={`rounded-xl border border-solid p-3.5 ${
                  response.kind === 'admin_decision' ? 'border-secondary bg-secondary-light' : 'border-slate-200'
                }`}
              >
                <p className="text-xs font-semibold text-slate-800">
                  {response.authorName}
                  <span className="ml-2 font-normal text-slate-500">
                    {response.authorRole} · {response.kind.replaceAll('_', ' ')}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{response.body}</p>
                {response.evidenceId ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Attached evidence:{' '}
                    <Link href={`/projects/${assignmentId}/evidence`} className={LINK_ARROW}>
                      open the gallery
                    </Link>
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-400">
                  {response.createdAt ? new Date(response.createdAt).toLocaleString('en-GB') : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!finished ? (
        <>
          <form action={respondToIssueAction} className={`${CARD} grid gap-3 p-5`}>
            <input type="hidden" name="assignment_id" value={assignmentId} />
            <input type="hidden" name="issue_id" value={issue.issue.id} />
            <input type="hidden" name="next" value={`/projects/${assignmentId}/issues/${issue.issue.id}`} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="response_kind" className={LABEL}>
                  What kind of entry
                </label>
                <select id="response_kind" name="kind" required defaultValue="response" className={FIELD}>
                  <option value="response">A response</option>
                  <option value="evidence">Evidence to add</option>
                  {settlementOffered ? <option value="settlement">A settlement offer</option> : null}
                </select>
              </div>
              <div>
                <label htmlFor="evidence_id" className={LABEL}>
                  Attach evidence (optional)
                </label>
                <select id="evidence_id" name="evidence_id" defaultValue="" className={FIELD}>
                  <option value="">No attachment</option>
                  {evidence.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.kind}
                      {item.note ? ` — ${item.note}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="response_body" className={LABEL}>
                What you are saying
              </label>
              <textarea id="response_body" name="body" rows={4} required maxLength={4000} className={FIELD} />
            </div>
            <div>
              <PendingButton
                idle="Submit response"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </form>

          <div className="grid gap-3 sm:grid-cols-2">
            <form action={setIssueStatusAction} className={`${CARD} grid gap-2 p-5`}>
              <input type="hidden" name="assignment_id" value={assignmentId} />
              <input type="hidden" name="issue_id" value={issue.issue.id} />
              <input type="hidden" name="status" value="escalated" />
              <input type="hidden" name="next" value={`/projects/${assignmentId}/issues/${issue.issue.id}`} />
              <p className="text-sm font-bold tracking-tight text-slate-900">Escalate to the platform</p>
              <p className="text-xs leading-relaxed text-slate-500">
                Asking for a platform decision does not decide anything by itself; it moves the case to the platform,
                which investigates and closes it.
              </p>
              <PendingButton
                idle="Escalate"
                pending="Escalating…"
                icon={<TriangleAlert aria-hidden="true" className="h-4 w-4" />}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>

            <form action={setIssueStatusAction} className={`${CARD} grid gap-2 p-5`}>
              <input type="hidden" name="assignment_id" value={assignmentId} />
              <input type="hidden" name="issue_id" value={issue.issue.id} />
              <input type="hidden" name="status" value="resolved" />
              <input type="hidden" name="next" value={`/projects/${assignmentId}/issues/${issue.issue.id}`} />
              <p className="text-sm font-bold tracking-tight text-slate-900">Accept the settlement</p>
              <p className="text-xs leading-relaxed text-slate-500">
                {settlementOffered
                  ? 'Resolving lifts the legal hold, which is what lets the payout be requested again.'
                  : 'No settlement has been offered on this case, so there is nothing to accept yet.'}
              </p>
              <input name="resolution" maxLength={2000} placeholder="How it was settled (optional)" className={FIELD} />
              <PendingButton
                idle="Accept settlement resolution"
                pending="Saving…"
                className="inline-flex w-fit items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          This case is {issue.issue.status}. It stays readable as the record of what was raised and how it ended, and
          nothing more can be added to it.
        </p>
      )}

      {issue.canIntervene ? (
        <form action={setIssueStatusAction} className={`${CARD} grid gap-3 p-5`}>
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="issue_id" value={issue.issue.id} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/issues/${issue.issue.id}`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Platform decision</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Investigating and closing are platform actions, recorded as decisions rather than party responses.
              Resolving or closing lifts the legal hold.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="platform_status" className={LABEL}>
                Move to
              </label>
              <select id="platform_status" name="status" required defaultValue="investigation" className={FIELD}>
                <option value="investigation">Under investigation</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label htmlFor="platform_resolution" className={LABEL}>
                Reasoning (needed to resolve or close)
              </label>
              <input id="platform_resolution" name="resolution" maxLength={2000} className={FIELD} />
            </div>
          </div>
          <div>
            <PendingButton
              idle="Record the decision"
              pending="Saving…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </div>
  );
}
