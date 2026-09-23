import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { InvitationLinkPanel, MembersTable } from '@/components/organisations/OrgDirectory';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getOrganisationDirectory, invitationLink } from '@/features/organisations/directory';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';

/**
 * /org/[orgId]/members — the member directory.
 *
 * ⚠️ ROLE AND SCOPE ARE THE SECURITY SURFACE, AND THE COMMANDS OWN THEM. Nobody widens their own site scope, an owner
 * cannot be demoted or suspended from this page, and a member cannot suspend themselves. Grants and removals go
 * through the platform's second-factor gate when the account has one.
 *
 * ⚠️ THE PLATFORM SENDS NO EMAIL OF ITS OWN, SO THE INVITATION LINK IS SHOWN ONCE. The token is stored hashed; the
 * inviter passes the link on. Saying that plainly is better than a form that reads as though the platform emailed
 * somebody.
 */
export const metadata: Metadata = {
  title: 'Members and roles',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ saved?: string; token?: string; failed?: string; section?: string }>;

export default async function OrganisationMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const directory = await getOrganisationDirectory(orgId);
  if (directory.denied || directory.unavailable) notFound();

  const host = (await headers()).get('host') ?? '';
  const origin = host ? `https://${host}` : '';
  const failure = organisationFailureCopy(query.failed);
  const canAdminister = directory.role === 'admin';

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Members and roles</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Who can act for this organisation, what they may act on, and when they last did. A site scope is a limit the
          platform enforces, not a label: a member scoped to one site is scoped to one site in every read and write.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'member' ? (
        <WorkspaceNotice tone="teal" role="status" title="Member updated.">
          <p>The role and the sites they may act on are stored; the change is in the audit record.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'member_status' ? (
        <WorkspaceNotice tone="teal" role="status" title="Membership status changed.">
          <p>A suspension keeps the history and stops the person acting for the organisation.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'invitation' && query.token ? (
        <WorkspaceNotice tone="teal" role="status" title="Invitation created.">
          <InvitationLinkPanel token={query.token} link={invitationLink(origin, query.token)} />
        </WorkspaceNotice>
      ) : null}

      <MembersTable
        organisationId={orgId}
        directory={directory}
        canAdminister={canAdminister}
      />
    </div>
  );
}
