import type { PublicHelpArticle, PublicHelpCategory } from '@/features/help/knowledge-base';

/**
 * JSON-LD for the help centre.
 *
 * ── ONE ESCAPING HELPER, USED BY EVERY CALLER ─────────────────────────────────────────────────
 *
 * The bundled Next.js guide is explicit that `JSON.stringify` does not sanitise, and recommends replacing
 * `<` with its unicode escape before it goes into `dangerouslySetInnerHTML`. That is `scriptTag` below, and
 * nothing in this feature builds a JSON-LD string any other way: two call sites each doing their own
 * escaping is how one of them ends up without it.
 *
 * ⚠️ NOTHING IN THIS FILE INVENTS A FACT TO SATISFY A RICH-RESULT CHECKLIST.
 *
 *   datePublished   omitted. The platform has a `reviewedAt` — the date the copy was last checked against
 *                   the product — and no record of when an article was first written. Publishing the review
 *                   date as the publication date would be a fabricated claim in structured data, which is
 *                   exactly the kind of markup a search engine is entitled to act on. `dateModified` is the
 *                   claim this repository can actually support.
 *
 *   author          the organisation, named as such. There is no named human author or reviewer in this
 *                   repository, and inventing one with a face and a job title is the fabricated proof this
 *                   codebase has already removed once (see features/marketing/guides.ts).
 *
 *   ratings         absent. There are no ratings, and aggregateRating is the single most abused property in
 *                   this vocabulary.
 *
 * The values are all code-authored constants from the knowledge base, so this is defence in depth rather
 * than the only barrier — which is the correct posture for markup that a machine reads.
 */

export type JsonLd = Record<string, unknown>;

/** The one way a JSON-LD payload becomes a script body. */
export function scriptTag(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function absolute(site: string, path: string): string {
  return new URL(path, site).toString();
}

/**
 * The hub, as a WebPage with a sitelinks-searchbox action.
 *
 * The SearchAction is worth having here specifically because the help centre has a working search: the
 * target template is the real route the form posts to, not a URL invented for markup.
 */
export function helpHubJsonLd({
  site,
  categories,
}: {
  site: string;
  categories: PublicHelpCategory[];
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Help centre',
    description:
      'Guides for customers, providers and organisations, plus the current status of the platform.',
    url: absolute(site, '/help'),
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: '101GlobalWork', url: site },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absolute(site, '/help')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    hasPart: categories.map((category) => ({
      '@type': 'WebPage',
      name: category.title,
      description: category.summary,
      url: absolute(site, category.href),
    })),
  };
}

/** A category page, described as a collection of the articles it lists. */
export function categoryJsonLd({
  site,
  category,
  articles,
}: {
  site: string;
  category: PublicHelpCategory;
  articles: PublicHelpArticle[];
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.title,
    description: category.summary,
    url: absolute(site, category.href),
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: '101GlobalWork', url: site },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: article.title,
        url: absolute(site, article.href),
      })),
    },
  };
}

/** One article. */
export function articleJsonLd({ site, article }: { site: string; article: PublicHelpArticle }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    // The claim this repository can support. See the file header for why datePublished is absent.
    dateModified: article.reviewedAt,
    inLanguage: 'en',
    articleSection: article.categoryTitle,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(site, article.href) },
    author: { '@type': 'Organization', name: '101GlobalWork', url: site },
    publisher: { '@type': 'Organization', name: '101GlobalWork', url: site },
    about: article.keywords.slice(0, 6).map((keyword) => ({ '@type': 'Thing', name: keyword })),
  };
}

/** Breadcrumbs, which the pages already render visually — this is the same trail, machine-readable. */
export function breadcrumbJsonLd({ site, trail }: { site: string; trail: { label: string; href: string }[] }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absolute(site, item.href),
    })),
  };
}
