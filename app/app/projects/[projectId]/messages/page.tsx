import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectMessagesSection } from '@/components/projects/ProjectWork';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { getProjectMessages } from '@/features/projects/messages';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/messages — the conversation, with the record beside it.
 *
 * ⚠️ CHAT AND RECORD ARE RENDERED AS TWO THINGS. The thread is grouped by what each message is about; the activity
 * feed below it is derived from the rows that caused it — a schedule written, a checkpoint recorded, evidence
 * submitted, an approval given. Merging them would let a comment read as a decision.
 *
 * ⚠️ TRANSLATION IS OFFERED ONLY WHEN A TRANSLATION EXISTS, AND NONE DOES. The platform has no translation provider
 * configured, so every message carries its original text alone; the UI says that rather than offering a button that
 * cannot work, and the column that would hold a translation sits beside the original rather than replacing it.
 */
export const metadata: Metadata = {
  title: 'Project messages',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; sent?: string }>;

export default async function ProjectMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const messages = await getProjectMessages(projectId);
  if (messages.denied || messages.unavailable) notFound();

  const failure = projectFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That message was not sent.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.sent === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Message sent.">
          <p>Both parties can read it, and the original text is what is stored.</p>
        </WorkspaceNotice>
      ) : null}

      <ProjectMessagesSection
        messages={messages.messages}
        activity={messages.activity}
        contexts={messages.contexts.map(context => ({ kind: context.kind, label: context.label, tasks: context.tasks }))}
        assignmentId={project.header.assignmentId}
        evidence={project.evidence.map(item => ({ id: item.id, kind: item.kind, note: item.note }))}
        canPost={messages.role !== 'admin'}
      />
    </div>
  );
}
