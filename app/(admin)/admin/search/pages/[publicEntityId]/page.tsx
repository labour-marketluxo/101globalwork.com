import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileCode2, Link2, ScanLine } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { searchPages } from '@/features/admin/ui-placeholders';

export const metadata = { title: 'Search page inspection', robots: { index: false, follow: false } };

/**
 * /admin/search/pages/[publicEntityId] — one route in depth.
 *
 * ⚠️ THIS IS A UI BUILD. The route is looked up in features/admin/ui-placeholders.ts by the id in the URL; in the
 * wired version that lookup becomes a read, and the id stays the key — a public path is a label that changes, not an
 * identity, which is the same rule the taxonomy console follows.
 */
export default async function SearchPageInspection({ params }: { params: Promise<{ publicEntityId: string }> }) {
  const { publicEntityId } = await params;
  const page = searchPages.find(entry => entry.id === publicEntityId);
  if (!page) notFound();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Search · page inspection</p>
          <h1>{page.canonicalPath}</h1>
          <p>
            {page.entityKind} · {page.entityRef} · market {page.marketCode} · updated{' '}
            {new Date(page.updatedAt).toLocaleString('en-GB')}
          </p>
        </div>
        <div className="admin-row-actions">
          <span className={page.indexability === 'indexable' ? BADGE_SLATE : BADGE_AMBER}>
            {page.indexability.replaceAll('_', ' ')}
          </span>
          <a className="secondary-button" href={page.canonicalUrl} target="_blank" rel="noreferrer">
            Preview live page <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
          <Link className="secondary-button" href="/admin/search">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Search presence
          </Link>
        </div>
      </header>

      <p className="notice" role="status">
        <strong>UI build.</strong> This entity is placeholder data; the controls below are rendered but not wired.
      </p>

      <section className="admin-section two-column-admin">
        <div className={`${CARD} p-5`} aria-labelledby="canonical-heading">
          <h2 id="canonical-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <Link2 aria-hidden="true" className="h-4 w-4 text-primary" />
            Canonical and metadata
          </h2>
          <dl className="admin-facts">
            <div>
              <dt>Canonical URL</dt>
              <dd><code>{page.canonicalUrl}</code></dd>
            </div>
            <div>
              <dt>Points at another page</dt>
              <dd>{page.canonicalOf ?? 'No — this route is its own canonical'}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{page.title}{page.title.length > 60 ? ' — longer than the usual 60-character guide' : ''}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{page.metaDescription}</dd>
            </div>
            <div>
              <dt>Quality score</dt>
              <dd>{page.qualityScore}/100</dd>
            </div>
          </dl>
          <p className="admin-incident-meta">
            Changing a canonical path here appends a redirect from the old path to this entity&apos;s route, so a
            rename never breaks what was already published.
          </p>
        </div>

        <div className={`${CARD} p-5`} aria-labelledby="blocks-heading">
          <h2 id="blocks-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Why it is held back
          </h2>
          {page.noindexReasons.length === 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Nothing is blocking this page. It is indexable and follows links.
            </p>
          ) : (
            <ul className="admin-facts">
              {page.noindexReasons.map(reason => (
                <li key={reason}>
                  <strong>{reason}</strong>
                  <span>Recorded by the last route evaluation</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="admin-facts">
            <div>
              <dt>Internal linking depth</dt>
              <dd>{page.depth} levels from the market root · {page.inboundLinks} internal link(s) point here</dd>
            </div>
            <div>
              <dt>Organic analytics</dt>
              <dd>
                Not available — the platform stores no visit, referrer or session data, so there is nothing to
                report here rather than an empty chart.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="schema-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="schema-heading">Structured data</h2>
            <p>
              The schema this page emits, whether it parses, and which required properties are missing.
            </p>
          </div>
          <span className={page.schemaValid ? BADGE_SLATE : BADGE_AMBER}>
            {page.schemaValid ? 'parses' : `${page.schemaErrors.length} error(s)`}
          </span>
        </div>
        <div className={`${CARD} p-5`}>
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <FileCode2 aria-hidden="true" className="h-4 w-4 text-primary" />
            {page.structuredData}
          </p>
          {page.schemaErrors.length > 0 ? (
            <ul className="admin-facts">
              {page.schemaErrors.map(error => (
                <li key={error}>
                  <strong>{error}</strong>
                  <span>A validation error, not a warning: the page still renders, the entity is underspecified.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              No validation errors. The schema names the service, the area it is served in and the breadcrumb trail.
            </p>
          )}
          <div className="admin-row-actions">
            <button type="button" className="admin-trigger-quiet">
              <ScanLine aria-hidden="true" className="h-4 w-4" />
              Validate JSON-LD schema
            </button>
            <button type="button" className="admin-trigger-quiet">Request search recrawl</button>
          </div>
          <p className="admin-incident-meta">
            A recrawl request is recorded here and in the audit stream; the platform cannot ask a search engine
            directly, so the record is what an operator chases.
          </p>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="metadata-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="metadata-heading">Update SEO metadata</h2>
            <p>
              Title, description and canonical path for this route. Saving a path change appends the preserving
              redirect in the same transaction.
            </p>
          </div>
        </div>
        <form className={`${CARD} grid gap-3 p-5 sm:grid-cols-2`}>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="seo_title">Title</label>
            <input id="seo_title" className={FIELD} defaultValue={page.title} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="seo_description">Meta description</label>
            <textarea id="seo_description" rows={3} className={FIELD} defaultValue={page.metaDescription} />
          </div>
          <div>
            <label className={LABEL} htmlFor="seo_path">Canonical path</label>
            <input id="seo_path" className={FIELD} defaultValue={page.canonicalPath} />
          </div>
          <div>
            <label className={LABEL} htmlFor="seo_reason">Reason code (required)</label>
            <select id="seo_reason" className={FIELD} required defaultValue="">
              <option value="" disabled>Choose a reason</option>
              <option value="metadata_fix">Title, description or schema was wrong</option>
              <option value="canonical_fix">Fixing which URL is canonical</option>
              <option value="quality_gate">The page no longer meets the quality gate</option>
              <option value="manual_request">Somebody asked for a recrawl</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="seo_note">What changed and why</label>
            <input id="seo_note" className={FIELD} placeholder="At least ten characters, recorded with the change." />
          </div>
          <div className="admin-row-actions sm:col-span-2">
            <button type="button" className="admin-confirm-amber">Update SEO metadata</button>
            <Link href="/admin/search/redirects" className={LINK_ARROW}>
              Redirect registry
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
