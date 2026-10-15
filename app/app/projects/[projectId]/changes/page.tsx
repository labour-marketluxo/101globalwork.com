import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChangesSection } from '@/components/projects/ProjectControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { getProjectChanges } from '@/features/projects/controls';
import { getProjectEvidence } from '@/features/projects/files';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/changes — scope, schedule and price variations.
 *
 * ⚠️ THE BASELINE IS MEASURED, NOT TYPED. Every proposal freezes the baseline it was written against, so the diff on
 * this page is a comparison the platform made rather than one the proposer supplied. Accepting appends a baseline
 * version; the one it replaces stays.
 *
 * ⚠️ ACCEPTING DOES NOT REWRITE THE MONEY. The platform's financial record for a job is one funded obligation, and
 * this page does not silently replace it: the agreed adjustment is recorded against the baseline and the notice says
 * so, because a control that quietly restated a funded amount would be a control nobody could audit.
 */
export const metadata: Metadata = {
  title: 'Project changes',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; change?: string }>;

export default async function ProjectChangesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const changes = await getProjectChanges(projectId);
  if (changes.denied || changes.unavailable) notFound();
  const evidence = await getProjectEvidence(projectId);

  const failure = projectFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Changes</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          A change is a proposed adjustment to the agreed scope, schedule or price. The other party decides it, and
          accepting one appends a new baseline version — so &ldquo;what we agreed&rdquo; is always answerable from the
          record rather than from memory.
        </p>
      </section>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.change === 'created' ? (
        <WorkspaceNotice tone="teal" role="status" title="Change proposal saved.">
          <p>The other party can decide it now, and both of you can see the baseline it compares against.</p>
        </WorkspaceNotice>
      ) : null}
      {query.change === 'accepted' ? (
        <WorkspaceNotice tone="teal" role="status" title="Accepted — the baseline was adjusted.">
          <p>
            A new baseline version is on the record and the previous one is untouched. The payment record itself is not
            rewritten by this: the agreed difference is recorded, and money moves through the payment and payout path
            where it can be reconciled.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.change === 'rejected' ? (
        <WorkspaceNotice tone="slate" role="status" title="Proposal rejected.">
          <p>The baseline did not change. The proposal stays readable with the reason, if one was given.</p>
        </WorkspaceNotice>
      ) : null}
      {query.change === 'withdrawn' ? (
        <WorkspaceNotice tone="slate" role="status" title="Proposal withdrawn.">
          <p>It stays in the list, marked as withdrawn, so the history of what was asked for is intact.</p>
        </WorkspaceNotice>
      ) : null}

      <ChangesSection
        changes={changes.changes}
        baselines={changes.baselines}
        assignmentId={project.header.assignmentId}
        evidence={evidence.items.map(item => ({ id: item.id, kind: item.kind, note: item.note }))}
        canPropose={changes.role !== 'admin'}
      />
    </div>
  );
}
