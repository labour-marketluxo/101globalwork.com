import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EvidenceGallery, EvidenceUploadLink } from '@/components/projects/ProjectFiles';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { getProject } from '@/features/projects/project';
import { getProjectEvidence, EVIDENCE_KIND_COPY } from '@/features/projects/files';
import Link from 'next/link';
import { CARD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { sendProjectMessageAction } from '@/features/projects/actions';
import { PendingButton } from '@/components/provider/ProviderControls';
import { FIELD } from '@/components/discovery/tokens';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/evidence — what was submitted, by whom, and whether anybody disputed it.
 *
 * ⚠️ THERE IS NO SECOND UPLOAD PATH. Evidence is captured on the provider's job page, where the queue, the
 * compression and the storage policies already live; this page points there rather than reimplementing it. A
 * "upload" button here that behaved slightly differently would be a second set of limits to get wrong.
 *
 * ⚠️ FILTERING IS QUERY PARAMETERS, AND THE FILTERS NARROW ONLY WHAT WAS RETURNED. Type, uploader and step all come
 * from the rows themselves, so no combination of parameters can reveal an item the command did not send.
 */
export const metadata: Metadata = {
  title: 'Project evidence',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ kind?: string; uploader?: string; flagged?: string; failed?: string }>;

export default async function ProjectEvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const evidence = await getProjectEvidence(projectId);
  if (evidence.denied || evidence.unavailable) notFound();

  const kinds = [...new Set(evidence.items.map(item => item.kind))];
  const filtered = evidence.items.filter(item => {
    if (query.kind && item.kind !== query.kind) return false;
    if (query.uploader && item.uploaderRole !== query.uploader) return false;
    return true;
  });
  const failure = projectFailureCopy(query.failed);
  const canUpload = project.role === 'provider';

  return (
    <div className="grid gap-5">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.flagged === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Flagged.">
          <p>
            The item is still here — a flag records that somebody questions it, and the platform does not decide who
            is right. It appears in the timeline as a factual entry.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.flagged === 'withdrawn' ? (
        <WorkspaceNotice tone="teal" role="status" title="Flag withdrawn.">
          <p>The item is unmarked, and the withdrawal is in the timeline.</p>
        </WorkspaceNotice>
      ) : null}

      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Evidence on this job</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Everything submitted as proof of work, with who sent it, when, where it came from, and whether anybody has
          questioned it. Files are in a private bucket and are served to participants only, through a temporary signed
          link.
        </p>
        {canUpload ? (
          <p className="mt-2">
            <EvidenceUploadLink assignmentId={project.header.assignmentId} />
          </p>
        ) : null}
      </section>

      <form method="get" action={`/projects/${projectId}/evidence`} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
        <div className="min-w-0 flex-1">
          <label htmlFor="kind" className={LABEL}>
            Type
          </label>
          <select id="kind" name="kind" defaultValue={query.kind ?? ''} className={FIELD}>
            <option value="">Every type</option>
            {kinds.map(kind => (
              <option key={kind} value={kind}>
                {EVIDENCE_KIND_COPY[kind] ?? kind}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="uploader" className={LABEL}>
            Uploaded by
          </label>
          <select id="uploader" name="uploader" defaultValue={query.uploader ?? ''} className={FIELD}>
            <option value="">Anyone</option>
            <option value="provider">The provider</option>
            <option value="customer">The customer</option>
          </select>
        </div>
        <PendingButton
          idle="Apply"
          pending="Applying…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        {query.kind || query.uploader ? (
          <Link href={`/projects/${projectId}/evidence`} className={LINK_ARROW}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-xs leading-relaxed text-slate-500">
        {filtered.length} of {evidence.items.length} item{evidence.items.length === 1 ? '' : 's'} shown. Task steps are
        shown on each item where the provider tied it to one — that checklist is theirs, not the customer&apos;s.
      </p>

      <EvidenceGallery
        items={filtered}
        assignmentId={project.header.assignmentId}
        canUpload={canUpload}
        canFlag={project.role !== 'admin'}
      />

      {project.role !== 'admin' ? (
        <form action={sendProjectMessageAction} className={`${CARD} grid gap-3 p-5`}>
          <input type="hidden" name="assignment_id" value={project.header.assignmentId} />
          <input type="hidden" name="context_kind" value="project" />
          <input type="hidden" name="next" value={`/projects/${projectId}/evidence`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Request additional proof</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Asking for more evidence is a message, because that is what it is: a request the other party can answer.
              The platform does not have a separate mechanism for it, and a request that went nowhere would be worse
              than a sentence in the thread.
            </p>
          </div>
          <div>
            <label htmlFor="body" className={LABEL}>
              What is missing
            </label>
            <textarea
              id="body"
              name="body"
              rows={3}
              required
              maxLength={4000}
              defaultValue="Please add evidence of "
              className={FIELD}
            />
          </div>
          <div>
            <PendingButton
              idle="Send the request"
              pending="Sending…"
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          You are reading this as platform staff: the gallery is visible and flagging is a party&apos;s statement, so
          it is not offered here.
        </p>
      )}

      {canUpload ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Evidence is captured at{' '}
          <Link href={`${PROVIDER_PATHS.work}/${project.header.assignmentId}/evidence`} className={LINK_ARROW}>
            the job&apos;s evidence page
          </Link>
          , where files are compressed and queued on the device before upload.
        </p>
      ) : null}
    </div>
  );
}
