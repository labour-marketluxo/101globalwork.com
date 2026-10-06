import { ArrowRight, BadgeCheck, FileText, ScrollText, ShieldAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { PendingButton } from '@/components/provider/ProviderControls';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { formatExpiry } from '@/features/provider-workspace/format';
import { VERIFICATION_STATUS_COPY } from '@/features/provider-workspace/verification';
import {
  CREDENTIAL_TYPES,
  type CredentialRecord,
  type ProviderCredentials,
} from '@/features/provider-workspace/credentials';
import { saveCredentialAction } from '@/features/provider-workspace/actions';
import Link from 'next/link';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * Credentials: licences, certifications and insurance.
 *
 * ⚠️ THE DASHBOARD SHOWS WHAT THE MARKETPLACE SHOWS, AND THE PAGE SAYS SO. Verified credentials are
 * published as a COUNT on the provider's public profile and nothing else — an issuing body, a
 * jurisdiction and a licence number are readable by the owner and by a platform reviewer. A provider
 * typing a licence number into a form deserves to know where it goes before they do it, not after.
 *
 * ⚠️ RENEWAL IS THE SAME WRITE AS ADDITION. "Renew / upload updated document" posts the same values
 * with the credential's id, and the database resets the review: a verified credential whose document
 * has just been replaced is not verified any more, because the thing that was verified is gone.
 */

function CredentialStatus({ credential }: { credential: CredentialRecord }) {
  // An expired date outranks a review status: a licence that ran out last month is not "verified"
  // whatever the platform concluded when it was checked.
  if (credential.isExpired) return <span className={BADGE_AMBER}>Expired</span>;
  const copy = VERIFICATION_STATUS_COPY[credential.status];
  if (copy.tone === 'teal') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
        <BadgeCheck aria-hidden="true" className="h-3 w-3" />
        {copy.label}
      </span>
    );
  }
  if (copy.tone === 'amber') return <span className={BADGE_AMBER}>{copy.label}</span>;
  return <span className={BADGE_SLATE}>{copy.label}</span>;
}

export function CredentialHeader({ data }: { data: ProviderCredentials }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Credentials</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Licences, certifications and insurance
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          What you hold, who issued it, and when it runs out. A verified credential is published on your
          profile as a count only — the issuing body, jurisdiction and reference stay on this page.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <span className={data.verifiedCount > 0 ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_SLATE}>
          {data.verifiedCount} verified
        </span>
        {data.attentionCount > 0 ? (
          <span className={BADGE_AMBER}>{data.attentionCount} needing attention</span>
        ) : null}
        <Link href={PROVIDER_PATHS.verification} className={LINK_ARROW}>
          Identity and business checks
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function RenewForm({ credential, nextPath }: { credential: CredentialRecord; nextPath: string }) {
  return (
    <form action={saveCredentialAction} className="mt-3 grid gap-3 border-t border-solid border-slate-200 pt-3">
      <input type="hidden" name="provider_id" value={credential.providerId} />
      <input type="hidden" name="credential_id" value={credential.id} />
      <input type="hidden" name="credential_type" value={credential.credentialType} />
      <input type="hidden" name="issuing_body" value={credential.issuingBody} />
      <input type="hidden" name="jurisdiction_code" value={credential.jurisdictionCode ?? ''} />
      <input type="hidden" name="next" value={nextPath} />
      {credential.serviceIds.map(id => (
        <input key={id} type="hidden" name="service_entity_ids" value={id} />
      ))}

      <p className="text-xs leading-relaxed text-slate-600">
        Renewing resets the review on this credential. A verified licence whose document has been
        replaced is not verified any more, so the badge goes back to pending until somebody checks the
        new one.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`expires_${credential.id}`} className={LABEL}>
            New expiry date
          </label>
          <input
            id={`expires_${credential.id}`}
            name="expires_at"
            type="date"
            defaultValue={credential.expiresAt ?? ''}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`reference_${credential.id}`} className={LABEL}>
            Reference label
          </label>
          <input
            id={`reference_${credential.id}`}
            name="reference_label"
            defaultValue={credential.referenceLabel ?? ''}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`document_${credential.id}`} className={LABEL}>
            Updated document reference
          </label>
          <input
            id={`document_${credential.id}`}
            name="document_reference"
            defaultValue={credential.documentReference ?? ''}
            maxLength={300}
            placeholder="Scan reference or registry URL"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <PendingButton
          idle="Renew / upload updated document"
          pending="Saving…"
          icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </form>
  );
}

/**
 * `now` is passed in rather than read here: this is a server component rendered per request, and one
 * instant for the whole list means two cards cannot disagree about whether a credential expires today.
 */
export function CredentialList({
  data,
  nextPath,
  now,
}: {
  data: ProviderCredentials;
  nextPath: string;
  now: Date;
}) {
  if (data.credentials.length === 0) {
    return (
      <EmptyState title="No credentials on file">
        Adding one is worth it even before it is verified: it appears on your profile as a verified
        count the moment a reviewer checks it, and it is the detail customers ask about for regulated
        work.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4">
      {data.credentials.map(credential => (
        <article key={credential.id} className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                {credential.typeLabel} · {credential.issuingBody}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {credential.serviceNames.length > 0
                  ? `Covers ${credential.serviceNames.join(', ')}`
                  : 'Covers every service this business offers'}
              </p>
            </div>
            <CredentialStatus credential={credential} />
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Issuing body</dt>
              <dd className="mt-0.5 text-slate-700">{credential.issuingBody}</dd>
            </div>
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Jurisdiction</dt>
              <dd className="mt-0.5 text-slate-700">{credential.jurisdictionCode ?? 'Not stated'}</dd>
            </div>
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Expires</dt>
              <dd
                className={`mt-0.5 ${
                  credential.isExpired || credential.expiresSoon ? 'font-semibold text-amber-800' : 'text-slate-700'
                }`}
              >
                {credential.expiresAt ? formatExpiry(credential.expiresAt, now) : 'No expiry date recorded'}
              </dd>
            </div>
          </dl>

          {credential.reviewNote ? (
            <p className="mt-3 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
              <span className="font-bold">Reviewer note: </span>
              {credential.reviewNote}
            </p>
          ) : null}

          {credential.documentReference ? (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>Document on file: {credential.documentReference}</span>
            </p>
          ) : null}

          {credential.isExpired || credential.expiresSoon || credential.status === 'rejected' ? (
            <RenewForm credential={credential} nextPath={nextPath} />
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function AddCredentialForm({ data, nextPath }: { data: ProviderCredentials; nextPath: string }) {
  return (
    <form action={saveCredentialAction} className={`${CARD} grid gap-4 p-5`} aria-labelledby="add-credential-heading">
      <input type="hidden" name="provider_id" value={data.providerId} />
      <input type="hidden" name="next" value={nextPath} />

      <div>
        <h2 id="add-credential-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <ScrollText aria-hidden="true" className="h-4 w-4 text-primary" />
          Add credential
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          It goes into review as pending. Adding the same type from the same issuer twice is refused —
          renew the one on file instead, so its expiry date is the one that applies.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="credential_type" className={LABEL}>
            Credential type
          </label>
          <select id="credential_type" name="credential_type" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose a type
            </option>
            {CREDENTIAL_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="issuing_body" className={LABEL}>
            Issuing body
          </label>
          <input
            id="issuing_body"
            name="issuing_body"
            required
            minLength={2}
            maxLength={160}
            placeholder="e.g. Council for the Regulation of Engineering"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="jurisdiction_code" className={LABEL}>
            Jurisdiction (optional)
          </label>
          <input id="jurisdiction_code" name="jurisdiction_code" placeholder="e.g. NG-LA" className={FIELD} />
        </div>
        <div>
          <label htmlFor="expires_at" className={LABEL}>
            Expiry date (optional until there is one)
          </label>
          <input id="expires_at" name="expires_at" type="date" className={FIELD} />
        </div>
        <div>
          <label htmlFor="reference_label" className={LABEL}>
            Reference label (optional)
          </label>
          <input id="reference_label" name="reference_label" maxLength={160} className={FIELD} />
        </div>
        <div>
          <label htmlFor="document_reference" className={LABEL}>
            Document reference (optional now, required on a renewal)
          </label>
          <input
            id="document_reference"
            name="document_reference"
            maxLength={300}
            placeholder="Scan reference or registry URL"
            aria-describedby="document_reference-help"
            className={FIELD}
          />
          <p id="document_reference-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Binary upload is not connected on this platform yet, so this is the reference a reviewer
            uses to check the document. It is never published.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="service_entity_ids" className={LABEL}>
          Affected service categories
        </label>
        <select id="service_entity_ids" name="service_entity_ids" multiple size={5} className={FIELD}>
          {data.serviceOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Leave empty if the credential covers everything the business does — that is how most trade
          licences work.
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-solid border-slate-200 pt-4">
        <PendingButton
          idle="Add credential"
          pending="Saving…"
          icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
          Stored privately, read by you and by a reviewer.
        </span>
      </div>
    </form>
  );
}
