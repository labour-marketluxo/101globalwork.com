import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ArrowRight, BadgeCheck, Building2, MapPin } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CTA_AMBER, PUBLIC_SHELL } from '@/components/discovery/tokens';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import {
  ProviderContextNote,
  ProviderProfileSections,
} from '@/components/discovery/ProviderProfileSections';
import {
  CONTEXTUAL_VARIANT_ROBOTS,
  marketHref,
  providerCanonicalHref,
} from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
import { resolveLocalService } from '@/features/discovery/data/local-service';
import { resolveMarketProviderProfile } from '@/features/discovery/data/provider-profile';
import {
  previewEnabled,
  previewProviderProfile,
} from '@/features/discovery/data/preview-providers';

/**
 * Provider profile, in full context —
 * /{market}/{region}/{locality}/{service-plural}/{provider-slug}
 *
 * e.g. /ng/abuja/gwarinpa/plumbers/bright-plumb-services
 *
 * The trade-and-place path to a provider: the URL a visitor builds when they know all three
 * of "where", "what" and "who". The breadcrumb it produces is the reason the route exists —
 * Home › Nigeria › Abuja › Gwarinpa › Plumbing › Bright Plumb Services is a trail a person
 * can read, and it is the trail the PRD asks for.
 *
 * THE SEGMENT IS `[provider]` AND ITS NAME DOES NOT MATTER. It cannot be `[provider-slug]`
 * and it could not share this level with anything else anyway; what the router calls it
 * never reaches the URL. What DOES matter is that this file is the only child of
 * `[service]`, which is why the trade stays resolvable above it.
 *
 * THE URL ASSERTS FOUR THINGS, AND EACH ONE IS CHECKED
 *
 *   market    the market exists, and the profile's recorded location is in it — enforced in
 *             resolveMarketProviderProfile, the same guard the flat route uses.
 *   region    real, and the parent of the locality — enforced by the location chain.
 *   locality  real, and the profile's OWN recorded locality. A mismatch does not 404: the
 *             provider is real, so the visitor is sent to the canonical profile with a 307
 *             rather than told the provider does not exist. See the note below on why 307.
 *   service   real, and the profile's recorded service. A mismatch is answered the same way.
 *
 * WHY 307 AND NOT 308 FOR A CONTEXT MISMATCH. A retired handle is permanent — that entity's
 * old slug will never be correct again, so it 308s (see the leaf route). A provider's
 * locality is a mutable fact: they can move, or take on a second trade. Telling a crawler
 * that this URL is permanently that URL would be a claim about data that changes.
 *
 * CANONICAL AND INDEXABILITY. This is a CONTEXTUAL VARIANT: same profile, extra path. It
 * declares the flat /{market}/providers/{slug} canonical and is noindex, follow — the two
 * instructions have to agree, and a page pointing its canonical elsewhere while asking to
 * be indexed gives crawlers a contradiction to resolve however they like. See
 * canonical-policy.ts for the whole policy; the exception there is service pages, whose
 * canonical URL comes from the registry per locality.
 *
 * WHAT THIS ROUTE CANNOT PUBLISH. It renders through ProviderProfileSections, which accepts
 * a view model with no id fields, and the ids the guards need stay in this file. There is no
 * contact field to leak: the RPC projection has none.
 */

type Params = Promise<{
  market: string;
  region: string;
  locality: string;
  service: string;
  provider: string;
}>;
type SearchParams = Promise<{ preview?: string }>;

/**
 * One resolution pass for both metadata and the page.
 *
 * Runs the service leaf resolver first, because the trade segment has to be real before
 * this is a profile URL at all — and because that resolver is what validates the location
 * chain, matches the trade handle against the registry and the aliases, and answers a
 * retired handle with a redirect. Reusing it means this route cannot disagree with the leaf
 * page about whether /ng/abuja/gwarinpa/plumbers is a thing.
 */
async function resolve(
  market: string,
  region: string,
  locality: string,
  service: string,
  providerSlug: string,
  preview: boolean,
) {
  const leaf = await resolveLocalService(market, region, locality, service);
  if (!leaf) return null;
  if (leaf.kind === 'redirect') return { kind: 'redirect', toPath: leaf.toPath } as const;

  const { context } = leaf;

  // Dev-only. The sample profile carries no identifiers on purpose: the fixture is not a claim
  // that a real provider works at a real location, so there is nothing for the context checks
  // below to match against and the page says SAMPLE instead.
  if (preview) {
    const view = previewProviderProfile(providerSlug);
    if (!view) return null;
    return {
      kind: 'page',
      context,
      profile: { view, locationId: null, serviceEntityId: null },
    } as const;
  }

  const profile = await resolveMarketProviderProfile(context.locations, providerSlug);
  if (!profile) return null;

  return { kind: 'page', context, profile } as const;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { market, region, locality, service, provider } = await params;
  const query = await searchParams;
  const preview = previewEnabled(query.preview);

  const resolved = await resolve(market, region, locality, service, provider, preview);
  // A retired path and an unresolvable one both have no page, and therefore no title.
  if (!resolved || resolved.kind === 'redirect') return {};

  const { context, profile } = resolved;
  const place = `${context.locality.name}, ${context.region.name}`;

  return {
    title: `${profile.view.displayName} — ${context.service.displayName} in ${place}`,
    description:
      profile.view.description ??
      `${profile.view.displayName}, ${context.service.displayName.toLowerCase()} recorded in ${place}. Verification, service scope and how to request a quote.`,
    alternates: { canonical: providerCanonicalHref(context.market.slug, profile.view.slug) },
    // A preview is noindex AND nofollow: it is fabricated supply, so it may not be crawled and
    // its links may not be followed. Dead code in a production build.
    robots: preview ? { index: false, follow: false } : CONTEXTUAL_VARIANT_ROBOTS,
  };
}

export default async function ContextualProviderProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market, region, locality, service, provider } = await params;
  const query = await searchParams;
  const preview = previewEnabled(query.preview);

  const resolved = await resolve(market, region, locality, service, provider, preview);

  if (!resolved) notFound();
  if (resolved.kind === 'redirect') permanentRedirect(resolved.toPath);

  const { context, profile } = resolved;
  const { view } = profile;
  const canonicalHref = providerCanonicalHref(context.market.slug, view.slug);
  const place = `${context.locality.name}, ${context.region.name}`;

  // The URL claims this locality and this trade. The record agrees with the first by
  // construction (resolveMarketProviderProfile only checks the market; the locality is
  // checked here) and with the second when a service is recorded at all. A provider with no
  // recorded service is not a mismatch — it is an absence, and the page below says so rather
  // than treating an empty field as a contradiction.
  //
  // SKIPPED IN PREVIEW, and not as a shortcut: the fixture has no location or service to
  // compare, so there is no claim for the URL to contradict.
  if (!preview) {
    const localityMismatch = profile.locationId !== context.locality.locationId;
    const serviceMismatch =
      profile.serviceEntityId !== null &&
      profile.serviceEntityId !== context.service.serviceEntityId;

    if (localityMismatch || serviceMismatch) redirect(canonicalHref);
  }

  return (
    <div className="w-full">
      <TaxonomyHero
        // Ancestors are linked only where a page exists: the region hub is still served from
        // the mock hubs, so `regionHub` is left to the builder's own lookup, while the
        // locality hub is real for every catalogue locality (see the locality route).
        breadcrumbs={discoveryTrail({
          market: context.market,
          region: context.region,
          locality: context.locality,
          localityHub: true,
          service: { label: context.service.displayName, href: context.canonicalHref },
          leaf: view.displayName,
        })}
        eyebrow={
          <>
            <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
            Provider · {context.market.code}
          </>
        }
        title={view.displayName}
        lede={
          view.description ??
          `${view.serviceName ?? 'Service provider'} covering ${place}. The provider has not published a description yet.`
        }
        chips={
          <>
            {view.verified ? (
              <span className={BADGE_AMBER}>
                <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Identity checked
              </span>
            ) : (
              <span className={BADGE_SLATE}>Verification pending</span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-slate-200 uppercase">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {place}
            </span>
            {preview ? <span className={BADGE_SLATE}>Sample row</span> : null}
          </>
        }
        actions={
          <>
            <Link href="/requests/new" className={CTA_AMBER}>
              Request a quote
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            {/* The trade page for this locality — the step back up the hierarchy, which is
                where a visitor comparing providers expects to go. */}
            <Link
              href={context.canonicalHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 no-underline transition-colors hover:text-white"
            >
              {context.service.displayName} in {context.locality.name}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      {/* No Suspense boundary: every read this page needs has already completed — the
          name, the place and the service all had to resolve before the page could decide
          whether it was a 404. There is nothing left to stream. */}
      <div className={PUBLIC_SHELL}>
        {preview ? (
          <div className="mb-8">
            <NoticePanel tone="amber" title="Sample profile">
              This is the dev-only <code>?preview=1</code> fixture, not a published provider, and
              it is not shown as working in {place}. No provider profile exists in this database
              yet, so the page is rendering invented copy through the real component — including
              the real field allowlist. It is inert in a production build.
            </NoticePanel>
          </div>
        ) : null}
        <ProviderProfileSections
          view={view}
          market={context.market}
          place={place}
          contextNote={
            <ProviderContextNote
              place={place}
              serviceName={context.service.displayName}
              canonicalHref={canonicalHref}
            />
          }
        />
        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          Looking for this provider without the location in the path?{' '}
          <Link
            href={canonicalHref}
            className="font-semibold text-primary underline underline-offset-2"
          >
            {canonicalHref}
          </Link>{' '}
          is the canonical page, and the{' '}
          <Link href={marketHref(context.market.slug)} className="font-semibold text-primary underline underline-offset-2">
            {context.market.displayName} hub
          </Link>{' '}
          is where the rest of the catalogue starts.
        </p>
      </div>
    </div>
  );
}
