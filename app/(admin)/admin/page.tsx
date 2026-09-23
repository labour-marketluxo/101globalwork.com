import Link from 'next/link';
import { ArrowRight, Gavel } from 'lucide-react';
import { IncidentFeedList } from './overview-sections';
import { adminFailureCopy, INCIDENT_SEVERITIES, INCIDENT_WINDOWS } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getIncidentFeed } from '@/features/admin/incidents';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Platform overview', robots: { index: false, follow: false } };

type Overview = {
  accounts?: { active?: number; suspended?: number };
  providers?: { active?: number; pending_verifications?: number };
  work?: { open_requests?: number; completed?: number; disputed?: number };
  money?: { funded_obligations?: number; disputed_obligations?: number; eligible_payouts?: number };
  operations?: { unpublished_outbox?: number; rejected_provider_events?: number };
};

/**
 * /admin — the operational command hub.
 *
 * ⚠️ THE FILTERS NARROW THE INCIDENT FEED, NOT THE SUMMARY COUNTS, AND THE PAGE SAYS SO. Market, window and
 * severity are passed to `admin_incident_feed_command`, which reports per incident whether a market filter
 * actually applies to it. The four platform totals below come from `admin_overview_command`, which takes
 * no filters at all — relabelling them as filtered would be the easiest way to make this page lie, so they
 * keep their own heading and a note saying they ignore the filter.
 *
 * ⚠️ ACKNOWLEDGING IS NOT CLOSING. The control records that somebody looked, and at how many items; the
 * queue itself is untouched. That distinction is printed on the card and in the confirmation, because an
 * operator who believes acknowledging has cleared a backlog will stop looking at it.
 */
export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; window?: string; severity?: string; acknowledged?: string; failed?: string; step_up?: string }>;
}) {
  const query = await searchParams;
  const parsedWindow = Number.parseInt(query.window ?? '24', 10);
  const windowHours = Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 24;
  const severity = INCIDENT_SEVERITIES.includes(query.severity as (typeof INCIDENT_SEVERITIES)[number])
    ? query.severity
    : undefined;

  const supabase = await createSupabaseServerClient();
  const now = new Date();

  const [context, { data: overview, error: overviewError }, feed, reasons, { data: markets }] = await Promise.all([
    getAdminContext(),
    supabase.rpc('admin_overview_command'),
    getIncidentFeed({ marketId: query.market, windowHours, severity }),
    getReasonCodes(),
    supabase.from('public_market_catalog').select('market_id,display_name,code').order('display_name'),
  ]);

  const o = (overview ?? {}) as Overview;
  const totalsAvailable = !overviewError && Boolean(overview);
  const bootstrapSecretPresent = Boolean(process.env.PLATFORM_OWNER_BOOTSTRAP_TOKEN);
  const canAcknowledge = Boolean(context?.has('platform.admin.manage'));
  const attention = feed.counts.critical + feed.counts.high;
  const failure = adminFailureCopy(query.failed);
  const filters = { market: query.market, window: query.window, severity: query.severity };
  const filtered = Boolean(query.market || query.severity || (query.window && query.window !== '24'));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Platform overview</p>
          <h1>What needs your attention today?</h1>
          <p>
            Exceptions across trust, financials, projects and operations, each derived from the records that
            carry it. Acknowledging records that you looked; the queue stays until the underlying records move.
          </p>
        </div>
        <div className={`admin-health ${attention ? 'attention' : ''}`}>
          <strong>{attention}</strong>
          <span>{attention ? 'critical or high incidents' : 'nothing critical outstanding'}</span>
        </div>
      </header>

      {bootstrapSecretPresent ? (
        <p className="notice" role="status">
          <strong>Security cleanup:</strong> the one-time Platform Owner bootstrap secret is still configured.
          Remove <code>PLATFORM_OWNER_BOOTSTRAP_TOKEN</code> from the Production environment and redeploy.
        </p>
      ) : null}

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not save.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {query.step_up === '1' && !query.acknowledged ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Try the action again — nothing was saved by
          the attempt that was refused.
        </p>
      ) : null}

      {query.acknowledged ? (
        <p className="notice" role="status">
          Acknowledged <code>{query.acknowledged}</code>. The queue is unchanged: this records that you looked,
          and at how many items, so a later increase reads as new rather than as already reviewed.
        </p>
      ) : null}

      <form method="get" action="/admin" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="market">
            Market or region
          </label>
          <select id="market" name="market" defaultValue={query.market ?? ''} className="admin-field">
            <option value="">Every market</option>
            {(markets ?? []).map(market => (
              <option key={market.market_id} value={market.market_id}>
                {market.display_name} ({market.code})
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="window">
            Time window
          </label>
          <select id="window" name="window" defaultValue={String(windowHours)} className="admin-field">
            {INCIDENT_WINDOWS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="severity">
            Severity
          </label>
          <select id="severity" name="severity" defaultValue={severity ?? ''} className="admin-field">
            <option value="">Every severity</option>
            {INCIDENT_SEVERITIES.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="secondary-button">
          Apply filters
        </button>
        {filtered ? (
          <Link className="text-button" href="/admin">
            Clear
          </Link>
        ) : null}
      </form>

      {!feed.allowed ? (
        <section className="admin-section admin-panel" role="alert">
          <h2>
            {feed.unavailable
              ? 'The incident feed could not be read'
              : 'Incidents are behind a capability your role does not hold'}
          </h2>
          <p>
            {feed.unavailable
              ? 'Nothing has changed. Reload the page to try again — do not read this as an all-clear.'
              : 'Reading the incident feed needs operations or administration access. The platform totals below are still available to you, and nothing has changed.'}
          </p>
        </section>
      ) : (
        <>
          <p className="admin-incident-meta">
            <span>
              Window: last {feed.windowHours} hour{feed.windowHours === 1 ? '' : 's'}
              {feed.since ? ` · since ${new Date(feed.since).toLocaleString('en-GB')}` : ''}
            </span>
            <span>{feed.counts.outstanding} outstanding</span>
            <span>{feed.counts.unacknowledged} unacknowledged</span>
            {feed.counts.recurred > 0 ? <span>{feed.counts.recurred} grown since acknowledgement</span> : null}
          </p>
          <IncidentFeedList
            feed={feed}
            now={now}
            reasons={reasons.incident_ack}
            canAcknowledge={canAcknowledge}
            filters={filters}
          />
        </>
      )}

      <section className="admin-section" aria-labelledby="shortcuts-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="shortcuts-heading">Case queues</h2>
            <p>The queues an incident usually leads to, and the audit log that records what happened next.</p>
          </div>
        </div>
        <div className="admin-action-grid">
          <Link href="/admin/trust/verifications">
            <strong>Open the verification queue</strong>
            <span>{o.providers?.pending_verifications ?? 0} pending</span>
          </Link>
          <Link href="/admin/projects">
            <strong>Projects in dispute</strong>
            <span>{o.work?.disputed ?? 0} open</span>
          </Link>
          <Link href="/admin/money">
            <strong>Financial disputes</strong>
            <span>{o.money?.disputed_obligations ?? 0} open</span>
          </Link>
          <Link href="/admin/audit">
            <strong>
              Jump to the audit log
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </strong>
            <span>Who changed what, and why</span>
          </Link>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="totals-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="totals-heading">Platform totals</h2>
            <p>
              Whole-platform counts. The filters above do not narrow these — a filtered total that looked
              unfiltered would be worse than no total at all.
            </p>
          </div>
        </div>
        {/* ⚠️ NOT ZEROS WHEN THE READ WAS REFUSED. `admin_overview_command` refuses roles that hold none of
            administration, audit or operations access; rendering its empty result would show "0 active
            accounts" to somebody who simply cannot read the number, and a wrong figure is worse than none. */}
        {!totalsAvailable ? (
          <p className="empty-admin">
            These totals are not available to your role. They need platform administration, audit or
            operations access — the incident feed above is the part of this page your role can read.
          </p>
        ) : (
          <div className="admin-stat-grid">
            <article>
              <span>Active accounts</span>
              <strong>{o.accounts?.active ?? 0}</strong>
              <small>{o.accounts?.suspended ?? 0} suspended</small>
            </article>
            <article>
              <span>Active providers</span>
              <strong>{o.providers?.active ?? 0}</strong>
              <small>{o.providers?.pending_verifications ?? 0} awaiting review</small>
            </article>
            <article>
              <span>Open work</span>
              <strong>{o.work?.open_requests ?? 0}</strong>
              <small>{o.work?.completed ?? 0} completed</small>
            </article>
            <article>
              <span>Eligible payouts</span>
              <strong>{o.money?.eligible_payouts ?? 0}</strong>
              <small>{o.money?.funded_obligations ?? 0} funded obligations</small>
            </article>
          </div>
        )}
      </section>

      <section className="admin-section" aria-labelledby="control-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="control-heading">Control areas</h2>
            <p>
              {context?.isOwner ? 'Platform owner access.' : `Signed in as ${context?.roles[0]?.name ?? 'administrator'}.`}{' '}
              Every area stays capability-driven, so this list is what you can reach rather than an index of
              everything that exists.
            </p>
          </div>
          <span className="admin-quick-note">
            <Gavel aria-hidden="true" className="h-3.5 w-3.5" />
            Capability-based
          </span>
        </div>
        <div className="admin-module-grid">
          <Link href="/admin/accounts">
            <strong>Accounts</strong>
            <span>People, standings, sessions and recovery</span>
          </Link>
          <Link href="/admin/providers">
            <strong>Providers</strong>
            <span>Supply, readiness, credentials and holds</span>
          </Link>
          <Link href="/admin/trust/verifications">
            <strong>Trust &amp; safety</strong>
            <span>Verification and provider trust</span>
          </Link>
          <Link href="/admin/projects">
            <strong>Projects</strong>
            <span>Requests, assignments and interventions</span>
          </Link>
          <Link href="/admin/money">
            <strong>Financials</strong>
            <span>Obligations, payouts, refunds and disputes</span>
          </Link>
          <Link href="/admin/discovery">
            <strong>Discovery &amp; SEO</strong>
            <span>Taxonomy, public pages and indexability</span>
          </Link>
          <Link href="/admin/operations">
            <strong>Operations</strong>
            <span>Events, failures and system health</span>
          </Link>
          <Link href="/admin/audit">
            <strong>Audit</strong>
            <span>Who changed what, when and why</span>
          </Link>
          <Link href="/admin/access">
            <strong>Users &amp; access</strong>
            <span>Administrator roles and invitations</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
