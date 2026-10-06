import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, BadgeCheck, Info, MapPin, ShieldCheck, Sparkles, Tag, TriangleAlert } from '@/components/ui/icons';
import type { BreadcrumbItem } from '@/components/ui/Breadcrumbs';
import {
  BADGE_AMBER,
  BADGE_SLATE,
  CARD,
  CTA_AMBER,
  LINK_ARROW,
  PUBLIC_SHELL,
} from '@/components/discovery/tokens';
import {
  MarketDataNotice,
  NoticePanel,
  ProviderResultCard,
} from '@/components/discovery/MarketSections';
import {
  AliasChips,
  AvailabilityChip,
  GuidanceList,
  LowSupplyNotice,
  MetaChip,
  ServiceCard,
  TaxonomyHero,
  TaxonomySkeleton,
} from '@/components/discovery/TaxonomySections';
import { Faq, JourneyStepList } from '@/components/marketing/PageSections';
import { PLATFORM_FAQS } from '@/features/marketing/content';
import { FEE_POLICY } from '@/features/pricing/fee-policy';
import { providerCanonicalHref } from '@/features/discovery/data/canonical-policy';
import { getAreaSupply } from '@/features/discovery/data/local-service';
import type { Market, MarketLocation } from '@/features/discovery/data/market-catalog';
import {
  outcomeHref,
  problemHref,
  type IntentCatalog,
  type TaxonomyOutcome,
  type TaxonomyProblem,
} from '@/features/discovery/data/intent-taxonomy';
import type { TaxonomyService } from '@/features/discovery/data/service-taxonomy';

/**
 * IntentSections — the shared bodies of the problem and solution routes.
 *
 * `/{market}/problems/{slug}` and `/{market}/solutions/{slug}` are the two halves of one
 * question. The first is the customer's symptoms, the second is their goal, and both end
 * at the same place: a canonical service, and a request. They share this file because
 * their sections are the same sections with different nouns — a hero, the services that
 * address it, what the platform can and cannot say about cost, the process, and the
 * platform's own answers. Splitting them would have produced two near-identical files.
 *
 * WHAT THESE PAGES MAY NOT CLAIM
 *
 *   Costs and durations. The PRD asks for "estimated cost and time ranges"; the platform
 *   publishes no fee schedule (FEE_POLICY.published is false) and measures no duration.
 *   The panel below says exactly that in both cases rather than inventing a range per
 *   problem, which is the one thing that would be trivially plausible and completely
 *   unsupported.
 *   Emergencies. Severity stops at 'time-sensitive' and every severity carries a note
 *   explaining itself, because the platform is not an emergency service and says so on
 *   /how-it-works and /trust-and-safety. A "safety-relevant" problem gets the same
 *   treatment: what to do is stated, and who to call it for is stated too.
 *   Trade coverage. An outcome bundles the services that exist. Where that is one
 *   service, the page says one service — it does not pad the list with trades the
 *   catalog has no row for.
 */

/* --------------------------------------------------------------- small parts */

/**
 * How the platform talks about urgency.
 *
 * Two visual states, not four: amber for anything time-sensitive, slate for everything
 * routine. The label is always accompanied by its note when one is curated, so a badge
 * never travels alone as an unexplained warning.
 */
export function SeverityBadge({ severity }: { severity: TaxonomyProblem['severity'] }) {
  const label =
    severity === 'time-sensitive'
      ? 'Time-sensitive'
      : severity === 'safety-relevant'
        ? 'Safety-relevant'
        : 'Routine';
  return <span className={severity === 'routine' ? BADGE_SLATE : BADGE_AMBER}>{label}</span>;
}

/**
 * A problem or outcome reached WITH a location in the path.
 *
 * `locality` is null for the region-scoped shape (/{market}/{region}/{outcome-slug}) and
 * present for the locality-scoped one (/{market}/{region}/{locality}/{problem-slug}), so
 * every page that uses this has to handle both depths — which is the point of keeping the
 * two segments apart rather than collapsing them into one optional value.
 *
 * `locations` rides along because the supply read scopes itself by expanding an area code
 * into its descendants, and expanding needs the whole location list. Passing it is one
 * fewer catalogue read per render.
 */
export type LocalizedPlace = {
  region: MarketLocation;
  locality: MarketLocation | null;
  locations: MarketLocation[];
};

/** 'Gwarinpa, Abuja' / 'Niger State' / null when there is no location in the path. */
export function placeOf(localized?: LocalizedPlace | null): string | null {
  if (!localized) return null;
  return localized.locality
    ? `${localized.locality.name}, ${localized.region.name}`
    : localized.region.name;
}

/**
 * The H1 for a contextual intent page.
 *
 * The catalogue's display names are sentences ('A leaking pipe or joint', 'The leak found and
 * stopped'), so this reads as a phrase rather than as a bare keyword stack — the localisation
 * the brief asks for, without rewriting curated copy per location.
 */
export function localizedHeading(base: string, localized?: LocalizedPlace | null): string {
  const place = placeOf(localized);
  return place ? `${base} in ${place}` : base;
}

/**
 * The cost and duration panel, shared by both routes.
 *
 * Deliberately identical in both places: "we do not publish a range" is the same answer
 * whether the visitor arrived from a symptom or from a goal, and it must not drift.
 *
 * `place` is the only thing a location changes, and it changes the SUBJECT of the sentence,
 * not the answer: a job in Gwarinpa costs what an itemized quote for Gwarinpa says it costs.
 * The note about comparability is the reason a localized version is worth having at all —
 * quotes for two different areas are not comparable even for identical scope, because travel
 * and access differ, and a visitor comparing numbers needs that said out loud.
 */
export function CostAndTimingPanel({ subject, place }: { subject: string; place?: string | null }) {
  return (
    <div className={`${CARD} p-6`}>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-amber-200 bg-secondary-light text-amber-700"
      >
        <Info className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-base font-bold text-slate-900">
        No cost or time estimate is published {place ? `for ${subject} in ${place}` : `for ${subject}`}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {FEE_POLICY.published
          ? 'The platform publishes its fee schedule on the pricing page. What a job itself costs is never published here: it is stated on an itemized quote, because two providers quoting the same scope can price it differently.'
          : 'The platform has not published a fee schedule yet, and no price in this database is attached to a problem or an outcome — a figure here would be invented. What a job costs is stated on an itemized quote, lines included.'}{' '}
        Nothing on the platform estimates how long work will take either: turnaround depends
        on the provider, the parts and the access to the site.
      </p>
      {place ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Two quotes are only comparable when they cover the same work in the same area. Travel,
          access and parts availability differ between {place} and the next locality, so a price
          you were quoted elsewhere is not a benchmark for this one.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/pricing" className={LINK_ARROW}>
          How fees work
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <Link href="/how-it-works" className={LINK_ARROW}>
          How a quote is put together
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/** The services that address a problem or deliver an outcome. */
function ServiceBundle({
  marketSlug,
  services,
  description,
}: {
  marketSlug: string;
  services: TaxonomyService[];
  description: string;
}) {
  if (!services.length) {
    return (
      <NoticePanel tone="slate" title="No service in this market&rsquo;s catalog is linked to this yet.">
        The entry is real and published; the link from it to a canonical service has not been
        curated. Nothing is guessed in the gap — an unlinked page is better than a page that
        points at the wrong trade.
      </NoticePanel>
    );
  }

  return (
    <>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <ServiceCard key={service.serviceEntityId} marketSlug={marketSlug} service={service} />
        ))}
      </div>
    </>
  );
}

/** Cross-links between the two halves, computed from the bundles they share. */
function RelatedList({
  heading,
  items,
}: {
  heading: string;
  items: { href: string; label: string; detail: string }[];
}) {
  if (!items.length) return null;

  return (
    <section aria-label={heading}>
      <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        {heading}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={`${CARD} block p-4 no-underline transition-shadow hover:shadow-md`}>
              <span className="block text-sm font-bold text-slate-900">{item.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------- area supply (N) */

/**
 * Who can do this work in the place the visitor is looking at.
 *
 * The one section that only exists on a contextual URL, and it exists because the location is
 * the whole reason that URL was worth building: a problem page for Gwarinpa that does not say
 * who works in Gwarinpa is the flat page with a longer heading.
 *
 * WHERE THE COUNT COMES FROM. `provider_matching_eligibility` joined to the public profile
 * projection — the same rows the search results and the local service page read, so the three
 * cannot disagree. The area code is expanded to its descendants, which is why a region-scoped
 * page counts providers recorded in that region's localities.
 *
 * THE HONEST CAVEAT WHEN NO SERVICE IS LINKED. `getAreaSupply` narrows an area-wide result by
 * service name. When the entity links to no service at all there is nothing to narrow by, and
 * the section says the list is every eligible provider in the area rather than implying it is
 * a list for this problem. Today every problem and outcome has at least one service, so this
 * branch is a guard rather than the live path — which is exactly why it is written out instead
 * of left to chance.
 */
async function AreaSupplySection({
  market,
  localized,
  services,
  heading,
}: {
  market: Market;
  localized: LocalizedPlace;
  services: TaxonomyService[];
  heading: string;
}) {
  const place = placeOf(localized) ?? market.displayName;
  const supply = await getAreaSupply({
    market,
    locations: localized.locations,
    areaCode: localized.locality?.code ?? localized.region.code,
    serviceNames: services.map((service) => service.displayName),
  });

  // The lowest threshold among the linked services: the strictest gate any of them has to
  // clear, because that is the one that decides whether a page here can be indexed at all.
  const minimumSupply = services.reduce<number | null>(
    (lowest, service) =>
      service.indexingThreshold === null
        ? lowest
        : lowest === null
          ? service.indexingThreshold
          : Math.min(lowest, service.indexingThreshold),
    null,
  );

  const tradeList = services.map((service) => service.displayName.toLowerCase());
  const trades = tradeList.length === 1 ? tradeList[0] : tradeList.join(' and ');

  return (
    <section aria-labelledby="area-supply">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-solid border-slate-200 pb-4">
        <div>
          <h2 id="area-supply" className="text-2xl font-bold tracking-tight text-slate-900">
            {heading}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {services.length
              ? `Providers verified by the platform and eligible for ${trades} in ${place}. Eligibility is checked per service and per area, so a provider listed here can be matched to work at an address in this area.`
              : `Providers verified by the platform and recorded as eligible in ${place}. This entry is not linked to a canonical service yet, so this is every eligible provider in the area rather than a list for this particular problem — the platform would rather say that than imply a match it cannot make.`}
          </p>
        </div>
        <AvailabilityChip count={supply.providers.length} />
      </div>

      {supply.unavailable ? (
        <div className="mt-5">
          <NoticePanel tone="amber" icon={<TriangleAlert className="h-5 w-5" />}>
            The provider catalog did not respond, so local availability cannot be shown right now.
            This is a problem on our side rather than a statement about who works in {place} —
            reload in a moment.
          </NoticePanel>
        </div>
      ) : supply.providers.length ? (
        <div className="mt-5 grid gap-3">
          {supply.providers.map((provider) => (
            <ProviderResultCard
              key={provider.slug}
              provider={provider}
              // The market-scoped profile is the canonical one for a provider. The local
              // service page still links the global /providers/{slug} route, which predates
              // the canonical policy in canonical-policy.ts and is left alone deliberately.
              profileHref={providerCanonicalHref(market.slug, provider.slug)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          <LowSupplyNotice
            marketName={place}
            serviceName={services.length ? trades : 'this work'}
            count={0}
            indexingThreshold={minimumSupply}
          />
          <div className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Post the request anyway
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                Matching runs on the request, not on this page: a request is matched against
                providers who are eligible for the work in the area it names, including ones who
                are not published here yet.
              </p>
            </div>
            <Link href="/requests/new" className={CTA_AMBER}>
              Start a request
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------- page views (N) */

/**
 * The problem page: hero plus body, with or without a location.
 *
 * Both routes that serve a problem render through here — the flat
 * /{market}/problems/{slug} and the locality-scoped /{market}/{region}/{locality}/{slug} —
 * because they are the same page. The ONLY things a location changes are the heading, the
 * scope sentence, the eyebrow, the place chip, the cost panel's subject and the supply
 * section, and every one of those is derived here rather than in the route, so the two URLs
 * cannot end up describing the same problem differently.
 *
 * The breadcrumb trail is passed IN, because only the route knows which segments its URL
 * actually had.
 */
export function ProblemPageView({
  market,
  problem,
  catalog,
  breadcrumbs,
  localized,
}: {
  market: Market;
  problem: TaxonomyProblem;
  catalog: IntentCatalog;
  breadcrumbs: BreadcrumbItem[];
  localized?: LocalizedPlace | null;
}) {
  const place = placeOf(localized);

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={breadcrumbs}
        eyebrow={
          <>
            <Tag aria-hidden="true" className="h-3.5 w-3.5" />
            Problem · {market.code}
            {place ? ` · ${place}` : ''}
          </>
        }
        title={localizedHeading(problem.displayName, localized)}
        lede={
          place
            ? `${problem.definition} This page is scoped to ${place}: the providers below are the ones recorded for that area, and the trade links open the ${place} pages.`
            : problem.definition
        }
        chips={
          <>
            <SeverityBadge severity={problem.severity} />
            <MetaChip>
              {problem.services.length} service{problem.services.length === 1 ? '' : 's'} linked
            </MetaChip>
            {place ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-slate-200 uppercase">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {place}
              </span>
            ) : null}
          </>
        }
        actions={
          // /requests/new is the destination; it sends a signed-out visitor through /auth/sign-in
          // and returns them to the form, which is why this does not point at /auth/sign-in
          // directly. The label stays area-free even on a localized page: the request form is
          // not pre-scoped to an area, and a button that says "in Gwarinpa" would claim it is.
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request to fix this
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      <div className={PUBLIC_SHELL}>
        <ProblemBody market={market} problem={problem} catalog={catalog} localized={localized} />
      </div>
    </div>
  );
}

/** The outcome page, for the same reasons. See ProblemPageView. */
export function OutcomePageView({
  market,
  outcome,
  catalog,
  breadcrumbs,
  localized,
}: {
  market: Market;
  outcome: TaxonomyOutcome;
  catalog: IntentCatalog;
  breadcrumbs: BreadcrumbItem[];
  localized?: LocalizedPlace | null;
}) {
  const place = placeOf(localized);

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={breadcrumbs}
        eyebrow={
          <>
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Outcome · {market.code}
            {place ? ` · ${place}` : ''}
          </>
        }
        title={localizedHeading(outcome.displayName, localized)}
        lede={
          place
            ? `${outcome.definition} This page is scoped to ${place}: the trades below are the ones the catalogue offers there, and the planning steps are the same ones the platform applies everywhere it operates.`
            : outcome.definition
        }
        chips={
          <>
            <MetaChip>
              {outcome.services.length} service{outcome.services.length === 1 ? '' : 's'} bundled
            </MetaChip>
            {outcome.planningSteps.length ? (
              <MetaChip>{outcome.planningSteps.length}-step process</MetaChip>
            ) : null}
            {place ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-slate-200 uppercase">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {place}
              </span>
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

      <div className={PUBLIC_SHELL}>
        <OutcomeBody market={market} outcome={outcome} catalog={catalog} localized={localized} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ problem body */

export function ProblemBody({
  market,
  problem,
  catalog,
  localized,
}: {
  market: Market;
  problem: TaxonomyProblem;
  catalog: IntentCatalog;
  /** Present only when the URL carried a location. See LocalizedPlace. */
  localized?: LocalizedPlace | null;
}) {
  const place = placeOf(localized);
  // Outcomes that share a service with this problem: the goal a visitor may actually
  // want, reached from the symptom they typed.
  const relatedOutcomes = catalog.outcomes
    .filter((outcome) =>
      outcome.services.some((service) =>
        problem.services.some((member) => member.serviceEntityId === service.serviceEntityId),
      ),
    )
    .map((outcome) => ({
      href: outcomeHref(market.slug, outcome),
      label: outcome.displayName,
      detail: outcome.definition,
    }));

  return (
    <div className="grid gap-12">
      <section aria-labelledby="problem-symptoms">
        <h2 id="problem-symptoms" className="text-2xl font-bold tracking-tight text-slate-900">
          What this usually looks like
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{problem.definition}</p>
        {problem.severityNote ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-900">On timing: </span>
            {problem.severityNote}
          </p>
        ) : null}

        {problem.guidance.length ? (
          <div className="mt-5 max-w-3xl">
            <h3 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What to note before you ask for a quote
            </h3>
            <div className="mt-3">
              <GuidanceList items={problem.guidance} />
            </div>
          </div>
        ) : null}

        {problem.aliases.length ? (
          <div className="mt-6">
            <AliasChips
              marketSlug={market.slug}
              aliases={problem.aliases}
              cap={16}
              label="Also described as"
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="problem-services">
        <h2 id="problem-services" className="text-2xl font-bold tracking-tight text-slate-900">
          Services that fix this
        </h2>
        <ServiceBundle
          marketSlug={market.slug}
          services={problem.services}
          description={`Each entry is a canonical service in ${market.displayName}'s catalog, with its own scope. Opening one shows what the work covers and how to post a request for it.`}
        />
      </section>

      {/* The local supply read is the slow one, and it is the only thing on this page that
          depends on the visitor's location — so it streams, and the page's identity (is this
          a real problem? is this a real place?) is settled before the shell flushes. */}
      {localized ? (
        <Suspense fallback={<TaxonomySkeleton count={2} />}>
          <AreaSupplySection
            market={market}
            localized={localized}
            services={problem.services}
            heading={`Who can take this on in ${place}`}
          />
        </Suspense>
      ) : null}

      <section aria-labelledby="problem-cost">
        <h2 id="problem-cost" className="text-2xl font-bold tracking-tight text-slate-900">
          Cost and timing
        </h2>
        <div className="mt-5">
          <CostAndTimingPanel subject={problem.displayName.toLowerCase()} place={place} />
        </div>
      </section>

      {/* Safety wording is deliberately about behaviour, not about the platform:
          what a reader should do first, and the explicit statement that the platform
          does not answer emergencies. */}
      <section aria-labelledby="problem-safety">
        <h2 id="problem-safety" className="text-2xl font-bold tracking-tight text-slate-900">
          Safety first
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-900">Before anyone arrives</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Isolate the supply or the power where it is safe to do so, keep water away from
              electrical fittings, and photograph what you can see. Do not open anything you are not
              sure how to close.
            </p>
          </div>
          <div className={`${CARD} p-5`}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-amber-200 bg-secondary-light text-amber-700"
            >
              <TriangleAlert className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-900">
              The platform is not an emergency service
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              If anyone is in danger, or a property is at immediate risk, contact the appropriate
              emergency service first — not this platform. Nothing here promises response times.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="problem-faq">
        <h2 id="problem-faq" className="text-2xl font-bold tracking-tight text-slate-900">
          Questions people ask about this
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          The platform answers, published identically everywhere — none of them depends on the
          problem you arrived from.
        </p>
        <div className="mt-5">
          <Faq items={PLATFORM_FAQS} />
        </div>
      </section>

      <RelatedList heading="The goal behind this problem" items={relatedOutcomes} />

      <section
        className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
      >
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Ready to get this fixed?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Describe it in your own words — you do not need to know which part is at fault, and you
            do not need an account to look around.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request to fix this
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link href={`/${market.slug}/search?q=${encodeURIComponent(problem.displayName)}`} className={LINK_ARROW}>
            Search providers
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <MarketDataNotice />
    </div>
  );
}

/* ------------------------------------------------------------ outcome body */

export function OutcomeBody({
  market,
  outcome,
  catalog,
  localized,
}: {
  market: Market;
  outcome: TaxonomyOutcome;
  catalog: IntentCatalog;
  /** Present only when the URL carried a location. See LocalizedPlace. */
  localized?: LocalizedPlace | null;
}) {
  const place = placeOf(localized);
  const relatedProblems = catalog.problems
    .filter((problem) =>
      problem.services.some((service) =>
        outcome.services.some((member) => member.serviceEntityId === service.serviceEntityId),
      ),
    )
    .map((problem) => ({
      href: problemHref(market.slug, problem),
      label: problem.displayName,
      detail: problem.definition,
    }));

  const trades = outcome.services.map((service) => service.displayName);

  return (
    <div className="grid gap-12">
      <section aria-labelledby="outcome-scope">
        <h2 id="outcome-scope" className="text-2xl font-bold tracking-tight text-slate-900">
          What has to happen
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{outcome.definition}</p>

        {/* "Required trades" is answered from the catalog rather than from a plan:
            the platform can only name trades it actually has services for. */}
        <div className="mt-5 max-w-3xl rounded-xl border border-solid border-slate-200/80 bg-slate-50 p-5">
          <h3 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Trades involved
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {outcome.services.length === 1
              ? `One canonical service reaches this outcome in ${
                  market.displayName
                } today: ${trades[0]}. Other trades may be needed on a real job, but the catalog has no service for them yet, and listing them here would promise coverage the platform cannot match.`
              : `${trades.length} canonical services are bundled for this outcome: ${trades.join(', ')}.`}
          </p>
        </div>

        {outcome.aliases.length ? (
          <div className="mt-5">
            <AliasChips
              marketSlug={market.slug}
              aliases={outcome.aliases}
              cap={16}
              label="Also described as"
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="outcome-services">
        <h2 id="outcome-services" className="text-2xl font-bold tracking-tight text-slate-900">
          Services bundled for this
        </h2>
        <ServiceBundle
          marketSlug={market.slug}
          services={outcome.services}
          description="Each is a canonical service with its own scope and its own providers. Opening one shows what it covers and how to post a request for it."
        />
      </section>

      {outcome.planningSteps.length ? (
        <section aria-labelledby="outcome-plan">
          <h2 id="outcome-plan" className="text-2xl font-bold tracking-tight text-slate-900">
            How this goes, step by step
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            The platform&rsquo;s process, from the first description to releasing payment. Steps are
            about what gets agreed and when — not about how long anything takes.
          </p>
          {/* The steps are the platform's process and are the same everywhere. A regional URL
              does NOT get region-specific prerequisites, because none are recorded: inventing
              "permits needed in Niger State" from a slug would be the most convincing kind of
              wrong. What the region changes is the sentence a reader sees first. */}
          {localized ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Planning this for {place}: the platform records no area-specific requirement or
              permit step, so the sequence below is the one that applies everywhere it operates.
              Where a job does need a local approval, the provider raises it on the quote rather
              than this page asserting it.
            </p>
          ) : null}
          <div className="mt-6">
            <JourneyStepList
              steps={outcome.planningSteps.map((step, index) => ({
                number: String(index + 1),
                title: step.title,
                body: step.body,
              }))}
            />
          </div>
        </section>
      ) : null}

      {localized ? (
        <Suspense fallback={<TaxonomySkeleton count={2} />}>
          <AreaSupplySection
            market={market}
            localized={localized}
            services={outcome.services}
            heading={`Who can deliver this in ${place}`}
          />
        </Suspense>
      ) : null}

      <section aria-labelledby="outcome-cost">
        <h2 id="outcome-cost" className="text-2xl font-bold tracking-tight text-slate-900">
          Planning and cost
        </h2>
        <div className="mt-5">
          <CostAndTimingPanel subject={outcome.displayName.toLowerCase()} place={place} />
        </div>
      </section>

      <section aria-labelledby="outcome-trust">
        <h2 id="outcome-trust" className="text-2xl font-bold tracking-tight text-slate-900">
          Who you are hiring
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
            >
              <BadgeCheck className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-900">Verified before they appear</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Identity is checked before a provider can quote, licences where the trade requires one,
              and insurance where it applies. What those checks do not guarantee is set out on the
              trust and safety page.
            </p>
          </div>
          <div className={`${CARD} p-5`}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-900">A scope both sides work from</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              A multi-step outcome is where scope creep costs money. Every change is re-approved
              before the work happens, and the itemized quote is the document a dispute is reviewed
              against.
            </p>
          </div>
        </div>
      </section>

      <RelatedList heading="Problems this addresses" items={relatedProblems} />

      <section
        className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
      >
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Ready to plan this?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Describe the outcome you want. Providers quote against the same scope, so the numbers are
            comparable and the plan is written down before anyone starts.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/requests/new" className={CTA_AMBER}>
            Plan your project
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link href={`/${market.slug}/services`} className={LINK_ARROW}>
            Browse the catalog
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <MarketDataNotice />
    </div>
  );
}
