import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Ban, ShieldAlert } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import {
  ExceptionTags,
  JobList,
  MoneySummary,
  NoOverrideAccess,
  OverrideHistory,
  PhaseBadge,
  StateBadge,
  TimelineList,
  TransitionReference,
} from '@/components/admin/ProjectSections';
import { adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getProjectDiagnostics } from '@/features/admin/projects';
import { escalateProjectToDisputeAction, runProjectOverrideAction } from '@/features/admin/project-actions';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { REQUEST_STATE_COPY } from '@/features/requests/state-copy';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Project diagnostics', robots: { index: false, follow: false } };

/**
 * /admin/projects/[projectId] — diagnostics and the override console.
 *
 * ⚠️ ZERO DIRECT MUTATION, AND THE PAGE SHOWS THE RULE RATHER THAN ASSERTING IT. Every control here is a form
 * that posts to `run_project_override_command` (force a state transition, retry one delivery) or to the trust
 * case command (escalate). There is no editable field on this page, no inline patch, and no generic "run a
 * command" box: the allow-list is those two overrides, and the database refuses anything else by key.
 *
 * ⚠️ AN OVERRIDE NEEDS FOUR THINGS, ALL ENFORCED IN SQL: a second factor on the session, a reason code from the
 * operator vocabulary, a note, and a support-ticket or case reference. The form collects all four because the
 * command will refuse without them — and the refusal is what makes "mandatory reason logging" a fact rather
 * than a habit.
 *
 * ⚠️ WHAT AN OVERRIDE DOES NOT DO IS SAID ON THE PAGE. Forcing a state moves the state machine; it does not
 * fund, release, refund, notify or close anything, and the money section beside it is what tells an operator
 * whether the two now agree.
 */
export default async function ProjectDiagnosticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    failed?: string;
    step_up?: string;
    overridden?: string;
    command?: string;
    to?: string;
    escalated?: string;
  }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  const [context, diagnostics, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getProjectDiagnostics(projectId),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (!diagnostics.allowed) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>
            Project diagnostics are behind the platform projects capability. Nothing has changed, and nothing
            here is broken.
          </p>
        </section>
      </div>
    );
  }
  if (diagnostics.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>That project could not be loaded</h1>
          <p>Nothing has changed. Reload the page to try again.</p>
        </section>
      </div>
    );
  }
  if (!diagnostics.found) notFound();

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = Boolean(hasFactor && levels?.currentLevel !== 'aal2');
  const canOverride = Boolean(context?.has('platform.projects.intervene') || context?.has('platform.admin.manage'));
  // ⚠️ ESCALATION IS A TRUST-CAPABILITY ACTION, NOT A PROJECT ONE. It opens a case, and the case commands
  // require trust verify, trust moderate or administration — an operator with only the projects intervene
  // capability would otherwise be shown a control the database refuses.
  const canEscalate = Boolean(
    context?.has('platform.trust.verify') || context?.has('platform.trust.moderate') || context?.has('platform.admin.manage'),
  );
  const failure = adminFailureCopy(query.failed);
  const next = `/admin/projects/${projectId}`;
  const blockedTasks = diagnostics.stages.flatMap(stage => stage.tasks).filter(task => task.status === 'blocked');

  const exceptions = [
    ...(diagnostics.issues.some(issue => issue.legalHold) ? ['legal_hold'] : []),
    ...(diagnostics.issues.some(issue => ['open', 'investigation', 'escalated'].includes(issue.status)) ? ['open_issue'] : []),
    ...(blockedTasks.length > 0 ? ['blocked_task'] : []),
    ...(diagnostics.project.state === 'disputed' ? ['disputed'] : []),
  ];

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Projects · diagnostics</p>
          <h1>{diagnostics.project.title}</h1>
          <p>
            {diagnostics.project.marketName ?? 'No market recorded'}
            {diagnostics.project.marketCode ? ` (${diagnostics.project.marketCode})` : ''}
            {' · '}
            {diagnostics.project.serviceName ?? 'category not recorded'}
            {' · '}
            {diagnostics.project.locationName ?? 'location not recorded'}
            {' · '}
            {projectId.slice(0, 8)}
          </p>
        </div>
        <div className="admin-row-actions">
          <StateBadge state={diagnostics.project.state} />
          <PhaseBadge phase={
            ['draft', 'submitted', 'matching', 'quoted'].includes(diagnostics.project.state)
              ? 'pre_work'
              : ['accepted', 'scheduled', 'in_progress', 'submitted_for_approval'].includes(diagnostics.project.state)
                ? 'contracted'
                : diagnostics.project.state === 'completed'
                  ? 'closed'
                  : diagnostics.project.state === 'cancelled'
                    ? 'cancelled'
                    : 'exception'
          } />
          <Link className="secondary-button" href="/admin/projects">Back to the directory</Link>
        </div>
      </header>

      <p className="admin-reveal-warning" role="note">
        <Ban aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Nothing on this page edits the database directly. Interventions run as backend commands with a second
          factor, a reason code, a note and a support reference — and each one is written to
          <code> platform_project_overrides </code> and to the audit stream before the page reloads.
        </span>
      </p>

      {exceptions.length > 0 ? (
        <p className="admin-incident-meta">
          <ExceptionTags tags={exceptions} />
        </p>
      ) : null}

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not run.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {query.step_up === '1' ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Try the command again — nothing was saved by
          the attempt that was refused.
        </p>
      ) : null}

      {query.overridden ? (
        <p className="notice" role="status">
          {query.command === 'force_state'
            ? `State forced to ${REQUEST_STATE_COPY[query.to ?? ''] ?? query.to ?? 'the requested state'}. The override moved the state and nothing else — no money, no notification and no stage work. The money section below shows whether the record now agrees with itself.`
            : 'Delivery retry recorded. The attempt count and the last error on that event are cleared, and the next publisher cycle will pick it up again.'}
        </p>
      ) : null}

      {query.escalated ? (
        <p className="notice" role="status">
          Dispute opened as a trust case about this project.{' '}
          <Link href="/admin/trust/cases">Open the case queue</Link> to assign it and, if the money should be
          frozen, to place a legal hold — that is a separate, deliberate action.
        </p>
      ) : null}

      {stepUpPending ? (
        <p className="notice" role="alert">
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          <strong> This session has not passed your second factor.</strong> Overrides need one.{' '}
          <Link href={`/auth/challenge?redirect=${encodeURIComponent(`${next}?step_up=1`)}`}>Confirm it is you</Link>{' '}
          and come back.
        </p>
      ) : !hasFactor && canOverride ? (
        <p className="notice" role="status">
          Your account has no authenticator enrolled, so no override can be run from this session. Enrol one at{' '}
          <Link href={`/account/security?next=${encodeURIComponent(next)}`}>account security</Link> if running
          project overrides is part of your role.
        </p>
      ) : null}

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>The project</h2>
              <p>Who commissioned it, who is doing it, and where it is.</p>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Customer</dt>
              <dd>
                {diagnostics.customer.name}
                {diagnostics.customer.contactMasked ? ` · ${diagnostics.customer.contactMasked}` : ''}
                {diagnostics.customer.accountStatus ? ` · ${diagnostics.customer.accountStatus.replaceAll('_', ' ')}` : ''}
              </dd>
            </div>
            <div>
              <dt>Commissioned by</dt>
              <dd>{diagnostics.project.organisationName ?? 'A personal customer account'}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>
                {diagnostics.provider
                  ? `${diagnostics.provider.name} · ${diagnostics.provider.status.replaceAll('_', ' ')} · assignment ${diagnostics.provider.assignmentStatus.replaceAll('_', ' ')}`
                  : 'Not assigned — this project has no active provider'}
              </dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>
                {diagnostics.schedule?.scheduledStart
                  ? `${new Date(diagnostics.schedule.scheduledStart).toLocaleString('en-GB')}${diagnostics.schedule.scheduledEnd ? ` → ${new Date(diagnostics.schedule.scheduledEnd).toLocaleString('en-GB')}` : ''}`
                  : 'No schedule recorded'}
                {diagnostics.schedule?.timezone ? ` · ${diagnostics.schedule.timezone}` : ''}
              </dd>
            </div>
            <div>
              <dt>Timestamps</dt>
              <dd>
                created {diagnostics.project.createdAt ? new Date(diagnostics.project.createdAt).toLocaleString('en-GB') : 'unknown'}
                {diagnostics.project.submittedAt ? ` · submitted ${new Date(diagnostics.project.submittedAt).toLocaleString('en-GB')}` : ''}
                {diagnostics.project.completedAt ? ` · completed ${new Date(diagnostics.project.completedAt).toLocaleString('en-GB')}` : ''}
                {diagnostics.project.cancelledAt ? ` · cancelled ${new Date(diagnostics.project.cancelledAt).toLocaleString('en-GB')}` : ''}
              </dd>
            </div>
          </dl>
          <div className="admin-row-actions">
            {diagnostics.customer.accountId ? (
              <Link className="text-button" href={`/admin/accounts/${diagnostics.customer.accountId}`}>
                Open the customer account <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {diagnostics.provider ? (
              <Link className="text-button" href={`/admin/providers?q=${encodeURIComponent(diagnostics.provider.name)}`}>
                Open the provider in supply
              </Link>
            ) : null}
            {diagnostics.provider ? (
              <Link className="text-button" href={`/projects/${diagnostics.provider.assignmentId}`}>
                The project workspace
              </Link>
            ) : null}
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>State machine</h2>
              <p>What the domain commands will allow from here, and what only an override can do.</p>
            </div>
            <StateBadge state={diagnostics.project.state} />
          </div>
          <TransitionReference legalTransitions={diagnostics.legalTransitions} currentState={diagnostics.project.state} />
          <p className="admin-incident-meta">
            The request state machine has {Object.keys(diagnostics.legalTransitions).length} states and its guard
            is a database trigger, not a convention. An override is the only path outside it, and it exists for
            exactly one transaction.
          </p>
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Accepted records</h2>
              <p>The scope and quote the two parties agreed, as they stand.</p>
            </div>
          </div>
          {diagnostics.acceptedScope ? (
            <>
              <p className="admin-incident-meta">
                <span>Scope version {diagnostics.acceptedScope.version} accepted {diagnostics.acceptedScope.acceptedAt ? new Date(diagnostics.acceptedScope.acceptedAt).toLocaleString('en-GB') : 'at an unrecorded time'}</span>
              </p>
              <pre className="admin-json">{JSON.stringify(diagnostics.acceptedScope.scope, null, 2)}</pre>
            </>
          ) : (
            <p className="empty-admin">
              No accepted scope record yet. Structured scope is written when a quote is accepted; before that the
              project has a request and a description only.
            </p>
          )}
          {diagnostics.acceptedQuote ? (
            <dl className="admin-facts">
              <div>
                <dt>Accepted quote</dt>
                <dd>
                  {diagnostics.acceptedQuote.summary ?? 'No summary on the quote'}
                  {' · '}
                  {diagnostics.acceptedQuote.status.replaceAll('_', ' ')}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Money</h2>
              <p>What the ledger says about this project, and the way into the financial console.</p>
            </div>
          </div>
          {diagnostics.money ? (
            <MoneySummary money={diagnostics.money} />
          ) : (
            <p className="empty-admin">
              No payment obligation exists for this project. One is created when a customer accepts a quote; a
              project before that point has no money against it at all, which is a fact rather than a gap.
            </p>
          )}
        </div>
      </section>

      <section className="admin-section" aria-labelledby="stages-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="stages-heading">Stages and tasks</h2>
            <p>
              The same breakdown the two parties work from. A blocked task is somebody&apos;s explicit statement
              that they cannot continue.
            </p>
          </div>
          <span>{diagnostics.stages.length} stage{diagnostics.stages.length === 1 ? '' : 's'} · {diagnostics.evidenceCount} evidence item{diagnostics.evidenceCount === 1 ? '' : 's'} · {diagnostics.documentCount} document{diagnostics.documentCount === 1 ? '' : 's'}</span>
        </div>
        {diagnostics.stages.length === 0 ? (
          <p className="empty-admin">No stages have been created on this project yet.</p>
        ) : (
          <div className="admin-list">
            {diagnostics.stages.map(stage => (
              <article key={stage.stageId}>
                <div>
                  <strong>{stage.ordinal}. {stage.title}</strong>
                  {stage.tasks.length === 0 ? (
                    <span>No tasks in this stage</span>
                  ) : (
                    stage.tasks.map(task => (
                      <span key={task.id}>
                        {task.title} · {task.status.replaceAll('_', ' ')}
                        {task.assignee ? ` · ${task.assignee}` : ''}
                      </span>
                    ))
                  )}
                </div>
                <small>{stage.tasks.filter(task => task.status === 'blocked').length} blocked</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Issues</h2>
              <p>Cases raised inside the project, and the hold that freezes a self-service payout.</p>
            </div>
            <span>{diagnostics.issues.length}</span>
          </div>
          {diagnostics.issues.length === 0 ? (
            <p className="empty-admin">No issue case has been raised on this project.</p>
          ) : (
            <div className="admin-list">
              {diagnostics.issues.map(issue => (
                <article key={issue.id}>
                  <div>
                    <strong>{issue.kind.replaceAll('_', ' ')} · {issue.status}</strong>
                    <span>{issue.summary}</span>
                    <span>
                      {issue.legalHold ? 'Legal hold in force' : 'No legal hold'}
                      {issue.responseDueAt ? ` · response due ${new Date(issue.responseDueAt).toLocaleDateString('en-GB')}` : ''}
                    </span>
                    {issue.resolution ? <span>Resolution: {issue.resolution}</span> : null}
                  </div>
                  <small>{issue.createdAt ? new Date(issue.createdAt).toLocaleString('en-GB') : 'time not recorded'}</small>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Change requests</h2>
              <p>Proposals against the baseline, with their money deltas.</p>
            </div>
            <span>{diagnostics.changes.length}</span>
          </div>
          {diagnostics.changes.length === 0 ? (
            <p className="empty-admin">No change request has been raised.</p>
          ) : (
            <div className="admin-list">
              {diagnostics.changes.map(change => (
                <article key={change.id}>
                  <div>
                    <strong>{change.title}</strong>
                    <span>
                      {change.changeKind.replaceAll('_', ' ')} · {change.status.replaceAll('_', ' ')}
                      {change.proposedTotalMinor !== null && change.baselineTotalMinor !== null
                        ? ` · ${(change.baselineTotalMinor / 100).toFixed(2)} → ${(change.proposedTotalMinor / 100).toFixed(2)} ${change.currencyCode ?? ''}`
                        : ''}
                    </span>
                  </div>
                  <small>{change.createdAt ? new Date(change.createdAt).toLocaleDateString('en-GB') : 'time not recorded'}</small>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="admin-section" aria-labelledby="override-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="override-heading">Run an approved command</h2>
            <p>
              Two commands, and no others: force a state transition, or retry one undelivered delivery. The
              database refuses any other key, so this console cannot become a general-purpose SQL prompt.
            </p>
          </div>
          <Link className="text-button" href="/admin/audit">
            Open audit trail <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>

        {!canOverride ? (
          <NoOverrideAccess reason="Overrides need the platform projects intervene capability, which your role does not hold." />
        ) : (
          <div className="admin-incident-grid">
            <div className="admin-incident">
              <h3>Force a state transition</h3>
              <p>
                Moves the request state machine to a state the domain commands would refuse. It changes the state
                and nothing else: no money moves, nobody is notified, and no stage work is created or closed.
              </p>
              <form action={runProjectOverrideAction} className="admin-row-actions">
                <input type="hidden" name="request_id" value={diagnostics.project.requestId} />
                <input type="hidden" name="command_key" value="force_state" />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Run the override"
                  triggerClassName="admin-confirm-danger"
                  title={`Force the state of ${diagnostics.project.title}`}
                  description="The guard is bypassed for one statement, by a caller who holds the intervene capability, inside one transaction. Everything you record here is what makes that explainable later."
                  confirmLabel="Force the transition"
                  confirmClassName="admin-confirm-danger"
                  reasons={reasons.project_override}
                  noteLabel="What is wrong with the record, and what this fixes"
                  disabled={!canEscalate || stepUpPending}
                  disabledReason={
                    stepUpPending
                      ? 'Confirm it is you on this session first.'
                      : 'Opening a case needs the trust capability. Ask a trust lead to take this one.'
                  }
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="target-state">Move it to</label>
                      <select id="target-state" name="target_state" required defaultValue="" className="admin-field">
                        <option value="" disabled>Choose a state</option>
                        {Object.entries(REQUEST_STATE_COPY)
                          .filter(([value]) => value !== diagnostics.project.state)
                          .map(([value, label]) => {
                            const legal = (diagnostics.legalTransitions[diagnostics.project.state] ?? []).includes(value);
                            return (
                              <option key={value} value={value}>
                                {label}{legal ? ' — the domain commands allow this' : ' — override needed'}
                              </option>
                            );
                          })}
                      </select>
                      <label className="admin-field-label" htmlFor="evidence">Support ticket or case reference</label>
                      <input id="evidence" name="evidence_reference" required minLength={3} maxLength={200} placeholder="e.g. SUP-4821" className="admin-field" />
                    </>
                  }
                />
              </form>
              <p className="admin-incident-meta">
                <span>
                  Forcing a state does not move money. If the project should also be paid, refunded or funded,
                  that is a financial action in the money console — and if the money should be frozen, a legal
                  hold on a case is what does it.
                </span>
              </p>
            </div>

            <div className="admin-incident">
              <h3>Escalate to dispute</h3>
              <p>
                Opens a trust case of type dispute about this project, with an owner and an SLA. It does not
                change the project&apos;s state and does not freeze the money — both are separate, deliberate
                actions with their own records.
              </p>
              <form action={escalateProjectToDisputeAction} className="admin-row-actions">
                <input type="hidden" name="request_id" value={diagnostics.project.requestId} />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Escalate to dispute"
                  triggerClassName="admin-trigger-danger"
                  title={`Escalate ${diagnostics.project.title} to a dispute`}
                  description="The case is isolated from project chat and support threads: it is readable by platform operators only. Assign it afterwards from the case queue."
                  confirmLabel="Open the dispute"
                  confirmClassName="admin-confirm-danger"
                  reasons={reasons.trust_case_action}
                  noteLabel="What the reviewer will see first"
                  disabled={stepUpPending}
                  disabledReason="Confirm it is you on this session first."
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="dispute-summary">Case summary</label>
                      <textarea
                        id="dispute-summary"
                        name="summary"
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        placeholder="What is disputed, in neutral language, without naming anybody who is not a party."
                        className="admin-field"
                      />
                      <label className="admin-field-label" htmlFor="dispute-severity">Severity</label>
                      <select id="dispute-severity" name="severity" defaultValue="medium" className="admin-field">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="critical">Critical</option>
                      </select>
                      <label className="admin-field-label" htmlFor="dispute-sla">Respond by (optional)</label>
                      <input id="dispute-sla" name="sla_due_at" type="date" className="admin-field" />
                    </>
                  }
                />
              </form>
            </div>
          </div>
        )}
      </section>

      <section className="admin-section" aria-labelledby="jobs-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="jobs-heading">Delivery jobs</h2>
            <p>
              Domain events waiting to be published, and the ones that got through. Retrying clears the
              bookkeeping on one event; it does not publish anything from here.
            </p>
          </div>
          <span>{diagnostics.jobs.filter(job => !job.publishedAt).length} undelivered</span>
        </div>
        <JobList
          jobs={diagnostics.jobs}
          reasons={reasons.job_retry}
          requestId={diagnostics.project.requestId}
          next={next}
          canOverride={canOverride}
          stepUpPending={stepUpPending}
        />
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Overrides on this project</h2>
              <p>Append-only, with the reason, the reference and the state it actually moved between.</p>
            </div>
            <span>{diagnostics.overrides.length}</span>
          </div>
          <OverrideHistory overrides={diagnostics.overrides} />
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Domain event timeline</h2>
              <p>
                Projected from the audit stream — the same history the two parties see. Nothing here is derived
                from the current state.
              </p>
            </div>
            <Link className="text-button" href="/admin/audit">
              Full audit trail <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          <TimelineList events={diagnostics.timeline} />
        </div>
      </section>
    </div>
  );
}
