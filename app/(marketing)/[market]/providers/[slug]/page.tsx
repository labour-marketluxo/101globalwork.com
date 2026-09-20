import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, BadgeCheck, Building2, Clock, Info, MapPin, ShieldCheck } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, CTA_AMBER, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { getMarket, getMarketLocations } from '@/features/discovery/data/market-catalog';
import { getPublicProviderProfile } from '@/lib/providers/public-profile';

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
 * itself canonical for the market-scoped path; the global route is untouched.
 *
 * UNKNOWN MARKET → redirect('/'). A provider whose primary location is not in this market →
 * 404, because the market is part of what the URL asserts.
 */

type Params = Promise<{ market: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, slug } = await params;
  const marketRow = await getMarket(market);
  if (!marketRow) return {};

  const profile = await loadProfile(marketRow.marketId, slug);
  if (!profile) return {};

  return {
    title: profile.headline ?? profile.service_name ?? 'Service provider',
    description: profile.public_description ?? undefined,
    alternates: { canonical: `/${marketRow.slug}/providers/${slug}` },
    // The same gate the global profile route uses: the platform's own readiness score, not
    // a popularity signal. Below the threshold the page is useful to a human who has the
    // link and is not offered to a crawler.
    robots: { index: profile.readiness_score >= 60, follow: true },
  };
}

/**
 * The provider, only if they serve this market.
 *
 * `getPublicProviderProfile` throws on a read error, which is right for a page whose entire
 * content is the profile — but this route also has a market guard, and a 404 for an
 * unreadable row is worse than saying so. Hence the try/catch, narrowed to "no profile".
 */
async function loadProfile(marketId: string, slug: string) {
  let profile;
  try {
    profile = await getPublicProviderProfile(slug);
  } catch {
    return null;
  }
  if (!profile) return null;

  const locations = await getMarketLocations(marketId);
  const inMarket = locations.some((location) => location.locationId === profile.location_id);
  return inMarket ? profile : null;
}

export default async function MarketProviderProfilePage({ params }: { params: Params }) {
  const { market, slug } = await params;

  const marketRow = await getMarket(market);
  if (!marketRow) redirect('/');

  const profile = await loadProfile(marketRow.marketId, slug);
  if (!profile) notFound();

  const verified = Boolean(profile.verification_summary?.verified);
  const displayName = profile.headline ?? profile.service_name ?? 'Service provider';
  const place = profile.location_name ? `${profile.location_name}` : marketRow.displayName;

  const facts = [
    { label: 'Service', value: profile.service_name ?? '—' },
    { label: 'Based in', value: place },
    {
      label: 'Experience',
      value:
        profile.years_experience === null
          ? 'Not stated'
          : `${profile.years_experience} year${profile.years_experience === 1 ? '' : 's'}`,
    },
    { label: 'Taking new work', value: profile.accepts_new_work ? 'Yes' : 'No' },
    {
      label: 'Platform readiness',
      value: `${profile.readiness_score.toFixed(0)}/100`,
    },
  ];

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: marketRow.displayName, href: `/${marketRow.slug}` },
          { label: 'Providers', href: `/${marketRow.slug}/providers` },
          { label: displayName },
        ]}
        eyebrow={
          <>
            <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
            Provider · {marketRow.code}
          </>
        }
        title={displayName}
        lede={
          profile.public_description ??
          `${profile.service_name ?? 'Service provider'} covering ${place}. The provider has not published a description yet.`
        }
        chips={
          <>
            {verified ? (
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
          </>
        }
        actions={
          <Link href="/requests/new" className={CTA_AMBER}>
            Request a quote
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />

      <div className={PAGE_SHELL}>
        <div className="grid gap-12">
          <section aria-labelledby="provider-facts">
            <h2 id="provider-facts" className="text-2xl font-bold tracking-tight text-slate-900">
              At a glance
            </h2>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {facts.map((fact) => (
                <div key={fact.label} className={`${CARD} p-4`}>
                  <dt className="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-base font-bold text-slate-900">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-500">
              Platform readiness is the platform&rsquo;s own discoverability score for a provider
              — it is not a customer rating, and it is not a promise about ranking. No customer
              ratings exist anywhere on this platform yet.
            </p>
          </section>

          <section aria-labelledby="provider-services">
            <h2 id="provider-services" className="text-2xl font-bold tracking-tight text-slate-900">
              Services and area
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className={`${CARD} p-5`}>
                <h3 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Canonical service
                </h3>
                {profile.service_name ? (
                  <p className="mt-2">
                    <Link
                      href={`/${marketRow.slug}/search?q=${encodeURIComponent(profile.service_name)}`}
                      className="rounded-full border border-solid border-primary-subtle bg-primary-surface px-2.5 py-1 text-xs font-medium text-primary no-underline transition-colors hover:border-primary hover:bg-white"
                    >
                      {profile.service_name}
                    </Link>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No service is recorded yet.</p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  The catalog service this provider is eligible for. Eligibility is checked per
                  service and per area, so it is the same scope their quotes are matched against.
                </p>
              </div>
              <div className={`${CARD} p-5`}>
                <h3 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Based in
                </h3>
                <p className="mt-2 text-sm font-bold text-slate-900">{place}</p>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  The locality on record, which is as precise as this platform publishes. Exact
                  addresses are not collected for publication and never appear on a public page.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <Link
                    href={`/${marketRow.slug}/search?area=${encodeURIComponent(
                      (profile.location_name ?? '').toLowerCase().replace(/\s+/g, '-'),
                    )}`}
                    className={LINK_ARROW}
                  >
                    Local providers
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="provider-verification">
            <h2 id="provider-verification" className="text-2xl font-bold tracking-tight text-slate-900">
              Verification
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className={`${CARD} p-5`}>
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
                >
                  <BadgeCheck className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Identity</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {verified
                    ? 'Checked before this provider could quote. The check confirms identity; it is not a character reference.'
                    : 'Not yet shown as verified. A provider can hold a public profile while a check is outstanding, and cannot quote until it passes.'}
                </p>
              </div>
              <div className={`${CARD} p-5`}>
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Licences and insurance</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Licences are checked where the trade requires one, and insurance is requested
                  where it applies. Which checks ran for this provider is not published per
                  provider yet.
                </p>
              </div>
              <div className={`${CARD} p-5`}>
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-amber-200 bg-secondary-light text-amber-700"
                >
                  <Clock className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Operational hours</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Not published, because the platform does not collect them. Availability is
                  expressed as whether the provider is taking new work, and turnaround is agreed
                  in the request.
                </p>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-xs text-slate-500">
              What verification does not guarantee, and how a dispute is handled, are set out on{' '}
              <Link
                href="/trust-and-safety"
                className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
              >
                trust and safety
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="provider-reviews">
            <h2 id="provider-reviews" className="text-2xl font-bold tracking-tight text-slate-900">
              Reviews and work samples
            </h2>
            <div className="mt-5">
              <NoticePanel tone="slate" icon={<Info className="h-5 w-5" />} title="Not collected yet.">
                This platform has no reviews table and no portfolio records, so there is nothing
                truthful to show here — and a fabricated testimonial is exactly the kind of proof
                this codebase refuses to publish. When reviews exist they will carry the request
                they came from, so a rating can be traced to completed work rather than asserted.
              </NoticePanel>
            </div>
          </section>

          <section
            className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}
          >
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Request a quote from {displayName}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                Describe the work once. Every quote on a request is itemized against the same scope,
                so this provider&rsquo;s price can be compared with the others — and payment is
                released only after you approve the finished work.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/requests/new" className={CTA_AMBER}>
                Request a quote
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href={`/${marketRow.slug}/services`} className={LINK_ARROW}>
                All services in {marketRow.displayName}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
