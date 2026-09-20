import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMarket, getMarketLocations, type Market } from '@/features/discovery/data/market-catalog';
import { getServiceTaxonomy, type TaxonomyService } from '@/features/discovery/data/service-taxonomy';
import {
  readPublicProjection,
  stepArray,
  stringArray,
  text,
} from '@/features/discovery/data/public-projection';

/**
 * The problem and outcome catalogues — the two halves of customer intent.
 *
 * A problem is what someone has ("the tap will not close"); an outcome is what they
 * want instead ("no more leaks"). Both are canonical taxonomy entities
 * (`taxonomy_entities.kind = 'problem' | 'outcome'`) linked to the services that
 * address them, and both are unreadable by an anonymous visitor directly — so the pages
 * read four curated projections instead:
 *
 *   public_problem_catalog           the problem's own public copy (definition, severity,
 *                                    guidance, the phrases people use)
 *   public_problem_service_catalog   which services address it
 *   public_outcome_catalog           the outcome's copy, plus the platform's planning steps
 *   public_outcome_service_catalog   which services deliver it
 *
 * WHY THE PAGES EXIST AT ALL, given the service directory already lists services: because
 * people do not search for "plumbing_residential". They search for the symptom or the
 * goal, and the aliases attached to these entities are the platform's own record of the
 * words they use. Landing on a page that names the problem in the customer's language and
 * then offers the canonical service is the whole point of the route family.
 *
 * NO COST OR TIME ESTIMATES ARE READ HERE, because none exist: FEE_POLICY.published is
 * false and nothing in this schema measures duration. Both page bodies state that.
 */

export type ProblemSeverity = 'routine' | 'time-sensitive' | 'safety-relevant';

export type TaxonomyProblem = {
  problemEntityId: string;
  canonicalKey: string;
  slug: string;
  displayName: string;
  definition: string;
  /** How the platform talks about urgency. Never 'emergency' — see the route header. */
  severity: ProblemSeverity;
  /** One line explaining what the severity means, so the badge is not a bare label. */
  severityNote: string | null;
  guidance: string[];
  aliases: string[];
  services: TaxonomyService[];
  languageCode: string;
  localeIsFallback: boolean;
};

export type TaxonomyOutcome = {
  outcomeEntityId: string;
  canonicalKey: string;
  slug: string;
  displayName: string;
  definition: string;
  /** Platform process steps, in order. Not a schedule and not a duration. */
  planningSteps: { title: string; body: string }[];
  aliases: string[];
  services: TaxonomyService[];
  languageCode: string;
  localeIsFallback: boolean;
};

export type IntentCatalog = {
  problems: TaxonomyProblem[];
  outcomes: TaxonomyOutcome[];
  /** True when a read failed, as opposed to the catalogue being empty. */
  unavailable: boolean;
};

function severityOf(value: unknown): ProblemSeverity {
  return value === 'time-sensitive' || value === 'safety-relevant' ? value : 'routine';
}

/**
 * Both catalogues for one market.
 *
 * Cached per request because the route resolves the entity for the breadcrumb and the
 * page body renders it — with the taxonomy in between, that is four reads a naive
 * implementation would repeat per render.
 */
export const getIntentCatalog = cache(async function getIntentCatalog(
  market: Market,
): Promise<IntentCatalog> {
  const supabase = await createSupabaseServerClient();
  const locations = await getMarketLocations(market.marketId);
  const taxonomy = await getServiceTaxonomy(market, locations);

  const [problemRows, outcomeRows, problemLinks, outcomeLinks] = await Promise.all([
    readPublicProjection(
      supabase,
      'public_problem_catalog',
      'problem_entity_id,market_id,canonical_key,slug,display_name,definition,severity,severity_note,guidance,aliases,language_code,sort_order,is_active',
    ),
    readPublicProjection(
      supabase,
      'public_outcome_catalog',
      'outcome_entity_id,market_id,canonical_key,slug,display_name,definition,planning_steps,aliases,language_code,sort_order,is_active',
    ),
    readPublicProjection(
      supabase,
      'public_problem_service_catalog',
      'problem_entity_id,service_entity_id,sort_order',
    ),
    readPublicProjection(
      supabase,
      'public_outcome_service_catalog',
      'outcome_entity_id,service_entity_id,sort_order',
    ),
  ]);

  if (taxonomy.unavailable) {
    return { problems: [], outcomes: [], unavailable: true };
  }

  const servicesById = new Map(
    taxonomy.services.map((service) => [service.serviceEntityId, service]),
  );
  const marketLanguage = market.languageCode.toLowerCase();

  // A row scoped to a market belongs to that market; a row with no market is
  // market-agnostic. Same rule the category catalogue and indexability policies use.
  const inMarket = (row: Record<string, unknown>) =>
    row.market_id === null || row.market_id === undefined || row.market_id === market.marketId;

  const servicesFor = (
    links: Record<string, unknown>[],
    key: string,
    entityId: string,
  ): TaxonomyService[] =>
    links
      .filter((link) => link[key] === entityId)
      .map((link) => servicesById.get(link.service_entity_id as string))
      .filter((service): service is TaxonomyService => Boolean(service));

  const problems: TaxonomyProblem[] = problemRows
    .filter((row) => inMarket(row) && row.is_active !== false)
    .map((row) => {
      const problemEntityId = row.problem_entity_id as string;
      const languageCode = text(row.language_code) ?? market.languageCode;
      return {
        problemEntityId,
        canonicalKey: row.canonical_key as string,
        slug: row.slug as string,
        displayName: row.display_name as string,
        definition: (row.definition as string) ?? '',
        severity: severityOf(row.severity),
        severityNote: text(row.severity_note),
        guidance: stringArray(row.guidance),
        aliases: stringArray(row.aliases),
        services: servicesFor(problemLinks, 'problem_entity_id', problemEntityId),
        languageCode,
        localeIsFallback: languageCode.toLowerCase() !== marketLanguage,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const outcomes: TaxonomyOutcome[] = outcomeRows
    .filter((row) => inMarket(row) && row.is_active !== false)
    .map((row) => {
      const outcomeEntityId = row.outcome_entity_id as string;
      const languageCode = text(row.language_code) ?? market.languageCode;
      return {
        outcomeEntityId,
        canonicalKey: row.canonical_key as string,
        slug: row.slug as string,
        displayName: row.display_name as string,
        definition: (row.definition as string) ?? '',
        planningSteps: stepArray(row.planning_steps),
        aliases: stringArray(row.aliases),
        services: servicesFor(outcomeLinks, 'outcome_entity_id', outcomeEntityId),
        languageCode,
        localeIsFallback: languageCode.toLowerCase() !== marketLanguage,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { problems, outcomes, unavailable: false };
});

/**
 * Resolve one problem slug for one market. Null means 404.
 *
 * The slug IS the handle here — problems are catalog rows with a curated slug, and
 * unlike services there is no registry route to reconcile against (no indexing policy
 * covers these kinds yet, which is also why the pages are noindex). A retired slug
 * therefore 404s; the redirect catalogue only carries paths the registry knows about.
 */
export async function resolveProblem(
  marketSlug: string,
  problemSlug: string,
): Promise<{ market: Market; problem: TaxonomyProblem; catalog: IntentCatalog } | null> {
  const market = await getMarket(marketSlug);
  if (!market) return null;

  const catalog = await getIntentCatalog(market);
  if (catalog.unavailable) return null;

  const needle = problemSlug.trim().toLowerCase();
  const problem = catalog.problems.find((item) => item.slug.toLowerCase() === needle);
  return problem ? { market, problem, catalog } : null;
}

export async function resolveOutcome(
  marketSlug: string,
  outcomeSlug: string,
): Promise<{ market: Market; outcome: TaxonomyOutcome; catalog: IntentCatalog } | null> {
  const market = await getMarket(marketSlug);
  if (!market) return null;

  const catalog = await getIntentCatalog(market);
  if (catalog.unavailable) return null;

  const needle = outcomeSlug.trim().toLowerCase();
  const outcome = catalog.outcomes.find((item) => item.slug.toLowerCase() === needle);
  return outcome ? { market, outcome, catalog } : null;
}

export function problemHref(marketSlug: string, problem: TaxonomyProblem): string {
  return `/${marketSlug}/problems/${problem.slug}`;
}

export function outcomeHref(marketSlug: string, outcome: TaxonomyOutcome): string {
  return `/${marketSlug}/solutions/${outcome.slug}`;
}
