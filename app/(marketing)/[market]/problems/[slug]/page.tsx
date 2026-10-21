import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ProblemPageView } from '@/components/discovery/IntentSections';
import {
  CONTEXTUAL_VARIANT_ROBOTS,
  intentCanonicalHref,
} from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
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
    // The FLAT path is canonical for a problem, which is what makes the locality-scoped
    // sibling a contextual variant. Emitted from canonical-policy so the preferred URL is
    // defined once: if this route's shape ever changes, the sibling's canonical follows it
    // instead of silently pointing at a URL that no longer exists.
    alternates: { canonical: intentCanonicalHref(marketRow.slug, 'problems', problem.slug) },
    robots: CONTEXTUAL_VARIANT_ROBOTS,
  };
}

export default async function ProblemPage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const resolved = await resolveProblem(market, slug);
  if (!resolved) notFound();

  const { problem, catalog } = resolved;

  // One page view for both shapes of this entity: this route passes no location, the
  // locality-scoped route at /{market}/{region}/{locality}/{problem-slug} passes one. The
  // heading, the scope sentence, the cost panel and the supply section all vary from that
  // one input, so the two URLs cannot describe the same problem differently.
  return (
    <ProblemPageView
      market={marketRow}
      problem={problem}
      catalog={catalog}
      breadcrumbs={discoveryTrail({
        market: marketRow,
        family: 'Problems',
        leaf: problem.displayName,
      })}
    />
  );
}
