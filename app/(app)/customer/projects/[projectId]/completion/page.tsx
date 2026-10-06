import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from '@/components/ui/icons';
import { CARD, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import {
  CompletionDecisionPanel,
  CompletionHistory,
  CompletionNotice,
  DeliverableEvidence,
} from '@/components/customer/CompletionSections';
import { QuoteTermsList } from '@/components/customer/QuoteSections';
import { completionCriteria, getProjectCompletion } from '@/features/customer/completion';
import { formatMoney } from '@/features/customer/payments';

export const metadata = {
  title: 'Completion review',
  robots: { index: false, follow: false },
};

/**
 * Project completion review — `/customer/projects/[projectId]/completion`.
 *
 * ⚠️ `projectId` IS AN ASSIGNMENT ID, the same mapping the agreement route uses: this schema has no projects
 * table, and the unit of agreed work is the assignment created when a quote was accepted.
 *
 * ⚠️ THE PAGE IS THE GATE, AND IT IS OPEN ONLY WHEN THE WORK IS ACTUALLY WAITING. There is one state in which a
 * customer can release money — `submitted_for_approval`, with evidence filed and a funded obligation — and the
 * panel renders the three answers only in that state. Everywhere else it says which state the job is in instead
 * of showing buttons the database would refuse. Approval is a POST: a page view, a reload or a returning
 * browser changes nothing, and nothing in this system approves on the customer's behalf.
 */
export default async function ProjectCompletionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    failed?: string;
    approved?: string;
    corrected?: string;
    disputed?: string;
  }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const completion = await getProjectCompletion(projectId);
  if (!completion) notFound();

  const { agreement } = completion;
  const criteria = completionCriteria(agreement.quote);

  return (
    <section className={PAGE_SHELL}>
      <CompletionNotice
        failed={query.failed}
        approved={query.approved}
        corrected={query.corrected}
        disputed={query.disputed}
      />

      <nav aria-label="Completion" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/customer/requests/${agreement.requestId}`} className={LINK_ARROW}>
          ← Back to the job
        </Link>
        <span className="text-slate-300" aria-hidden="true">
          /
        </span>
        <Link href={`/customer/projects/${agreement.assignmentId}/agreement`} className={LINK_ARROW}>
          The agreement
        </Link>
        {/* The shared workspace, from the customer's side: the same assignment as the plan and the conversation
            both parties can see. */}
        <span className="text-slate-300" aria-hidden="true">
          /
        </span>
        <Link href={`/projects/${agreement.assignmentId}`} className={LINK_ARROW}>
          Shared project view
        </Link>
        {agreement.obligation ? (
          <>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <Link href={`/customer/payments/${agreement.obligation.id}`} className={LINK_ARROW}>
              The payment
            </Link>
          </>
        ) : null}
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Completion review</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Check what {agreement.providerName} submitted against what you agreed, then decide: approve and release
          the money you are holding, send the work back to be put right, or raise it as a dispute. Nothing happens
          until you choose one of those — this page never decides for you.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <DeliverableEvidence
            evidence={completion.evidence}
            unavailable={completion.evidenceUnavailable}
          />
          <CompletionHistory completion={completion} />
        </div>

        <aside className="space-y-4">
          <CompletionDecisionPanel completion={completion} criteria={criteria} />

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What was agreed
            </h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>
                · Quote version {agreement.quoteVersionLabel}
                {agreement.quoteLockedAt ? ', locked when you accepted it' : ''}: the list beside the approve
                button is built from exactly this version.
              </li>
              <li>
                · {formatMoney(agreement.totalMinor, agreement.currencyCode)} agreed with{' '}
                {agreement.providerName}
                {agreement.quoteAcceptedAt
                  ? `, accepted ${new Date(agreement.quoteAcceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : ''}
                .
              </li>
              <li>
                · The provider cannot change that version now. A change of price or scope after acceptance is a
                new version, not an edit to the one you hold.
              </li>
              <li>
                · Nothing on this platform approves work automatically, and a promise made in conversation is not
                part of what was agreed unless it is in the locked version.
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Some of the checklist labels beside the approve button are shortened. Every agreed term is here, from
              the same locked version the checklist is built from.
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                The agreed terms in full
              </summary>
              <div className="mt-3">
                <QuoteTermsList quote={agreement.quote} dense />
              </div>
            </details>
            <Link href={`/customer/requests/${agreement.requestId}/quotes`} className={`${LINK_ARROW} mt-3`}>
              The quote you accepted <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}
