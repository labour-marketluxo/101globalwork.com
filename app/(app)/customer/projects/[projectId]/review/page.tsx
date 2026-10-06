import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from '@/components/ui/icons';
import { CARD, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import {
  ReviewAudienceNote,
  ReviewForm,
  ReviewNotAvailable,
  ReviewNotice,
  ReviewSummary,
} from '@/components/customer/ReviewSections';
import { getProjectCompletion } from '@/features/customer/completion';
import { getReviewForAssignment } from '@/features/customer/reviews';
import { formatMoney } from '@/features/customer/payments';

export const metadata = {
  title: 'Review the provider',
  robots: { index: false, follow: false },
};

/**
 * Reviewing the provider — `/customer/projects/[projectId]/review`.
 *
 * ⚠️ THE ANTI-MANIPULATION RULE IS THE ELIGIBILITY TEST, AND IT IS A ROW. `getProjectCompletion` is used for
 * the ownership check and for the approval record, and the form is only rendered when that record exists. The
 * database enforces the same thing twice over — the command looks for the approval, and the review table
 * carries it as a NOT NULL foreign key — so there is no path to a rating for work that was never completed.
 *
 * ⚠️ ONE REVIEW PER JOB, AND IT CANNOT BE EDITED. That is stated on the page rather than discovered later: a
 * review that could be revised until the rating improved would be worth less than one that could not.
 */
export default async function ProjectReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ failed?: string; reviewed?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const completion = await getProjectCompletion(projectId);
  if (!completion) notFound();

  const { agreement, approval } = completion;
  const { review, unavailable } = await getReviewForAssignment(agreement.assignmentId);

  return (
    <section className={PAGE_SHELL}>
      <ReviewNotice failed={query.failed} reviewed={query.reviewed} />

      <nav aria-label="Review" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/customer/projects/${agreement.assignmentId}/completion`} className={LINK_ARROW}>
          ← The completion review
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Review {agreement.providerName}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          What they did, and how it went. This is attached to the job you approved as complete, which is why it
          carries weight: it cannot be written about work that never happened.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {review ? (
            <ReviewSummary review={review} />
          ) : unavailable ? (
            <ReviewNotAvailable
              assignmentId={agreement.assignmentId}
              requestId={agreement.requestId}
              reason="unavailable"
            />
          ) : approval ? (
            <ReviewForm assignmentId={agreement.assignmentId} providerName={agreement.providerName} />
          ) : (
            <ReviewNotAvailable
              assignmentId={agreement.assignmentId}
              requestId={agreement.requestId}
              reason="not_completed"
            />
          )}
        </div>

        <aside className="space-y-4">
          <section className={`${CARD} p-5`}>
            <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              The job you are reviewing
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Provider</dt>
                <dd className="font-semibold text-slate-800">{agreement.providerName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Agreed price</dt>
                <dd className="font-semibold text-slate-800">
                  {formatMoney(agreement.totalMinor, agreement.currencyCode)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Quote version</dt>
                <dd className="font-sans text-slate-800">{agreement.quoteVersionLabel}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Approved complete</dt>
                <dd className="text-slate-800">
                  {approval
                    ? new Date(approval.approvedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Not yet'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{agreement.requestNeedText}</p>
            <div className="mt-3 flex flex-wrap gap-3 border-t border-solid border-slate-200 pt-3">
              <Link href={`/customer/requests/${agreement.requestId}`} className={LINK_ARROW}>
                Open the job <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
              {agreement.providerSlug ? (
                <Link href={`/providers/${agreement.providerSlug}`} className={LINK_ARROW}>
                  Their public profile
                </Link>
              ) : null}
            </div>
          </section>

          <ReviewAudienceNote />
        </aside>
      </div>
    </section>
  );
}
