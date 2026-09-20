import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Scale } from 'lucide-react';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import { TaxonomyHero } from '@/components/discovery/TaxonomySections';
import { NotInForceNotice, Prose, ReaderLayout } from '@/components/marketing/ReaderLayout';
import { POLICIES, getPolicy } from '@/features/legal/policies';

/**
 * Policy — /legal/{policy-slug}
 *
 * One legal document, with the sidebar a reader needs to move between them and a version /
 * effective-date block above the text.
 *
 * ⚠️ NOTHING HERE IS IN FORCE YET, and the page says so twice: once as a notice at the top of
 * the body, and once per section, whose text describes what the published policy will cover
 * rather than what it says. That is not a placeholder pattern — it is the honest state of a
 * product whose terms have not been drafted and reviewed, and it is the same choice /pricing
 * makes about a fee schedule that has not been agreed. Writing plausible-sounding terms inside
 * a code change would create text that LOOKS binding to a reader, which is worse than a page
 * that admits the gap.
 *
 * WHERE A READER CAN GET AN ANSWER TODAY. Statements of platform behaviour that ARE published
 * appear in the sections (the platform's role, where money is held, what verification checks);
 * they are marked as not-yet-policy and link out to the pages that do govern them in practice:
 * /pricing for fees, /trust-and-safety for verification and disputes, /how-it-works for the
 * request process.
 *
 * The route is platform-level, not market-scoped: terms and privacy apply to the platform, and
 * putting them under /{market}/ would imply one copy per market.
 */

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return POLICIES.map((policy) => ({ slug: policy.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) return {};

  return {
    title: policy.title,
    description: policy.summary,
    alternates: { canonical: `/legal/${policy.slug}` },
    // `index` only once the document is genuinely in force. A page whose whole content is
    // "this is not published" is not a useful search result, and indexing it would imply the
    // platform has terms it does not have.
    robots: { index: policy.published, follow: true },
  };
}

export default async function PolicyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className="w-full">
      <TaxonomyHero
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Legal', href: '/legal' },
          { label: policy.title },
        ]}
        eyebrow={
          <>
            <Scale aria-hidden="true" className="h-3.5 w-3.5" />
            {policy.published ? `In force · ${policy.version}` : 'Not in force'}
          </>
        }
        title={policy.title}
        lede={policy.summary}
      />

      <ReaderLayout
        sidebarTitle="Policies"
        activeHref={`/legal/${policy.slug}`}
        meta={
          <dl className="grid gap-1.5 font-mono text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Version</dt>
              <dd className="text-right font-bold text-slate-900">{policy.version ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Effective</dt>
              <dd className="text-right font-bold text-slate-900">{policy.lastUpdated ?? '—'}</dd>
            </div>
          </dl>
        }
        sidebarItems={POLICIES.map((item) => ({
          label: item.title,
          href: `/legal/${item.slug}`,
          detail: item.published ? `In force · ${item.version}` : 'Not published',
        }))}
        footer={
          <section className="rounded-xl border border-solid border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Where answers live today
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              These pages are published, maintained and in force, and they cover most of what
              people come to a legal page for.
            </p>
            <ul className="mt-4 grid gap-2.5">
              {[
                { href: '/pricing', label: 'Pricing and fees', detail: 'The fee schedule, or its absence' },
                { href: '/trust-and-safety', label: 'Trust and safety', detail: 'Verification types and what they do not guarantee' },
                { href: '/how-it-works', label: 'How it works', detail: 'The request, quote, payment and dispute path' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-primary no-underline transition-colors hover:text-primary-dark"
                  >
                    {item.label}
                    <span className="text-xs font-normal text-slate-500">{item.detail}</span>
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        }
      >
        {!policy.published ? <NotInForceNotice /> : null}

        <div className="scroll-mt-24">
          <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            What this document will cover
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {policy.sections.length} sections are planned. Each is listed with the question it
            answers, so the shape of the document can be reviewed before its wording exists.
          </p>
        </div>

        <Prose sections={policy.sections} />
      </ReaderLayout>

      <div className={PAGE_SHELL}>
        <p className="max-w-3xl text-sm text-slate-500">
          {policy.published
            ? 'This policy is in force and carries the version shown above. A request is governed by the version that was effective when it was posted.'
            : 'This policy is not in force. Nothing here is a term you are agreeing to, and no effective date has been set.'}
        </p>
      </div>
    </div>
  );
}
