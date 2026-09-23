import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCode2, RefreshCw, Send } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { sitemapGenerationLog, sitemaps } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Sitemaps and structured data', robots: { index: false, follow: false } };

/**
 * /admin/search/sitemaps — generation and schema hub.
 *
 * ⚠️ THIS IS A UI BUILD. Rows come from features/admin/ui-placeholders.ts and nothing is wired.
 *
 * ⚠️ THE XML IS NOT STORED, AND THE PAGE SAYS SO. The application generates the sitemap on request from the route
 * table; this console tracks the INPUTS (counts, freshness, submission state) and the schema errors, rather than
 * keeping a second copy of the XML that could disagree with the live one.
 */
export default function SitemapsPage() {
  const totalUrls = sitemaps.reduce((sum, entry) => sum + entry.indexableUrls, 0);
  const totalExcluded = sitemaps.reduce((sum, entry) => sum + entry.excludedUrls, 0);
  const schemaErrorCount = sitemaps.reduce((sum, entry) => sum + entry.schemaErrors.length, 0);
  const notSubmitted = sitemaps.filter(entry => entry.submissionStatus === 'not submitted');

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Search · sitemaps</p>
          <h1>Sitemaps and structured data.</h1>
          <p>
            What each market index would contain right now, when it was last generated and submitted, and which
            pages carry structured data that does not parse.
          </p>
        </div>
        <div className="admin-row-actions">
          <span className="admin-quick-note">
            <FileCode2 aria-hidden="true" className="h-3.5 w-3.5" />
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

      {notSubmitted.length > 0 ? (
        <p className="admin-reveal-warning" role="note">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {notSubmitted.map(entry => entry.name).join(', ')} has never been submitted. A sitemap that is generated
            and never handed to a search engine is a file, not a signal — and the platform cannot submit one itself,
            so this is a thing for an operator to chase.
          </span>
        </p>
      ) : null}

      <section className="admin-stat-grid" aria-label="Sitemap summary">
        <article><span>Indexable URLs</span><strong>{totalUrls}</strong><small>Across {sitemaps.length} market indexes</small></article>
        <article><span>Held back</span><strong>{totalExcluded}</strong><small>Noindex or below a quality gate</small></article>
        <article><span>Schema errors</span><strong>{schemaErrorCount}</strong><small>Pages whose structured data does not parse</small></article>
        <article><span>Last generated</span><strong>05:00</strong><small>Daily; re-runs on request</small></article>
      </section>

      <section className="admin-section" aria-labelledby="indexes-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="indexes-heading">Market indexes</h2>
            <p>
              One index per market. The counts are what the application would emit on the next request, not a stored
              snapshot.
            </p>
          </div>
          <span>{sitemaps.length} indexes</span>
        </div>
        <div className="admin-incident-grid">
          {sitemaps.map(entry => (
            <article key={entry.marketId} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <span className={entry.submissionStatus === 'accepted' ? BADGE_SLATE : BADGE_AMBER}>
                      {entry.submissionStatus}
                    </span>
                    <span>{entry.code}</span>
                  </div>
                  <h3>{entry.name}</h3>
                </div>
                <div className="admin-incident-count">
                  <strong>{entry.indexableUrls}</strong>
                  <span className="admin-incident-meta">{entry.excludedUrls} excluded</span>
                </div>
              </div>
              <dl className="admin-facts">
                <div>
                  <dt>Index URL</dt>
                  <dd><code>{entry.indexUrl}</code></dd>
                </div>
                <div>
                  <dt>Last generated</dt>
                  <dd>{new Date(entry.lastGeneratedAt).toLocaleString('en-GB')}</dd>
                </div>
                <div>
                  <dt>Last submitted</dt>
                  <dd>{entry.lastSubmittedAt ? new Date(entry.lastSubmittedAt).toLocaleString('en-GB') : 'never submitted'}</dd>
                </div>
                <div>
                  <dt>Newest route change</dt>
                  <dd>{new Date(entry.lastRouteChangeAt).toLocaleString('en-GB')}</dd>
                </div>
              </dl>
              <div className="admin-row-actions">
                <button type="button" className="admin-trigger-quiet">
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  Force regeneration
                </button>
                <button type="button" className="admin-trigger-quiet">
                  <Send aria-hidden="true" className="h-4 w-4" />
                  Record a submission
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className={`${CARD} p-5`} aria-labelledby="log-heading">
          <h2 id="log-heading" className="text-sm font-bold tracking-tight text-slate-900">Generation log</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            What each run produced, and whether it finished cleanly. A warning means the index was written with fewer
            URLs than the route table holds, which is the case worth reading rather than the successes.
          </p>
          <div className="mt-3 admin-list">
            {sitemapGenerationLog.map(run => (
              <article key={run.id}>
                <div>
                  <strong>
                    {run.result === 'ok'
                      ? <CheckCircle2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-primary" />
                      : <AlertTriangle aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-amber-700" />}
                    {run.urls} urls across {run.markets} markets
                  </strong>
                  <span>
                    Started {new Date(run.startedAt).toLocaleString('en-GB')} · finished{' '}
                    {new Date(run.finishedAt).toLocaleTimeString('en-GB')}
                  </span>
                  {run.detail ? <span>{run.detail}</span> : null}
                </div>
                <button type="button" className="text-button">Inspect error logs</button>
              </article>
            ))}
          </div>
        </div>

        <div className={`${CARD} p-5`} aria-labelledby="schema-heading">
          <h2 id="schema-heading" className="text-sm font-bold tracking-tight text-slate-900">Schema parsing errors</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Structured data is read from each route&apos;s metadata. A page that does not parse still renders for a
            visitor; what it loses is the entity description a search engine would have read.
          </p>
          {schemaErrorCount === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Every indexable page carries structured data that parses.
            </p>
          ) : (
            <div className="mt-3 admin-list">
              {sitemaps.flatMap(entry => entry.schemaErrors.map(error => (
                <article key={`${entry.code}-${error.path}`}>
                  <div>
                    <strong>{error.path}</strong>
                    <span>{error.detail}</span>
                  </div>
                  <small>market {entry.code}</small>
                </article>
              )))}
            </div>
          )}
          <div className="admin-row-actions">
            <button type="button" className="admin-trigger-quiet">Validate XML syntax</button>
            <Link className={LINK_ARROW} href="/admin/search">
              Back to search presence
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
