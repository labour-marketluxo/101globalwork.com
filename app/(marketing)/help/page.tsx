import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, LifeBuoy } from '@/components/ui/icons';
import { PUBLIC_SHELL } from '@/components/discovery/tokens';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import {
  HelpArticleList,
  HelpCategoryGrid,
  HelpSearchForm,
  HelpSearchResults,
  JsonLd,
  StatusStrip,
  SupportActionCards,
} from '@/components/help/HelpSections';
import { getSystemStatus } from '@/features/help/status';
import {
  allHelpCategories,
  isSearchable,
  searchHelp,
  startHereArticles,
  type PublicHelpArticle,
} from '@/features/help/knowledge-base';
import { helpHubJsonLd } from '@/features/help/structured-data';

/**
 * The help centre — /help
 *
 * ── PRE-RENDERED, INDEXABLE, AND NOINDEXED ONLY WHEN IT IS A SEARCH RESULT ────────────────────
 *
 * The hub is public content and is indexable with `index, follow`. The same route also renders search
 * results from `?q=`, and a parameterised result page is NOT indexable — it is infinite, it duplicates the
 * articles it links to, and a crawler that follows every query string would spend the whole crawl budget on
 * permutations of the same eight words. So `generateMetadata` flips `robots` per request: the canonical bare
 * `/help` is indexable, and `/help?q=…` is `noindex, follow` with a canonical pointing back at `/help`.
 *
 * ── THE TWO HALVES OF THIS PAGE ARE FETCHED DIFFERENTLY, ON PURPOSE ───────────────────────────
 *
 * The articles are code-authored constants: no database, no query, nothing that can come back empty. The
 * status strip is live and can fail, so it is the one part of the page that can say "I could not check" — and
 * it says exactly that rather than defaulting to green. Mixing the two would make the whole page's reliability
 * depend on the least reliable input it has.
 *
 * ── LOW BANDWIDTH ─────────────────────────────────────────────────────────────────────────────
 *
 * No images, no client components, one GET form. See components/help/HelpSections.tsx for why that is the
 * design rather than an optimisation left for later.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';

type SearchParams = Promise<{ q?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const query = (params.q ?? '').trim();

  return {
    title: 'Help centre',
    description:
      'Guides for customers, providers and organisations: posting work, comparing quotes, payments, verification, safety and account security.',
    alternates: { canonical: '/help' },
    // A search result is a view of the same corpus, not a document of its own. A query with nothing to
    // search with — "how do i" and its stopwords — is not a result page at all, so it stays indexable.
    robots: isSearchable(query) ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: 'Help centre',
      description: 'Guides for customers, providers and organisations, and the current platform status.',
      url: '/help',
      type: 'website',
    },
  };
}

export default async function HelpCentrePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();

  const searching = isSearchable(query);
  const [status, categories] = await Promise.all([getSystemStatus(), Promise.resolve(allHelpCategories())]);
  const hits = searching ? searchHelp(query) : [];
  const startHere: PublicHelpArticle[] = startHereArticles();

  return (
    <div className="w-full">
      <JsonLd data={helpHubJsonLd({ site: SITE, categories })} />

      <TaxonomyHero
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Help centre' }]}
        eyebrow={
          <>
            <LifeBuoy aria-hidden="true" className="h-3.5 w-3.5" />
            Help centre
          </>
        }
        title="How can we help?"
        lede="Search the guides, browse by who you are, or open a private case if the answer depends on your own project or account."
      >
        <div className="mt-6 max-w-3xl">
          <HelpSearchForm query={query} />
        </div>
      </TaxonomyHero>

      <div className={`${PUBLIC_SHELL} grid gap-10`}>
        <StatusStrip status={status} />

        {searching ? (
          <section aria-labelledby="results-heading" className="grid gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="results-heading" className="text-lg font-bold tracking-tight text-slate-900">
                {hits.length} result{hits.length === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
              </h2>
              <Link href="/help" className="font-sans text-xs font-semibold text-primary no-underline hover:text-primary-dark">
                Clear search
              </Link>
            </div>
            <HelpSearchResults query={query} hits={hits} />
          </section>
        ) : null}

        <section aria-labelledby="start-heading" className="grid gap-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"
            >
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <h2 id="start-heading" className="text-lg font-bold tracking-tight text-slate-900">
                Start here
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                The five articles that answer most of what people arrive with. Every one of them is a
                description of how the platform behaves today, not of how it is meant to behave.
              </p>
            </div>
          </div>
          <HelpArticleList articles={startHere} />
        </section>

        <section aria-labelledby="browse-heading" className="grid gap-4">
          <div>
            <h2 id="browse-heading" className="text-lg font-bold tracking-tight text-slate-900">
              Browse articles
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Six sections. Customer, provider and organisation guides are written for whoever is doing that
              job; payments, safety and account are for both sides of a piece of work.
            </p>
          </div>
          <HelpCategoryGrid categories={categories} />
        </section>

        <section aria-labelledby="get-help-heading" className="grid gap-4">
          <div>
            <h2 id="get-help-heading" className="text-lg font-bold tracking-tight text-slate-900">
              Get a person
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              A guide cannot look at your project. These open a private case instead, which can.
            </p>
          </div>
          <SupportActionCards />
        </section>

        <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
          Every article here is written and maintained by 101GlobalWork and shows the date it was last checked
          against the product. Nothing on this page personalises, tracks or requires an account, and the
          platform does not record what you searched for.
        </p>
      </div>
    </div>
  );
}
