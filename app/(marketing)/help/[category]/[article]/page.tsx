import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { Prose, ReaderLayout } from '@/components/marketing/ReaderLayout';
import { ArticleFooter, ArticleMeta, JsonLd } from '@/components/help/HelpSections';
import {
  allPublishedArticles,
  articlesInCategory,
  getHelpCategory,
  getPublishedArticle,
} from '@/features/help/knowledge-base';
import { articleJsonLd, breadcrumbJsonLd } from '@/features/help/structured-data';

/**
 * One help article — /help/{category}/{article}
 *
 * ── PRE-RENDERED, AND THAT IS THE POINT OF THE SEO REQUIREMENT ────────────────────────────────
 *
 * `generateStaticParams` enumerates every PUBLISHED article from the content module. A draft is not in the
 * list, and `getPublishedArticle` returns nothing for one, so an unpublished article is a 404 here and is
 * absent from the sitemap and from search — the three surfaces cannot disagree, because all three ask the
 * same publication function whether the article exists.
 *
 * ── METADATA IS GENERATED, NOT DECLARED ───────────────────────────────────────────────────────
 *
 * `index, follow` on every article, with a canonical path built from the slug by the content module rather
 * than spelled here, and an OpenGraph block that repeats the title and summary so a shared link shows the
 * article rather than the site. There is no per-article `publishedTime`: the platform records when an article
 * was last CHECKED against the product and not when it was first written, and OpenGraph has no property for
 * "reviewed", so claiming one as the other is the kind of small lie this codebase does not tell.
 *
 * ── THE LAYOUT IS THE READER LAYOUT THE MARKET GUIDES USE ─────────────────────────────────────
 *
 * Same sidebar, same prose scale, same sticky table of contents. A help article and a market guide are the
 * same kind of document, and two reader layouts would drift apart within a release.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';

type Params = Promise<{ category: string; article: string }>;

export function generateStaticParams() {
  return allPublishedArticles().map((article) => ({
    category: article.category,
    article: article.slug,
  }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, article: slug } = await params;
  const found = getPublishedArticle(category, slug);
  if (!found) return {};

  return {
    title: found.title,
    description: found.summary,
    alternates: { canonical: found.href },
    robots: { index: true, follow: true },
    openGraph: {
      title: found.title,
      description: found.summary,
      url: found.href,
      type: 'article',
    },
  };
}

export default async function HelpArticlePage({ params }: { params: Params }) {
  const { category: categorySlug, article: articleSlug } = await params;

  const category = getHelpCategory(categorySlug);
  const article = getPublishedArticle(categorySlug, articleSlug);
  if (!category || !article) notFound();

  const siblings = articlesInCategory(category.slug);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Help centre', href: '/help' },
    { label: category.title, href: category.href },
    { label: article.title, href: article.href },
  ];

  return (
    <div className="w-full">
      <JsonLd data={breadcrumbJsonLd({ site: SITE, trail })} />
      <JsonLd data={articleJsonLd({ site: SITE, article })} />

      <TaxonomyHero
        breadcrumbs={trail}
        eyebrow={category.forLine}
        title={article.title}
        lede={article.summary}
      />

      <ReaderLayout
        sidebarTitle={category.title}
        activeHref={article.href}
        meta={
          <dl className="grid gap-1.5 font-mono text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Read</dt>
              <dd className="font-bold text-slate-900">{article.readMinutes} min</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Checked</dt>
              <dd className="font-bold text-slate-900">{article.reviewedAt}</dd>
            </div>
          </dl>
        }
        sidebarItems={siblings.map((entry) => ({ label: entry.title, href: entry.href }))}
        sidebarExtra={
          <div className="grid gap-2">
            {article.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg px-3 py-1.5 text-xs no-underline transition-colors text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                {section.title}
              </a>
            ))}
          </div>
        }
        footer={
          <p className="text-xs leading-relaxed text-slate-500">
            This article is one of {siblings.length} in {category.title}.{' '}
            <Link href={category.href} className="underline underline-offset-2">
              See the rest
            </Link>
            , or{' '}
            <Link href="/help" className="underline underline-offset-2">
              search the knowledge base
            </Link>
            .
          </p>
        }
      >
        <ArticleMeta article={article} />
        <Prose sections={article.sections} />
      </ReaderLayout>

      <ArticleFooter article={article} />
    </div>
  );
}
