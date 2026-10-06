import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Info } from '@/components/ui/icons';
import { CARD, LINK_ARROW } from '@/components/discovery/tokens';
import EvidenceCapture from '@/components/provider/EvidenceCapture';
import { OfflineSyncStatus } from '@/components/provider/WorkStatusActions';
import { WorkspaceNotice, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';
import { getAssignmentDetail, workPath } from '@/features/provider-workspace/work';

/**
 * /provider/work/[assignmentId]/evidence — capture and submit proof of work.
 *
 * ⚠️ THE UPLOADS HAPPEN IN THE BROWSER, INTO A PRIVATE BUCKET, ONE FILE AT A TIME. That is the design decision
 * this page is built around, and it is what makes the weak-connection case survive: the bytes go to storage as
 * they are chosen, the PATHS are remembered on the device, and the final submission is a small write that can be
 * retried. See components/provider/EvidenceCapture.tsx for what is compressed and what the limits are.
 *
 * ⚠️ THE REQUIREMENT CHECKLIST IS THE PROVIDER'S OWN. This platform has no per-trade evidence requirements — no
 * table says "three photographs of the joint and a signed certificate" — so the page shows the provider's
 * checklist and the platform's own floor: at least one file, submitted while the work is under way.
 */
export const metadata: Metadata = {
  title: 'Evidence',
  description: 'Capture and submit proof of work.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; submitted?: string }>;

export default async function ProviderEvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: SearchParams;
}) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) notFound();

  const { detail, unavailable } = await getAssignmentDetail(provider.id, assignmentId);
  if (unavailable) {
    return (
      <div className="grid gap-6">
        <WorkspaceUnavailable what="This job" />
      </div>
    );
  }
  if (!detail) notFound();

  const failure = providerFailureCode(query.failed);
  const nextPath = workPath(detail.assignment.id);

  return (
    <div className="grid gap-6">
      <nav aria-label="Evidence" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={nextPath} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to the job
        </Link>
      </nav>

      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
          Evidence · {detail.request.needText}
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Show the work
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Photographs, video, a document or a note. This is what the customer reads before they approve the job,
          and what the payment rests on — so submit what shows the work was done, not what flatters it.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That package was not submitted.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
          <p className="mt-1">
            The files themselves are already in private storage — only the submission failed, so nothing has to be
            uploaded again.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.submitted === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Evidence submitted.">
          <p>
            The customer has been asked to approve the work. Nothing is paid by this alone, and if they send it
            back you can submit another package.
          </p>
          <p className="mt-1">
            <Link href={nextPath} className={LINK_ARROW}>
              Back to the job
            </Link>
          </p>
        </WorkspaceNotice>
      ) : null}

      <OfflineSyncStatus />

      <section className={`${CARD} p-5`} aria-labelledby="requirements-heading">
        <h2 id="requirements-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <Info aria-hidden="true" className="h-4 w-4 text-primary" />
          What this job expects
        </h2>
        <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-slate-600">
          <li className="rounded-xl border border-solid border-slate-200 p-3">
            <strong className="font-semibold text-slate-800">At least one file or note.</strong> The database refuses
            a completion submission with no payload at all, so this is the platform&apos;s floor rather than a
            preference.
          </li>
          <li className="rounded-xl border border-solid border-slate-200 p-3">
            <strong className="font-semibold text-slate-800">
              {detail.steps.length > 0 ? `${detail.steps.length} checklist step${detail.steps.length === 1 ? '' : 's'} on this job.` : 'No checklist on this job.'}
            </strong>{' '}
            {detail.steps.length > 0
              ? 'You can tie a package to one step. The platform does not require evidence per step — that is your call, and the customer never sees the checklist.'
              : 'The platform does not require one, and it does not invent one. Write steps on the job page if they help you.'}
          </li>
          {detail.site.hazardous ? (
            <li className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-amber-900">
              <strong className="font-semibold">The customer flagged this job as hazardous.</strong> Photograph how
              you left the site as well as the work itself.
            </li>
          ) : null}
          {detail.correction ? (
            <li className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-amber-900">
              <strong className="font-semibold">The customer sent this work back.</strong> {detail.correction.message}
            </li>
          ) : null}
        </ul>
      </section>

      <EvidenceCapture
        assignmentId={detail.assignment.id}
        providerId={provider.id}
        steps={detail.steps.map(step => ({ id: step.id, label: `${step.ordinal}. ${step.label}` }))}
        requestState={detail.request.state}
        nextPath={nextPath}
      />
    </div>
  );
}
