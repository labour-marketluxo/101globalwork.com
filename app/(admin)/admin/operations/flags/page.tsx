import Link from 'next/link';
import { ArrowLeft, Flag, Plus, ShieldAlert, SlidersHorizontal, Undo2 } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { featureFlags } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Feature flags', robots: { index: false, follow: false } };

/**
 * /admin/operations/flags — progressive delivery.
 *
 * ⚠️ THIS IS A UI BUILD. Rows come from features/admin/ui-placeholders.ts and nothing is wired.
 *
 * ⚠️ THE RELEASE RULE IS ON THE SCREEN AND IN THE DATA. A flag marked as guarding authoritative data cannot be given
 * a partial cohort: half the cohort writing under one meaning and half under another is not an experiment, it is two
 * platforms sharing a database. Those flags are shown with the rule beside them, which is why one of the rows below
 * reads "rolled back" with the reason recorded.
 */
export default function FeatureFlagsPage() {
  const active = featureFlags.filter(flag => flag.status === 'active');
  const stopped = featureFlags.filter(flag => flag.status === 'paused' || flag.status === 'rolled_back');
  const guarded = featureFlags.filter(flag => flag.guardsAuthoritativeData);
  const partial = featureFlags.filter(flag => flag.cohortPercent > 0 && flag.cohortPercent < 100 && flag.status === 'active');

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Operations · features</p>
          <h1>Feature flags and rollouts.</h1>
          <p>
            What is switched on, for how much of the audience, and which flags are allowed to be partial — because a
            flag that changes what a write means cannot be.
          </p>
        </div>
        <div className="admin-row-actions">
          <span className="admin-quick-note">
            <Flag aria-hidden="true" className="h-3.5 w-3.5" />
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

      <p className="admin-reveal-warning" role="note">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>A flag may not change what a write means.</strong> Flags decide who SEES a change, never which
          authoritative record a cohort produces. A flag marked as guarding authoritative data is refused a partial
          rollout outright — it is either released to everybody or not released at all.
        </span>
      </p>

      <section className="admin-stat-grid" aria-label="Rollout summary">
        <article><span>Active flags</span><strong>{active.length}</strong><small>of {featureFlags.length} recorded</small></article>
        <article><span>Partial rollouts</span><strong>{partial.length}</strong><small>Between 1% and 99% of the audience</small></article>
        <article><span>Stopped</span><strong>{stopped.length}</strong><small>Paused or rolled back</small></article>
        <article><span>Guarding authoritative data</span><strong>{guarded.length}</strong><small>Cannot be partial, by rule</small></article>
      </section>

      <section className="admin-section" aria-labelledby="flags-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="flags-heading">Flags</h2>
            <p>
              Cohort percentage is the share of the audience that receives the change. A kill-switch sets it to zero
              without rolling anything back.
            </p>
          </div>
          <span>{featureFlags.length} flags</span>
        </div>

        <div className="admin-list">
          {featureFlags.map(flag => (
            <article key={flag.id}>
              <div>
                <strong>
                  {flag.name}
                  {' '}
                  <span className={flag.status === 'active' ? BADGE_SLATE : BADGE_AMBER}>{flag.status.replaceAll('_', ' ')}</span>
                  {flag.guardsAuthoritativeData ? (
                    <span className={BADGE_AMBER}>
                      <ShieldAlert aria-hidden="true" className="h-3 w-3" />
                      guards authoritative data
                    </span>
                  ) : null}
                </strong>
                <span>{flag.description}</span>
                <span>
                  <code>{flag.key}</code> · {flag.environment} · owner {flag.owner} · updated{' '}
                  {new Date(flag.updatedAt).toLocaleString('en-GB')}
                </span>
                <span>
                  Audience: <strong>{flag.cohortPercent}%</strong>
                  {flag.guardsAuthoritativeData && flag.cohortPercent !== 100 && flag.cohortPercent !== 0
                    ? ' — this should not be possible, and the flag is flagged here rather than hidden'
                    : flag.guardsAuthoritativeData
                      ? ' — all or nothing, by rule'
                      : ' — partial rollout allowed'}
                </span>
                <details className="identity-details">
                  <summary>Change history ({flag.events.length})</summary>
                  <ul className="admin-session-list">
                    {flag.events.map(event => (
                      <li key={`${flag.id}-${event.at}`}>
                        <strong>{event.action.replaceAll('_', ' ')}</strong>
                        <span>{event.note}</span>
                        <small>{event.actor} · {new Date(event.at).toLocaleString('en-GB')} · {event.reasonCode.replaceAll('_', ' ')}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
              <div className="admin-row-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`cohort-${flag.id}`}>Target cohort percentage for {flag.name}</label>
                  <select id={`cohort-${flag.id}`} className={`${FIELD} w-24`} defaultValue={String(flag.cohortPercent)} disabled={flag.guardsAuthoritativeData}>
                    <option value="0">0%</option>
                    <option value="10">10%</option>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="100">100%</option>
                  </select>
                  <button type="button" className="admin-trigger-quiet" disabled={flag.guardsAuthoritativeData}>
                    <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                    Adjust cohort
                  </button>
                </div>
                <button type="button" className="admin-trigger-quiet">
                  {flag.status === 'active' ? 'Pause flag' : 'Resume flag'}
                </button>
                <button type="button" className="admin-trigger-danger">
                  <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Trigger rollback
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section admin-panel" aria-labelledby="create-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="create-heading">Create a flag</h2>
            <p>
              A flag starts paused at 0% and is raised deliberately. Marking it as guarding authoritative data locks
              the cohort to all-or-nothing from the start.
            </p>
          </div>
        </div>
        <form className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="flag_key">Key</label>
            <input id="flag_key" className={FIELD} placeholder="e.g. quotes.builder_v3" />
          </div>
          <div>
            <label className={LABEL} htmlFor="flag_name">Display name</label>
            <input id="flag_name" className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="flag_description">What it changes, and what it must not change</label>
            <textarea id="flag_description" rows={3} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="flag_environment">Environment</label>
            <select id="flag_environment" className={FIELD} defaultValue="production">
              <option value="development">Development</option>
              <option value="preview">Preview</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="flag_guard">Does it change what a write means?</label>
            <select id="flag_guard" className={FIELD} defaultValue="yes">
              <option value="yes">Yes — lock it to all or nothing</option>
              <option value="no">No — it only changes what people see</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="flag_reason">Reason code (required)</label>
            <select id="flag_reason" className={FIELD} required defaultValue="">
              <option value="" disabled>Choose a reason</option>
              <option value="staged_rollout">Staged rollout</option>
              <option value="beta_cohort">Beta cohort</option>
              <option value="experiment_finished">The experiment finished</option>
            </select>
          </div>
          <div className="admin-row-actions sm:col-span-2">
            <button type="button" className="admin-confirm-amber">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create flag
            </button>
            <Link href="/admin/operations/incidents" className={LINK_ARROW}>
              Incidents and system operations
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
