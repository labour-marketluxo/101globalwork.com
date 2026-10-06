import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Info, Scale } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, PAGE_SHELL } from '@/components/discovery/tokens';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { anyPolicyPublished, POLICIES } from '@/features/legal/policies';

/**
 * Legal index — /legal
 *
 * The way in to the policy register. It exists because a sidebar of four policies with no
 * index page would leave a reader who arrived at /legal with nothing, and because the
 * register's own state — none of these documents is in force yet — is information a visitor
 * is entitled to see in one place rather than one 404 at a time.
 *
 * NOT A MARKET-SCOPED ROUTE. Terms, privacy and payment-holding policy apply to the platform,
 * not to a market: putting them under /{market}/ would imply four copies of the same document
 * and multiply the duplicate-content problem by the number of markets.
 *
 * INDEXABILITY tracks the register: while nothing is published the page is `noindex, follow`,
 * and it flips to `index, follow` automatically once ANY policy is in force. A legal index
 * that is indexed while every policy on it says "not in force" would be a search result with
 * nothing in it.
 */

export const metadata: Metadata = {
  title: 'Legal and policies',
  description:
    'Terms of service, privacy, payment holding and disclaimers for 101GlobalWork, with the version and effective date of each.',
  alternates: { canonical: '/legal' },
  robots: { index: anyPolicyPublished, follow: true },
};

export default function LegalIndexPage() {
  const inForce = POLICIES.filter((policy) => policy.published);

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Legal' }]}
        eyebrow={
          <>
            <Scale aria-hidden="true" className="h-3.5 w-3.5" />
            Legal
          </>
        }
        title="Legal and policies"
        lede="The documents that govern using 101GlobalWork. Each one states its version and the date it takes effect — a policy without an effective date cannot be checked against what applied at the time of a request."
      />

      <div className={PAGE_SHELL}>
        <div className="grid max-w-4xl gap-8">
          {!anyPolicyPublished ? (
            <NoticePanel tone="amber" icon={<Info className="h-5 w-5" />} title="None of these is in force yet.">
              The platform has not published its terms, privacy policy, payment-holding terms or
              disclaimers. Each page below sets out what the document will cover so the shape is
              reviewable, and says plainly that it is not yet an agreement. Nothing on this site
              presents unreviewed text as a policy a reader could rely on.
            </NoticePanel>
          ) : null}

          <ul className="grid gap-4 sm:grid-cols-2">
            {POLICIES.map((policy) => (
              <li key={policy.slug}>
                <Link
                  href={`/legal/${policy.slug}`}
                  className={`${CARD} flex h-full flex-col p-5 no-underline transition-shadow hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-base font-bold tracking-tight text-slate-900">
                      {policy.title}
                    </span>
                    <span className={policy.published ? BADGE_AMBER : BADGE_SLATE}>
                      {policy.published ? `In force · ${policy.version}` : 'Not published'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{policy.summary}</p>
                  <span className="mt-4 font-mono text-[11px] tracking-wider text-slate-500 uppercase">
                    {policy.published && policy.lastUpdated
                      ? `Last updated ${policy.lastUpdated}`
                      : `${policy.sections.length} sections planned`}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
                    Read
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-sm text-slate-500">
            {inForce.length} of {POLICIES.length} documents are in force. Questions about money are
            answered on{' '}
            <Link
              href="/pricing"
              className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
            >
              pricing and fees
            </Link>
            , and questions about verification and disputes on{' '}
            <Link
              href="/trust-and-safety"
              className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
            >
              trust and safety
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
