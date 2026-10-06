import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle2, Radio, Siren, UserPlus } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { incidentAlerts, incidents } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Incidents', robots: { index: false, follow: false } };

/**
 * /admin/operations/incidents — technical incident command.
 *
 * ⚠️ THIS IS A UI BUILD. Rows come from features/admin/ui-placeholders.ts and nothing is wired.
 *
 * ⚠️ THIS IS NOT THE DERIVED INCIDENT FEED ON THE OVERVIEW. That feed is computed from exception rows and has no
 * identity; these are incidents people declare, own and close, with a lead, a runbook and — where the cause is
 * financial or safety-related — a link to the trust or money case that carries the consequence.
 */
export default function IncidentsPage() {
  const open = incidents.filter(incident => !['resolved', 'closed'].includes(incident.state));
  const critical = incidents.filter(incident => incident.severity === 'critical' || incident.severity === 'high');
  const unacknowledgedAlerts = incidentAlerts.filter(alert => alert.incidentId === null);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Operations · incidents</p>
          <h1>Incident command.</h1>
          <p>
            Outages, degradations and third-party disruptions, with the alert that raised each one, the runbook being
            followed and the operator accountable for it.
          </p>
        </div>
        <div className="admin-row-actions">
          <span className="admin-quick-note">
            <Siren aria-hidden="true" className="h-3.5 w-3.5" />
            UI build — not wired
          </span>
          <Link className="secondary-button" href="/admin/operations">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Operations
          </Link>
        </div>
      </header>

      <p className="notice" role="status">
        <strong>This screen is a UI build.</strong> The rows are placeholder data; the controls are not connected to a
        command yet.
      </p>

      <section className="admin-stat-grid" aria-label="Incident summary">
        <article><span>Open incidents</span><strong>{open.length}</strong><small>{critical.length} at high or critical severity</small></article>
        <article><span>Awaiting acknowledgement</span><strong>{unacknowledgedAlerts.length}</strong><small>Alerts with no incident opened against them yet</small></article>
        <article><span>Third-party involvement</span><strong>{incidents.filter(incident => incident.thirdParty).length}</strong><small>Waiting on somebody outside the platform</small></article>
        <article><span>Linked cases</span><strong>{incidents.filter(incident => incident.trustCaseRef || incident.moneyCaseRef).length}</strong><small>With a trust or financial case attached</small></article>
      </section>

      <section className="admin-section" aria-labelledby="alerts-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="alerts-heading">Alert queue</h2>
            <p>
              Alerts raised by monitors. Acknowledging one records that a person has seen it — it does not mean the
              underlying problem is gone, which is what the incident state beside it is for.
            </p>
          </div>
          <span>{incidentAlerts.length} alerts</span>
        </div>
        <div className="admin-list">
          {incidentAlerts.map(alert => (
            <article key={alert.id}>
              <div>
                <strong>
                  <Radio aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  {alert.headline}
                </strong>
                <span>
                  {alert.source} · raised {new Date(alert.raisedAt).toLocaleString('en-GB')} · severity{' '}
                  <span className={alert.severity === 'high' ? BADGE_AMBER : BADGE_SLATE}>{alert.severity}</span>
                </span>
                <span>
                  {alert.incidentId
                    ? `An incident is already open against this alert: ${alert.incidentId}`
                    : 'No incident has been opened against this alert yet'}
                </span>
              </div>
              <div className="admin-row-actions">
                <button type="button" className="admin-trigger-quiet">
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Acknowledge alert
                </button>
                {alert.incidentId ? null : <button type="button" className="admin-confirm-amber">Open an incident</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section" aria-labelledby="incidents-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="incidents-heading">Open incidents</h2>
            <p>Ordered by severity, then by how long they have been running.</p>
          </div>
          <span>{open.length} open</span>
        </div>

        <div className="admin-incident-grid">
          {open.map(incident => (
            <article key={incident.id} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <span className={incident.severity === 'critical' || incident.severity === 'high' ? BADGE_AMBER : BADGE_SLATE}>
                      {incident.severity}
                    </span>
                    <span className={BADGE_SLATE}>{incident.state.replaceAll('_', ' ')}</span>
                    <span>{incident.area.replaceAll('_', ' ')}</span>
                  </div>
                  <h3>{incident.title}</h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">
                    {incident.lead ? `Lead ${incident.lead}` : 'No lead assigned'}
                  </span>
                  <span className="admin-incident-meta">
                    Opened {new Date(incident.openedAt).toLocaleString('en-GB')}
                  </span>
                </div>
              </div>

              <p>{incident.summary}</p>

              <div className="admin-incident-meta">
                {incident.acknowledgedBy
                  ? <span>Acknowledged by {incident.acknowledgedBy} at {incident.acknowledgedAt ? new Date(incident.acknowledgedAt).toLocaleString('en-GB') : ''}</span>
                  : <span className="admin-severity" data-severity="high">Not acknowledged</span>}
                {incident.thirdParty ? <span>Waiting on {incident.thirdParty}</span> : null}
                {incident.runbookReference ? (
                  <span>
                    <BookOpen aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                    {incident.runbookReference}
                  </span>
                ) : <span>No runbook recorded</span>}
                {incident.trustCaseRef ? <span>Trust case {incident.trustCaseRef}</span> : null}
                {incident.moneyCaseRef ? <span>Financial case {incident.moneyCaseRef}</span> : null}
              </div>

              <details className="identity-details">
                <summary>Timeline ({incident.events.length})</summary>
                <ul className="admin-session-list">
                  {incident.events.map(event => (
                    <li key={`${incident.id}-${event.at}`}>
                      <strong>{event.action.replaceAll('_', ' ')}</strong>
                      <span>{event.note}</span>
                      <small>{event.actor} · {new Date(event.at).toLocaleString('en-GB')} · {event.reasonCode.replaceAll('_', ' ')}</small>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="admin-row-actions">
                <button type="button" className="admin-trigger-quiet">
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Acknowledge alert
                </button>
                <button type="button" className="admin-trigger-quiet">
                  <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                  Assign incident lead
                </button>
                <button type="button" className="admin-trigger-quiet">Update severity status</button>
                <button type="button" className="admin-trigger-quiet">Link to trust or financial case</button>
                <button type="button" className="admin-confirm-amber">Close incident</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <form className={`${CARD} grid gap-3 p-5`}>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Declare an incident</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              For something not yet raised by a monitor — a report from a provider, a regulator, or an operator who
              noticed.
            </p>
          </div>
          <div>
            <label className={LABEL} htmlFor="incident_title">Title</label>
            <input id="incident_title" className={FIELD} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="incident_area">Area</label>
              <select id="incident_area" className={FIELD} defaultValue="platform">
                <option value="platform">Platform</option>
                <option value="payments">Payments</option>
                <option value="search">Search</option>
                <option value="trust">Trust</option>
                <option value="delivery">Delivery</option>
                <option value="third_party">Third party</option>
                <option value="data">Data</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="incident_severity">Severity</label>
              <select id="incident_severity" className={FIELD} defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="incident_summary">What is happening, and what is not affected</label>
            <textarea id="incident_summary" rows={3} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="incident_reason">Reason code (required)</label>
            <select id="incident_reason" className={FIELD} required defaultValue="">
              <option value="" disabled>Choose a reason</option>
              <option value="triaged">Triaged</option>
              <option value="third_party">Waiting on a third party</option>
              <option value="monitoring">Monitoring</option>
              <option value="mitigated">Mitigated</option>
            </select>
          </div>
          <div className="admin-row-actions">
            <button type="button" className="admin-confirm-danger">Declare incident</button>
            <span className="admin-incident-meta">Every state change on an incident is recorded with a reason code.</span>
          </div>
        </form>

        <div className={`${CARD} p-5`} aria-labelledby="closed-heading">
          <h2 id="closed-heading" className="text-sm font-bold tracking-tight text-slate-900">What a runbook is for here</h2>
          <ul className="admin-facts">
            <li>
              <strong>It is a reference, not an automated action</strong>
              <span>
                The platform does not run a runbook for you. It records which one was being followed, so the next
                person can read the same steps and the postmortem has something to check the response against.
              </span>
            </li>
            <li>
              <strong>Closing needs a resolution</strong>
              <span>
                An incident cannot be closed without saying what was concluded. The audit stream keeps every state
                change, including the ones that were wrong.
              </span>
            </li>
            <li>
              <strong>A financial or safety cause gets a case</strong>
              <span>
                Where an incident has a money or safety consequence, it links to the trust or financial case that
                carries it — the incident records the outage, the case owns the consequence.
              </span>
            </li>
          </ul>
          <p className="admin-row-actions">
            <Link href="/admin/operations/flags" className={LINK_ARROW}>
              Feature flags and rollouts
            </Link>
            <Link href="/admin/audit" className={LINK_ARROW}>
              Audit explorer
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
