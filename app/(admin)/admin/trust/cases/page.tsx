import Link from 'next/link';
import { ShieldAlert } from '@/components/ui/icons';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { CaseBadge, CaseStateBadge } from '@/components/admin/TrustSections';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import {
  CASE_SEVERITIES,
  CASE_STATES,
  CASE_STATE_COPY,
  CASE_TYPES,
  CASE_TYPE_COPY,
  adminFailureCopy,
} from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getTrustCases } from '@/features/admin/trust';
import {
  assignTrustCaseAction,
  closeTrustCaseAction,
  createTrustCaseAction,
  restrictCaseSubjectAction,
  setLegalHoldAction,
} from '@/features/admin/trust-actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Moderation and safety cases', robots: { index: false, follow: false } };

/**
 * /admin/trust/cases — the abuse and incident queue.
 *
 * ⚠️ THIS IS NOT A CHAT SURFACE, AND THE PAGE SAYS WHY IT NEVER BECOMES ONE. A safety case is about a person:
 * it is read by platform operators only, there is no participant read policy on the table, and nothing links
 * it to a project conversation. The brief's isolation rule is structural here rather than a promise, and the
 * banner at the top exists so an operator does not paste case text into a message thread by habit.
 *
 * ⚠️ EVERY ACTION IS A FORM WITH A REASON CODE. Assigning, holding, restricting and closing each write an
 * append-only case event and an audit row. The two that change somebody's access — the hold and the account
 * restriction — additionally need a confirmed second factor, which the page checks before offering them.
 */
export default async function TrustCasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    severity?: string;
    type?: string;
    assignee?: string;
    failed?: string;
    step_up?: string;
    opened?: string;
    assigned?: string;
    hold?: string;
    restricted?: string;
    closed?: string;
    subject_account?: string;
    subject_provider?: string;
    subject_request?: string;
  }>;
}) {
  const query = await searchParams;
  const severity = CASE_SEVERITIES.includes(query.severity as (typeof CASE_SEVERITIES)[number]) ? query.severity : undefined;
  const caseType = CASE_TYPES.includes(query.type as (typeof CASE_TYPES)[number]) ? query.type : undefined;
  const state = CASE_STATES.includes(query.state as (typeof CASE_STATES)[number]) ? query.state : undefined;

  const supabase = await createSupabaseServerClient();
  const [context, queue, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getTrustCases({ state, severity, caseType, assignee: query.assignee }),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = Boolean(hasFactor && levels?.currentLevel !== 'aal2');
  const canRead = Boolean(context?.has('platform.trust.read') || context?.has('platform.trust.moderate') || context?.has('platform.operations.read') || context?.has('platform.admin.manage'));
  const canAct = Boolean(context?.has('platform.trust.moderate') || context?.has('platform.admin.manage'));
  const canIntervene = Boolean(context?.has('platform.support.intervene') || context?.has('platform.admin.manage'));
  const failure = adminFailureCopy(query.failed);

  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>{ACCESS_NOTE}</p>
        </section>
      </div>
    );
  }

  const refreshed = Boolean(failure);
  const stepUpPrompt = query.step_up === '1';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust · moderation and safety</p>
          <h1>Reports, incidents and conduct cases.</h1>
          <p>
            Every case is about an account, a provider or a project record, and is read by platform operators
            only. Nothing here is a conversation, and nothing here is visible to the people it is about.
          </p>
        </div>
        <Link className="secondary-button" href="/admin/trust">Trust overview</Link>
      </header>

      {/* The isolation rule, stated where somebody might otherwise paste case text into a thread. */}
      <p className="admin-reveal-warning" role="note">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Safety and abuse cases are isolated from project chat and support threads by design: there is no
          participant read policy on this table, and nothing in the customer or provider workspace joins it.
          Keep case detail here rather than copying it into a message.
        </span>
      </p>

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not save.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {stepUpPrompt ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Try the action again — nothing was saved by the
          attempt that was refused.
        </p>
      ) : null}

      {query.opened && !refreshed ? (
        <p className="notice" role="status">
          Case opened. It is in the queue below with its reason code in the history; assign it to somebody so it
          is not relying on the unassigned count to be noticed.
        </p>
      ) : null}
      {query.restricted && !refreshed ? (
        <p className="notice" role="status">
          The account&apos;s standing was changed and its sessions ended. The case history records that the
          restriction came from this case.
        </p>
      ) : null}
      {query.hold === 'placed' ? (
        <p className="notice" role="status">
          Legal hold placed. The case cannot be closed while it is on, and the subject account cannot be
          reinstated until it is lifted.
        </p>
      ) : null}
      {query.hold === 'lifted' ? (
        <p className="notice" role="status">
          Legal hold lifted, with the reason recorded. The case can now be closed.
        </p>
      ) : null}
      {query.assigned && !refreshed ? (
        <p className="notice" role="status">Assignment recorded. It is in the case history with your reason.</p>
      ) : null}
      {query.closed && !refreshed ? (
        <p className="notice" role="status">
          Case resolved with its resolution recorded. Nothing about the people involved changed — a resolution
          is a decision about the case, and any restriction is a separate action.
        </p>
      ) : null}

      <section className="admin-stat-grid" aria-label="Queue state">
        <article><span>Open</span><strong>{queue.counts.open}</strong><small>{queue.counts.unassigned} unassigned</small></article>
        <article><span>Investigating</span><strong>{queue.counts.investigating}</strong><small>{queue.counts.awaitingResponse} awaiting a response</small></article>
        <article><span>Escalated</span><strong>{queue.counts.escalated}</strong><small>{queue.counts.held} under a legal hold</small></article>
        <article><span>Past SLA</span><strong>{queue.counts.overdue}</strong><small>{queue.counts.closed} resolved</small></article>
      </section>
      <p className="admin-incident-meta">
        <span>
          Whole-queue counts. The filters below narrow the list, not these numbers — a filtered count that
          looked unfiltered would be worse than no count.
        </span>
      </p>

      <nav className="admin-queue-tabs" aria-label="Case state">
        {[{ value: 'all', label: 'Every case' }, ...CASE_STATES.map(value => ({ value, label: CASE_STATE_COPY[value].label }))].map(option => {
          const href = `/admin/trust/cases?state=${option.value}${severity ? `&severity=${severity}` : ''}${caseType ? `&type=${caseType}` : ''}`;
          return (
            <Link key={option.value} href={href} aria-current={(state ?? 'all') === option.value ? 'true' : undefined}>
              {option.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/trust/cases" className="admin-filters">
        <input type="hidden" name="state" value={state ?? 'all'} />
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="type">Case type</label>
          <select id="type" name="type" defaultValue={caseType ?? ''} className="admin-field">
            <option value="">Every type</option>
            {CASE_TYPES.map(value => (
              <option key={value} value={value}>{CASE_TYPE_COPY[value]}</option>
            ))}
          </select>
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="severity">Severity</label>
          <select id="severity" name="severity" defaultValue={severity ?? ''} className="admin-field">
            <option value="">Every severity</option>
            {CASE_SEVERITIES.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="assignee">Assignee</label>
          <select id="assignee" name="assignee" defaultValue={query.assignee ?? ''} className="admin-field">
            <option value="">Anyone</option>
            {queue.reviewers.map(reviewer => (
              <option key={reviewer.accountId} value={reviewer.accountId}>{reviewer.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="secondary-button">Filter cases</button>
        {state || severity || caseType || query.assignee ? (
          <Link className="text-button" href="/admin/trust/cases">Clear</Link>
        ) : null}
      </form>

      <section className="admin-section" aria-labelledby="queue-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="queue-heading">The queue</h2>
            <p>Critical cases first, then whatever is nearest its SLA.</p>
          </div>
          <span>{queue.cases.length} shown</span>
        </div>

        {queue.cases.length === 0 ? (
          <p className="empty-admin">
            Nothing matches that filter. Cases arrive from this form — the intake for reports that reach the
            platform by email, by phone or from a regulator.
          </p>
        ) : (
          queue.cases.map(item => (
            <article key={item.id} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <CaseBadge item={item} />
                    <CaseStateBadge state={item.state} />
                    <span>{CASE_TYPE_COPY[item.caseType] ?? item.caseType}</span>
                    <span>Opened {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : 'at an unrecorded time'}</span>
                  </div>
                  <h3>{item.summary}</h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">
                    {item.slaDueAt
                      ? item.overdue
                        ? `SLA passed ${new Date(item.slaDueAt).toLocaleDateString('en-GB')}`
                        : `Due ${new Date(item.slaDueAt).toLocaleDateString('en-GB')}`
                      : 'No SLA set'}
                  </span>
                  <span className="admin-incident-meta">
                    {item.assignedTo ? `Assigned to ${item.assignedTo}` : 'Unassigned'}
                  </span>
                </div>
              </div>

              <div className="admin-incident-meta">
                {item.reporter ? <span>Reported by {item.reporter.name} ({item.reporter.contactMasked ?? 'no contact'})</span> : <span>Opened by the platform</span>}
                {item.subjectAccount ? (
                  <span>
                    Subject account {item.subjectAccount.name} · {item.subjectAccount.accountStatus.replaceAll('_', ' ')}
                  </span>
                ) : null}
                {item.subjectProvider ? <span>Subject provider {item.subjectProvider.name}</span> : null}
                {item.subjectRequest ? <span>Request: {item.subjectRequest.title}</span> : null}
              </div>

              {item.legalHold ? (
                <p className="admin-reveal-warning">
                  <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Legal hold: {item.legalHoldReason?.replaceAll('_', ' ') ?? 'reason not recorded'}
                    {item.legalHoldBy ? ` · placed by ${item.legalHoldBy}` : ''}
                    {item.legalHoldAt ? ` on ${new Date(item.legalHoldAt).toLocaleDateString('en-GB')}` : ''}. The
                    case cannot be closed and the subject account cannot be reinstated until this is lifted.
                  </span>
                </p>
              ) : null}

              {item.evidence.length > 0 ? (
                <p className="admin-incident-meta">
                  <span>Evidence referenced: {item.evidence.map(entry => `${entry.kind.replaceAll('_', ' ')} (${entry.id.slice(0, 8)})`).join(', ')}</span>
                </p>
              ) : (
                <p className="admin-incident-meta"><span>No evidence is referenced from this case</span></p>
              )}

              {item.resolution ? (
                <p className="admin-incident-meta"><span>Resolution: {item.resolution}</span></p>
              ) : null}

              {item.events.length > 0 ? (
                <details className="identity-details">
                  <summary>Case history ({item.events.length} recent)</summary>
                  <ul className="admin-session-list">
                    {item.events.map(event => (
                      <li key={`${item.id}-${event.eventType}-${event.occurredAt ?? 'unknown'}`}>
                        <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                        <span>
                          {event.actor}
                          {event.reasonCode ? ` · ${event.reasonCode.replaceAll('_', ' ')}` : ''}
                          {event.note ? ` · ${event.note}` : ''}
                        </span>
                        <small>{event.occurredAt ? new Date(event.occurredAt).toLocaleString('en-GB') : 'time not recorded'}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {item.state !== 'resolved' && item.state !== 'closed' ? (
                <div className="admin-row-actions">
                  <form action={assignTrustCaseAction}>
                    <input type="hidden" name="case_id" value={item.id} />
                    <input type="hidden" name="next" value="/admin/trust/cases" />
                    <ReasonCodeControl
                      triggerLabel={item.assignedTo ? 'Reassign case' : 'Assign case'}
                      triggerClassName="admin-trigger-quiet"
                      title={`Assign case ${item.id.slice(0, 8)}`}
                      description="Assignment moves the case to a named reviewer and, if it is still open, to under investigation. The assignee has to hold a trust capability — the list is built from the capability tables, not from job titles."
                      confirmLabel="Record assignment"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons.trust_case_action}
                      noteLabel="Why this reviewer"
                      tone="standard"
                      disabled={!canAct}
                      disabledReason="Your role does not cover moderating cases."
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`assignee-${item.id}`}>Assign to</label>
                          <select id={`assignee-${item.id}`} name="assignee_account_id" required defaultValue="" className="admin-field">
                            <option value="" disabled>Choose a reviewer</option>
                            {queue.reviewers.map(reviewer => (
                              <option key={reviewer.accountId} value={reviewer.accountId}>
                                {reviewer.name} · {reviewer.role}
                              </option>
                            ))}
                          </select>
                          <label className="admin-field-label" htmlFor={`state-${item.id}`}>Move the case to</label>
                          <select id={`state-${item.id}`} name="state" defaultValue={item.state === 'open' ? 'investigating' : item.state} className="admin-field">
                            <option value="open">Open</option>
                            <option value="investigating">Under investigation</option>
                            <option value="awaiting_response">Awaiting response</option>
                            <option value="escalated">Escalated</option>
                          </select>
                        </>
                      }
                    />
                  </form>

                  <form action={setLegalHoldAction}>
                    <input type="hidden" name="case_id" value={item.id} />
                    <input type="hidden" name="next" value="/admin/trust/cases" />
                    <input type="hidden" name="hold" value={item.legalHold ? 'false' : 'true'} />
                    <ReasonCodeControl
                      triggerLabel={item.legalHold ? 'Lift the legal hold' : 'Place under legal hold'}
                      triggerClassName={item.legalHold ? 'admin-trigger-quiet' : 'admin-trigger-danger'}
                      title={item.legalHold ? 'Lift the legal hold on this case' : 'Place this case under a legal hold'}
                      description={
                        item.legalHold
                          ? 'Lifting the hold allows the case to be closed and the subject account to be reinstated. The reason code explains why the record no longer needs preserving.'
                          : 'A hold preserves the case and blocks two things: closing it, and putting the subject account back into service. It needs a second factor.'
                      }
                      confirmLabel={item.legalHold ? 'Lift the hold' : 'Place the hold'}
                      confirmClassName={item.legalHold ? 'admin-confirm-amber' : 'admin-confirm-danger'}
                      reasons={item.legalHold ? reasons.trust_case_hold_lift : reasons.trust_case_hold}
                      noteLabel="What this hold is for"
                      disabled={!canAct || stepUpPending}
                      disabledReason={
                        stepUpPending
                          ? 'Confirm it is you on this session first.'
                          : 'Your role does not cover moderating cases.'
                      }
                    />
                  </form>

                  {item.subjectAccount ? (
                    <form action={restrictCaseSubjectAction}>
                      <input type="hidden" name="case_id" value={item.id} />
                      <input type="hidden" name="account_id" value={item.subjectAccount.accountId} />
                      <input type="hidden" name="next" value="/admin/trust/cases" />
                      <ReasonCodeControl
                        triggerLabel={item.subjectAccount.accountStatus === 'active' ? 'Restrict the account' : 'Reinstate the account'}
                        triggerClassName={item.subjectAccount.accountStatus === 'active' ? 'admin-trigger-danger' : 'admin-trigger-quiet'}
                        title={
                          item.subjectAccount.accountStatus === 'active'
                            ? `Suspend ${item.subjectAccount.name}`
                            : `Reinstate ${item.subjectAccount.name}`
                        }
                        description={
                          item.subjectAccount.accountStatus === 'active'
                            ? 'Suspending ends every session on the account and the database refuses it from its next request. This is the same operation as the one on the account page, recorded against this case.'
                            : 'Reinstating restores the account on its next request. It cannot end the sessions the suspension already ended, and it is refused while a legal hold is in force.'
                        }
                        confirmLabel={item.subjectAccount.accountStatus === 'active' ? 'Suspend the account' : 'Reinstate the account'}
                        confirmClassName={item.subjectAccount.accountStatus === 'active' ? 'admin-confirm-danger' : 'admin-confirm-amber'}
                        reasons={reasons.account_standing}
                        noteLabel="Why, in the case record"
                        disabled={!canIntervene || stepUpPending}
                        disabledReason={
                          stepUpPending
                            ? 'Confirm it is you on this session first.'
                            : 'Your role can read this queue but not change an account standing.'
                        }
                        extraFields={
                          <>
                            <input type="hidden" name="status" value={item.subjectAccount.accountStatus === 'active' ? 'suspended' : 'active'} />
                            <p className="admin-dialog-hint">
                              The account is {item.subjectAccount.name} · {item.subjectAccount.accountStatus.replaceAll('_', ' ')}
                              {item.subjectAccount.contactMasked ? ` · ${item.subjectAccount.contactMasked}` : ''}.
                            </p>
                          </>
                        }
                      />
                    </form>
                  ) : null}

                  <form action={closeTrustCaseAction}>
                    <input type="hidden" name="case_id" value={item.id} />
                    <input type="hidden" name="next" value="/admin/trust/cases" />
                    <ReasonCodeControl
                      triggerLabel="Close with resolution"
                      triggerClassName="admin-trigger-quiet"
                      title={`Close case ${item.id.slice(0, 8)}`}
                      description="Closing records the resolution and does not change anything about the people involved. If a restriction is warranted, apply it as its own action first so the case history shows it."
                      confirmLabel="Record the resolution"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons.trust_case_closure}
                      noteLabel="What was concluded"
                      disabled={!canAct || stepUpPending || item.legalHold}
                      disabledReason={
                        item.legalHold
                          ? 'This case is under a legal hold: lift it first.'
                          : stepUpPending
                            ? 'Confirm it is you on this session first.'
                            : 'Your role does not cover moderating cases.'
                      }
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`resolution-${item.id}`}>Resolution</label>
                          <textarea
                            id={`resolution-${item.id}`}
                            name="resolution"
                            required
                            minLength={10}
                            maxLength={2000}
                            rows={3}
                            placeholder="What the platform concluded, and what it did about it."
                            className="admin-field"
                          />
                        </>
                      }
                    />
                  </form>
                </div>
              ) : (
                <p className="admin-incident-meta"><span>This case is closed. A further concern is a new case.</span></p>
              )}
            </article>
          ))
        )}
      </section>

      <section className="admin-section admin-panel" aria-labelledby="intake-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="intake-heading">Open a case</h2>
            <p>
              The intake for reports that reach the platform outside it — by email, by phone, or from a
              regulator or law-enforcement contact. A case has to be about an account, a provider or a request:
              paste the identifier from the record itself, and the case links to it.
            </p>
          </div>
        </div>

        {!canAct ? (
          <p className="empty-admin">Your role can read the queue but not open cases.</p>
        ) : (
          <form action={createTrustCaseAction} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="admin-field-label" htmlFor="case_type">Case type</label>
                <select id="case_type" name="case_type" required defaultValue="safety" className="admin-field">
                  {CASE_TYPES.map(value => (
                    <option key={value} value={value}>{CASE_TYPE_COPY[value]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-field-label" htmlFor="case_severity">Severity</label>
                <select id="case_severity" name="severity" required defaultValue="medium" className="admin-field">
                  {CASE_SEVERITIES.map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-field-label" htmlFor="case_source">Where it came from</label>
                <select id="case_source" name="source" defaultValue="operator" className="admin-field">
                  <option value="operator">An operator is recording it</option>
                  <option value="report">Somebody reported it</option>
                  <option value="system">A platform check raised it</option>
                </select>
              </div>
            </div>

            <div>
              <label className="admin-field-label" htmlFor="case_summary">Summary</label>
              <textarea
                id="case_summary"
                name="summary"
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="What is alleged, in neutral language, without naming anybody who is not a party."
                className="admin-field"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="admin-field-label" htmlFor="subject_account">Account ID (optional)</label>
                <input id="subject_account" name="subject_account_id" defaultValue={query.subject_account ?? ''} className="admin-field" />
              </div>
              <div>
                <label className="admin-field-label" htmlFor="subject_provider">Provider ID (optional)</label>
                <input id="subject_provider" name="subject_provider_id" defaultValue={query.subject_provider ?? ''} className="admin-field" />
              </div>
              <div>
                <label className="admin-field-label" htmlFor="subject_request">Request ID (optional)</label>
                <input id="subject_request" name="subject_request_id" defaultValue={query.subject_request ?? ''} className="admin-field" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="admin-field-label" htmlFor="sla_due_at">Respond by (optional)</label>
                <input id="sla_due_at" name="sla_due_at" type="date" className="admin-field" />
              </div>
              <div>
                <label className="admin-field-label" htmlFor="case_note">Note for the case history (optional)</label>
                <input id="case_note" name="note" maxLength={2000} className="admin-field" />
              </div>
            </div>

            <div>
              <label className="admin-field-label" htmlFor="case_reason">Reason code</label>
              <select id="case_reason" name="reason_code" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose a reason</option>
                {reasons.trust_case_action.map(reason => (
                  <option key={reason.code} value={reason.code}>{reason.label}</option>
                ))}
              </select>
              <p className="admin-dialog-hint">
                An SLA is a date the queue shows and sorts by. Nothing chases it: the platform sends no reminder
                when a case passes its deadline, which is why the overdue count is on the stat row.
              </p>
            </div>

            <div className="admin-row-actions">
              <button type="submit" className="admin-confirm-amber">Open the case</button>
              <span className="admin-incident-meta">
                Opening a case changes nobody&apos;s access, so it needs no second factor — restricting or holding
                does.
              </span>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
