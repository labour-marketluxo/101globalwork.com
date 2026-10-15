import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  EarningsActions,
  EarningsCards,
  EarningsHeader,
  EarningsTable,
  FeeDisclosure,
  PayoutRequestPanels,
} from '@/components/provider/EarningsSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getEarnings } from '@/features/provider-workspace/earnings';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/earnings — what the platform owes, what it has sent, and what it has deducted.
 *
 * ⚠️ THE PAGE IS BUILT ON THE LEDGER, AND SAYS SO. `get_my_earnings_command` reads the provider's own payable
 * account and cross-checks it against the jobs and payouts behind it; each currency card reports the difference.
 * That is what makes "reconciled ledger records are financial truth" checkable here rather than a claim in a
 * specification.
 *
 * ⚠️ "REQUEST PAYOUT" QUEUES AND STOPS. A provider can put their own eligible payout in the platform's queue —
 * with every block check the admin path applies — and the transfer itself still needs the platform's service-role
 * execution path. Nothing in this app moves money from a browser session.
 */
export const metadata: Metadata = {
  title: 'Earnings',
  description: 'What you have earned, what is owed, and what has been paid.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; payout?: string; count?: string }>;

export default async function ProviderEarningsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.payout === 'requested' ? (
        <WorkspaceNotice tone="teal" role="status" title={`${params.count ?? '1'} payout${params.count === '1' ? '' : 's'} requested.`}>
          <p>
            {' '}
            It is in the platform&apos;s queue now. The transfer is submitted from the platform&apos;s side, and this
            page will show it as on its way until the payment provider confirms it.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.payout === 'partially_requested' ? (
        <WorkspaceNotice tone="amber" role="status" title={`${params.count ?? 'Some'} requested, the rest were refused.`}>
          <p>
            Some payouts could not be queued — usually because they are no longer eligible or the destination is not
            verified. The list below shows the state of each one; nothing was sent twice.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <EarningsBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function EarningsBody({ providerId }: { providerId: string }) {
  const earnings = await getEarnings(providerId);
  if (earnings.unavailable) return <WorkspaceUnavailable what="Your earnings" />;

  return (
    <>
      <EarningsHeader earnings={earnings} />
      <EarningsActions />

      {earnings.currencies.length === 0 ? (
        <WorkspaceNotice tone="slate" role="status" title="No money has moved on this account yet.">
          <p>
            When a customer accepts your quote and funds it, the payment is reconciled into the ledger and the
            figures appear here — held first, then ready to request once the job is signed off.
          </p>
        </WorkspaceNotice>
      ) : (
        earnings.currencies.map(books => <EarningsCards key={books.currencyCode} books={books} />)
      )}

      <PayoutRequestPanels earnings={earnings} />
      <FeeDisclosure />
      <EarningsTable items={earnings.items} />
    </>
  );
}
