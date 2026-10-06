import Link from 'next/link';
import { ArrowDown, ArrowUp, Bot, Gauge, Pause, Plus, RefreshCw, ShieldAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { formatMoney } from '@/features/provider-workspace/format';
import { aiPolicies, aiProposals, aiRoutes, aiTraces } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'AI operations', robots: { index: false, follow: false } };

/**
 * /admin/ai — model governance and cost monitoring.
 *
 * ⚠️ THIS IS A UI BUILD. Every figure and row comes from features/admin/ui-placeholders.ts and nothing is wired to a
 * command yet. The controls are rendered with their real labels and geometry so the wiring pass is a matter of
 * attaching handlers, not redesigning the screen.
 *
 * ⚠️ THE INVARIANT IS ON THE PAGE, NOT ONLY IN THE CODE. A model may propose; a person decides. The proposals panel
 * below is that rule made visible — an undecided proposal has no effect on anything, and a decided one names the
 * human who decided it.
 */
export default function AiOperationsPage() {
  const productionRoutes = aiRoutes.filter(route => route.environment === 'production');
  const activeRoutes = aiRoutes.filter(route => route.status === 'active');
  const pausedRoutes = aiRoutes.filter(route => route.status === 'paused');
  const totalCostMinor = aiTraces.reduce((sum, trace) => sum + trace.costMinor, 0);
  const decided = aiTraces.filter(trace => trace.outcome === 'accepted' || trace.outcome === 'rejected');
  const accepted = decided.filter(trace => trace.outcome === 'accepted').length;
  const acceptanceRate = decided.length > 0 ? Math.round((accepted / decided.length) * 100) : null;
  const activePolicies = aiPolicies.filter(policy => policy.status === 'active');
  const draftPolicies = aiPolicies.filter(policy => policy.status === 'draft');
  const undecided = aiProposals.filter(proposal => proposal.status === 'proposed');

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">AI operations</p>
          <h1>Model governance and cost.</h1>
          <p>
            Which provider answers which purpose, at what price and latency, with what quota left — and every
            suggestion a model has made that a person has not yet decided.
          </p>
        </div>
        <span className="admin-quick-note">
          <Bot aria-hidden="true" className="h-3.5 w-3.5" />
          UI build — not wired
        </span>
      </header>

      <p className="notice" role="status">
        <strong>This screen is a UI build.</strong> The rows below are placeholder data from{' '}
        <code>features/admin/ui-placeholders.ts</code>, and the controls are rendered but not connected to any
        command. Nothing here reads or writes the database yet.
      </p>

      <p className="admin-reveal-warning" role="note">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>AI proposes; a person decides.</strong> No model here can change a project, an account, a
          credential or a payment. Anything a model produces lands as a proposal and waits for an operator who is
          named on the decision.
        </span>
      </p>

      <section className="admin-stat-grid" aria-label="AI operations summary">
        <article>
          <span>Routes</span>
          <strong>{activeRoutes.length}</strong>
          <small>{pausedRoutes.length} paused · {productionRoutes.length} in production</small>
        </article>
        <article>
          <span>Acceptance rate</span>
          <strong>{acceptanceRate === null ? '—' : `${acceptanceRate}%`}</strong>
          <small>{accepted} accepted of {decided.length} decided suggestions</small>
        </article>
        <article>
          <span>Generation cost in view</span>
          <strong>{formatMoney(totalCostMinor, 'NGN')}</strong>
          <small>Across the {aiTraces.length} traces below</small>
        </article>
        <article>
          <span>Awaiting a decision</span>
          <strong>{undecided.length}</strong>
          <small>AI output with no effect until somebody accepts it</small>
        </article>
      </section>

      <section className="admin-section" aria-labelledby="routes-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="routes-heading">Provider routing</h2>
            <p>
              Lower priority runs first. A paused route is skipped and the next one for the same purpose is tried,
              which is the fallback chain.
            </p>
          </div>
          <span>{aiRoutes.length} routes</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Model routes with cost, latency and quota</caption>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Purpose</th>
                <th scope="col">Order</th>
                <th scope="col">Quota this month</th>
                <th scope="col">Cost per 1k</th>
                <th scope="col">Latency</th>
                <th scope="col">Suggestions</th>
                <th scope="col">Controls</th>
              </tr>
            </thead>
            <tbody>
              {aiRoutes.map(route => {
                const quotaPercent = Math.min(100, Math.round((route.unitsUsed / route.monthlyQuotaUnits) * 100));
                const decidedForRoute = route.accepted + route.rejected;
                const rate = decidedForRoute > 0 ? Math.round((route.accepted / decidedForRoute) * 100) : null;
                return (
                  <tr key={route.routeKey}>
                    <td>
                      <strong>{route.routeKey}</strong>
                      <small>{route.provider} · {route.model} · {route.environment}</small>
                    </td>
                    <td><small>{route.purpose}</small></td>
                    <td>
                      <small>priority {route.priority}</small>
                      <div className="admin-row-actions" style={{ marginTop: 4 }}>
                        <button type="button" className="admin-trigger-quiet" aria-label={`Move ${route.routeKey} earlier`}>
                          <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="admin-trigger-quiet" aria-label={`Move ${route.routeKey} later`}>
                          <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td>
                      <small>{route.unitsUsed.toLocaleString('en-GB')} of {route.monthlyQuotaUnits.toLocaleString('en-GB')} units · {quotaPercent}%</small>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100" title={`${quotaPercent}% of the monthly quota is used`}>
                        <span
                          className={`block h-full rounded-full ${quotaPercent >= 80 ? 'bg-secondary' : 'bg-primary'}`}
                          style={{ width: `${quotaPercent}%` }}
                        />
                      </div>
                    </td>
                    <td><small>{formatMoney(route.costPer1kMinor, 'NGN')}</small></td>
                    <td><small>{route.averageLatencyMs.toLocaleString('en-GB')} ms average</small></td>
                    <td>
                      <small>{rate === null ? 'no decisions yet' : `${rate}% accepted`}</small>
                      <small>{route.accepted} accepted · {route.rejected} rejected</small>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className={route.status === 'paused' ? 'admin-trigger-quiet' : 'admin-trigger-danger'}>
                          <Pause aria-hidden="true" className="h-3.5 w-3.5" />
                          {route.status === 'paused' ? 'Resume route' : 'Pause AI route'}
                        </button>
                      </div>
                      {route.pausedReason ? <small>Paused: {route.pausedReason}</small> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel" aria-labelledby="policies-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="policies-heading">Policy versions</h2>
              <p>
                One active version per policy. A draft is not in force — rolling one out retires the version it
                replaces.
              </p>
            </div>
            <span>{activePolicies.length} active · {draftPolicies.length} draft</span>
          </div>

          <div className="admin-list">
            {aiPolicies.map(policy => (
              <article key={`${policy.policyKey}-${policy.version}`}>
                <div>
                  <strong>
                    {policy.policyKey} v{policy.version}
                    {' '}
                    <span className={policy.status === 'active' ? BADGE_SLATE : BADGE_AMBER}>{policy.status}</span>
                  </strong>
                  <span>{policy.purpose} · routed through {policy.routeKey}</span>
                  <span>
                    {policy.activatedAt
                      ? `In force since ${new Date(policy.activatedAt).toLocaleString('en-GB')}`
                      : 'Not in force'}
                    {policy.notes ? ` · ${policy.notes}` : ''}
                  </span>
                  <ul>
                    {policy.constraints.map(constraint => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                </div>
                {policy.status === 'draft' ? (
                  <button type="button" className="admin-confirm-amber">
                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                    Roll out policy version
                  </button>
                ) : (
                  <small>In force</small>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="admin-panel" aria-labelledby="prompt-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="prompt-heading">Test a model prompt</h2>
              <p>
                A test records a trace and checks the prompt against the policy constraints. It cannot change
                anything — the result is a proposal like any other.
              </p>
            </div>
            <Gauge aria-hidden="true" className="h-4 w-4 text-primary" />
          </div>
          <div className="grid gap-3">
            <div>
              <label className={LABEL} htmlFor="test_route">Route</label>
              <select id="test_route" className={FIELD} defaultValue={activeRoutes[0]?.routeKey ?? ''}>
                {activeRoutes.map(route => (
                  <option key={route.routeKey} value={route.routeKey}>{route.routeKey} · {route.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="test_policy">Policy version</label>
              <select id="test_policy" className={FIELD} defaultValue={activePolicies[0] ? `${activePolicies[0].policyKey} v${activePolicies[0].version}` : ''}>
                {aiPolicies.map(policy => (
                  <option key={`${policy.policyKey}-${policy.version}`} value={`${policy.policyKey} v${policy.version}`}>
                    {policy.policyKey} v{policy.version} ({policy.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="test_prompt">Prompt to test</label>
              <textarea
                id="test_prompt"
                rows={5}
                className={FIELD}
                placeholder="Paste the prompt shape under test. Nothing typed here is stored — a trace keeps a hash, a length and a redacted summary."
              />
            </div>
            <div className="admin-row-actions">
              <button type="button" className="admin-confirm-amber">Test model prompt</button>
              <span className="admin-incident-meta">Records a dry-run trace only; no provider is called from this build.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="proposals-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="proposals-heading">What the models suggested</h2>
            <p>
              A proposal has no effect until a person decides it. Accepted and refused suggestions keep the name of
              whoever decided them.
            </p>
          </div>
          <span>{undecided.length} awaiting a decision</span>
        </div>
        <div className="admin-list">
          {aiProposals.map(proposal => (
            <article key={proposal.id}>
              <div>
                <strong>
                  {proposal.actionKind}
                  {' '}
                  <span className={proposal.status === 'proposed' ? BADGE_AMBER : BADGE_SLATE}>{proposal.status}</span>
                </strong>
                <span>{proposal.target} · {proposal.proposedPayload}</span>
                <span>
                  {proposal.policyVersion} · raised {new Date(proposal.createdAt).toLocaleString('en-GB')}
                  {proposal.decidedBy ? ` · decided by ${proposal.decidedBy}` : ''}
                </span>
              </div>
              {proposal.status === 'proposed' ? (
                <div className="admin-row-actions">
                  <button type="button" className="admin-confirm-amber">Accept proposal</button>
                  <button type="button" className="admin-trigger-quiet">Reject proposal</button>
                </div>
              ) : (
                <small>{proposal.decidedAt ? new Date(proposal.decidedAt).toLocaleString('en-GB') : ''}</small>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section" aria-labelledby="traces-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="traces-heading">Recent traces</h2>
            <p>
              Privacy-safe by construction: a hash, a length and a redacted summary. There is no prompt text here,
              because there is no column for it.
            </p>
          </div>
          <span>{aiTraces.length} traces</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">AI traces with latency, cost and outcome</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Route and policy</th>
                <th scope="col">Prompt</th>
                <th scope="col">Latency</th>
                <th scope="col">Cost</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {aiTraces.map(trace => (
                <tr key={trace.id}>
                  <td><small>{new Date(trace.at).toLocaleString('en-GB')}</small></td>
                  <td>
                    <small>{trace.routeKey}</small>
                    <small>{trace.policyVersion} · {trace.purpose}</small>
                  </td>
                  <td>
                    <small>{trace.promptHash} · {trace.promptChars} characters</small>
                    <small>{trace.redactedSummary}</small>
                    {trace.subject ? <small>Subject {trace.subject}</small> : null}
                  </td>
                  <td><small>{trace.latencyMs === 0 ? 'not called' : `${trace.latencyMs.toLocaleString('en-GB')} ms`}</small></td>
                  <td><small>{formatMoney(trace.costMinor, 'NGN')}</small></td>
                  <td>
                    <span className={trace.outcome === 'accepted' ? BADGE_SLATE : BADGE_AMBER}>
                      {trace.outcome.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="fallbacks-heading">
        <h2 id="fallbacks-heading" className="text-sm font-bold tracking-tight text-slate-900">Configure provider fallbacks</h2>
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600">
          The chain is the priority order above. A route that is paused, over quota or erroring is skipped and the
          next one for the same purpose is tried — so a fallback is only useful if it exists and is allowed to answer
          the same purpose.
        </p>
        <ul className="admin-facts">
          {Object.entries(
            aiRoutes.reduce<Record<string, typeof aiRoutes>>((groups, route) => {
              groups[route.purpose] = [...(groups[route.purpose] ?? []), route];
              return groups;
            }, {}),
          ).map(([purpose, routes]) => (
            <li key={purpose}>
              <strong>{purpose}</strong>
              <span>
                {routes
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map(route => `${route.priority}. ${route.routeKey}${route.status === 'paused' ? ' (paused)' : ''}`)
                  .join(' → ')}
              </span>
            </li>
          ))}
        </ul>
        <div className="admin-row-actions">
          <button type="button" className="admin-trigger-quiet">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add a fallback route
          </button>
          <Link href="/admin/operations/flags" className={LINK_ARROW}>
            Feature flags and rollouts
          </Link>
        </div>
      </section>
    </div>
  );
}
