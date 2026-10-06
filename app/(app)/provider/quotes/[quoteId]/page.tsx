import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from '@/components/ui/icons';
import { LINK_ARROW } from '@/components/discovery/tokens';
import {
  QuoteActionsPanel,
  QuoteAgreementPanel,
  QuoteBreakdownPanel,
  QuoteCustomerPanel,
  QuoteStatusPanel,
  QuoteVersionDiffPanel,
  QuoteVersionHistory,
} from '@/components/provider/ProviderQuoteSections';
import { WorkspaceNotice, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { diffQuoteVersions, getProviderQuoteDetail, quoteDisplayStatus } from '@/features/provider-workspace/quotes';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * /provider/quotes/[quoteId] — one version, with everything that happened to it.
 *
 * ⚠️ THE STATUS IS DERIVED AND THE PAGE SAYS WHICH PARTS ARE DERIVED. There is no per-view tracking, so "viewed"
 * cannot be shown; expiry is computed from the validity date rather than from the status column, because nothing
 * walks the table to change it. Each of those is stated on the page instead of being smoothed into a status
 * word the platform cannot back.
 *
 * ⚠️ THE DIFF IS AGAINST THE PREVIOUS VERSION, NOT AGAINST AN EDIT. A revision is a new row; the earlier row is
 * untouched and remains what the customer first read. This page is the evidence for that claim rather than
 * just the wording of it.
 */
export const metadata: Metadata = {
  title: 'Quote',
  description: 'One version of your quote, and what the customer has said about it.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ submitted?: string; withdrawn?: string; messaged?: string; failed?: string }>;

export default async function ProviderQuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams: SearchParams;
}) {
  const [{ quoteId }, query] = await Promise.all([params, searchParams]);
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) notFound();

  const { detail, unavailable } = await getProviderQuoteDetail(provider.id, quoteId);
  if (unavailable) {
    return (
      <div className="grid gap-6">
        <WorkspaceUnavailable what="This quote" />
      </div>
    );
  }
  if (!detail) notFound();

  const { quote, previous, changes, messages, agreement, assignmentId, request } = detail;
  const hasOpenQuestion = changes.some(change => change.status === 'open');
  const status = quoteDisplayStatus(quote, { hasOpenQuestion, now: new Date() });
  const diff = previous ? diffQuoteVersions(previous, quote) : null;
  const nextPath = `${PROVIDER_PATHS.quotes}/${quote.id}`;

  return (
    <div className="grid gap-6">
      <nav aria-label="Quote" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={PROVIDER_PATHS.opportunities} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Opportunities
        </Link>
        <span className="text-slate-300" aria-hidden="true">
          /
        </span>
        <Link href={`${PROVIDER_PATHS.opportunities}/${request.id}`} className={LINK_ARROW}>
          The request
        </Link>
      </nav>

      {query.submitted === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Quote submitted.">
          <p>
            The customer can now read it and accept, decline or ask a question. Do not start work on the strength
            of a quote alone — the accepted version and, for paid work, a funded payment come first.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.withdrawn === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Quote withdrawn.">
          <p>
            The customer can no longer accept this version. It stays in the history so they can see what was
            offered — send them a message if the change is not obvious.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.messaged === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Message sent.">
          <p>It appears on the customer&apos;s request page.</p>
        </WorkspaceNotice>
      ) : null}
      {query.failed ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>
            {query.failed === 'locked'
              ? 'An accepted quote cannot be withdrawn or changed — it is the document the job and its payment point at.'
              : 'Nothing was changed. Try again, and if it keeps failing the quote may have moved on since this page was loaded.'}
          </p>
        </WorkspaceNotice>
      ) : null}

      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
          Quote {quote.version} · {request.needText}
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {status.label}
        </h1>
      </header>

      <QuoteStatusPanel quote={quote} status={status} />
      <QuoteBreakdownPanel quote={quote} />
      {diff ? <QuoteVersionDiffPanel diff={diff} /> : null}
      <QuoteVersionHistory versions={detail.versions} currentId={quote.id} />
      <QuoteActionsPanel quote={quote} nextPath={nextPath} />
      <QuoteCustomerPanel
        changes={changes}
        messages={messages}
        providerId={provider.id}
        requestId={request.id}
        quoteId={quote.id}
        nextPath={nextPath}
      />
      <QuoteAgreementPanel agreement={agreement} assignmentId={assignmentId} />
    </div>
  );
}
