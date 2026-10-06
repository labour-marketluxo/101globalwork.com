import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleSlash,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  ShieldCheck,
  Star,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  approveProjectCompletionAction,
  raiseCompletionDisputeAction,
  requestCompletionCorrectionAction,
  withdrawCompletionDisputeAction,
} from '@/features/customer/completion-actions';
import {
  COMPLETION_FAILURE_COPY,
  completionFailureCode,
  type CompletionCriterion,
  type CompletionEvidence,
  type ProjectCompletion,
} from '@/features/customer/completion';
import { formatMoney } from '@/features/customer/payments';

/**
 * The completion review: what was submitted, what was agreed, and the three answers.
 *
 * ⚠️ THE FINANCIAL CONSEQUENCE IS STATED BEFORE THE BUTTON, NOT AFTER IT. Approving completion is what makes
 * the provider's payout eligible — it is the moment money stops being held. A page that put the amber button
 * first and explained the consequence underneath would be arranging the interface to produce a click.
 *
 * ⚠️ THERE IS NO DEFAULT AND NO TIMEOUT. Nothing on this page approves anything by being visited, and no
 * process anywhere approves on the customer's behalf. The three answers are all explicit submissions.
 */

export function CompletionNotice({
  failed,
  approved,
  corrected,
  disputed,
}: {
  failed?: string;
  approved?: string;
  corrected?: string;
  disputed?: string;
}) {
  const code = completionFailureCode(failed);

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {COMPLETION_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && approved ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Approved. The work is recorded as complete and the payment is no longer held back by your decision —
          the provider is paid from the funds you approved.
        </p>
      ) : null}
      {!code && corrected ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Sent back to the provider. The job is back in progress, nothing was released, and your note is on their
          copy of the work.
        </p>
      ) : null}
      {!code && disputed ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          {disputed === 'withdrawn'
            ? 'Dispute withdrawn. The work is back waiting for your decision, and nothing was released.'
            : 'Recorded. The job is marked as disputed, which stops any payout being released, and the platform team can see it.'}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceItem({ item }: { item: CompletionEvidence }) {
  const icon =
    item.kind === 'photo' ? (
      <ImageIcon aria-hidden="true" className="h-4 w-4" />
    ) : item.kind === 'link' ? (
      <Link2 aria-hidden="true" className="h-4 w-4" />
    ) : (
      <FileText aria-hidden="true" className="h-4 w-4" />
    );

  return (
    <li className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">{item.kind}</p>
          {item.note ? (
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{item.note}</p>
          ) : null}
          {item.externalUrl ? (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className={`${LINK_ARROW} mt-2`}
            >
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              Open what they submitted
            </a>
          ) : null}
          {item.storageObjectPath ? (
            <p className="mt-2 text-xs text-slate-500">
              Stored file: <span className="font-sans">{item.storageObjectPath}</span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-400">
            Submitted{' '}
            {new Date(item.submittedAt).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * The deliverables.
 *
 * ⚠️ AN EMPTY LIST HERE IS DANGEROUS, SO IT IS TREATED AS ONE. If the evidence read failed, the page says so
 * rather than showing "nothing was submitted" — because the next thing on the page is a button that releases
 * money, and approving work nobody can see is the failure this page exists to prevent.
 */
export function DeliverableEvidence({
  evidence,
  unavailable,
}: {
  evidence: CompletionEvidence[];
  unavailable: boolean;
}) {
  return (
    <section aria-labelledby="evidence-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="evidence-heading" className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          What the provider submitted
        </h2>
        <span className={BADGE_SLATE}>
          {unavailable ? 'unavailable' : `${evidence.length} item${evidence.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {unavailable ? (
        <p role="alert" className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          The evidence could not be read just now. That is a read failure, not an empty submission — do not decide
          on this job until the page loads it.
        </p>
      ) : evidence.length === 0 ? (
        <p className="rounded-xl border border-dashed border-solid border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
          Nothing has been submitted. The provider marks the work finished and files their evidence first; until
          they do, there is nothing here to review and nothing to approve.
        </p>
      ) : (
        <ul className="space-y-3">
          {evidence.map(item => (
            <EvidenceItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The agreed criteria, as checkboxes that carry their own key and label when ticked. */
export function CriteriaChecklist({ criteria }: { criteria: CompletionCriterion[] }) {
  return (
    <fieldset className="mt-4">
      <legend className={LABEL}>What you are confirming</legend>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        These are the terms from the quote version you accepted, not a general question about quality. Tick each
        one only if you have checked it against what was actually delivered.
      </p>
      <ul className="space-y-2">
        {criteria.map(criterion => (
          <li key={criterion.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-solid border-slate-200 px-3.5 py-3 transition-colors hover:border-primary">
              <input
                type="checkbox"
                name="criterion"
                value={JSON.stringify({ key: criterion.key, label: criterion.label })}
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="text-sm leading-relaxed text-slate-700">{criterion.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * The decision panel.
 *
 * The three answers are deliberately different shapes: approving is one amber button after a required
 * checklist; sending the work back needs a written reason, because the provider has to act on it; and a dispute
 * is behind a disclosure with its own warning, because it stops the money and is not a message.
 */
export function CompletionDecisionPanel({
  completion,
  criteria,
}: {
  completion: ProjectCompletion;
  criteria: CompletionCriterion[];
}) {
  const { agreement, approval, evidence, awaitingDecision } = completion;
  const funded = agreement.obligation ? agreement.obligation.status === 'funded' : true;
  const hasEvidence = evidence.length > 0;

  if (approval) {
    return (
      <section className={`${CARD} p-5`}>
        <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
          Approved
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          You approved this work on{' '}
          {new Date(approval.approvedAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          . The record of what you confirmed is below.
        </p>
        {approval.acknowledgedCriteria.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {approval.acknowledgedCriteria.map(item => (
              <li key={item.key} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                <ClipboardCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            This approval was recorded before the platform asked for a checklist, so there is no list of confirmed
            items against it.
          </p>
        )}
        {approval.note ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <span className="font-semibold">Your note:</span> {approval.note}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-solid border-slate-200 pt-4">
          <Link href={`/customer/projects/${agreement.assignmentId}/review`} className={LINK_ARROW}>
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            Review this provider <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
          {agreement.obligation ? (
            <Link href={`/customer/payments/${agreement.obligation.id}`} className={LINK_ARROW}>
              Open the payment record
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Your decision
      </h2>

      {!awaitingDecision ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          This job is not waiting for a decision from you right now — its state is{' '}
          <span className="font-semibold">{agreement.requestState.replace(/_/g, ' ')}</span>. The evidence above
          is still the record of what was submitted.
        </p>
      ) : !funded ? (
        <p className="mt-2 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          The payment for this job has not cleared, so there is nothing to release. Approving now would be refused
          — the money has to actually be there first. Check{' '}
          <Link href={`/customer/payments/${agreement.obligation?.id ?? ''}`} className={LINK_ARROW}>
            the payment record
          </Link>
          .
        </p>
      ) : !hasEvidence ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          There is nothing to approve yet. The provider has to mark the work finished and submit evidence before
          this becomes your decision.
        </p>
      ) : (
        <>
          {/* ⚠️ THE CONSEQUENCE, BEFORE THE BUTTON. This is the line that turns a click into a decision. */}
          <div className="mt-3 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              Approving releases the funds you are holding to {agreement.providerName}.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90">
              This is the step that ends the hold
              {agreement.obligation
                ? ` of ${formatMoney(agreement.obligation.amountMinor, agreement.obligation.currencyCode)}`
                : ''}
              . It cannot be undone from here: once the payout has gone out, the only route back is a refund raised
              by the platform team, and that may not be possible at all. If the work is not right, send it back
              instead.
            </p>
          </div>

          <form action={approveProjectCompletionAction} className="mt-4">
            <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
            <CriteriaChecklist criteria={criteria} />
            <div className="mt-4">
              <label className={LABEL} htmlFor="approval-note">
                Anything to record with the approval <span className="font-normal normal-case">(optional)</span>
              </label>
              <textarea
                id="approval-note"
                name="note"
                rows={3}
                maxLength={2000}
                className={FIELD}
                placeholder="e.g. Cleaned up afterwards and left the parts they replaced."
              />
            </div>
            <button
              type="submit"
              className="mt-4 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-sans text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              Approve Work &amp; Release Funds <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              The record stores which of the items above you confirmed, the time, and your note. That record is
              what a dispute would be checked against.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              This step does not ask for a code. The platform does require a one-time email code to sign the
              agreement and to start a payment, and it does not ask for one here: there is no per-project setting
              to turn a second check on, and inventing a number to type would be theatre rather than a control.
              What this approval rests on instead is that it is explicit, that the checklist is attached to it,
              and that the money is already funded and held.
            </p>
          </form>
        </>
      )}

      {awaitingDecision ? (
        <div className="mt-5 space-y-3 border-t border-solid border-slate-200 pt-5">
          <details>
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
              Request a correction — send the work back
            </summary>
            <form action={requestCompletionCorrectionAction} className="mt-3 space-y-3">
              <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
              <div>
                <label className={LABEL} htmlFor="correction-message">
                  What needs putting right?
                </label>
                <textarea
                  id="correction-message"
                  name="message"
                  rows={4}
                  required
                  minLength={10}
                  maxLength={2000}
                  className={FIELD}
                  placeholder="e.g. The second radiator is still cold, and the old unit is still in the yard."
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                The job returns to in progress and your note goes to {agreement.providerName}. Nothing is released,
                and nothing is cancelled — this is the ordinary way to say the work is not finished yet.
              </p>
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
              >
                Send it back
              </button>
            </form>
          </details>

          <details>
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Raise an issue or dispute
            </summary>
            <form action={raiseCompletionDisputeAction} className="mt-3 space-y-3">
              <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
              <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  A dispute is not a message. It marks the job as disputed, which stops any payout being released
                  while it stands, and the platform team can see it. You can withdraw it, and withdrawing puts the
                  work back in front of you for a decision — it does not approve anything.
                </span>
              </p>
              <div>
                <label className={LABEL} htmlFor="dispute-reason">
                  What is wrong?
                </label>
                <textarea
                  id="dispute-reason"
                  name="reason"
                  rows={4}
                  required
                  minLength={10}
                  maxLength={2000}
                  className={FIELD}
                  placeholder="e.g. The unit they fitted is a different model from the one quoted."
                />
              </div>
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
              >
                Open a dispute
              </button>
            </form>
          </details>
        </div>
      ) : null}
    </section>
  );
}

/** The corrections and disputes already on this job, whichever way they went. */
export function CompletionHistory({ completion }: { completion: ProjectCompletion }) {
  const { corrections, disputes } = completion;
  if (corrections.length === 0 && disputes.length === 0) return null;

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        What you have raised on this job
      </h2>

      {corrections.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {corrections.map(correction => (
            <li key={correction.id} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">Correction requested</span>
                <span className={correction.status === 'open' ? BADGE_AMBER : BADGE_SLATE}>{correction.status}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{correction.message}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {new Date(correction.createdAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {disputes.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {disputes.map(dispute => (
            <li key={dispute.id} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">Dispute</span>
                <span className={dispute.status === 'open' ? BADGE_AMBER : BADGE_SLATE}>{dispute.status}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{dispute.reason}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {new Date(dispute.createdAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {dispute.status === 'open' ? (
                <form action={withdrawCompletionDisputeAction} className="mt-2">
                  <input type="hidden" name="assignment_id" value={completion.agreement.assignmentId} />
                  <input type="hidden" name="dispute_id" value={dispute.id} />
                  <button type="submit" className="text-xs font-semibold text-slate-500 underline hover:text-primary">
                    Withdraw this dispute
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
