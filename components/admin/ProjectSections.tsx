import Link from 'next/link';
import { ArrowRight, Ban, CircleCheck, TriangleAlert } from '@/components/ui/icons';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { PROJECT_EXCEPTION_COPY, type ReasonCode } from '@/features/admin/copy';
import type { ProjectJobRow, ProjectOverrideRow, ProjectTimelineEvent } from '@/features/admin/projects';
import { REQUEST_PHASE_COPY, REQUEST_STATE_COPY } from '@/features/requests/state-copy';
import { runProjectOverrideAction } from '@/features/admin/project-actions';
import { formatMoney } from '@/features/provider-workspace/format';

/**
 * The project console's shared pieces.
 *
 * ⚠️ THE ONLY INTERACTIVE CONTROL IN THIS FILE IS THE JOB RETRY, AND IT POSTS TO THE OVERRIDE COMMAND. Every
 * panel here is a read. That is deliberate: a console for investigating projects should be able to grow new
 * panels — evidence counts, change requests, timeline sections — without any of them being able to write.
 */

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className="admin-severity" data-severity={phase === 'exception' ? 'high' : 'low'}>
      {REQUEST_PHASE_COPY[phase] ?? phase}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  const attention = state === 'disputed' || state === 'cancelled';
  return (
    <span className="admin-severity" data-severity={attention ? 'high' : 'low'}>
      {REQUEST_STATE_COPY[state] ?? state.replaceAll('_', ' ')}
    </span>
  );
}

/**
 * The exception tags on one project.
 *
 * ⚠️ EACH TAG IS NAMED, NOT COLOURED. "Financially inconsistent" is not one thing: it is a completed job whose
 * money is still held, or a cancelled job whose money is not, or a payout that landed before completion. An
 * operator triaging the queue needs to know which before opening anything.
 */
export function ExceptionTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return (
      <span className="admin-incident-meta">
        <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
        No exception fired
      </span>
    );
  }
  return (
    <span className="admin-row-actions">
      {tags.map(tag => (
        <span key={tag} className="admin-severity" data-severity="high">
          <TriangleAlert aria-hidden="true" className="h-3 w-3" />
          {PROJECT_EXCEPTION_COPY[tag] ?? tag.replaceAll('_', ' ')}
        </span>
      ))}
    </span>
  );
}

export function TimelineList({ events }: { events: ProjectTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="empty-admin">The audit stream holds no event for this project.</p>;
  }
  return (
    <ul className="admin-session-list">
      {events.map(event => (
        <li key={`${event.action}-${event.occurredAt ?? 'unknown'}-${event.resourceId ?? 'none'}`}>
          <strong>{event.action.replaceAll('_', ' ')}</strong>
          <span>
            {event.actor} ({event.actorType}) · {event.resourceType}
            {event.reasonCode ? ` · ${event.reasonCode.replaceAll('_', ' ')}` : ''}
          </span>
          <small>{event.occurredAt ? new Date(event.occurredAt).toLocaleString('en-GB') : 'time not recorded'}</small>
        </li>
      ))}
    </ul>
  );
}

/**
 * The delivery jobs, each with its own retry.
 *
 * ⚠️ A RETRY CANNOT BE BATCHED, AND THAT IS THE SAFEST SHAPE. Each control names one outbox row, carries its
 * id, and takes its own reason code — so the audit log says which delivery was retried and why, rather than
 * "an operator retried fourteen jobs".
 *
 * ⚠️ THE LIST INCLUDES DELIVERED EVENTS. An operator investigating a project needs to see that a step did
 * happen, and hiding the successful rows would make a working pipeline look like a stalled one.
 */
export function JobList({
  jobs,
  reasons,
  requestId,
  next,
  canOverride,
  stepUpPending,
}: {
  jobs: ProjectJobRow[];
  reasons: ReasonCode[];
  requestId: string;
  next: string;
  canOverride: boolean;
  stepUpPending: boolean;
}) {
  if (jobs.length === 0) {
    return (
      <p className="empty-admin">
        No delivery job is recorded for this project. Domain events are written to the outbox when a command
        changes something; a project that has not moved yet has none.
      </p>
    );
  }

  return (
    <div className="admin-list">
      {jobs.map(job => (
        <article key={job.id}>
          <div>
            <strong>{job.eventType.replaceAll('_', ' ')}</strong>
            <span>
              {job.aggregateType.replaceAll('_', ' ')} · {job.attemptCount} attempt{job.attemptCount === 1 ? '' : 's'}
              {' · '}
              {job.publishedAt
                ? `delivered ${new Date(job.publishedAt).toLocaleString('en-GB')}`
                : job.lastError
                  ? 'undelivered, with a recorded error'
                  : 'undelivered, never attempted'}
            </span>
            {job.lastError ? <span>Last error: {job.lastError}</span> : null}
            <span>Queued {job.occurredAt ? new Date(job.occurredAt).toLocaleString('en-GB') : 'at an unrecorded time'}</span>
          </div>
          {job.publishedAt ? (
            <small>Delivered — nothing to retry</small>
          ) : (
            <form action={runProjectOverrideAction}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="command_key" value="retry_delivery" />
              <input type="hidden" name="target_id" value={job.id} />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel="Retry this delivery"
                triggerClassName="admin-trigger-quiet"
                title={`Retry ${job.eventType.replaceAll('_', ' ')}`}
                description="This clears the attempt count and the recorded error on this one event so the next publisher cycle picks it up again. It does not publish it now, and it cannot undo an effect that already landed downstream."
                confirmLabel="Record the retry"
                confirmClassName="admin-confirm-amber"
                reasons={reasons}
                noteLabel="Why a retry is safe here"
                tone="standard"
                disabled={!canOverride || stepUpPending}
                disabledReason={
                  stepUpPending
                    ? 'Confirm it is you on this session first.'
                    : 'Your role cannot run an override.'
                }
              />
            </form>
          )}
        </article>
      ))}
    </div>
  );
}

export function OverrideHistory({ overrides }: { overrides: ProjectOverrideRow[] }) {
  if (overrides.length === 0) {
    return (
      <p className="empty-admin">
        No override has been run against this project. Everything it has done so far went through a domain
        command.
      </p>
    );
  }
  return (
    <div className="admin-list">
      {overrides.map(override => (
        <article key={override.id}>
          <div>
            <strong>{override.commandKey === 'force_state' ? 'State forced' : 'Delivery retried'}</strong>
            <span>
              {override.commandKey === 'force_state'
                ? `${REQUEST_STATE_COPY[override.fromState ?? ''] ?? override.fromState} → ${REQUEST_STATE_COPY[override.toState ?? ''] ?? override.toState}`
                : `${override.fromDetail ?? 'no detail recorded'} → ${override.toDetail ?? 'no detail recorded'}`}
            </span>
            <span>
              Reason {override.reasonCode.replaceAll('_', ' ')} · reference {override.evidenceReference}
            </span>
            <span>{override.note}</span>
          </div>
          <small>
            {override.executedBy} · {override.executedAt ? new Date(override.executedAt).toLocaleString('en-GB') : 'time not recorded'}
            {override.result === 'no_change' ? ' · no change applied' : ''}
          </small>
        </article>
      ))}
    </div>
  );
}

/**
 * The money chain for one project.
 *
 * ⚠️ IT PRINTS THE LEDGER, NOT A BALANCE. "Linked escrow balances" in the brief is, in this schema, one funded
 * obligation and the ledger entries written against it. Showing a single computed balance would hide whether
 * the money has left — which is the first question an operator asks about a disputed job.
 */
export function MoneySummary({
  money,
}: {
  money: {
    obligationId: string;
    status: string;
    amountMinor: number;
    currencyCode: string;
    payouts: { id: string; status: string; amountMinor: number; currencyCode: string; providerReference: string | null }[];
    refunds: { id: string; status: string; amountMinor: number; reason: string | null }[];
    ledger: { entryCount: number; byAccountKind: Record<string, number>; lastEntryAt: string | null };
  };
}) {
  return (
    <>
      <dl className="admin-facts">
        <div>
          <dt>Obligation</dt>
          <dd>
            {formatMoney(money.amountMinor, money.currencyCode)} · {money.status.replaceAll('_', ' ')}
          </dd>
        </div>
        <div>
          <dt>Ledger entries against it</dt>
          <dd>
            {money.ledger.entryCount}
            {money.ledger.lastEntryAt ? ` · last written ${new Date(money.ledger.lastEntryAt).toLocaleString('en-GB')}` : ''}
          </dd>
        </div>
        {Object.entries(money.ledger.byAccountKind).length > 0 ? (
          <div>
            <dt>Ledger movement by account kind</dt>
            <dd>
              {Object.entries(money.ledger.byAccountKind)
                .map(([kind, total]) => `${kind}: ${formatMoney(total, money.currencyCode)}`)
                .join(' · ')}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Payouts</dt>
          <dd>
            {money.payouts.length === 0
              ? 'None raised'
              : money.payouts
                  .map(payout => `${formatMoney(payout.amountMinor, payout.currencyCode)} ${payout.status.replaceAll('_', ' ')}`)
                  .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>
            {money.refunds.length === 0
              ? 'None recorded'
              : money.refunds
                  // A refund carries no currency of its own: it is denominated in the obligation's, which is
                  // the only currency this project's money has ever been in.
                  .map(refund => `${formatMoney(refund.amountMinor, money.currencyCode)} ${refund.status.replaceAll('_', ' ')}`)
                  .join(' · ')}
          </dd>
        </div>
      </dl>
      <p className="admin-row-actions">
        <Link className="text-button" href={`/admin/money/${money.obligationId}`}>
          Open the financial record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
      <p className="admin-incident-meta">
        The financial console is where money is moved. Nothing on this page can fund, release or refund
        anything — an override moves a state or resets a delivery, and the record above is what tells you
        whether those two now agree.
      </p>
    </>
  );
}

/** The states this request could legally move to right now, and the ones it could not. */
export function TransitionReference({ legalTransitions, currentState }: { legalTransitions: Record<string, string[]>; currentState: string }) {
  const legal = legalTransitions[currentState] ?? [];
  return (
    <dl className="admin-facts">
      <div>
        <dt>Legal from {REQUEST_STATE_COPY[currentState] ?? currentState}</dt>
        <dd>
          {legal.length === 0
            ? 'None — this is a terminal state for the domain commands, which is exactly when an override is worth considering.'
            : legal.map(state => REQUEST_STATE_COPY[state] ?? state).join(', ')}
        </dd>
      </div>
      <div>
        <dt>Everything else</dt>
        <dd>
          Any other state can only be reached by an override, which is what the control below is for. The
          domain commands will keep refusing those moves.
        </dd>
      </div>
    </dl>
  );
}

export function NoOverrideAccess({ reason }: { reason: string }) {
  return (
    <p className="admin-control-unavailable">
      <Ban aria-hidden="true" className="h-4 w-4" />
      Overrides are not available to your role
      <span className="admin-control-unavailable-why">{reason}</span>
    </p>
  );
}
