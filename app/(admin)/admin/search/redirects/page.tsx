import Link from 'next/link';
import { AlertTriangle, ArrowLeft, GitMerge, Plus, Route } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { redirects, searchPages } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Redirect registry', robots: { index: false, follow: false } };

/**
 * /admin/search/redirects — equity-preserving redirects.
 *
 * ⚠️ THIS IS A UI BUILD. The rows come from features/admin/ui-placeholders.ts and nothing is wired.
 *
 * ⚠️ THE TWO SAFETY RULES ARE SHOWN AS STATE, NOT AS A PROMISE. A chain is drawn where one exists, because the rule
 * is enforced when a redirect is written and a row can still become a chain later — when somebody redirects its
 * destination. The canonical entity behind each redirect is displayed so a redirect is never the only record of
 * where an entity went.
 */
export default function RedirectRegistryPage() {
  const active = redirects.filter(row => row.disabledAt === null);
  const disabled = redirects.filter(row => row.disabledAt !== null);
  const chained = active.filter(row => row.chainsInto !== null);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Search · redirects</p>
          <h1>Redirect registry.</h1>
          <p>
            Retired public paths and where they point now. Each row keeps the canonical entity it belongs to, so the
            entity — not the path — remains the identity that survives a rename.
          </p>
        </div>
        <div className="admin-row-actions">
          <span className="admin-quick-note">
            <Route aria-hidden="true" className="h-3.5 w-3.5" />
            UI build — not wired
          </span>
          <Link className="secondary-button" href="/admin/search">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Search presence
          </Link>
        </div>
      </header>

      <p className="notice" role="status">
        <strong>This screen is a UI build.</strong> The rows are placeholder data; the controls are not connected to a
        command yet.
      </p>

      {chained.length > 0 ? (
        <p className="admin-reveal-warning" role="alert">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{chained.length} redirect is part of a chain.</strong> The registry refuses a chain at the moment
            it is written, so this one became a chain later: its destination is itself redirected. Point it at the
            final path, or disable it and let the older redirect carry the traffic.
          </span>
        </p>
      ) : null}

      <section className="admin-stat-grid" aria-label="Redirect summary">
        <article><span>Active</span><strong>{active.length}</strong><small>Redirects in force</small></article>
        <article><span>Chained</span><strong>{chained.length}</strong><small>Pointing at a path that also redirects</small></article>
        <article><span>Disabled</span><strong>{disabled.length}</strong><small>Kept for the record, no longer served</small></article>
        <article><span>Entity linkage</span><strong>{active.length}</strong><small>Every row names the canonical entity it belongs to</small></article>
      </section>

      <section className="admin-section" aria-labelledby="registry-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="registry-heading">In force</h2>
            <p>Permanent redirects for retired paths. A 308 is used where the method must be preserved.</p>
          </div>
          <span>{active.length} rows</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Active redirects with their canonical entity and chain state</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Canonical entity</th>
                <th scope="col">Chain</th>
                <th scope="col">Created</th>
                <th scope="col">Controls</th>
              </tr>
            </thead>
            <tbody>
              {active.map(row => (
                <tr key={row.id}>
                  <td><code>{row.fromPath}</code></td>
                  <td>
                    <code>{row.toPath}</code>
                    <small>{row.status} permanent</small>
                  </td>
                  <td><small>{row.targetEntityRef}</small></td>
                  <td>
                    {row.chainsInto ? (
                      <span className={BADGE_AMBER}>
                        <GitMerge aria-hidden="true" className="h-3 w-3" />
                        chains into {row.chainsInto}
                      </span>
                    ) : (
                      <span className={BADGE_SLATE}>resolves in one hop</span>
                    )}
                  </td>
                  <td>
                    <small>{new Date(row.createdAt).toLocaleDateString('en-GB')}</small>
                    <small>{row.reasonCode?.replaceAll('_', ' ') ?? 'no reason recorded'}</small>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="admin-trigger-quiet">Validate route chain</button>
                      <button type="button" className="admin-trigger-danger">Disable redirect</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {disabled.length > 0 ? (
        <section className="admin-section" aria-labelledby="disabled-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="disabled-heading">Disabled</h2>
              <p>
                Kept rather than deleted: a disabled redirect is evidence that a path used to point somewhere, and
                deleting it would erase the only record of that decision.
              </p>
            </div>
            <span>{disabled.length} rows</span>
          </div>
          <div className="admin-list">
            {disabled.map(row => (
              <article key={row.id}>
                <div>
                  <strong>{row.fromPath} → {row.toPath}</strong>
                  <span>{row.targetEntityRef}</span>
                </div>
                <small>Disabled {row.disabledAt ? new Date(row.disabledAt).toLocaleDateString('en-GB') : ''}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="admin-section two-column-admin">
        <form className={`${CARD} grid gap-3 p-5`}>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Create a redirect</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              The destination is chosen from existing routes rather than typed, so a redirect cannot point at a page
              that does not exist.
            </p>
          </div>
          <div>
            <label className={LABEL} htmlFor="redirect_from">Retired path</label>
            <input id="redirect_from" className={FIELD} placeholder="/ng/abuja/plumbing/leaking-tap" />
          </div>
          <div>
            <label className={LABEL} htmlFor="redirect_to">Destination route</label>
            <select id="redirect_to" className={FIELD} defaultValue={searchPages[0]?.id}>
              {searchPages.map(page => (
                <option key={page.id} value={page.id}>{page.canonicalPath} · {page.entityRef}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="redirect_status">Status</label>
              <select id="redirect_status" className={FIELD} defaultValue="301">
                <option value="301">301 permanent</option>
                <option value="308">308 permanent, preserving the method</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="redirect_reason">Reason code (required)</label>
              <select id="redirect_reason" className={FIELD} required defaultValue="">
                <option value="" disabled>Choose a reason</option>
                <option value="canonical_fix">Fixing which URL is canonical</option>
                <option value="entity_retired">The entity behind the page was retired</option>
                <option value="duplicate_content">The page duplicates another one</option>
                <option value="quality_gate">The page no longer meets the quality gate</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="redirect_note">Why this redirect</label>
            <input id="redirect_note" className={FIELD} placeholder="At least ten characters, recorded with the change." />
          </div>
          <div className="admin-row-actions">
            <button type="button" className="admin-confirm-amber">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create redirect
            </button>
            <button type="button" className="admin-trigger-quiet">Validate route chain</button>
          </div>
        </form>

        <div className={`${CARD} p-5`} aria-labelledby="rule-heading">
          <h2 id="rule-heading" className="text-sm font-bold tracking-tight text-slate-900">What is refused</h2>
          <ul className="admin-facts">
            <li>
              <strong>A loop</strong>
              <span>
                A redirect whose destination eventually points back at the path it came from. Refused before the row is
                written, with the hop it would have gone through.
              </span>
            </li>
            <li>
              <strong>A chain</strong>
              <span>
                A redirect whose destination is itself redirected. Also refused — the correct destination is the final
                path, and two hops lose both equity and clarity.
              </span>
            </li>
            <li>
              <strong>A destination that is not a route</strong>
              <span>
                The destination is a route id, so a redirect cannot be pointed at a page that does not exist or at a
                free-text path somebody typed.
              </span>
            </li>
          </ul>
          <p className="admin-incident-meta">
            Disabling instead of deleting keeps the history of a path; the entity linkage on the row is what survives
            even then.{' '}
            <Link href="/admin/search/sitemaps" className={LINK_ARROW}>
              Sitemaps and schema
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
