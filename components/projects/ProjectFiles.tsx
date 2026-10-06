import Link from 'next/link';
import { ArrowRight, Download, Eye, FileText, Flag, History, ShieldAlert, Upload } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import {
  EVIDENCE_KIND_COPY,
  FLAG_REASON_COPY,
  SIGNER_STATUS_COPY,
  timelineHref,
  type DocumentVersion,
  type EvidenceItem,
  type ProjectDocument,
  type TimelineEvent,
} from '@/features/projects/files';
import { ACCESS_SCOPE_COPY, DOCUMENT_TYPE_COPY } from '@/features/projects/document-copy';
import { flagEvidenceAction, withdrawEvidenceFlagAction, decideProjectDocumentAction } from '@/features/projects/actions';

/**
 * Evidence, the timeline and the documents.
 *
 * ⚠️ NOTHING ON THESE THREE PAGES EDITS HISTORY. Evidence is flagged rather than removed, a document version is a new
 * row rather than a replacement, and the timeline is rendered from the audit log with no control that could change
 * it. Each of those is enforced in the database as well, so the pages are not the only thing standing in the way.
 *
 * ⚠️ FILES ARE NEVER LINKED DIRECTLY. Every download goes through a route that mints a short-lived signed URL, which
 * is the only way a private object is reachable — and it means the request is made by a signed-in participant.
 */

function verificationBadge(item: EvidenceItem) {
  if (item.verification === 'flagged') return <span className={BADGE_AMBER}>Flagged</span>;
  if (item.verification === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
        Approved with the job
      </span>
    );
  }
  return <span className={BADGE_SLATE}>Submitted</span>;
}

export function EvidenceGallery({
  items,
  assignmentId,
  canUpload,
  canFlag,
}: {
  items: EvidenceItem[];
  assignmentId: string;
  canUpload: boolean;
  canFlag: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState title="No evidence on this job yet">
        {canUpload
          ? 'Capture the proof of work from the job page: it queues, compresses and uploads on a weak connection.'
          : 'The provider has not submitted any proof of work yet.'}
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map(item => (
        <article key={item.id} className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                {EVIDENCE_KIND_COPY[item.kind] ?? item.kind}
                {item.stepLabel ? ` · ${item.stepLabel}` : ''}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {item.uploaderName} · {item.uploaderRole}
                {item.submittedAt
                  ? ` · ${new Date(item.submittedAt).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : ''}
              </p>
            </div>
            {verificationBadge(item)}
          </div>

          {item.note ? <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.note}</p> : null}

          {/* Provenance: where the file came from, in the platform's own terms. */}
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Source</dt>
              <dd className="mt-0.5 text-slate-700">
                {item.source === 'package' ? 'Completion package' : 'Single submission'}
                {item.storagePath ? ' · private storage' : ''}
              </dd>
            </div>
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Location</dt>
              <dd className="mt-0.5 text-slate-700">
                {item.storagePath ? 'In the private evidence bucket' : item.externalUrl ? 'An external link' : 'No file'}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {item.storagePath ? (
              <Link href={`/projects/${assignmentId}/evidence/${item.id}/download`} className={LINK_ARROW}>
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                Download asset
              </Link>
            ) : null}
            {item.externalUrl ? (
              <a href={item.externalUrl} target="_blank" rel="noreferrer noopener" className={LINK_ARROW}>
                Open the link they supplied
              </a>
            ) : null}
          </div>

          {item.flags.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {item.flags.map(flag => (
                <li key={flag.id} className="rounded-xl border border-solid border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">
                    {FLAG_REASON_COPY[flag.reasonCode] ?? flag.reasonCode}
                    <span className="ml-2 font-normal text-slate-500">
                      raised by the {flag.raisedByRole}
                      {flag.status === 'withdrawn' ? ' · withdrawn' : ''}
                    </span>
                  </p>
                  {flag.note ? <p className="mt-0.5">{flag.note}</p> : null}
                  {flag.raisedByMe && flag.status === 'open' ? (
                    <form action={withdrawEvidenceFlagAction} className="mt-2">
                      <input type="hidden" name="assignment_id" value={assignmentId} />
                      <input type="hidden" name="flag_id" value={flag.id} />
                      <input type="hidden" name="next" value={`/projects/${assignmentId}/evidence`} />
                      <PendingButton
                        idle="Withdraw my flag"
                        pending="Withdrawing…"
                        className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {canFlag && item.verification !== 'flagged' ? (
            <details className="mt-3">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
                <Flag aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                Report or flag this evidence
              </summary>
              <form action={flagEvidenceAction} className="mt-2 grid gap-2 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5">
                <input type="hidden" name="assignment_id" value={assignmentId} />
                <input type="hidden" name="evidence_id" value={item.id} />
                <input type="hidden" name="next" value={`/projects/${assignmentId}/evidence`} />
                <div>
                  <label htmlFor={`reason_${item.id}`} className={LABEL}>
                    What is wrong with it
                  </label>
                  <select id={`reason_${item.id}`} name="reason_code" required defaultValue="" className={FIELD}>
                    <option value="" disabled>
                      Choose a reason
                    </option>
                    {Object.entries(FLAG_REASON_COPY).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`note_${item.id}`} className={LABEL}>
                    Anything to add (optional)
                  </label>
                  <input id={`note_${item.id}`} name="note" maxLength={500} className={FIELD} />
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  This is recorded against the item and stays in the timeline. The platform does not decide who is
                  right — it shows that the question was raised.
                </p>
                <div>
                  <PendingButton
                    idle="Flag it"
                    pending="Saving…"
                    className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </form>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/**
 * The canonical timeline.
 *
 * ⚠️ FACTUAL ONLY, AND THE PAGE SAYS SO. Every entry is an audit row: it names the actor, the exact instant with the
 * viewer's timezone, and the record it is about. Chat rows are excluded by the query, and there is no control here
 * that edits or deletes — a corrected record is a later entry, which is what immutability means in practice.
 */
export function TimelineSection({ events, assignmentId }: { events: TimelineEvent[]; assignmentId: string }) {
  if (events.length === 0) {
    return <EmptyState title="Nothing recorded yet">The timeline fills as the job moves.</EmptyState>;
  }

  return (
    <ol className="grid gap-3">
      {events.map((event, index) => {
        const href = timelineHref(event, assignmentId);
        return (
          <li key={`${event.kind}-${event.at ?? index}`} className={`${CARD} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{event.description}</p>
              <span className={event.actorRole === 'platform' || event.actorRole === 'system' ? BADGE_AMBER : BADGE_SLATE}>
                {event.actorRole === 'system' ? 'Automatic' : event.actorRole}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-500 uppercase">
              {event.at
                ? `${new Date(event.at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short',
                  })}`
                : 'No timestamp'}
              {event.reasonCode ? ` · ${event.reasonCode.replaceAll('_', ' ')}` : ''}
            </p>
            {event.isOverride ? (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-solid border-secondary bg-secondary-light px-3 py-2 text-xs leading-relaxed text-amber-900">
                <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
                Recorded outside the ordinary party flow — a platform or automatic action.
              </p>
            ) : null}
            {href ? (
              <p className="mt-2">
                <Link href={href} className={LINK_ARROW}>
                  Open the record
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function versionRow(version: DocumentVersion, assignmentId: string, role: string | null) {
  const signer = SIGNER_STATUS_COPY[version.signerStatus] ?? { label: version.signerStatus, tone: 'slate' as const };
  const canDecide =
    role !== 'admin' && version.documentType !== 'agreement' && !version.uploadedByMe && version.signerStatus !== 'approved';

  return (
    <li key={version.id} className="rounded-xl border border-solid border-slate-200 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            v{version.versionMajor} · {version.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {version.uploaderName} · {version.uploaderRole}
            {version.createdAt
              ? ` · ${new Date(version.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : ''}
            {version.sizeBytes ? ` · ${(version.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ''}
          </p>
        </div>
        <span
          className={
            signer.tone === 'teal'
              ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
              : signer.tone === 'amber'
                ? BADGE_AMBER
                : BADGE_SLATE
          }
        >
          {signer.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Visible to {ACCESS_SCOPE_COPY[version.accessScope] ?? version.accessScope}
        {version.documentType === 'agreement'
          ? ' · the agreement is signed through the agreement flow, which records how the customer verified'
          : ''}
      </p>

      {version.decisions.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs text-slate-600">
          {version.decisions.map(decision => (
            <li key={`${decision.role}-${decision.decidedAt}`}>
              {decision.decision === 'approved' ? 'Approved' : 'Declined'} by the {decision.role}
              {decision.decidedAt
                ? ` on ${new Date(decision.decidedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : ''}
              {decision.note ? ` — ${decision.note}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href={`/projects/${assignmentId}/documents/${version.id}/download`} className={LINK_ARROW}>
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Download
        </Link>
        <Link href={`/projects/${assignmentId}/documents/${version.id}/download?inline=1`} className={LINK_ARROW}>
          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          Preview
        </Link>
      </div>

      {canDecide ? (
        <form action={decideProjectDocumentAction} className="mt-3 grid gap-2 border-t border-solid border-slate-200 pt-3">
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="document_id" value={version.id} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/documents`} />
          <label htmlFor={`decision_note_${version.id}`} className={LABEL}>
            Sign / approve this version — note (optional)
          </label>
          <input id={`decision_note_${version.id}`} name="note" maxLength={500} className={FIELD} />
          <p className="text-xs leading-relaxed text-slate-500">
            This is an acknowledgement by a participant, not an e-signature: the platform has no signing provider. The
            clickwrap agreement with its step-up is the one record that does carry a verification method.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton
              idle="Approve"
              pending="Saving…"
              formAction={decideProjectDocumentAction}
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function DocumentsSection({
  documents,
  assignmentId,
  role,
}: {
  documents: ProjectDocument[];
  assignmentId: string;
  role: string | null;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState title="No documents on this job">
        Agreements, scope specifications, receipts and certificates live here, each version kept. The signed agreement
        is recorded by the agreement flow, and appears here once it exists.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4">
      {documents.map(document => (
        <section key={document.groupId} className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <FileText aria-hidden="true" className="h-4 w-4 text-primary" />
                {document.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {DOCUMENT_TYPE_COPY[document.documentType] ?? document.documentType} · {ACCESS_SCOPE_COPY[document.accessScope] ?? document.accessScope} ·{' '}
                {document.versions.length} version{document.versions.length === 1 ? '' : 's'}
              </p>
            </div>
            <span className={BADGE_SLATE}>Latest v{document.latestVersion}</span>
          </div>
          <ul className="mt-3 grid gap-2">
            {document.versions.map(version => versionRow(version, assignmentId, role))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <History aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            Every version is kept. A newer version never replaces an older one, and there is no delete: what was signed
            is still readable afterwards.
          </p>
        </section>
      ))}
    </div>
  );
}

/** The provider's route for capturing evidence, so the gallery can point at it instead of duplicating it. */
export function EvidenceUploadLink({ assignmentId }: { assignmentId: string }) {
  return (
    <Link href={`${PROVIDER_PATHS.work}/${assignmentId}/evidence`} className={LINK_ARROW}>
      <Upload aria-hidden="true" className="h-3.5 w-3.5" />
      Capture and upload evidence
    </Link>
  );
}
