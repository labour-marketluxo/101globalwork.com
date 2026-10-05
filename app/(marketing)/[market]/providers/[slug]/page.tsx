import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, BadgeCheck, Building2, MapPin } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CTA_AMBER, PUBLIC_SHELL } from '@/components/discovery/tokens';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { ProviderProfileSections } from '@/components/discovery/ProviderProfileSections';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { providerCanonicalHref } from '@/features/discovery/data/canonical-policy';
import { discoveryTrail } from '@/features/discovery/data/discovery-breadcrumbs';
import { getMarket, getMarketLocations } from '@/features/discovery/data/market-catalog';
import { resolveMarketProviderProfile } from '@/features/discovery/data/provider-profile';
import {
  previewEnabled,
  previewProviderProfile,
} from '@/features/discovery/data/preview-providers';

/**
 * Public provider profile — /{market}/providers/{provider-slug}
 *
 * THE FIELD ALLOWLIST IS THE SECURITY BOUNDARY, and it is not implemented here — it is
 * implemented in the database, by `get_public_provider_profile_command`, which returns
 * exactly thirteen columns: provider_id, slug, headline, public_description,
 * years_experience, accepts_new_work, verification_summary, trust_score, readiness_score,
 * service_entity_id, service_name, location_id, location_name.
 *
 * There is no phone number, no email, no street address and no contact field of any kind in
 * that projection, and this page adds none: every value rendered below comes from those
 * thirteen columns or from the public location catalog. The one place a provider's exact
 * position could leak — an address — does not exist in the schema at the granularity that
 * would leak it: a provider is associated with a LOCALITY, and the locality is what this
 * page names.
 *
 * WHAT THE PRD ASKS FOR THAT DOES NOT EXIST YET, stated rather than filled in:
 *
 *   "overall rating / completion stats"   there is no reviews table and no completed-job
 *                                          counter in this database. The page shows the two
 *                                          real numbers that do exist — years of experience
 *                                          and the platform's own readiness score — and says
 *                                          plainly that neither is a customer rating.
 *   "customer reviews & portfolio"         same absence. A portfolio would also need
 *                                          work-sample records with consent attached, which
 *                                          no table holds.
 *   "operational hours"                    no column exists. Hours are agreed in the request.
 *
 * CANONICAL URL, and an open question this file deliberately does NOT settle: the global
 * route `/providers/{slug}` renders the same public profile without a market in the path, so
 * one provider currently has two live URLs. Deciding which is canonical is a product/SEO
 * decision with a redirect attached, and silently changing an existing page's canonical tag
 * from inside a new route would hide that decision rather than make it. This page declares
 * itself canonical for the market-scoped path, through canonical-policy.ts; the global route is
 * untouched.
 *
 * THE BODY IS SHARED WITH THE NESTED ROUTE. /{market}/{region}/{locality}/{service}/{slug}
 * serves the same profile with the location in the path, and both render through
 * ProviderProfileSections. What differs is the breadcrumb (this page has two crumbs, that one
 * has six), the canonical tag (flat here, pointing at this URL there), and a provenance note.
 * Everything else — including every claim the page makes about verification, ratings and
 * hours — is one implementation, because a second copy is where "not collected" becomes a
 * plausible-looking table.
 *
 * NO /{market}/providers INDEX EXISTS. The breadcrumb used to link to one, which meant a live
 * page linked to a 404 on every provider profile. It is now a family label rather than a link,
 * which is the rule discoveryTrail applies to every crumb it builds. Creating that index is a
 * real piece of missing work, and it is deliberately not faked here.
 *
 * UNKNOWN MARKET → redirect('/'). A provider whose primary location is not in this market →
 * 404, because the market is part of what the URL asserts.
 */

type Params = Promise<{ market: string; slug: string }>;
type SearchParams = Promise<{ preview?: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { market, slug } = await params;
  const query = await searchParams;
  const marketRow = await getMarket(market);
  if (!marketRow) return {};

  const locations = await getMarketLocations(marketRow.marketId);
  const preview = previewEnabled(query.preview);
  const view = preview
    ? previewProviderProfile(slug)
    : ((await resolveMarketProviderProfile(locations, slug))?.view ?? null);
  if (!view) return {};

  return {
    title: view.displayName,
    description: view.description ?? undefined,
    alternates: { canonical: providerCanonicalHref(marketRow.slug, view.slug) },
    // The same gate the global profile route uses: the platform's own readiness score, not
    // a popularity signal. Below the threshold the page is useful to a human who has the
    // link and is not offered to a crawler.
    //
    // A PREVIEW IS NEVER INDEXABLE, whatever the sample's score says: it is fabricated supply,
    // and a fabricated page asking to be crawled is the exact failure the fixture exists to
    // avoid. The branch is dead code in a production build (see previewEnabled).
    robots: preview
      ? { index: false, follow: false }
      : { index: view.readinessScore >= 60, follow: true },
  };
}

export default async function MarketProviderProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { market, slug } = await params;
  const query = await searchParams;
  const preview = previewEnabled(query.preview);

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const locations = await getMarketLocations(marketRow.marketId);
  // In preview the sample is used directly and the market check is skipped: the fixture is not
  // a claim about any real provider, so there is no location to verify it against.
  const view = preview
    ? previewProviderProfile(slug)
    : ((await resolveMarketProviderProfile(locations, slug))?.view ?? null);
  if (!view) notFound();

  const place = view.locationName ?? marketRow.displayName;

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={discoveryTrail({
          market: marketRow,
          // 'Providers' is a FAMILY LABEL, not a link: there is no /{market}/providers index
          // page, and the crumb that used to point there was a live link to a 404.
          family: 'Providers',
          leaf: view.displayName,
        })}
        eyebrow={
          <>
            <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
            Provider · {marketRow.code}
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-white/15 bg-white/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {place}
            </span>
            {preview ? <span className={BADGE_SLATE}>Sample row</span> : null}
          </>
        }
        actions={
          <Link href="/requests/new" className={CTA_AMBER}>
            Request a quote
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      <div className={PUBLIC_SHELL}>
        {preview ? (
          <div className="mb-8">
            <NoticePanel tone="amber" title="Sample profile">
              This is the dev-only <code>?preview=1</code> fixture, not a published provider.
              No provider profile exists in this database yet, so the page you are looking at is
              rendering invented copy through the real component. It is inert in a production
              build and is marked noindex, nofollow.
            </NoticePanel>
          </div>
        ) : null}
        <ProviderProfileSections view={view} market={marketRow} place={place} />
      </div>
    </div>
  );
}


