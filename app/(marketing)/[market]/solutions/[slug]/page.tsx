import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OutcomePageView } from '@/components/discovery/IntentSections';
import {
  CONTEXTUAL_VARIANT_ROBOTS,
  intentCanonicalHref,
} from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
import { getMarket } from '@/features/discovery/data/market-catalog';
import { resolveOutcome } from '@/features/discovery/data/intent-taxonomy';

/**
 * Outcome page — /{market}/solutions/{outcome-slug}
 *
 * e.g. /ng/solutions/stop-a-leak
 *
 * The goal-shaped sibling of the problem route: the visitor describes what they want to end
 * up with, and the page shows the services bundled to deliver it plus the platform's process
 * from first description to released payment. Outcomes are canonical taxonomy rows
 * (`kind='outcome'`) linked to services through `taxonomy_links`, read through the curated
 * projections added by migration 20260920140000.
 *
 * WHAT AN OUTCOME PAGE CAN HONESTLY BUNDLE, TODAY. The catalog holds two services, so every
 * published outcome resolves to the services that can actually deliver it — one, in most
 * cases. The body says that in as many words instead of padding a "required trades" list with
 * trades the platform has no service for, because a bundle is a promise about coverage.
 *
 * CANONICAL TAGS: enabled, and self-referencing. INDEXABILITY: `noindex, follow` — see the
 * problem route for why no gate exists for this entity kind yet; the canonical is already
 * correct for the day one does.
 *
 * UNKNOWN MARKET → redirect('/'), matching the sibling market routes. UNKNOWN OUTCOME → 404.
 */

type Params = Promise<{ market: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, slug } = await params;
  const marketRow = await getMarket(market);
  if (!marketRow) return {};

  const resolved = await resolveOutcome(market, slug);
  if (!resolved) return {};

  const { outcome } = resolved;
  return {
    title: `${outcome.displayName} — ${marketRow.displayName}`,
    description: outcome.definition,
    // Flat path is canonical; the region-scoped sibling at /{market}/{region}/{outcome-slug}
    // is a contextual variant. See canonical-policy.ts.
    alternates: { canonical: intentCanonicalHref(marketRow.slug, 'solutions', outcome.slug) },
    robots: CONTEXTUAL_VARIANT_ROBOTS,
  };
}

export default async function OutcomePage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const resolved = await resolveOutcome(market, slug);
  if (!resolved) notFound();

  const { outcome, catalog } = resolved;

  // No location is passed: this is the flat, context-free page. The region-scoped variant
  // renders through the same view with `localized` set. See ProblemPage for the sibling.
  return (
    <OutcomePageView
      market={marketRow}
      outcome={outcome}
      catalog={catalog}
      breadcrumbs={discoveryTrail({
        market: marketRow,
        family: 'Solutions',
        leaf: outcome.displayName,
      })}
    />
  );
}
