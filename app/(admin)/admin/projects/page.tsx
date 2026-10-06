import Link from 'next/link';
import { ArrowRight, ExternalLink } from '@/components/ui/icons';
import { ExceptionTags, PhaseBadge, StateBadge } from '@/components/admin/ProjectSections';
import {
  PROJECT_EXCEPTIONS,
  PROJECT_EXCEPTION_FILTER_COPY,
} from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getProjectOperations } from '@/features/admin/projects';
import { REQUEST_STATE_COPY } from '@/features/requests/state-copy';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Projects', robots: { index: false, follow: false } };

/**
 * /admin/projects — the exception directory.
 *
 * ⚠️ IT IS A DIRECTORY OF EXCEPTIONS, NOT OF PROJECTS. Every row can be filtered by which exception fired, and
 * each row prints the ones that did. A list of every project on the platform would be a worse tool for the
 * question this screen exists to answer — which ones need somebody today — and the ones that do are a small
 * minority of it.
 *
 * ⚠️ "FINANCIALLY INCONSISTENT" IS A DISAGREEMENT, NOT A VERDICT. The tags name two facts that cannot both be
 * true; which of them is wrong is what the diagnostics page is for. The financial console stays the place
 * money moves, and every row links to it.
 */
export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; market?: string; exception?: string; q?: string }>;
}) {
  const query = await searchParams;
  const state = query.state && REQUEST_STATE_COPY[query.state] ? query.state : undefined;
  const exception = PROJECT_EXCEPTIONS.includes(query.exception as (typeof PROJECT_EXCEPTIONS)[number])
    ? query.exception
    : undefined;

  const supabase = await createSupabaseServerClient();
  const [context, directory, { data: markets }] = await Promise.all([
    getAdminContext(),
    getProjectOperations({ state, marketId: query.market, exception: exception === 'any' ? undefined : exception, search: query.q }),
    supabase.from('public_market_catalog').select('market_id,display_name,code').order('display_name'),
  ]);

  const canRead = Boolean(context?.has('platform.projects.read') || context?.has('platform.projects.intervene') || context?.has('platform.admin.manage'));
  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>
            Project operations are behind the platform projects capability. Nothing has changed — ask a platform
            owner or an operations lead if you need it.
          </p>
        </section>
      </div>
    );
  }

  const filtered = Boolean(state || query.market || (exception && exception !== 'any') || query.q);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Projects</p>
          <h1>Projects that need somebody.</h1>
          <p>
            Blocked, disputed, stale and financially inconsistent work across every market, with the exception
            named on the row and the records behind it one click away.
          </p>
        </div>
        <span className="admin-quick-note">Interventions are commands</span>
      </header>

      {!directory.allowed ? (
        <section className="admin-section admin-panel" role="alert">
          <h2>{directory.unavailable ? 'The directory could not be read' : 'Not available to your role'}</h2>
          <p>
            {directory.unavailable
              ? 'Nothing has changed. Reload the page to try again.'
              : 'This list needs the platform projects capability.'}
          </p>
        </section>
      ) : (
        <>
          <section className="admin-stat-grid" aria-label="Exception summary">
            <article><span>Projects tracked</span><strong>{directory.counts.total}</strong><small>Every request on the platform</small></article>
            <article><span>Blocked or held</span><strong>{directory.counts.blocked}</strong><small>A hold, an open issue or a blocked task</small></article>
            <article><span>In dispute</span><strong>{directory.counts.disputed}</strong><small>Request in dispute, or nothing holding it</small></article>
            <article><span>Financially inconsistent</span><strong>{directory.counts.financiallyInconsistent}</strong><small>State and money disagree</small></article>
          </section>
          <p className="admin-incident-meta">
            <span>
              Whole-platform counts over the same predicates the rows carry. {directory.counts.stale} project(s)
              are stale today. The filters below narrow the list, not these numbers.
            </span>
          </p>

          <form method="get" action="/admin/projects" className="admin-filters">
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="q">Search</label>
              <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="title, provider or customer name" className="admin-field" />
            </div>
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="exception">Exception</label>
              <select id="exception" name="exception" defaultValue={query.exception ?? 'any'} className="admin-field">
                {PROJECT_EXCEPTIONS.map(value => (
                  <option key={value} value={value}>{PROJECT_EXCEPTION_FILTER_COPY[value]}</option>
                ))}
              </select>
            </div>
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="state">State</label>
              <select id="state" name="state" defaultValue={query.state ?? ''} className="admin-field">
                <option value="">Every state</option>
                {Object.entries(REQUEST_STATE_COPY).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="market">Market</label>
              <select id="market" name="market" defaultValue={query.market ?? ''} className="admin-field">
                <option value="">Every market</option>
                {(markets ?? []).map(market => (
                  <option key={market.market_id} value={market.market_id}>{market.display_name} ({market.code})</option>
                ))}
              </select>
            </div>
            <button type="submit" className="secondary-button">Filter projects</button>
            {filtered ? <Link className="text-button" href="/admin/projects">Clear</Link> : null}
          </form>

          {directory.projects.length === 0 ? (
            <p className="empty-admin">
              No project matches that filter. That is a result rather than an absence — the counts above are the
              whole platform.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="sr-only">Projects with their state, exceptions and financial link</caption>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Parties</th>
                    <th scope="col">State</th>
                    <th scope="col">Exceptions</th>
                    <th scope="col">Money</th>
                    <th scope="col">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.projects.map(project => (
                    <tr key={project.requestId}>
                      <td>
                        <strong>{project.title}</strong>
                        <small>
                          {project.marketName ?? 'No market recorded'}
                          {project.marketCode ? ` (${project.marketCode})` : ''}
                          {' · '}
                          {project.requestId.slice(0, 8)}
                        </small>
                        <small>
                          Updated {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('en-GB') : 'at an unrecorded time'}
                        </small>
                      </td>
                      <td>
                        <small>Customer {project.customer.name}{project.customer.contactMasked ? ` · ${project.customer.contactMasked}` : ''}</small>
                        {project.provider ? (
                          <small>Provider {project.provider.name} · assignment {project.provider.assignmentStatus.replaceAll('_', ' ')}</small>
                        ) : (
                          <small>No provider assigned yet</small>
                        )}
                        {project.issue ? (
                          <small>
                            {project.issue.kind ? `${project.issue.kind.replaceAll('_', ' ')} issue` : 'Trust case'}
                            {project.issue.status ? ` · ${project.issue.status}` : ''}
                            {project.issue.legalHold || project.issue.trustCaseHold ? ' · legal hold' : ''}
                          </small>
                        ) : null}
                        {project.blockedTasks > 0 ? <small>{project.blockedTasks} blocked task(s)</small> : null}
                      </td>
                      <td>
                        <StateBadge state={project.state} />
                        <small><PhaseBadge phase={project.phase} /></small>
                      </td>
                      <td><ExceptionTags tags={project.exceptions} /></td>
                      <td>
                        {project.money.obligationId ? (
                          <>
                            <small>{project.money.obligationStatus?.replaceAll('_', ' ') ?? 'unknown'}{project.money.payoutStatus ? ` · payout ${project.money.payoutStatus}` : ''}</small>
                            <Link className="text-button" href={`/admin/money/${project.money.obligationId}`}>
                              Link to financial case <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                            </Link>
                          </>
                        ) : (
                          <small>No payment obligation exists for this project yet</small>
                        )}
                      </td>
                      <td>
                        <Link className="text-button" href={`/admin/projects/${project.requestId}`}>
                          Open project diagnostics <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
