import Link from 'next/link';
import { ArrowRight, Download, Eye, GitBranch, Lock, Search, ShieldCheck } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { auditAccessLog, auditEvents } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Audit', robots: { index: false, follow: false } };

/**
 * /admin/audit — the platform audit trail.
 *
 * ⚠️ THIS IS A UI BUILD. The events, the lineage chain and the access log come from
 * features/admin/ui-placeholders.ts; the search, lineage and export controls are rendered but not wired.
 *
 * ⚠️ THE TWO STORAGE RULES ARE ON THE SCREEN, NOT ONLY IN THE SCHEMA. The audit stream is append-only — nothing here
 * offers an edit or a delete — and reading it is itself recorded, which is what the access panel at the bottom shows.
 */
export default function AuditExplorerPage() {
  const decidedEvents = auditEvents.filter(event => event.reasonCode !== null);
  const correlationGaps = auditEvents.filter(event => event.correlationId === null).length;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Audit</p>
          <h1>Who changed what, and why?</h1>
          <p>
            Every consequential action across the platform: the actor, the object, the state before and after, the
            reason code that was required, and the moment it happened in the operator&apos;s own timezone.
          </p>
        </div>
        <span className="admin-quick-note">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Append-only — UI build
        </span>
      </header>

      <p className="notice" role="status">
        <strong>This screen is a UI build.</strong> The rows below are placeholder data and the controls are not
        connected to a reader yet. Personal details are shown masked, as they will be when this is wired.
      </p>

      <section className="admin-section two-column-admin">
        <div className={`${CARD} p-5`} aria-labelledby="rules-heading">
          <h2 id="rules-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            How this record behaves
          </h2>
          <ul className="admin-facts">
            <li>
              <strong>Append-only</strong>
              <span>
                Rows are written once and never edited or deleted by anybody, including platform owners. There is no
                control on this page that could change one, because there is no path in the database that could.
              </span>
            </li>
            <li>
              <strong>Minimised personal data</strong>
              <span>
                Actors are shown by name and role; contact details appear masked, and an unmasked value is only
                obtainable on the account page against an audited reason.
              </span>
            </li>
            <li>
              <strong>Reading is itself recorded</strong>
              <span>
                Every search, view, lineage walk and export writes a row naming the operator, the query, the reason
                code and how many rows it returned — before the results are shown.
              </span>
            </li>
          </ul>
        </div>

        <div className={`${CARD} p-5`} aria-labelledby="search-heading">
          <h2 id="search-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <Search aria-hidden="true" className="h-4 w-4 text-primary" />
            Search
          </h2>
          <div className="mt-3 grid gap-3">
            <div>
              <label className={LABEL} htmlFor="audit_q">Text, object reference or correlation id</label>
              <input id="audit_q" type="search" className={FIELD} placeholder="e.g. request #4c19a0, SUP-4821, PROVIDER_VERIFICATION_*" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="audit_action">Action</label>
                <select id="audit_action" className={FIELD} defaultValue="">
                  <option value="">Every action</option>
                  <option value="verification">Verification decisions</option>
                  <option value="account">Account and access changes</option>
                  <option value="money">Money and ledger</option>
                  <option value="project">Project and state overrides</option>
                  <option value="taxonomy">Taxonomy and markets</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="audit_resource">Object type</label>
                <select id="audit_resource" className={FIELD} defaultValue="">
                  <option value="">Every object</option>
                  <option value="request">Request</option>
                  <option value="account">Account</option>
                  <option value="payment_obligation">Payment obligation</option>
                  <option value="provider_verification">Provider verification</option>
                  <option value="organisation">Organisation</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="audit_actor">Actor</label>
                <select id="audit_actor" className={FIELD} defaultValue="">
                  <option value="">Anybody</option>
                  <option value="user">Platform operators</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="audit_window">Window</label>
                <select id="audit_window" className={FIELD} defaultValue="7">
                  <option value="1">Last hour</option>
                  <option value="24">Last 24 hours</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                </select>
              </div>
            </div>
            <div className="admin-row-actions">
              <button type="button" className="admin-confirm-amber">Search audit logs</button>
              <span className="admin-incident-meta">
                The search itself is recorded, with the query and your reason code.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="results-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="results-heading">Matching events</h2>
            <p>
              Newest first. Before and after sit side by side where a command recorded a change, rather than on one
              line that hides which value moved.
            </p>
          </div>
          <span>{auditEvents.length} events · {decidedEvents.length} carry a reason code</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Audit events with actor, object, change and reason</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action and object</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Reason</th>
                <th scope="col">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map(event => (
                <tr key={event.id}>
                  <td>
                    <small>{new Date(event.at).toLocaleString('en-GB')}</small>
                    <small>{event.timezone}</small>
                  </td>
                  <td>
                    <strong>{event.actorName}</strong>
                    <small>{event.actorRole} · {event.actorType}</small>
                  </td>
                  <td>
                    <small>{event.action.replaceAll('_', ' ')}</small>
                    <small>{event.resourceType} · {event.resourceRef}</small>
                  </td>
                  <td><small>{event.before ?? 'not recorded'}</small></td>
                  <td><small>{event.after ?? 'not recorded'}</small></td>
                  <td>
                    {event.reasonCode
                      ? <span className={BADGE_SLATE}>{event.reasonCode.replaceAll('_', ' ')}</span>
                      : <span className={BADGE_AMBER}>none recorded</span>}
                  </td>
                  <td>
                    <small>{event.correlationId ?? 'not recorded'}</small>
                    <button type="button" className="text-button">Follow lineage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-incident-meta">
          <span>
            {correlationGaps > 0
              ? `${correlationGaps} of these events carry no correlation id: the platform does not record one for every action, and this page says so rather than leaving the column blank.`
              : 'Every event in this window carries a correlation id.'}
          </span>
        </p>
      </section>

      <section className="admin-section two-column-admin">
        <div className={`${CARD} p-5`} aria-labelledby="lineage-heading">
          <h2 id="lineage-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <GitBranch aria-hidden="true" className="h-4 w-4 text-primary" />
            Follow one object
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            The full history of a single object, in order, with the objects each event touched beside it — which is
            how a decision made on one screen is connected to what happened on another.
          </p>
          <div className="mt-3">
            <label className={LABEL} htmlFor="lineage_ref">Object reference</label>
            <div className="flex flex-wrap items-end gap-2">
              <input id="lineage_ref" className={`${FIELD} min-w-0 flex-1`} defaultValue="request #4c19a0" />
              <button type="button" className="admin-trigger-quiet">Walk the lineage</button>
            </div>
          </div>
          <ul className="admin-session-list">
            <li>
              <strong>REQUEST_CREATED</strong>
              <span>System · request #4c19a0</span>
              <small>2026-09-18 09:12 · Africa/Lagos</small>
            </li>
            <li>
              <strong>QUOTE_ACCEPTED</strong>
              <span>Customer action · created obligation #b2f7…09</span>
              <small>2026-09-19 14:03 · Africa/Lagos</small>
            </li>
            <li>
              <strong>PAYMENT_RECONCILED</strong>
              <span>System · obligation #b2f7…09 moved to funded</span>
              <small>2026-09-19 14:11 · Africa/Lagos</small>
            </li>
            <li>
              <strong>PROJECT_STATE_FORCED</strong>
              <span>Grace Adeyemi · completed, reason support ticket, linked to SUP-4821</span>
              <small>2026-09-22 21:10 · Africa/Lagos</small>
            </li>
          </ul>
        </div>

        <div className={`${CARD} p-5`} aria-labelledby="export-heading">
          <h2 id="export-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <Download aria-hidden="true" className="h-4 w-4 text-primary" />
            Export audited data
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            An export carries the same rows you searched, plus your reason code and the moment it was taken. It is
            recorded in the access log whether or not the file is kept.
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <label className={LABEL} htmlFor="export_scope">What to export</label>
              <select id="export_scope" className={FIELD} defaultValue="results">
                <option value="results">The events matching this search</option>
                <option value="lineage">The lineage of one object</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="export_reason">Reason code (required)</label>
              <select id="export_reason" className={FIELD} required defaultValue="">
                <option value="" disabled>Choose a reason</option>
                <option value="support_ticket">A support ticket needs the history</option>
                <option value="incident_review">Reviewing an incident</option>
                <option value="legal_request">Legal or regulatory request</option>
                <option value="finance_review">A finance review</option>
                <option value="trust_review">A trust review</option>
                <option value="compliance_sample">A compliance sample</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="export_note">What it is for</label>
              <textarea id="export_note" rows={3} className={FIELD} placeholder="At least ten characters, recorded with the export." />
            </div>
            <div className="admin-row-actions">
              <button type="button" className="admin-confirm-danger">Export audited data</button>
              <span className="admin-incident-meta">CSV. The export never includes an unmasked contact detail.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="access-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="access-heading">Who has read this console</h2>
            <p>
              The access log itself — the operator, what they looked for, the reason they gave and how many rows came
              back.
            </p>
          </div>
          <span>{auditAccessLog.length} recent reads</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Audit console access log</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Operator</th>
                <th scope="col">What they did</th>
                <th scope="col">Query</th>
                <th scope="col">Rows</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditAccessLog.map(entry => (
                <tr key={entry.id}>
                  <td><small>{new Date(entry.at).toLocaleString('en-GB')}</small></td>
                  <td><strong>{entry.actorName}</strong></td>
                  <td>
                    <span className={BADGE_SLATE}>
                      <Eye aria-hidden="true" className="h-3 w-3" />
                      {entry.accessKind}
                    </span>
                  </td>
                  <td><small>{entry.query}</small></td>
                  <td><small>{entry.rowsReturned}</small></td>
                  <td><small>{entry.reasonCode.replaceAll('_', ' ')}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        Consequential actions elsewhere in the console link back into this record.{' '}
        <Link href="/admin" className={LINK_ARROW}>
          Operations overview
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
