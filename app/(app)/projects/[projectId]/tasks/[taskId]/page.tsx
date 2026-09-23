import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { TaskDetailView } from '@/components/projects/ProjectWork';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { getProjectTask } from '@/features/projects/task';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/tasks/[taskId] — one task, and exactly the moves this caller may make.
 *
 * ⚠️ THE BUTTONS ARE THE STATE MACHINE'S ANSWER. `allowed_transitions` comes from the command, which computed them
 * for this caller's role from the status the task is actually in. A customer sees "Approve task" and "Send back";
 * a provider sees "Start" and "Submit for approval"; neither sees the other's, and an admin sees none.
 *
 * ⚠️ NOTHING IS OPTIMISTIC. Every button is a server-action form, the page re-reads the task afterwards, and the
 * notice it shows is the outcome the database reported — not the outcome the click assumed.
 */
export const metadata: Metadata = {
  title: 'Task',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; moved?: string; saved?: string }>;

export default async function ProjectTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId, taskId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const { detail, denied: taskDenied } = await getProjectTask(projectId, taskId);
  if (taskDenied || !detail) notFound();

  const failure = projectFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      <nav aria-label="Task" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/projects/${projectId}/work`} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to the plan
        </Link>
      </nav>

      <TaskDetailView
        detail={detail}
        notice={
          <>
            {failure ? (
              <WorkspaceNotice tone="amber" role="alert" title="That move was not applied.">
                <p>{failure}</p>
              </WorkspaceNotice>
            ) : null}
            {query.moved ? (
              <WorkspaceNotice tone="teal" role="status" title={`Task is now “${query.moved.replaceAll('_', ' ')}”.`}>
                <p>The change is stored. Everything on this page was re-read from the database after it landed.</p>
              </WorkspaceNotice>
            ) : null}
            {query.saved === 'task' ? (
              <WorkspaceNotice tone="teal" role="status" title="Task saved.">
                <p>The scope, criteria and window are updated for both parties.</p>
              </WorkspaceNotice>
            ) : null}
          </>
        }
      />
    </div>
  );
}
