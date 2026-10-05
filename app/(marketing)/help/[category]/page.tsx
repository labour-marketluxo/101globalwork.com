import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PUBLIC_SHELL } from '@/components/discovery/tokens';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { HelpArticleList, HelpCategoryGrid, JsonLd, SupportActionCards } from '@/components/help/HelpSections';
import {
  allHelpCategories,
  articlesInCategory,
  getHelpCategory,
  HELP_CATEGORIES,
} from '@/features/help/knowledge-base';
import { breadcrumbJsonLd, categoryJsonLd } from '@/features/help/structured-data';

/**
 * A help category — /help/{category}
 *
 * PRE-RENDERED FROM THE CONTENT MODULE. `generateStaticParams` enumerates the six sections from the same array
 * the pages render from, so a category cannot exist in the router and be missing from the navigation or the
 * other way round. The route still renders per request because the site header is session-aware, which is what
 * the build output will say — the declaration is about which URLs exist, and they are all known here.
 *
 * INDEXABLE: six curated sections listing unique prose, which is exactly what an indexing gate is looking for.
 * An unknown category is a 404 rather than an empty page, because a category with no articles is a page that
 * would look broken to a reader and thin to a crawler.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';

type Params = Promise<{ category: string }>;

export function generateStaticParams() {
  return HELP_CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getHelpCategory(slug);
  if (!category) return {};

  return {
    title: category.title,
    description: category.summary,
    alternates: { canonical: category.href },
    robots: { index: true, follow: true },
    openGraph: {
      title: category.title,
      description: category.summary,
      url: category.href,
      type: 'website',
    },
  };
}

export default async function HelpCategoryPage({ params }: { params: Params }) {
  const { category: slug } = await params;
  const category = getHelpCategory(slug);
  if (!category) notFound();

  const articles = articlesInCategory(category.slug);
  const otherCategories = allHelpCategories().filter((entry) => entry.slug !== category.slug);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Help centre', href: '/help' },
    { label: category.title, href: category.href },
  ];

  return (
    <div className="w-full">
      <JsonLd data={breadcrumbJsonLd({ site: SITE, trail })} />
      <JsonLd data={categoryJsonLd({ site: SITE, category, articles })} />

      <TaxonomyHero
        breadcrumbs={trail}
        eyebrow={category.forLine}
        title={category.title}
        lede={category.summary}
      />

      <div className={`${PUBLIC_SHELL} grid gap-10`}>
        <section aria-labelledby="articles-heading" className="grid gap-4">
          <h2 id="articles-heading" className="text-lg font-bold tracking-tight text-slate-900">
            {articles.length} article{articles.length === 1 ? '' : 's'}
          </h2>
          <HelpArticleList articles={articles} emptyMessage="No article in this section has been published yet." />
        </section>

        <section aria-labelledby="other-heading" className="grid gap-4">
          <h2 id="other-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Other sections
          </h2>
          <HelpCategoryGrid categories={otherCategories} activeSlug={category.slug} />
        </section>

        <section aria-labelledby="cases-heading" className="grid gap-4">
          <h2 id="cases-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Still stuck?
          </h2>
          <SupportActionCards />
        </section>

        <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
          <Link href="/help" className="underline underline-offset-2">
            Back to the help centre
          </Link>{' '}
          for the full list, or search from there.
        </p>
      </div>
    </div>
  );
}
