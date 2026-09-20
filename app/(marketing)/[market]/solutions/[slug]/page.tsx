import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { OutcomeBody } from '@/components/discovery/IntentSections';
import { MetaChip, TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { CTA_AMBER, PAGE_SHELL } from '@/components/discovery/tokens';
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
    alternates: { canonical: `/${marketRow.slug}/solutions/${outcome.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function OutcomePage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const resolved = await resolveOutcome(market, slug);
  if (!resolved) notFound();

  const { outcome, catalog } = resolved;

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: marketRow.displayName, href: `/${marketRow.slug}` },
          // No /solutions index route exists yet: text, not a link that would 404.
          { label: 'Solutions' },
          { label: outcome.displayName },
        ]}
        eyebrow={
          <>
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Outcome · {marketRow.code}
          </>
        }
        title={outcome.displayName}
        lede={outcome.definition}
        chips={
          <>
            <MetaChip>
              {outcome.services.length} service{outcome.services.length === 1 ? '' : 's'} bundled
            </MetaChip>
            {outcome.planningSteps.length ? (
              <MetaChip>{outcome.planningSteps.length}-step process</MetaChip>
            ) : null}
          </>
        }
        actions={
          <Link href="/requests/new" className={CTA_AMBER}>
            Plan your project
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      {/* No Suspense boundary: the catalogue read had to finish before this page could
          resolve at all, so there is nothing left to stream. */}
      <div className={PAGE_SHELL}>
        <OutcomeBody market={marketRow} outcome={outcome} catalog={catalog} />
      </div>
    </div>
  );
}
