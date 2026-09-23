import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FileWarning,
  MapPin,
  MessageSquare,
  NotepadText,
  Plus,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { PendingButton } from '@/components/provider/ProviderControls';
import { BlockerControls, TaskStepControls } from '@/components/provider/WorkStatusActions';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { formatDayLabel, formatMoney, formatWindow } from '@/features/provider-workspace/format';
import type { AssignmentDetail } from '@/features/provider-workspace/work';
import { BLOCKER_REASON_COPY, FIELD_STATE_COPY, initialsOf, paymentIndicator } from '@/features/provider-workspace/work';
import type { ProviderQuote } from '@/features/provider-workspace/quotes';
import type { ProviderMessage } from '@/features/quotes/messages';
import {
  addTaskStepAction,
  removeTaskStepAction,
  sendQuoteMessageAction,
} from '@/features/provider-workspace/actions';

/**
 * The field workspace: one job, everything about it, and the controls a provider uses standing on site.
 *
 * ⚠️ WHAT IS HERE IS WHAT THE PLATFORM ACTUALLY HAS, AND THE GAPS ARE NAMED WHERE THEY WOULD BE NEEDED:
 *
 *   • "Site directions" are the customer's own landmark and access notes plus the area. There is no street
 *     address in this schema for either party, and the panel says so rather than showing an empty map.
 *   • "Customer contact" is the message thread. The platform gives a provider no phone number or email — that
 *     is a decision made in SQL, and the panel explains where the customer's messages actually arrive.
 *   • "Safety requirements" are the customer's hazard flag and the provider's own credentials. There is no
 *     per-trade safety model, so nothing here pretends to be a checklist the platform enforces.
 *
 * The panels that DO have data behind them — the agreed scope from the accepted quote, the checklist, the
 * evidence count, the blocker — are not summaries: they read the same rows the rest of the platform reads.
 */

export function AssignmentHeader({
  detail,
  now,
  pill,
}: {
  detail: AssignmentDetail;
  now: Date;
  pill: { label: string; tone: 'teal' | 'amber' | 'slate' };
}) {
  const initials = initialsOf(detail.customer.displayName);
  const dayLabel = formatDayLabel(detail.schedule?.scheduledStart ?? null, now);
  const window = formatWindow(
    detail.schedule?.scheduledStart ?? null,
    detail.schedule?.scheduledEnd ?? null,
    detail.schedule?.timezone ?? null,
  );
  const payment = paymentIndicator({
    obligationStatus: detail.obligation?.status ?? null,
    amountMinor: detail.obligation?.amountMinor ?? null,
    currencyCode: detail.obligation?.currencyCode ?? null,
    requestState: detail.request.state,
    assignmentStatus: detail.assignment.status,
    openBlockerReason: detail.blocker?.reasonCode ?? null,
    correctionOpen: Boolean(detail.correction),
    fieldState: detail.assignment.fieldState,
    fieldStateAt: detail.assignment.fieldStateAt,
    assignedAt: detail.assignment.assignedAt,
    endedAt: detail.assignment.endedAt,
    confirmedAt: detail.schedule?.confirmedAt ?? null,
    needText: detail.request.needText,
    urgency: detail.request.urgency,
    requestId: detail.request.id,
    assignmentId: detail.assignment.id,
    scheduleStatus: detail.schedule?.status ?? 'unscheduled',
    scheduleTimezone: detail.schedule?.timezone ?? null,
    scheduledStart: detail.schedule?.scheduledStart ?? null,
    scheduledEnd: detail.schedule?.scheduledEnd ?? null,
    approvedAt: detail.approvedAt,
    evidenceCount: detail.evidence.length,
    stepsTotal: detail.steps.length,
    stepsDone: detail.steps.filter(step => step.state === 'done').length,
    locationName: detail.request.locationName,
    cityName: detail.request.cityName,
    serviceName: detail.request.serviceName,
    customerDisplayName: detail.customer.displayName,
  });

  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Assigned work</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {detail.request.needText}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
              {dayLabel && window ? `${dayLabel}, ${window}` : dayLabel ?? 'No time agreed yet'}
            </span>
            {detail.request.locationName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {[detail.request.locationName, detail.request.cityName].filter(Boolean).join(', ')}
              </span>
            ) : null}
            {detail.assignment.fieldState ? (
              <span className={BADGE_SLATE}>
                {FIELD_STATE_COPY[detail.assignment.fieldState] ?? detail.assignment.fieldState}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              pill.tone === 'teal'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
                : pill.tone === 'amber'
                  ? BADGE_AMBER
                  : BADGE_SLATE
            }
          >
            {pill.label}
          </span>
          <span className={payment.tone === 'amber' ? BADGE_AMBER : BADGE_SLATE} title={payment.note}>
            {payment.label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-xs font-bold text-primary"
          >
            {initials ?? '—'}
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {detail.customer.displayName ?? 'Customer name not on file'}
            <span className="block text-xs font-normal text-slate-500">
              {detail.customer.hasPhoto ? '' : 'No photograph on file — the platform holds none.'}
            </span>
          </span>
        </span>

        {detail.obligation ? (
          <span className="text-xs text-slate-500">
            {formatMoney(detail.obligation.amountMinor, detail.obligation.currencyCode)} · payment{' '}
            {detail.obligation.status.replaceAll('_', ' ')}
          </span>
        ) : (
          <span className="text-xs text-slate-500">No payment obligation on this job.</span>
        )}
      </div>
    </header>
  );
}

/**
 * The agreed scope: the accepted quote, whole.
 *
 * ⚠️ THIS IS THE CONTRACT, NOT A RESTATEMENT OF IT. The line items, the exclusions and the warranty are the
 * columns of the version the customer accepted and signed for — the same rows the agreement's fingerprint was
 * taken from. A provider who wants to know what they agreed to reads it here rather than from memory.
 */
export function AgreedScopePanel({ quote }: { quote: ProviderQuote | null }) {
  if (!quote) {
    return (
      <section className={`${CARD} p-5`} aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Agreed scope
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          The accepted quote for this job could not be read. The work is still assigned; ask the customer to
          confirm anything you are unsure about before you begin.
        </p>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="scope-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="scope-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <NotepadText aria-hidden="true" className="h-4 w-4 text-primary" />
          Agreed scope
        </h2>
        <span className={BADGE_SLATE}>Accepted {quote.version}</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">
        {quote.summary?.trim() || 'The customer accepted a price with no written description.'}
      </p>

      {quote.lineItems.length > 0 ? (
        <dl className="mt-4 grid gap-1.5">
          {quote.lineItems.map(item => (
            <div key={`${item.label}:${item.amountMinor}`} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5 text-sm">
              <dt className="text-slate-700">{item.label}</dt>
              <dd className="font-mono text-slate-800">{formatMoney(item.amountMinor, quote.currencyCode)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-1 text-sm font-bold">
            <dt className="text-slate-900">Total, including taxes and fees</dt>
            <dd className="font-mono text-slate-900">{formatMoney(quote.totalMinor, quote.currencyCode)}</dd>
          </div>
        </dl>
      ) : null}

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Not covered</dt>
          <dd className="mt-0.5 text-slate-700">{quote.exclusions ?? 'Nothing stated as excluded'}</dd>
        </div>
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Warranty offered</dt>
          <dd className="mt-0.5 text-slate-700">{quote.warrantyTerms ?? 'None stated'}</dd>
        </div>
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Timeline</dt>
          <dd className="mt-0.5 text-slate-700">
            {quote.timelineDays ? `${quote.timelineDays} working day${quote.timelineDays === 1 ? '' : 's'}` : 'Not stated'}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Work outside this scope is a change to the agreement, not extra work — say so before you do it. The
        customer&apos;s copy of these terms is what they signed.
      </p>
    </section>
  );
}

/** Where the job is, in the customer's own words, and what the platform does not hold. */
export function SitePanel({ detail }: { detail: AssignmentDetail }) {
  const hasNotes = Boolean(detail.site.landmark || detail.site.accessNotes || detail.site.areaText);
  return (
    <section className={`${CARD} p-5`} aria-labelledby="site-heading">
      <h2 id="site-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <MapPin aria-hidden="true" className="h-4 w-4 text-primary" />
        Finding the site
      </h2>

      {hasNotes ? (
        <dl className="mt-3 grid gap-3 text-xs">
          {detail.site.landmark ? (
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Landmark</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{detail.site.landmark}</dd>
            </div>
          ) : null}
          {detail.site.accessNotes ? (
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Getting in</dt>
              <dd className="mt-0.5 text-sm whitespace-pre-line text-slate-700">{detail.site.accessNotes}</dd>
            </div>
          ) : null}
          {detail.site.areaText ? (
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Area as they described it</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{detail.site.areaText}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          The customer gave no landmark or access notes. The area above is everything the platform holds.
        </p>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
        <FileWarning aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          There is no street address here because the platform never asked for one — from either of you. The area,
          the landmark and these notes are the whole of it, so agree the exact place in the message thread before
          you set off if it is ambiguous.
        </span>
      </p>
    </section>
  );
}

/**
 * Safety, as far as the platform can speak to it.
 *
 * ⚠️ THERE IS NO SAFETY MODEL IN THIS SCHEMA, AND THIS PANEL DOES NOT INVENT ONE. What exists is the customer's
 * hazard flag on the request scope and the provider's own credentials. Both are shown; a "safety checklist"
 * with invented items would be worse than none, because a provider would treat it as the platform's word.
 */
export function SafetyPanel({ detail }: { detail: AssignmentDetail }) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="safety-heading">
      <h2 id="safety-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <ShieldAlert aria-hidden="true" className="h-4 w-4 text-primary" />
        Safety, and what the platform knows about it
      </h2>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {detail.site.hazardous
          ? 'The customer flagged this job as hazardous when they described it.'
          : 'The customer did not flag this job as hazardous.'}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        This platform has no safety checklist and no per-trade safety requirements, and it will not show you one it
        made up. Your own credentials are the platform&apos;s record of what you are qualified to do — if a licence
        matters for this job, make sure it is on file, because your customers see a count of verified ones.
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-4">
        <Link href={PROVIDER_PATHS.credentials} className={LINK_ARROW}>
          Your credentials
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <Link href="/trust-and-safety" className={LINK_ARROW}>
          What the platform does about safety
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}

/** The agreed work as a list the provider ticks off. Their own plan, not the customer's scope. */
export function ChecklistPanel({
  detail,
  nextPath,
}: {
  detail: AssignmentDetail;
  nextPath: string;
}) {
  const done = detail.steps.filter(step => step.state === 'done').length;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="checklist-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="checklist-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <ClipboardList aria-hidden="true" className="h-4 w-4 text-primary" />
          Your checklist
        </h2>
        {detail.steps.length > 0 ? <span className={BADGE_SLATE}>{done}/{detail.steps.length} done</span> : null}
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        This is your own plan for the job — the platform does not require it, and the customer never sees it. Write
        down what has to happen, and tick it off as you go: on a phone that has gone offline, the ticks queue.
      </p>

      {detail.steps.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Nothing written down yet. Two or three steps is usually enough for a site visit.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {detail.steps.map(step => (
            <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
              <span className="min-w-0">
                <span className={`text-sm ${step.state === 'done' ? 'text-slate-400 line-through' : 'font-semibold text-slate-800'}`}>
                  {step.ordinal}. {step.label}
                </span>
                {step.note ? <span className="mt-0.5 block text-xs text-slate-500">{step.note}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <TaskStepControls
                  assignmentId={detail.assignment.id}
                  stepId={step.id}
                  state={step.state}
                  nextPath={nextPath}
                />
                <form action={removeTaskStepAction}>
                  <input type="hidden" name="step_id" value={step.id} />
                  <input type="hidden" name="next" value={nextPath} />
                  <PendingButton
                    idle="Remove"
                    pending="Removing…"
                    className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </form>
              </span>
            </li>
          ))}
        </ol>
      )}

      {detail.assignment.status === 'active' ? (
        <form action={addTaskStepAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-solid border-slate-200 pt-4">
          <input type="hidden" name="assignment_id" value={detail.assignment.id} />
          <input type="hidden" name="next" value={nextPath} />
          <div className="min-w-0 flex-1">
            <label htmlFor="step_label" className={LABEL}>
              Add a step
            </label>
            <input
              id="step_label"
              name="label"
              required
              minLength={2}
              maxLength={200}
              placeholder="e.g. Isolate the water and check the joint"
              className={FIELD}
            />
          </div>
          <PendingButton
            idle="Add step"
            pending="Adding…"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      ) : null}
    </section>
  );
}

/** Blocked, or not. The one thing on this page that both sides can see. */
export function BlockerPanel({ detail, nextPath }: { detail: AssignmentDetail; nextPath: string }) {
  return (
    <section
      className={`${CARD} p-5 ${detail.blocker ? 'border-secondary bg-secondary-light' : ''}`}
      aria-labelledby="blocker-heading"
    >
      <h2 id="blocker-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <TriangleAlert aria-hidden="true" className={`h-4 w-4 ${detail.blocker ? 'text-amber-700' : 'text-primary'}`} />
        {detail.blocker ? 'This job is stopped' : 'Pause this job'}
      </h2>

      {detail.blocker ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-900">
          {BLOCKER_REASON_COPY[detail.blocker.reasonCode] ?? detail.blocker.reasonCode}
          {detail.blocker.openedAt
            ? ` · since ${new Date(detail.blocker.openedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : ''}
          {detail.blocker.note ? ` · ${detail.blocker.note}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Recording a blocker tells the customer their job has stopped, with a reason. It does not cancel anything
          and it does not change the work state — resume it when the problem is gone.
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        The customer can see that the job is stopped and why. Only you can resume it.
      </p>

      {detail.assignment.status === 'active' ? (
        <BlockerControls
          assignmentId={detail.assignment.id}
          blockerId={detail.blocker?.id ?? null}
          blocked={Boolean(detail.blocker)}
          nextPath={nextPath}
        />
      ) : null}
    </section>
  );
}

/** Work sent back with a reason: the provider's most urgent thing to read. */
export function CorrectionPanel({ detail }: { detail: AssignmentDetail }) {
  if (!detail.correction) return null;
  return (
    <section className="rounded-2xl border border-solid border-secondary bg-secondary-light p-5" aria-labelledby="correction-heading">
      <h2 id="correction-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-amber-900">
        <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-800" />
        The customer sent this work back
      </h2>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-amber-900">{detail.correction.message}</p>
      <p className="mt-2 text-xs leading-relaxed text-amber-900">
        {detail.correction.createdAt
          ? `Asked on ${new Date(detail.correction.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. `
          : ''}
        The job is back in your hands: fix what they raised, then submit evidence again from the evidence page.
      </p>
    </section>
  );
}

/**
 * The thread.
 *
 * ⚠️ THIS IS THE CUSTOMER CONTACT CHANNEL, AND IT IS THE ONLY ONE. The platform gives a provider no phone number
 * and no email address; what it gives is a record both sides can see. The panel says that where a "call the
 * customer" button would otherwise sit.
 */
export function ThreadPanel({
  messages,
  providerId,
  requestId,
  nextPath,
}: {
  messages: ProviderMessage[];
  providerId: string;
  requestId: string;
  nextPath: string;
}) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="thread-heading">
      <h2 id="thread-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <MessageSquare aria-hidden="true" className="h-4 w-4 text-primary" />
        Messages with the customer
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        The platform does not release phone numbers or email addresses in either direction. This thread is how you
        reach them, and it is the record of what was agreed in conversation — a promise made by phone is not part of
        the agreement.
      </p>

      {messages.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Nothing sent yet on this request. If access, timing or scope is unclear, ask here before you travel.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {messages.map(message => (
            <li key={message.id} className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5">
              <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">You</p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{message.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {message.createdAt ? new Date(message.createdAt).toLocaleString('en-GB') : 'Date not recorded'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form action={sendQuoteMessageAction} className="mt-4 grid gap-2 border-t border-solid border-slate-200 pt-4">
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="quote_id" value="" />
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="assignment_message" className={LABEL}>
          Send a message
        </label>
        <textarea
          id="assignment_message"
          name="message"
          rows={3}
          required
          minLength={2}
          maxLength={2000}
          placeholder="e.g. I am 20 minutes away and the gate is locked — can somebody let me in?"
          className={FIELD}
        />
        <div>
          <PendingButton
            idle="Send message"
            pending="Sending…"
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>
    </section>
  );
}

/** What has been submitted for this job, and the way to add more. */
export function EvidenceSummaryPanel({ detail, nextPath }: { detail: AssignmentDetail; nextPath: string }) {
  const stepLabel = new Map(detail.steps.map(step => [step.id, step.label]));
  return (
    <section className={`${CARD} p-5`} aria-labelledby="evidence-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="evidence-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Evidence submitted
        </h2>
        <span className={detail.evidence.length > 0 ? BADGE_SLATE : BADGE_AMBER}>
          {detail.evidence.length === 0 ? 'Nothing yet' : `${detail.evidence.length} item${detail.evidence.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {detail.evidence.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Completion needs proof: photographs, a note, a document or a link. Submit them from the evidence page,
          which is built to work on a weak connection.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 text-xs">
          {detail.evidence.slice(0, 8).map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
              <span className="text-slate-700">
                <strong className="font-semibold">{item.kind}</strong>
                {item.taskStepId && stepLabel.get(item.taskStepId) ? ` · ${stepLabel.get(item.taskStepId)}` : ''}
                {item.note ? ` · ${item.note}` : ''}
                {!item.note && !item.storagePath && item.externalUrl ? ` · ${item.externalUrl}` : ''}
              </span>
              <span className="text-slate-400">
                {item.submittedAt
                  ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {detail.assignment.status === 'active' ? (
        <p className="mt-4 border-t border-solid border-slate-200 pt-4">
          <Link href={`${nextPath}/evidence`} className={LINK_ARROW}>
            {detail.request.state === 'in_progress' ? 'Capture and submit evidence' : 'Open the evidence page'}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </p>
      ) : null}
    </section>
  );
}
