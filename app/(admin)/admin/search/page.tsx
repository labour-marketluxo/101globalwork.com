import Link from 'next/link';
import { ArrowRight, FileWarning, Globe2, Map as MapIcon, RefreshCw, ScanSearch } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { redirects, searchPages, searchPresence, sitemaps } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Search presence', robots: { index: false, follow: false } };

/**
 * /admin/search — the SEO health dashboard.
 *
 * ⚠️ THIS IS A UI BUILD. Every figure comes from features/admin/ui-placeholders.ts and no control is wired yet.
 *
 * ⚠️ ORGANIC CONVERSION IS NOT ON THIS SCREEN, AND THE SCREEN SAYS WHY. The platform stores no visit or session
 * data, so there is no funnel to show — a panel of invented percentages would be the most misleading thing on the
 * page, more so than an empty one.
 */
export default function SearchPresencePage() {
  const counts = searchPresence.counts;
  const noindexShare = Math.round((counts.noindex / counts.routes) * 100);
  const staleRoutes = searchPages.filter(page => page.indexability !== 'indexable');
  const chainedRedirects = redirects.filter(row => row.chainsInto !== null && row.disabledAt === null);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Search presence</p>
          <h1>What can be found, and what cannot.</h1>
          <p>
            Indexability, canonical alignment, structured data, sitemap freshness and language coverage across every
            market — computed from the platform&apos;s own route table rather than from a third-party report.
          </p>
        </div>
        <span className="admin-quick-note">
          <Globe2 aria-hidden="true" className="h-3.5 w-3.5" />
          UI build — not wired
        </span>
      </header>

      <p className="notice" role="status">
        <strong>This screen is a UI build.</strong> The rows are placeholder data from{' '}
        <code>features/admin/ui-placeholders.ts</code> and the controls are not connected to a reader yet.
      </p>

      <section className="admin-stat-grid" aria-label="Indexability summary">
        <article>
          <span>Routes</span>
          <strong>{counts.routes.toLocaleString('en-GB')}</strong>
          <small>{counts.indexable.toLocaleString('en-GB')} indexable · {counts.noindex.toLocaleString('en-GB')} held back ({noindexShare}%)</small>
        </article>
        <article>
          <span>Canonical gaps</span>
          <strong>{counts.canonicalMissing}</strong>
          <small>{counts.canonicalPointer} routes point at another canonical page</small>
        </article>
        <article>
          <span>Structured data missing</span>
          <strong>{counts.schemaMissing}</strong>
          <small>On pages that are otherwise indexable</small>
        </article>
        <article>
          <span>Stale evaluations</span>
          <strong>{counts.staleEvaluations}</strong>
          <small>Not re-checked in 30 days</small>
        </article>
      </section>

      <section className="admin-section" aria-labelledby="audit-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="audit-heading">Audit and sitemap</h2>
            <p>
              Re-running the audit re-checks every route against its quality gates. Regenerating the index recomputes
              the inputs the application reads; the XML itself is produced on request and never stored twice.
            </p>
          </div>
          <span>
            Last audit {new Date(searchPresence.recentAudits[0].at).toLocaleString('en-GB')}
          </span>
        </div>
        <div className={`${CARD} p-5`}>
          <div className="admin-row-actions">
            <button type="button" className="admin-confirm-amber">
              <ScanSearch aria-hidden="true" className="h-4 w-4" />
              Run search audit
            </button>
            <button type="button" className="admin-trigger-quiet">
              <MapIcon aria-hidden="true" className="h-4 w-4" />
              Regenerate sitemap index
            </button>
            <button type="button" className="admin-trigger-quiet">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Export indexability report
            </button>
            <span className="admin-incident-meta">Every one of these is recorded in the audit stream with a reason code.</span>
          </div>

          <dl className="admin-facts">
            <div>
              <dt>Sitemap generated</dt>
              <dd>{new Date(searchPresence.sitemapFreshness.lastGeneratedAt).toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Newest route change</dt>
              <dd>
                {new Date(searchPresence.sitemapFreshness.lastRouteChangeAt).toLocaleString('en-GB')}
                {' — later than the last generation, so the next request will not be identical to the last one.'}
              </dd>
            </div>
            <div>
              <dt>{searchPresence.sitemapFreshness.note}</dt>
              <dd>{sitemaps.map(entry => `${entry.name}: ${entry.indexableUrls} urls`).join(' · ')}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className={`${CARD} p-5`} aria-labelledby="markets-heading">
          <h2 id="markets-heading" className="text-sm font-bold tracking-tight text-slate-900">By market</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Indexability is decided per market, because supply is what makes a locality page worth publishing.
          </p>
          <div className="mt-3 admin-table-wrap">
            <table className="admin-table">
              <caption className="sr-only">Indexability by market</caption>
              <thead>
                <tr>
                  <th scope="col">Market</th>
                  <th scope="col">Routes</th>
                  <th scope="col">Indexable</th>
                  <th scope="col">Last evaluated</th>
                </tr>
              </thead>
              <tbody>
                {searchPresence.markets.map(market => (
                  <tr key={market.marketId}>
                    <td><strong>{market.name}</strong><small>{market.code}</small></td>
                    <td><small>{market.routes}</small></td>
                    <td><small>{market.indexable}</small></td>
                    <td><small>{new Date(market.lastEvaluatedAt).toLocaleString('en-GB')}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${CARD} p-5`} aria-labelledby="hreflang-heading">
          <h2 id="hreflang-heading" className="text-sm font-bold tracking-tight text-slate-900">Language coverage</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            How many routes carry a name in each language. A market with a translation but no localized page is a gap
            worth seeing.
          </p>
          <ul className="admin-facts">
            {searchPresence.hreflang.map(entry => (
              <li key={entry.language}>
                <strong>{entry.language}</strong>
                <span>
                  {entry.coverage} route(s) · {entry.markets.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="attention-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="attention-heading">Pages needing attention</h2>
            <p>Routes that are held back or that carry a schema error, with the reason recorded beside them.</p>
          </div>
          <span>{staleRoutes.length + sitemaps.reduce((sum, entry) => sum + entry.schemaErrors.length, 0)} items</span>
        </div>

        <div className="admin-list">
          {staleRoutes.map(page => (
            <article key={page.id}>
              <div>
                <strong>{page.canonicalPath}</strong>
                <span>
                  <span className={page.indexability === 'indexable' ? BADGE_SLATE : BADGE_AMBER}>
                    {page.indexability.replaceAll('_', ' ')}
                  </span>
                  {' '}
                  {page.noindexReasons[0] ?? page.schemaErrors[0] ?? 'No reason recorded'}
                </span>
              </div>
              <Link className="text-button" href={`/admin/search/pages/${page.id}`}>
                Inspect <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </article>
          ))}
          {sitemaps.flatMap(entry => entry.schemaErrors.map(error => (
            <article key={`${entry.code}-${error.path}`}>
              <div>
                <strong>{error.path}</strong>
                <span className="admin-incident-meta">
                  <FileWarning aria-hidden="true" className="h-3.5 w-3.5" />
                  {error.detail} · market {entry.code}
                </span>
              </div>
              <Link className="text-button" href="/admin/search/sitemaps">Sitemaps and schema</Link>
            </article>
          )))}
        </div>

        {chainedRedirects.length > 0 ? (
          <p className="admin-reveal-warning" role="note">
            <FileWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {chainedRedirects.length} redirect points at a path that is itself redirected. The registry refuses a
              chain on write; one already exists, which usually means a destination moved after the redirect was
              created.{' '}
              <Link href="/admin/search/redirects" className={LINK_ARROW}>
                Open the registry
              </Link>
            </span>
          </p>
        ) : null}
      </section>

      <p className="admin-incident-meta">
        <span>{searchPresence.analyticsNote}</span>
      </p>
    </div>
  );
}
