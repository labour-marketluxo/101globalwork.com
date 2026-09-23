import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectWorkSection } from '@/components/projects/ProjectWork';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/work — the plan.
 *
 * ⚠️ THE FILTERS ARE QUERY PARAMETERS, SO A FILTERED VIEW IS A LINK. It survives a reload, a bookmark and being sent
 * to the other party, and no JavaScript is needed to narrow the list.
 */
export const metadata: Metadata = {
  title: 'Project work',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ assignee?: string; status?: string; stage?: string; failed?: string; added?: string; moved?: string }>;

export default async function ProjectWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const failure = projectFailureCopy(query.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.added ? (
        <WorkspaceNotice tone="teal" role="status" title={query.added === 'stage' ? 'Stage added.' : 'Task added.'}>
          <p>Both parties can see the plan. Tasks are tracked here; money moves on the job’s own approval.</p>
        </WorkspaceNotice>
      ) : null}
      {query.moved === 'task' ? (
        <WorkspaceNotice tone="teal" role="status" title="Order changed.">
          <p>The plan is in the order you set.</p>
        </WorkspaceNotice>
      ) : null}

      <ProjectWorkSection
        project={project}
        filters={{
          assignee: query.assignee ?? '',
          status: query.status ?? '',
          stage: query.stage ?? '',
        }}
      />
    </div>
  );
}
