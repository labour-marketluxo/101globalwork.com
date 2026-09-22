import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { AcceptancePanel, AgreementAlternatives, AgreementTerms } from '@/components/customer/AgreementSections';
import { CARD, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { buildAgreementDocument, agreementHash, getProjectAgreement } from '@/features/customer/agreement';
import { formatMoney } from '@/features/customer/quotes';

export const metadata = {
  title: 'Project agreement',
  robots: { index: false, follow: false },
};

/**
 * Agreement review and acceptance.
 *
 * ⚠️ `projectId` IS AN ASSIGNMENT ID. There is no projects table in this schema; the unit of agreed work is
 * the assignment, created when a quote is accepted, with its payment obligation beside it. The route keeps the
 * brief's URL shape so a real projects table could be pointed at it later, and this comment is the only place
 * that mapping is explained to the next reader.
 *
 * ⚠️ THE HASH COVERS THE TEXT ON THIS PAGE. `buildAgreementDocument` produces the sections rendered below and
 * the canonical string hashed here, so the fingerprint recorded at acceptance is bound to the terms as shown.
 * If any of those values change, the fingerprint changes with them and the panel says so.
 *
 * ⚠️ ACCEPTANCE IS A CLICKWRAP, NOT A SIGNATURE, AND THE TERMS SAY SO. There is no e-signature provider, no
 * key material and no signed artefact. What the platform does have is GoTrue's email OTP and `amr` claims, so
 * "step-up" here means a one-time code verified moments before the acceptance — enforced in SQL by
 * `accept_project_agreement_command`, not by this page.
 */
export default async function ProjectAgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ failed?: string; verify?: string; signed?: string; asked?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const agreement = await getProjectAgreement(projectId);
  if (!agreement) notFound();

  const { sections, canonical } = buildAgreementDocument(agreement);
  const currentHash = agreementHash(canonical);

  return (
    <section className={PAGE_SHELL}>
      <nav aria-label="Agreement" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/customer/requests/${agreement.requestId}`} className={LINK_ARROW}>
          ← Back to the request
        </Link>
        <span className="text-slate-300" aria-hidden="true">
          /
        </span>
        <Link href={`/customer/requests/${agreement.requestId}/quotes`} className={LINK_ARROW}>
          Quotes
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Project agreement</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          The terms for the work you chose: {formatMoney(agreement.totalMinor, agreement.currencyCode)} with{' '}
          {agreement.providerName}, from quote version {agreement.quoteVersionLabel}
          {agreement.quoteLockedAt ? ', locked when you accepted it' : ''}. Read it, then verify by email to
          record your acceptance.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <AgreementTerms sections={sections} />

        <div className="space-y-4">
          <AcceptancePanel
            agreement={agreement}
            currentHash={currentHash}
            failed={query.failed}
            verify={query.verify === '1'}
            signed={query.signed === '1'}
            asked={query.asked === '1'}
          />

          <AgreementAlternatives agreement={agreement} />

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              After you accept
            </h2>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>1. The acceptance is recorded against this assignment, with the quote version and a fingerprint of these terms.</li>
              <li>2. Funding the obligation is a separate step, on the request page — accepting does not pay.</li>
              <li>3. The provider works; scheduling happens with them directly.</li>
              <li>4. When they submit evidence, you approve it before any money is released.</li>
            </ol>
            <Link href={`/requests/${agreement.requestId}`} className={`${LINK_ARROW} mt-3`}>
              Open the funding and evidence page <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </section>
        </div>
      </div>
    </section>
  );
}
