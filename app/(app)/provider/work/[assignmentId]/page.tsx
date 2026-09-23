import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LINK_ARROW } from '@/components/discovery/tokens';
import {
  AgreedScopePanel,
  AssignmentHeader,
  BlockerPanel,
  ChecklistPanel,
  CorrectionPanel,
  EvidenceSummaryPanel,
  SafetyPanel,
  SitePanel,
  ThreadPanel,
} from '@/components/provider/AssignmentSections';
import { PendingButton } from '@/components/provider/ProviderControls';
import { OfflineSyncStatus, WorkStatusActions } from '@/components/provider/WorkStatusActions';
import { WorkspaceNotice, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';
import { getAssignmentDetail, paymentIndicator, workPath, workRowFromDetail, workStatusPill } from '@/features/provider-workspace/work';
import { getProviderRequestQuotes } from '@/features/provider-workspace/quotes';
import { getProviderMessages } from '@/features/quotes/messages';
import { scheduleAssignmentAction } from '@/features/provider-workspace/actions';

/**
 * /provider/work/[assignmentId] — the field workspace.
 *
 * ⚠️ THIS SUPERSEDES /provider/assignments/[id], WHICH NOW REDIRECTS HERE. The old page read `requests` directly
 * — a table providers have no read policy on — so it 404'd for the very provider doing the work. Every read here
 * goes through a command that re-checks the provider's own assignment.
 *
 * ⚠️ THE STATUS ACTIONS ARE IDEMPOTENT AND QUEUEABLE, WHICH IS WHY THEY ARE CLIENT COMPONENTS. Field checkpoints
 * upsert; starting work is confirmed against the authoritative state when the command refuses; a checklist step
 * is set to a NAMED state rather than toggled. That is what makes replaying a queue safe on a phone that lost
 * signal halfway through a site visit — see components/provider/WorkStatusActions.tsx.
 */
export const metadata: Metadata = {
  title: 'Job',
  description: 'The work you are on, and what is left of it.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  failed?: string;
  scheduled?: string;
  accepted?: string;
  blocked?: string;
  step?: string;
  messaged?: string;
  submitted?: string;
}>;

export default async function ProviderAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: SearchParams;
}) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) notFound();

  const { detail, unavailable } = await getAssignmentDetail(provider.id, assignmentId);
  if (unavailable) {
    return (
      <div className="grid gap-6">
        <WorkspaceUnavailable what="This job" />
      </div>
    );
  }
  if (!detail) notFound();

  const now = new Date();
  const [quotes, messages] = await Promise.all([
    getProviderRequestQuotes(provider.id, detail.request.id),
    getProviderMessages(detail.request.id),
  ]);
  const acceptedQuote = quotes.find(quote => quote.status === 'accepted') ?? null;
  const row = workRowFromDetail(detail);
  const pill = workStatusPill(row);
  const payment = paymentIndicator(row);
  const nextPath = workPath(detail.assignment.id);
  const failure = providerFailureCode(query.failed);
  // The same rule `start_assignment_command` enforces: funded, or nothing to fund.
  const startAllowed = detail.obligation === null || detail.obligation.status === 'funded';

  return (
    <div className="grid gap-6">
      <nav aria-label="Job" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={PROVIDER_PATHS.work} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          All your jobs
        </Link>
        {/* The shared workspace: the same assignment as a plan both parties can see. This page stays the field
            tool — checkpoints, evidence, blockers — and the project view is where the plan and the conversation
            live. */}
        <span className="text-slate-300" aria-hidden="true">
          /
        </span>
        <Link href={`/projects/${detail.assignment.id}`} className={LINK_ARROW}>
          Shared project view
        </Link>
      </nav>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {query.scheduled === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Time saved.">
          <p>The customer has been asked to confirm it. Scheduling does not bypass funding for paid work.</p>
        </WorkspaceNotice>
      ) : null}
      {query.accepted === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Their proposed time is now the booking.">
          <p>
            It went through the ordinary schedule rules, so the confirmation on the booking was reset — the time
            they confirmed is no longer the time on the job.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.step === 'added' ? (
        <WorkspaceNotice tone="teal" role="status" title="Step added.">
          <p>Your checklist is private to you, and it travels with the job.</p>
        </WorkspaceNotice>
      ) : null}
      {query.messaged === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Message sent.">
          <p>It appears on the customer&apos;s copy of this request.</p>
        </WorkspaceNotice>
      ) : null}
      {query.submitted === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Submitted for sign-off.">
          <p>Your evidence package and note went to the customer. Nothing is paid until they approve it.</p>
        </WorkspaceNotice>
      ) : null}

      <AssignmentHeader detail={detail} now={now} pill={pill} />
      <OfflineSyncStatus />
      <CorrectionPanel detail={detail} />

      {detail.assignment.status === 'active' ? (
        <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
          <WorkStatusActions
            assignmentId={detail.assignment.id}
            requestState={detail.request.state}
            fieldState={detail.assignment.fieldState}
            startAllowed={startAllowed}
            blocked={Boolean(detail.blocker)}
            nextPath={nextPath}
          />
        </section>
      ) : (
        <WorkspaceNotice tone="slate" role="status" title="This job is closed.">
          <p>
            {detail.approvedAt
              ? `The customer approved the work on ${new Date(detail.approvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'It is no longer active, so its checklist and field actions are closed.'}
          </p>
        </WorkspaceNotice>
      )}

      {detail.request.state === 'accepted' ? (
        <form action={scheduleAssignmentAction} className="grid gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="assignment_id" value={detail.assignment.id} />
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Agree a time</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Work cannot start until a time is agreed with the customer. Scheduling reserves the slot; it does not
              bypass the payment gate for paid work.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="scheduled_start" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Start
              </label>
              <input
                id="scheduled_start"
                name="scheduled_start"
                type="datetime-local"
                required
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="scheduled_end" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Expected finish (optional)
              </label>
              <input
                id="scheduled_end"
                name="scheduled_end"
                type="datetime-local"
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="timezone" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Timezone
              </label>
              <input
                id="timezone"
                name="timezone"
                required
                defaultValue={detail.request.timezone ?? 'Africa/Lagos'}
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="schedule_note" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Note for the customer (optional)
              </label>
              <input
                id="schedule_note"
                name="note"
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              />
            </div>
          </div>
          {/*
            ⚠️ THE BLACKOUT OVERRIDE IS ON THE FORM, NOT IN THE SCHEDULE COMMAND. A blackout is the provider's own
            rule — see /provider/availability — so the action refuses a date inside one and this checkbox is how
            somebody who really does mean to work that week says so.
          */}
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input name="allow_blackout" type="checkbox" value="1" className="mt-0.5" />
            <span>
              Book it even if it falls in one of my blackout dates.
              <span className="block text-slate-500">
                You set those windows on your availability page; without this, the platform refuses the date.
              </span>
            </span>
          </label>
          <div>
            <PendingButton
              idle="Save this time"
              pending="Saving…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}

      {detail.schedule ? (
        <WorkspaceNotice tone={detail.schedule.confirmedAt ? 'teal' : 'slate'} role="status" title="The appointment">
          <p>
            {detail.schedule.scheduledStart
              ? new Date(detail.schedule.scheduledStart).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'No time'}
            {detail.schedule.scheduledEnd
              ? ` to ${new Date(detail.schedule.scheduledEnd).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : ''}{' '}
            ({detail.schedule.timezone})
            {detail.schedule.note ? ` · ${detail.schedule.note}` : ''}
          </p>
          <p className="mt-1">
            {detail.schedule.status === 'confirmed' && detail.schedule.confirmedAt
              ? `The customer confirmed this on ${new Date(detail.schedule.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`
              : detail.schedule.status === 'rescheduled'
                ? 'You moved this after it was confirmed, so the customer needs to confirm the new time.'
                : 'Waiting for the customer to confirm this time.'}
          </p>
        </WorkspaceNotice>
      ) : null}

      <AgreedScopePanel quote={acceptedQuote} />
      <ChecklistPanel detail={detail} nextPath={nextPath} />
      <SitePanel detail={detail} />
      <SafetyPanel detail={detail} />
      <BlockerPanel detail={detail} nextPath={nextPath} />
      <ThreadPanel messages={messages} providerId={provider.id} requestId={detail.request.id} nextPath={nextPath} />
      <EvidenceSummaryPanel detail={detail} nextPath={nextPath} />
      <p className="text-xs leading-relaxed text-slate-500">{payment.note}</p>
    </div>
  );
}
