import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from '@/components/ui/icons';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { IssueCase } from '@/components/projects/ProjectControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { getProjectIssue } from '@/features/projects/controls';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/issues/[issueId] — the isolated case hub.
 *
 * ⚠️ A CASE IS NOT THE CHAT. It has its own record, its own status, and platform decisions rendered as decisions. The
 * project's conversation stays on the Messages tab, which is the separation the brief asks for and the reason a
 * settlement cannot read as one more comment in a thread.
 *
 * ⚠️ THE HOLD IS SHOWN AS MONEY, NOT AS A LABEL. The page states the amount the hold is sitting on, because that is
 * the consequence: while a safety, privacy or financial case is open, the provider cannot request the payout and the
 * database refuses the request.
 */
export const metadata: Metadata = {
  title: 'Case',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; case?: string }>;

export default async function ProjectIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId, issueId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const issue = await getProjectIssue(projectId, issueId);
  if (issue.denied || issue.unavailable) notFound();

  const failure = projectFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      <nav aria-label="Case" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/projects/${projectId}/milestones`} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to milestones
        </Link>
      </nav>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.case === 'responded' ? (
        <WorkspaceNotice tone="teal" role="status" title="Added to the case.">
          <p>The entry is in the record and both parties can read it.</p>
        </WorkspaceNotice>
      ) : null}
      {query.case && query.case !== 'responded' ? (
        <WorkspaceNotice tone="teal" role="status" title={`Case moved to “${query.case.replaceAll('_', ' ')}”.`}>
          <p>
            {['resolved', 'closed'].includes(query.case)
              ? 'The legal hold is lifted, so the payout can be requested again if it is otherwise eligible.'
              : 'The record shows who moved it and when.'}
          </p>
        </WorkspaceNotice>
      ) : null}

      <IssueCase
        issue={issue}
        assignmentId={project.header.assignmentId}
        evidence={project.evidence.map(item => ({ id: item.id, kind: item.kind, note: item.note }))}
      />
    </div>
  );
}
