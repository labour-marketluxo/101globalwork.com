import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { CasesSection, EscrowCheckpoint } from '@/components/projects/ProjectControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { getProject } from '@/features/projects/project';
import { getProjectMilestones } from '@/features/projects/controls';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/milestones — the escrow checkpoint, the plan's checkpoints, and the cases.
 *
 * ⚠️ ONE CHECKPOINT HOLDS MONEY AND THE PAGE IS BUILT AROUND THAT FACT. The platform releases escrow once per job, on
 * the completion approval; the stages below it are checkpoints of the plan with no money attached, and every figure
 * shown comes from the obligation, the payout or the approvals themselves.
 *
 * ⚠️ THE ACTIONS ARE LINKS TO WHERE THEY ALREADY LIVE. Submitting for review happens with the work, approving happens
 * in the customer's completion review, and requesting revisions is that same review's correction path. Duplicating
 * them here would give the platform two ways to do one thing, and the second would eventually disagree with the first.
 */
export const metadata: Metadata = {
  title: 'Project milestones',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; case?: string }>;

export default async function ProjectMilestonesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const milestones = await getProjectMilestones(projectId);
  if (milestones.denied || milestones.unavailable) notFound();

  const failure = projectFailureCopy(query.failed);
  const assignmentId = project.header.assignmentId;
  const isProvider = milestones.role === 'provider';
  const isCustomer = milestones.role === 'customer';
  const evidence = project.evidence.map(item => ({ id: item.id, kind: item.kind }));

  return (
    <div className="grid gap-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Milestones and approvals</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          The checkpoint that releases money, the plan&apos;s own checkpoints, and any case that has stopped the job
          moving.
        </p>
      </section>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.case === 'opened' ? (
        <WorkspaceNotice tone="teal" role="status" title="Case opened.">
          <p>
            Both parties can see it, and a safety, privacy or financial case has frozen the payout until the platform
            resolves or closes it.
          </p>
        </WorkspaceNotice>
      ) : null}

      <EscrowCheckpoint milestones={milestones} assignmentId={assignmentId} evidence={evidence} />

      <section className={`${CARD} p-5`} aria-labelledby="next-steps-heading">
        <h2 id="next-steps-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Where the actions live
        </h2>
        <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-slate-600">
          {isProvider ? (
            <li className="rounded-xl border border-solid border-slate-200 p-3">
              <strong className="font-semibold text-slate-800">Submit for review</strong> — capture and send the
              completion evidence from{' '}
              <Link href={`${PROVIDER_PATHS.work}/${assignmentId}/evidence`} className={LINK_ARROW}>
                the job&apos;s evidence page
              </Link>
              . Submitting is what asks the customer to approve, and the platform refuses a completion submission with no
              evidence at all.
            </li>
          ) : null}
          {isCustomer ? (
            <>
              <li className="rounded-xl border border-solid border-slate-200 p-3">
                <strong className="font-semibold text-slate-800">Approve and release payment</strong> — the approval
                with its verification step is in{' '}
                <Link href={`/customer/projects/${assignmentId}/completion`} className={LINK_ARROW}>
                  your completion review
                </Link>
                . The notice above states what it releases before you press it.
              </li>
              <li className="rounded-xl border border-solid border-slate-200 p-3">
                <strong className="font-semibold text-slate-800">Request revisions</strong> — sending the work back with
                a reason is on that same page, and it returns the job to the provider without releasing anything.
              </li>
            </>
          ) : null}
          <li className="rounded-xl border border-solid border-slate-200 p-3">
            <strong className="font-semibold text-slate-800">Escalate to a dispute</strong> — raising a financial case
            below freezes the payout and puts the question to the platform, which is the only party that can close it.
          </li>
        </ul>
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="stage-checkpoints-heading">
        <h2 id="stage-checkpoints-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Plan checkpoints
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Stages from the plan. They track progress and carry no money — the checkpoint above is the only escrow release
          this platform has.
        </p>
        {milestones.stages.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            No stages written yet.{' '}
            <Link href={`/projects/${assignmentId}/work`} className={LINK_ARROW}>
              Write the plan
            </Link>
          </p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {milestones.stages.map(stage => (
              <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3 text-xs">
                <span className="text-slate-700">
                  {stage.ordinal}. {stage.title}
                </span>
                <span className="text-slate-500">
                  {stage.doneCount}/{stage.taskCount} tasks done · no payout attached
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="cases-heading">
        <h2 id="cases-heading" className={`${LABEL} mb-2`}>
          Cases
        </h2>
        <CasesSection milestones={milestones} assignmentId={assignmentId} />
      </section>
    </div>
  );
}
