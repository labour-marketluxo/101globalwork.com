import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, BookOpen, BadgeCheck } from 'lucide-react';
import { CARD, CTA_AMBER, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { Prose, ReaderLayout } from '@/components/marketing/ReaderLayout';
import { getMarket } from '@/features/discovery/data/market-catalog';
import { GUIDES, getGuide } from '@/features/marketing/guides';

/**
 * Guide — /{market}/guides/{guide-slug}
 *
 * A reader layout for the platform's own explainers: a sticky table of contents, the article
 * itself, contextual links to the services and problems it discusses, and a badge saying who
 * wrote it and when it was last checked against the product.
 *
 * THE CONTENT IS IN THE REPOSITORY, NOT IN A DATABASE — see features/marketing/guides.ts for
 * why (no articles table, no editorial workflow, and a guide that ships in the same diff as
 * the behaviour it describes cannot drift from it). The consequence for this file is that an
 * unknown slug is a 404 and there is no admin surface to publish one.
 *
 * INDEXABLE, unlike the taxonomy and intent routes: a guide is unique prose that the platform
 * stands behind, which is what an indexing gate is looking for. It is not a location or a
 * service page — its usefulness does not depend on local supply.
 *
 * MULTI-MARKET NOTE: the content is market-agnostic, but the route is market-scoped, so a
 * second market would serve the same guide at a second URL. That is a duplicate-content
 * decision to make when the second market exists (canonical to one market, or lift guides out
 * of the market prefix); with one market it is moot, and the canonical tag below is the
 * market-scoped URL.
 */

type Params = Promise<{ market: string; slug: string }>;

/**
 * NO `generateStaticParams`, deliberately — and this was a bug fix rather than an omission.
 *
 * The guide slugs are known at build time, so enumerating them looked like free pre-rendering.
 * But the route has TWO params and the market is not known at build time (markets come from the
 * database), so a partial list would have let Next attempt a static render of `/[market]/guides/
 * [slug]` with only half its params — the exact shape that produces a page which is correct in
 * development and wrong in production. The route also reads cookies through the Supabase server
 * client for the session-aware header, so it renders per request regardless.
 *
 * The performance claim the PRD asks for is therefore "server-rendered, no client JavaScript,
 * one indexed lookup per request" — stated in the route header — rather than ISR.
 */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, slug } = await params;
  const marketRow = await getMarket(market);
  const guide = getGuide(slug);
  if (!marketRow || !guide) return {};

  return {
    title: `${guide.title} — ${marketRow.displayName}`,
    description: guide.summary,
    alternates: { canonical: `/${marketRow.slug}/guides/${guide.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function GuidePage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const guide = getGuide(slug);
  if (!guide) notFound();

  const otherGuides = GUIDES.filter((item) => item.slug !== guide.slug);
  const reviewed = new Date(guide.reviewedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: marketRow.displayName, href: `/${marketRow.slug}` },
          // No /guides index route exists yet: text rather than a link that would 404.
          { label: 'Guides' },
          { label: guide.title },
        ]}
        eyebrow={
          <>
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            Guide · {marketRow.code}
          </>
        }
        title={guide.title}
        lede={guide.summary}
      />

      <ReaderLayout
        sidebarTitle="On this page"
        activeHref={`/${marketRow.slug}/guides/${guide.slug}`}
        sidebarItems={guide.sections.map((section) => ({
          label: section.title,
          href: `#${section.id}`,
        }))}
        sidebarExtra={
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Related
            </h3>
            <ul className="mt-2 grid gap-1.5">
              {guide.related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={LINK_ARROW}>
                    {item.label}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
            {otherGuides.length ? (
              <>
                <h3 className="mt-4 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Other guides
                </h3>
                <ul className="mt-2 grid gap-1.5">
                  {otherGuides.map((item) => (
                    <li key={item.slug}>
                      <Link href={`/${marketRow.slug}/guides/${item.slug}`} className={LINK_ARROW}>
                        {item.title}
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        }
      >
        {/* The authorship badge. There is no named human author or reviewer in this
            repository, so the badge names the platform and the date the copy was last
            checked — the claim that can actually be supported — and links to how the
            platform describes its own content. */}
        <div className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-2 p-4`}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-surface px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
            101GlobalWork
          </span>
          <span className="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
            Reviewed {reviewed} · {guide.readMinutes} min read
          </span>
          <Link
            href="/how-it-works"
            className="ml-auto font-mono text-[11px] font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
          >
            How this is maintained
          </Link>
        </div>

        <Prose sections={guide.sections} />
      </ReaderLayout>

      <div className={PAGE_SHELL}>
        <section
          className={`${CARD} flex max-w-3xl flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
        >
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Does your job match anything here?
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
              Describe it in your own words. You do not need the trade vocabulary, and you do not
              need an account to look around.
            </p>
          </div>
          <Link href="/requests/new" className={CTA_AMBER}>
            Start a request
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}
