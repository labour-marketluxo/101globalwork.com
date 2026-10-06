import Link from 'next/link';
import { ArrowRight, Banknote, Info, MapPin, TriangleAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, CTA_AMBER, LINK_ARROW } from '@/components/discovery/tokens';
import { MarketDataNotice, NoticePanel, ProviderResultCard } from '@/components/discovery/MarketSections';
import {
  AliasChips,
  AvailabilityChip,
  GuidanceList,
  LowSupplyNotice,
  TrustBadges,
} from '@/components/discovery/TaxonomySections';
import { Faq } from '@/components/marketing/PageSections';
import { PLATFORM_FAQS } from '@/features/marketing/content';
import { FEE_POLICY } from '@/features/pricing/fee-policy';
import { getCityHub, getLocalityHub } from '@/features/discovery/data/mock-locations';
import {
  getLocalSupply,
  type LocalServiceContext,
  type LocalSupply,
} from '@/features/discovery/data/local-service';
import { getPublicRouteDocument } from '@/features/discovery/data/service-taxonomy';
import { PREVIEW_PROVIDERS } from '@/features/discovery/data/preview-providers';
import type { MarketProvider } from '@/features/discovery/data/market-catalog';

/**
 * LocalServiceSections — the sections of the local discovery page
 * (/{market}/{region}/{locality}/{service-plural}).
 *
 * WHAT THIS PAGE IS FOR, because it changes what every section may claim: it is the
 * page someone reaches when they have already decided both what and where. The market
 * service page answers "what is this service"; this one has to answer "can I get it
 * HERE, and what happens if I ask". So the supply section is the page's centre, not a
 * detail, and the honest state of that answer today is "nobody is published in this
 * locality yet".
 *
 * THREE THINGS ARE DELIBERATELY ABSENT
 *
 *   Prices. `FEE_POLICY.published` is false, so no fee schedule exists to quote, and
 *   no local price data exists at any granularity. The section states that plainly and
 *   routes to /pricing. The PRD asks for "pricing estimates where verified" — the
 *   qualifier is doing the work, and nothing here is verified.
 *   Ratings and job counts. There is no reviews table. The mock hub files beside this
 *   one carry ★ 4.9 and "284 jobs completed"; those are fabricated and are NOT used
 *   here (see mock-locations.ts's own header).
 *   Local response times and guarantees. Nothing measures them.
 *
 * WHAT IS REAL, AND WHERE IT COMES FROM
 *
 *   providers       provider_matching_eligibility + provider_public_profiles, scoped to
 *                   this locality (the same rows the market search returns)
 *   guidance        the curated platform guidance in public_service_content_catalog
 *   coverage        public_location_catalog — siblings of this locality
 *   indexability    the registry's policy evaluation for this locality
 */

/* ------------------------------------------------------------------ supply */

/**
 * The page's centre: who can actually do this work here.
 *
 * Three states, and the empty one is not an apology — it is the state the whole
 * marketplace is in, so it leads with the fallback action (post the request) rather
 * than with the absence.
 */
export function LocalSupplySection({
  context,
  supply,
  preview = false,
}: {
  context: LocalServiceContext;
  supply: LocalSupply;
  /** Dev-only: marks the sample rows a `?preview=1` render uses. */
  preview?: boolean;
}) {
  const { locality, region, market, service, route } = context;

  return (
    <section aria-labelledby="local-supply">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-solid border-slate-200 pb-4">
        <div>
          <h2 id="local-supply" className="text-2xl font-bold tracking-tight text-slate-900">
            Verified providers in {locality.name}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Providers verified by the platform and eligible for {service.displayName.toLowerCase()} in{' '}
            {locality.name}, {region.name}. Eligibility is checked per service and per area, so a
            provider listed here can be matched to work at this address.
          </p>
        </div>
        <AvailabilityChip count={supply.providers.length} />
      </div>

      {supply.unavailable ? (
        <div className="mt-5">
          <NoticePanel tone="amber" icon={<TriangleAlert className="h-5 w-5" />}>
            The provider catalog did not respond, so local availability cannot be shown right now.
            This is a problem on our side rather than a statement about who works in {locality.name}
            — reload in a moment.
          </NoticePanel>
        </div>
      ) : supply.providers.length ? (
        <div className="mt-5 grid gap-3">
          {supply.providers.map((provider) => (
            <ProviderResultCard
              key={provider.slug}
              provider={provider}
              sample={preview}
              profileHref={`/providers/${provider.slug}`}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          <LowSupplyNotice
            marketName={`${locality.name}, ${region.name}`}
            serviceName={service.displayName}
            count={0}
            indexingThreshold={route?.indexingThreshold ?? service.indexingThreshold}
          />

          {/* The PRD's fallback: an empty list still has to leave the visitor with a
              working next step, so the request CTA is the section's primary action. */}
          <div
            className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
          >
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900">
                Need {service.displayName.toLowerCase()} in {locality.name}?
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                Posting is what creates the local record: your request is scoped to {locality.name}{' '}
                and {service.displayName.toLowerCase()}, and it can be matched as soon as verified
                providers are published here. Posting costs nothing and commits you to nothing.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/requests/new" className={CTA_AMBER}>
                Start request in {locality.name}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href={`/${market.slug}/search?category=${encodeURIComponent(service.canonicalKey)}&area=${encodeURIComponent(locality.code)}`} className={LINK_ARROW}>
                Search this area
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- guidance */

/**
 * What this costs and how it goes — the two questions the section can answer honestly.
 *
 * The pricing half is a gate, not a placeholder: while `FEE_POLICY.published` is false
 * the platform has no schedule to quote, and a local estimate would be a number
 * invented per page. The process half is the curated guidance the service and its
 * category already carry.
 */
export function LocalGuidanceSection({ context }: { context: LocalServiceContext }) {
  const { service, category, locality } = context;

  // Service guidance first, then anything the category adds that the service does not
  // already say — the two are curated separately and can overlap.
  const guidance = [
    ...service.guidance,
    ...(category?.guidance ?? []).filter((line) => !service.guidance.includes(line)),
  ];

  return (
    <section aria-labelledby="local-guidance">
      <h2 id="local-guidance" className="text-2xl font-bold tracking-tight text-slate-900">
        Costs and expectations in {locality.name}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        What the platform does and does not publish about money, and what to do before work starts.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className={`${CARD} p-6`}>
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary">
            <Banknote className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-slate-900">
            No local price estimate is published
          </h3>
          {FEE_POLICY.published ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The platform publishes its fee schedule on the pricing page. Provider prices are never
              published here: they are stated on an itemized quote, because two providers quoting the
              same request can legitimately price it differently.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The platform has not published a fee schedule yet, and provider prices are only ever
              stated on an itemized quote — so there is no figure to quote for {locality.name}. The
              request itself is free, and the quote you get is the price, lines included.
            </p>
          )}
          <div className="mt-4">
            <Link href="/pricing" className={LINK_ARROW}>
              How fees work
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className={`${CARD} p-6`}>
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary">
            <Info className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold text-slate-900">Before you ask for a quote</h3>
          {guidance.length ? (
            <div className="mt-3">
              <GuidanceList items={guidance} />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              No guidance has been curated for this service yet. The platform&rsquo;s process is the
              same for every service: describe the work, compare itemized quotes, and release
              payment only after you approve the finished work.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- coverage */

/**
 * What else is in reach.
 *
 * Sibling localities link into the market SEARCH rather than to their own leaf pages:
 * a leaf exists only where the registry holds a route for that exact service and
 * locality, and linking to one that does not would hand the visitor a 404 from a page
 * that looks authoritative. The search always works and always reflects real supply.
 */
export function LocalCoverageSection({ context }: { context: LocalServiceContext }) {
  const { market, region, locality, siblings, service } = context;

  const regionHub = getCityHub(market.slug, region.code);
  const localityHub = getLocalityHub(market.slug, region.code, locality.code);

  return (
    <section aria-labelledby="local-coverage">
      <h2 id="local-coverage" className="text-2xl font-bold tracking-tight text-slate-900">
        Around {locality.name}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Coverage follows the catalog: these are the other areas inside {region.name} that a request
        for {service.displayName.toLowerCase()} can be scoped to.
      </p>

      {siblings.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {siblings.map((sibling) => (
            <Link
              key={sibling.locationId}
              href={`/${market.slug}/search?category=${encodeURIComponent(service.canonicalKey)}&area=${encodeURIComponent(sibling.code)}`}
              className="inline-flex items-center gap-1 rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 no-underline transition-colors hover:border-primary-subtle hover:bg-primary-surface hover:text-primary"
            >
              <MapPin aria-hidden="true" className="h-3 w-3 text-slate-400" />
              {sibling.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {region.name} has no other areas in the catalog yet, so this locality is the whole of its
          current coverage for this service.
        </p>
      )}

      {/* "Change location" is a real navigation promise, so it is only offered where the
          hub route exists. The hub chain is still served from mock-locations.ts, which
          knows Abuja, Lagos and Port Harcourt but not Niger State — so for Minna the
          link is dropped rather than pointed at a 404. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {localityHub ? (
          <Link href={`/${market.slug}/${region.code}/${locality.code}`} className={LINK_ARROW}>
            Change location in {region.name}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {regionHub ? (
          <Link href={`/${market.slug}/${region.code}`} className={LINK_ARROW}>
            All services in {region.name}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        <Link href={`/${market.slug}/services`} className={LINK_ARROW}>
          Browse the full catalog
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ trust + faq */

export function LocalTrustSection() {
  return (
    <section aria-labelledby="local-trust">
      <h2 id="local-trust" className="text-2xl font-bold tracking-tight text-slate-900">
        How work here is protected
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        The same checks apply in every market, whatever the locality is called.
      </p>
      <div className="mt-5">
        <TrustBadges />
      </div>
    </section>
  );
}

export function LocalFaqSection({ context }: { context: LocalServiceContext }) {
  return (
    <section aria-labelledby="local-faq">
      <h2 id="local-faq" className="text-2xl font-bold tracking-tight text-slate-900">
        Questions about getting this done in {context.locality.name}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        These are the platform answers, published identically on every service page — none of them
        depends on the locality or the trade, so none of them is written twice.
      </p>
      <div className="mt-5">
        <Faq items={PLATFORM_FAQS} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ body */

/**
 * The streaming body.
 *
 * An async component so the Suspense boundary in the route has real work behind it:
 * the supply read is the page's slowest query, and the shell (hero, breadcrumb,
 * robots decision) has to flush before it or the route cannot 404.
 */
export async function LocalPageBody({
  context,
  preview = false,
}: {
  context: LocalServiceContext;
  preview?: boolean;
}) {
  const supply: LocalSupply = preview
    ? { providers: PREVIEW_PROVIDERS as MarketProvider[], unavailable: false }
    : await getLocalSupply(context);

  const document = await getPublicRouteDocument(`${context.canonicalHref}/`);

  return (
    <div className="grid gap-12">
      {preview ? (
        <NoticePanel
          tone="amber"
          icon={<TriangleAlert className="h-5 w-5" />}
          title="Preview mode — sample providers, not local supply."
        >
          This flag (<code>?preview=1</code>) fills the supply section with the same sample rows the
          market search preview uses, because the marketplace has no published providers yet. It only
          works in development.{' '}
          <Link href={context.canonicalHref}>Show the real (empty) state</Link>.
        </NoticePanel>
      ) : null}

      <LocalSupplySection context={context} supply={supply} preview={preview} />

      {context.service.aliases.length ? (
        <section aria-labelledby="local-vocabulary">
          <h2
            id="local-vocabulary"
            className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase"
          >
            Also described as
          </h2>
          <div className="mt-3">
            <AliasChips
              marketSlug={context.market.slug}
              aliases={context.service.aliases}
              cap={16}
            />
          </div>
        </section>
      ) : null}

      <LocalGuidanceSection context={context} />
      <LocalCoverageSection context={context} />
      <LocalTrustSection />
      <LocalFaqSection context={context} />

      {/* The closing action, for a reader who has scrolled the whole page. Same amber
          as the navbar CTA: one destination, one look. */}
      <section
        className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
      >
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Ready to ask for {context.service.displayName.toLowerCase()} in {context.locality.name}?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Describe the work once. You do not need an account to look around — only to post.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request in {context.locality.name}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link href="/how-it-works" className={LINK_ARROW}>
            How matching works
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <MarketDataNotice />

      <p className="text-sm text-slate-500">
        {context.category ? (
          <>
            <span className={BADGE_SLATE}>{context.category.displayName}</span>{' '}
          </>
        ) : null}
        <span className={BADGE_AMBER}>{context.locality.name}</span> This page is scoped to one
        locality on purpose — quoting accuracy depends on the provider being local to the job.
      </p>

      {/* Structured data, when the registry publishes a payload for this path. */}
      {document?.structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(document.structuredData).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}
    </div>
  );
}
