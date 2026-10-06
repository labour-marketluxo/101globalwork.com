import Link from 'next/link';
import { ArrowRight, FileText, ShieldCheck } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { PendingButton } from '@/components/provider/ProviderControls';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import {
  VERIFICATION_KIND_LABELS,
  VERIFICATION_STATUS_COPY,
  type VerificationCentre,
  type VerificationRecord,
  type VerificationRequirement,
} from '@/features/provider-workspace/verification';
import { resubmitVerificationAction, submitVerificationAction } from '@/features/provider-workspace/actions';

/**
 * The verification centre.
 *
 * ⚠️ ONE CARD PER REQUIREMENT, AND THE STATUS WORDS ARE DERIVED. `verification_status` is five enum
 * values; what a provider needs to read is four sentences — "not started", "in review", "verified",
 * "we need something else". The mapping lives in the feature module so the badge, the card and the
 * history list cannot describe the same row differently.
 *
 * ⚠️ A DOCUMENT REFERENCE, NOT AN UPLOAD. This platform has no storage bucket wired up. The input asks
 * for the provider's own pointer to the evidence — a scan reference, a registry URL, a document
 * number — and the card says so. A file control here would take a passport photograph and drop it on
 * the floor, which is the one outcome that must not happen on a page about proving identity.
 */

function StatusBadge({ record }: { record: VerificationRecord | null }) {
  if (!record) return <span className={BADGE_SLATE}>Not started</span>;
  const copy = VERIFICATION_STATUS_COPY[record.status];
  if (copy.tone === 'teal') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
        <ShieldCheck aria-hidden="true" className="h-3 w-3" />
        {copy.label}
      </span>
    );
  }
  if (copy.tone === 'amber') return <span className={BADGE_AMBER}>{copy.label}</span>;
  return <span className={BADGE_SLATE}>{copy.label}</span>;
}

/**
 * When the claim was decided, or submitted.
 *
 * ⚠️ NO `Date.now()` FALLBACK. A component that reaches for the clock during render is impure — the
 * linter is right to refuse it — and a row with neither a verified nor a submitted timestamp is a row
 * the platform cannot date, which is worth saying rather than papering over with "today".
 */
function formatSubmittedDate(record: VerificationRecord): string {
  const iso = record.verifiedAt ?? record.submittedAt;
  if (!iso) return 'Date not recorded';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Date not recorded';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RequirementCard({
  requirement,
  providerId,
  nextPath,
}: {
  requirement: VerificationRequirement;
  providerId: string;
  nextPath: string;
}) {
  const record = requirement.record;
  // A row with `not_started` is a placeholder rather than a claim: there is nothing to re-submit and
  // no decision to respect, so the first-submission form is the right one to show.
  const canStart = !record || record.status === 'not_started';
  const canResubmit = record?.status === 'rejected' || record?.status === 'expired';

  return (
    <article className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{requirement.label}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">{requirement.note}</p>
        </div>
        <StatusBadge record={record} />
      </div>

      {record ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          {record.jurisdictionCode ? (
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Jurisdiction</dt>
              <dd className="mt-0.5 text-slate-700">{record.jurisdictionCode}</dd>
            </div>
          ) : null}
          {record.referenceLabel ? (
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Reference</dt>
              <dd className="mt-0.5 text-slate-700">{record.referenceLabel}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">
              {record.status === 'verified' ? 'Verified' : 'Submitted'}
            </dt>
            <dd className="mt-0.5 text-slate-700">
              {formatSubmittedDate(record)}
            </dd>
          </div>
        </dl>
      ) : null}

      {/* A rejection is only useful with its reason, which is why the note is not hidden behind a
          disclosure: it is the instruction for the next attempt. */}
      {record?.reviewNote ? (
        <div className="mt-3 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
          <p className="font-bold">What the reviewer said</p>
          <p className="mt-1">{record.reviewNote}</p>
        </div>
      ) : null}

      {record?.documentReference ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>On file for this submission: {record.documentReference}</span>
        </p>
      ) : null}

      {record?.status === 'pending' ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          In review. Nothing is required from you, and submitting a second claim of the same kind would
          replace the one a reviewer is reading — so the platform will not let you.
        </p>
      ) : null}

      {record?.status === 'verified' ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Verified. {requirement.required ? 'This is the requirement that publication depends on. ' : ''}
          It stays on your record even if it later expires; an expired document is shown as expired
          rather than deleted.
        </p>
      ) : null}

      {canStart ? (
        <form action={submitVerificationAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-3">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="kind" value={requirement.kind} />
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor={`${requirement.kind}_jurisdiction`} className={LABEL}>
              Jurisdiction (optional)
            </label>
            <input
              id={`${requirement.kind}_jurisdiction`}
              name="jurisdiction_code"
              placeholder="e.g. NG-LA"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor={`${requirement.kind}_reference`} className={LABEL}>
              Reference you have (optional)
            </label>
            <input
              id={`${requirement.kind}_reference`}
              name="reference_label"
              placeholder="Document number or short note"
              className={FIELD}
            />
          </div>
          <div className="flex items-end">
            <PendingButton
              idle="Submit for review"
              pending="Submitting…"
              icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}

      {canResubmit && record ? (
        <form action={resubmitVerificationAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4">
          <input type="hidden" name="verification_id" value={record.id} />
          <input type="hidden" name="next" value={nextPath} />
          <p className="text-xs leading-relaxed text-slate-600">
            {record.status === 'rejected'
              ? 'Send what the reviewer asked for. This resets the review on this claim rather than filing a second one.'
              : 'This claim has expired. Send the renewed document and it goes back into review.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${requirement.kind}_reference_label`} className={LABEL}>
                Reference label (optional)
              </label>
              <input
                id={`${requirement.kind}_reference_label`}
                name="reference_label"
                defaultValue={record.referenceLabel ?? ''}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor={`${requirement.kind}_document`} className={LABEL}>
                Document reference
              </label>
              <input
                id={`${requirement.kind}_document`}
                name="document_reference"
                required
                maxLength={300}
                placeholder="Scan reference, registry URL or document number"
                aria-describedby={`${requirement.kind}_document-help`}
                className={FIELD}
              />
            </div>
          </div>
          <p id={`${requirement.kind}_document-help`} className="text-xs leading-relaxed text-slate-500">
            Recorded on the claim and readable by the reviewer. Binary upload is not connected yet on
            this platform, so a document reference is what an upload means here — the platform stores no
            file and would otherwise discard one silently.
          </p>
          <div>
            <PendingButton
              idle="Re-submit for review"
              pending="Submitting…"
              icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function VerificationHeader({ centre }: { centre: VerificationCentre }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Verification</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Prove who you are
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          A person reviews each claim by hand. Only identity verification blocks publication; the other
          two are asked for because they win commercial work, not because the platform requires them.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <span className={centre.needsAction ? BADGE_AMBER : BADGE_SLATE}>
          {centre.needsAction ? 'Action needed' : 'Nothing waiting on you'}
        </span>
        <Link href={PROVIDER_PATHS.credentials} className={LINK_ARROW}>
          Licences and insurance
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function RequirementsList({
  centre,
  providerId,
  nextPath,
}: {
  centre: VerificationCentre;
  providerId: string;
  nextPath: string;
}) {
  return (
    <div className="grid gap-4">
      {centre.requirements.map(requirement => (
        <RequirementCard
          key={requirement.kind}
          requirement={requirement}
          providerId={providerId}
          nextPath={nextPath}
        />
      ))}
    </div>
  );
}

/**
 * Everything ever submitted, including the rows the cards above have superseded.
 *
 * ⚠️ THE HISTORY IS NOT DECORATION. A provider who was rejected twice needs to see what they sent
 * each time; without it, "the reviewer said the document was unreadable" is a message about a file
 * they can no longer identify.
 */
export function VerificationHistory({ centre }: { centre: VerificationCentre }) {
  if (centre.history.length === 0) return null;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="verification-history-heading">
      <h2 id="verification-history-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Submission history
      </h2>
      <ul className="mt-3 grid gap-2">
        {centre.history.map(record => (
          <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3 text-xs">
            <span className="font-semibold text-slate-800">
              {VERIFICATION_KIND_LABELS[record.kind] ?? record.kind}
              {record.jurisdictionCode ? ` · ${record.jurisdictionCode}` : ''}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-slate-500">
                {record.submittedAt
                  ? new Date(record.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Unknown date'}
              </span>
              <StatusBadge record={record} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
