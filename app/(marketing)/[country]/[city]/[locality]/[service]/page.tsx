import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicDiscoveryDocument } from '@/lib/discovery/public-page';

type Params = Promise<{ country: string; city: string; locality: string; service: string }>;

function pathFromParams({ country, city, locality, service }: Awaited<Params>) {
  return `/${country}/${city}/${locality}/${service}/`.toLowerCase();
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolved = await params;
  const canonicalPath = pathFromParams(resolved);
  const doc = await getPublicDiscoveryDocument(canonicalPath);
  if (!doc) return {};

  const index = doc.indexability === 'indexable';
  return {
    title: doc.title,
    description: doc.meta_description ?? undefined,
    alternates: { canonical: canonicalPath },
    robots: { index, follow: true },
  };
}

export default async function ServiceLocationPage({ params }: { params: Params }) {
  const resolved = await params;
  const canonicalPath = pathFromParams(resolved);
  const doc = await getPublicDiscoveryDocument(canonicalPath);
  if (!doc) notFound();

  return (
    <article className="content-shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <a href={`/${resolved.country}/`}>{resolved.country.toUpperCase()}</a>
        <span>/</span>
        <a href={`/${resolved.country}/${resolved.city}/`}>{resolved.city}</a>
        <span>/</span>
        <span>{resolved.locality}</span>
      </nav>

      <header className="page-header">
        <p className="eyebrow">Local service</p>
        <h1>{doc.h1}</h1>
        {doc.summary ? <p className="lede">{doc.summary}</p> : null}
      </header>

      {doc.indexability !== 'indexable' ? (
        <aside className="notice" aria-label="Marketplace availability">
          This page is useful to visitors but is not yet eligible for search indexing. 101GlobalWork only indexes service-location pages after supply and quality thresholds are met.
        </aside>
      ) : null}

      <section className="action-panel">
        <h2>What do you need done?</h2>
        <p>Describe the plumbing problem in your own words. You do not need to know the professional terminology.</p>
        <form action="/search" method="get" className="need-form stacked">
          <input type="hidden" name="location" value={`${resolved.locality}, ${resolved.city}`} />
          <input type="hidden" name="service" value={resolved.service} />
          <label htmlFor="q">Describe the work</label>
          <textarea id="q" name="q" required minLength={5} placeholder="e.g. Water is leaking under my kitchen sink" />
          <button type="submit">Continue request</button>
        </form>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(doc.structured_data).replace(/</g, '\\u003c') }}
      />
    </article>
  );
}
