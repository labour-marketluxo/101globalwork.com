import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentsSection } from '@/components/projects/ProjectFiles';
import DocumentUploader from '@/components/projects/DocumentUploader';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProject } from '@/features/projects/project';
import { getProjectDocuments } from '@/features/projects/files';
import { projectFailureCopy } from '@/features/projects/failure-copy';

/**
 * /projects/[projectId]/documents — the versioned file repository.
 *
 * ⚠️ EVERY FILE IS SERVED BY A SIGNED URL. Nothing on this page links to a storage object directly: the download
 * and preview actions go through a route that mints a short-lived signed URL for the signed-in participant, which is
 * the only way into a private bucket.
 *
 * ⚠️ A NEW VERSION NEVER REPLACES AN OLD ONE, AND THERE IS NO DELETE. The database has no update path for a version
 * and the storage has no delete policy, so "prevent overwriting prior history" is a property of the schema rather
 * than a habit of this page.
 */
export const metadata: Metadata = {
  title: 'Project documents',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; document?: string }>;

export default async function ProjectDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const documents = await getProjectDocuments(projectId);
  if (documents.denied || documents.unavailable) notFound();

  const failure = projectFailureCopy(query.failed);
  const canAdd = project.role !== 'admin';

  return (
    <div className="grid gap-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Documents</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Agreements, scope specifications, receipts, permits and certificates, each version kept beside the ones
          before it. Files are private: the platform serves them through a temporary signed link to the parties on
          this job, and a document marked for one side is not readable by the other even with the link.
        </p>
      </section>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.document === 'added' ? (
        <WorkspaceNotice tone="teal" role="status" title="Document saved.">
          <p>
            It is in the repository now. If it was a new version, the earlier ones are untouched — the version number
            is how the history reads.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.document === 'decided' ? (
        <WorkspaceNotice tone="teal" role="status" title="Decision recorded.">
          <p>
            Your acknowledgement is stored against that version, and it appears in the timeline as a factual entry.
            It is not an e-signature — the agreement clickwrap is the one record that carries a verification method.
          </p>
        </WorkspaceNotice>
      ) : null}

      {documents.agreementAcceptance ? (
        <WorkspaceNotice tone="slate" role="status" title="The agreement is signed.">
          <p>
            Version {documents.agreementAcceptance.version} was accepted
            {documents.agreementAcceptance.acceptedAt
              ? ` on ${new Date(documents.agreementAcceptance.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : ''}{' '}
            after the customer verified by {documents.agreementAcceptance.authMethod}. That record is the signature;
            this page reads it rather than keeping a second copy.
          </p>
        </WorkspaceNotice>
      ) : null}

      <DocumentsSection
        documents={documents.documents}
        assignmentId={project.header.assignmentId}
        role={documents.role}
      />

      {canAdd ? (
        <DocumentUploader
          assignmentId={project.header.assignmentId}
          existingGroups={documents.documents.map(document => ({
            id: document.groupId,
            title: document.title,
            latestVersion: document.latestVersion,
          }))}
        />
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          You are reading these documents as platform staff: they are visible and adding one is not part of this page.
        </p>
      )}
    </div>
  );
}
