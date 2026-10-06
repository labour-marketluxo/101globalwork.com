import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, Clock, Info, MapPin, ShieldCheck } from '@/components/ui/icons';
import { CARD, CTA_AMBER, LINK_ARROW } from '@/components/discovery/tokens';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { CardImage } from '@/components/discovery/CardImage';
import type { Market } from '@/features/discovery/data/market-catalog';
import type { ProviderProfileView } from '@/features/discovery/data/provider-profile';

/**
 * The body of a provider profile, shared by both routes that serve one:
 *
 *   /{market}/providers/{provider-slug}                                  the canonical URL
 *   /{market}/{region}/{locality}/{service}/{provider-slug}              the contextual variant
 *
 * WHY IT IS A COMPONENT AND NOT TWO PAGES. The two routes differ in exactly three things
 * — breadcrumbs, the canonical tag, and a note explaining how the visitor got here. The
 * other five sections are the profile. Written twice, the second copy is where "Operational
 * hours: not collected" quietly becomes a plausible-looking opening-times block, because
 * nobody re-reads the copy they pasted.
 *
 * WHAT THIS COMPONENT CANNOT DO, BY CONSTRUCTION
 *
 * It accepts `ProviderProfileView`, which has no `provider_id`, no `service_entity_id` and
 * no `location_id` field. A component that cannot see an id cannot render one into a key, a
 * data attribute or an aria-label — the boundary is the type, not a code review. What the
 * routes keep for their own decisions stays in the route (see provider-profile.ts).
 *
 * NOTHING HERE INVENTS A NUMBER. Every figure rendered is a column: years_experience,
 * readiness_score, trust_score, accepts_new_work, verification_summary.verified. There is
 * no rating, no review count, no completion count and no response time, because the schema
 * has none of them — and the two sections below say so in words rather than leaving gaps a
 * reader would fill with assumptions.
 */

export function ProviderProfileSections({
  view,
  market,
  /** The place name to print, resolved by the route: the URL's locality, or the record's. */
  place,
  /** Optional note between the facts and the rest — the nested route uses it for provenance. */
  contextNote,
}: {
  view: ProviderProfileView;
  market: Market;
  place: string;
  contextNote?: ReactNode;
}) {
  const facts = [
    { label: 'Service', value: view.serviceName ?? '—' },
    { label: 'Based in', value: place },
    {
      label: 'Experience',
      value:
        view.yearsExperience === null
          ? 'Not stated'
          : `${view.yearsExperience} year${view.yearsExperience === 1 ? '' : 's'}`,
    },
    { label: 'Taking new work', value: view.acceptsNewWork ? 'Yes' : 'No' },
    { label: 'Platform readiness', value: `${view.readinessScore.toFixed(0)}/100` },
  ];

  return (
    <div className="grid gap-12">
      <section aria-labelledby="provider-facts">
        <h2 id="provider-facts" className="text-2xl font-bold tracking-tight text-slate-900">
          At a glance
        </h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {facts.map((fact) => (
            <div key={fact.label} className={`${CARD} p-4`}>
              <dt className="font-sans text-[11px] tracking-wider text-slate-500 uppercase">
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
        {contextNote ? <div className="mt-5 max-w-3xl">{contextNote}</div> : null}
      </section>

      <section aria-labelledby="provider-services">
        <h2 id="provider-services" className="text-2xl font-bold tracking-tight text-slate-900">
          Services and area
        </h2>
        {/* Three columns, so neither card takes half the width of the section. Each carries the
            same card art block as the rest of the discovery cards; `provider:service` and
            `provider:area` are the keys to map in components/discovery/CardImage.tsx. */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`${CARD} flex flex-col overflow-hidden`}>
            <CardImage artKey="provider:service" />
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Canonical service
              </h3>
              {view.serviceName ? (
                <p className="mt-2">
                  <Link
                    href={`/${market.slug}/search?q=${encodeURIComponent(view.serviceName)}`}
                    className="rounded-full border border-solid border-primary-subtle bg-primary-surface px-2.5 py-1 text-xs font-medium text-primary no-underline transition-colors hover:border-primary hover:bg-white"
                  >
                    {view.serviceName}
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
          </div>
          <div className={`${CARD} flex flex-col overflow-hidden`}>
            <CardImage artKey="provider:area" />
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Based in
              </h3>
              <p className="mt-2 text-sm font-bold text-slate-900">{place}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                The locality on record, which is as precise as this platform publishes. Exact
                addresses are not collected for publication and never appear on a public page.
              </p>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-4">
                <Link
                  href={`/${market.slug}/search?area=${encodeURIComponent(
                    (view.locationName ?? '').toLowerCase().replace(/\s+/g, '-'),
                  )}`}
                  className={LINK_ARROW}
                >
                  Local providers
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </div>
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
              {view.verified
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
            Request a quote from {view.displayName}
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
          <Link href={`/${market.slug}/services`} className={LINK_ARROW}>
            All services in {market.displayName}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * Why this profile is at a location-scoped URL, on the page.
 *
 * The nested route serves the same profile as the canonical one, reached through a trade
 * and a place. That is a legitimate URL — the visitor asked for a plumber in Gwarinpa and
 * got one — but it is also a URL whose meaning depends on the visitor's own record, so the
 * page states the connection instead of leaving them to infer it. It also carries the link
 * to the canonical URL, so the two are one click apart rather than competing silently.
 */
export function ProviderContextNote({
  place,
  serviceName,
  canonicalHref,
}: {
  place: string;
  serviceName: string | null;
  canonicalHref: string;
}) {
  return (
    <NoticePanel tone="slate" icon={<MapPin className="h-5 w-5" />} title={`Reached through ${place}`}>
      {serviceName
        ? `This profile is registered under ${serviceName} for ${place}. `
        : `This profile is registered for ${place}. `}
      The same profile is also published on its own at{' '}
      <Link href={canonicalHref} className="font-semibold text-primary underline underline-offset-2">
        {canonicalHref}
      </Link>
      , which is the URL the platform treats as canonical. Nothing differs between the two
      pages except the breadcrumb above.
    </NoticePanel>
  );
}
