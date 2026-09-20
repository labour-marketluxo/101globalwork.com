import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, Tag } from 'lucide-react';
import { ProblemBody, SeverityBadge } from '@/components/discovery/IntentSections';
import { MetaChip, TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { CTA_AMBER, PAGE_SHELL } from '@/components/discovery/tokens';
import { getMarket } from '@/features/discovery/data/market-catalog';
import { resolveProblem } from '@/features/discovery/data/intent-taxonomy';

/**
 * Problem page — /{market}/problems/{problem-slug}
 *
 * e.g. /ng/problems/low-water-pressure
 *
 * Captures the visitor who typed a SYMPTOM rather than a trade, names it back in their own
 * language, and hands them the canonical service that fixes it. The problem entities, their
 * aliases and their service links are canonical taxonomy rows (`kind='problem'`), read
 * through the curated projections added by migration 20260920140000.
 *
 * INDEXABILITY: `noindex, follow`, and it is not a placeholder. `indexability_policies`
 * holds a policy for `kind='service'` only, so there is no gate for this route to pass and
 * nothing that could legitimately flip it — the honest answer is "not offered to search
 * engines yet", and the page states its own canonical so that when a policy and a registry
 * row do arrive, the tag is already correct. Registering these routes in `public_routes`
 * without a policy would make the evaluator answer 'no_policy', which is true but implies a
 * gate exists.
 *
 * UNKNOWN MARKET → redirect('/'), matching `/{market}/services` and `/{market}/search`.
 * UNKNOWN PROBLEM → 404: there is no redirect history for these handles yet, and a
 * plausible-looking problem page for a slug the catalog does not carry would be invented
 * content rather than a missing one.
 */

type Params = Promise<{ market: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, slug } = await params;
  const marketRow = await getMarket(market);
  if (!marketRow) return {};

  const resolved = await resolveProblem(market, slug);
  if (!resolved) return {};

  const { problem } = resolved;
  return {
    title: `${problem.displayName} — ${marketRow.displayName}`,
    description: problem.definition,
    alternates: { canonical: `/${marketRow.slug}/problems/${problem.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function ProblemPage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const resolved = await resolveProblem(market, slug);
  if (!resolved) notFound();

  const { problem, catalog } = resolved;

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: marketRow.displayName, href: `/${marketRow.slug}` },
          // No /problems index exists yet, so this crumb is text rather than a link that
          // would 404 — the same rule the local page applies to its hub ancestors.
          { label: 'Problems' },
          { label: problem.displayName },
        ]}
        eyebrow={
          <>
            <Tag aria-hidden="true" className="h-3.5 w-3.5" />
            Problem · {marketRow.code}
          </>
        }
        title={problem.displayName}
        lede={problem.definition}
        chips={
          <>
            <SeverityBadge severity={problem.severity} />
            <MetaChip>
              {problem.services.length} service{problem.services.length === 1 ? '' : 's'} linked
            </MetaChip>
          </>
        }
        actions={
          // /requests/new is the destination; it sends a signed-out visitor through
          // /sign-in and returns them to the form, which is why this does not point at
          // /sign-in directly.
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request to fix this
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      {/* No Suspense boundary here, deliberately: the catalogue is a single cached read
          that already had to complete before the page could 404, so there is no slow
          work left to stream and a skeleton would only flash on a fast connection. */}
      <div className={PAGE_SHELL}>
        <ProblemBody market={marketRow} problem={problem} catalog={catalog} />
      </div>
    </div>
  );
}
