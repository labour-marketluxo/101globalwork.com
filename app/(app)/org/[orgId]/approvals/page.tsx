import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { ApprovalsInbox } from '@/components/organisations/OrgGovernance';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';
import { DECISION_COPY, getApprovals } from '@/features/organisations/governance';
import { getOrganisation } from '@/features/organisations/org';

/**
 * /org/[orgId]/approvals — the decision centre.
 *
 * ⚠️ SEPARATION OF DUTIES IS ENFORCED IN SQL, AND THIS PAGE DOES NOT PRETEND OTHERWISE. The item list arrives already
 * filtered to what this account may decide — the commissioning account and the request's internal owner never see
 * their own spend here — and the command re-checks it, so a hand-made form post fails too. What the page adds is the
 * explanation of the one rule a reader cannot see from the rows alone: above the organisation's threshold, only an
 * owner, administrator or approver may decide.
 *
 * ⚠️ A DECISION IS THE ORGANISATION'S, NOT THE PLATFORM'S. Accepting a quote and approving completed work remain
 * platform commands bound to the account that commissioned the request; the notice below says so on every landing,
 * because an organisation member who leaves believing the job was accepted would be wrong in a way that costs money.
 */
export const metadata: Metadata = {
  title: 'Approvals',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ decided?: string; failed?: string }>;

export default async function OrganisationApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const [approvals, { organisation }] = await Promise.all([getApprovals(orgId), getOrganisation(orgId)]);
  if (approvals.denied || approvals.unavailable) notFound();

  const currencyCode = organisation?.entity.currencyCode ?? 'NGN';
  const failure = organisationFailureCopy(query.failed);
  const decided = query.decided ? DECISION_COPY[query.decided] : undefined;

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Approvals</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          The spend, scope changes and milestone releases waiting on this organisation. Nobody approves their own
          request, and above the organisation&apos;s threshold only an owner, an administrator or an approver may
          decide.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
          A decision recorded here is the organisation&apos;s own governance record. It is not the platform&apos;s
          acceptance of a quote or approval of completed work — those stay with the account that commissioned the
          request, and each card links you to it.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
          Each card carries how long the item has been waiting. The platform holds no per-request decision deadline to
          count down to, so the age is the honest measure of what is late rather than a date this page invented.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {decided ? (
        <WorkspaceNotice tone="teal" role="status" title="Decision recorded.">
          <p>
            It is logged against this organisation as &ldquo;<strong className="font-semibold">{decided.label}</strong>
            &rdquo;, with the amount and the threshold in force at the time, and it is in the audit record.
          </p>
        </WorkspaceNotice>
      ) : null}

      <ApprovalsInbox approvals={approvals} organisationId={orgId} currencyCode={currencyCode} />

      <p className="text-xs leading-relaxed text-slate-400">
        The organisation&apos;s portfolio, with each request&apos;s own state and next action, is on{' '}
        <Link href={`/org/${orgId}/projects`} className={LINK_ARROW}>
          the projects page
        </Link>
        .
      </p>
    </div>
  );
}
