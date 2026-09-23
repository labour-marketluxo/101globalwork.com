import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  OpportunityDeadlinePanel,
  OpportunityDetailActions,
  OpportunityDetailHeader,
  OpportunityScopePanel,
  RequirementTags,
} from '@/components/provider/OpportunitySections';
import { WorkspaceNotice, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getOpportunityDetail } from '@/features/provider-workspace/opportunities';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * /provider/opportunities/[candidateId] — one request, in full.
 *
 * ⚠️ `candidateId` IS THE REQUEST ID, AND THAT IS A DELIBERATE READING OF THE BRIEF. There is no candidates
 * table: a provider's candidacy for a request is a computed fact (the request matches their services and areas
 * right now), so it has no id of its own. The request is the thing being offered, so the request id is what the
 * URL carries — and the command behind the page re-checks eligibility, so a guessed id from another provider's
 * feed returns a 404 rather than a peek.
 *
 * ⚠️ THE CUSTOMER'S CONTACT DETAILS ARE NOT ON THIS PAGE, BY CONSTRUCTION. The command projects an allowlist of
 * the scope document; the landmark, access notes and contact preference are not in it. The page says so once,
 * where a provider would look for them.
 */
export const metadata: Metadata = {
  title: 'Opportunity',
  description: 'One request you are eligible to quote.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ responded?: string; messaged?: string; failed?: string }>;

export default async function ProviderOpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: SearchParams;
}) {
  const [{ candidateId }, query] = await Promise.all([params, searchParams]);
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  // A path segment that is not a uuid cannot be an opportunity, and the command would refuse it anyway.
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) notFound();

  const { detail, unavailable } = await getOpportunityDetail(provider.id, candidateId);
  if (unavailable) {
    return (
      <div className="grid gap-6">
        <WorkspaceUnavailable what="This opportunity" />
      </div>
    );
  }
  if (!detail) notFound();

  const now = new Date();
  const nextPath = `${PROVIDER_PATHS.opportunities}/${candidateId}`;

  return (
    <div className="grid gap-6">
      <nav aria-label="Opportunity" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={PROVIDER_PATHS.opportunities} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          All opportunities
        </Link>
      </nav>

      {query.responded === 'interested' ? (
        <WorkspaceNotice tone="teal" role="status" title="Marked as interested.">
          <p>The customer is not told. It is your own note, shown back on the feed.</p>
        </WorkspaceNotice>
      ) : null}
      {query.responded === 'declined' ? (
        <WorkspaceNotice tone="teal" role="status" title="Declined.">
          <p>You can still quote this request if you change your mind — nothing was sent to the customer.</p>
        </WorkspaceNotice>
      ) : null}
      {query.messaged === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Message sent.">
          <p>
            It appears on the customer&apos;s request page. Answering is what moves this forward — a provider who
            asks early usually quotes better.
          </p>
        </WorkspaceNotice>
      ) : null}

      <OpportunityDetailHeader detail={detail} />
      <OpportunityScopePanel detail={detail} />
      <RequirementTags detail={detail} />
      <OpportunityDeadlinePanel detail={detail} now={now} />
      <OpportunityDetailActions detail={detail} providerId={provider.id} nextPath={nextPath} />
    </div>
  );
}
