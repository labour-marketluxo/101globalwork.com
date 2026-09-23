import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import {
  DecisionHistory,
  ExternalProfileLink,
  ServiceImpactList,
  StatusBadge,
} from '@/components/admin/TrustSections';
import { CREDENTIAL_DECISION_COPY, adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getCredentialCase } from '@/features/admin/trust';
import { decideCredentialAction } from '@/features/admin/trust-actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Credential review', robots: { index: false, follow: false } };

/**
 * /admin/trust/credentials/[credentialId] — licence and certification validation.
 *
 * ⚠️ THE IMPACT IS SHOWN BEFORE THE DECISION, NOT AFTER IT. The service list is computed twice over: which
 * categories this credential names, and whether a verified credential would still cover each of them once
 * this one is gone. An operator revoking a licence should see "Plumbing loses its last verified document"
 * while they can still change their mind.
 *
 * ⚠️ AND THE LIMIT IS ON THE PAGE IN PLAIN WORDS. Matching reads the provider's own service list, not their
 * credentials, so this decision changes the platform's record of coverage and recomputes readiness — it does
 * not withdraw a category from matching. That is a gap worth closing one day; until then the console says so
 * rather than implying a consequence the platform does not deliver.
 */
export default async function CredentialReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ credentialId: string }>;
  searchParams: Promise<{ decided?: string; failed?: string; step_up?: string }>;
}) {
  const [{ credentialId }, query] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  const [context, review, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getCredentialCase(credentialId),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (!review.allowed) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>Credential review is behind the trust capability. Nothing has changed.</p>
        </section>
      </div>
    );
  }
  if (review.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>That credential could not be loaded</h1>
          <p>Nothing has changed. Reload the page to try again.</p>
        </section>
      </div>
    );
  }
  if (!review.found) notFound();

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = Boolean(hasFactor && levels?.currentLevel !== 'aal2');
  const canDecide = Boolean(context?.has('platform.trust.verify') || context?.has('platform.trust.moderate') || context?.has('platform.admin.manage'));
  const failure = adminFailureCopy(query.failed);
  const next = `/admin/trust/credentials/${credentialId}`;
  const decided = query.decided
    ? CREDENTIAL_DECISION_COPY[query.decided as keyof typeof CREDENTIAL_DECISION_COPY]
    : undefined;
  const expired = review.credential.expiresAt !== null && new Date(review.credential.expiresAt) < new Date();
  const disabledReason = stepUpPending
    ? 'Confirm it is you on this session first.'
    : 'Your role cannot decide credentials.';
  const alreadyVerified = review.credential.status === 'verified';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust · credential review</p>
          <h1>{review.credential.issuingBody || 'Credential'} · {review.credential.credentialType.replaceAll('_', ' ')}</h1>
          <p>
            {review.provider.displayName}
            {review.credential.jurisdictionCode ? ` · ${review.credential.jurisdictionCode}` : ' · jurisdiction not supplied'}
            {' · submitted '}
            {review.credential.submittedAt ? new Date(review.credential.submittedAt).toLocaleString('en-GB') : 'at an unrecorded time'}
          </p>
        </div>
        <div className="admin-row-actions">
          <StatusBadge status={review.credential.status} kind="credential" />
          {expired ? <span className="admin-severity" data-severity="high">Expired</span> : null}
          <Link className="secondary-button" href="/admin/trust/credentials">Back to the queue</Link>
        </div>
      </header>

      {failure ? (
        <p className="notice" role="alert">
          <strong>That decision was not recorded.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {query.step_up === '1' ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Make the decision again — nothing was saved by
          the attempt that was refused.
        </p>
      ) : null}

      {decided ? (
        <p className="notice" role="status">
          Recorded: <strong>{decided}</strong>. The provider&apos;s onboarding progress and readiness were
          recomputed, and the decision is in the history below and in the audit stream.
        </p>
      ) : null}

      {stepUpPending ? (
        <p className="notice" role="alert">
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          <strong> This session has not passed your second factor.</strong> Deciding a credential needs one.{' '}
          <Link href={`/auth/challenge?redirect=${encodeURIComponent(`${next}?step_up=1`)}`}>Confirm it is you</Link>{' '}
          and come back.
        </p>
      ) : !hasFactor && canDecide ? (
        <p className="notice" role="status">
          Your account has no authenticator enrolled, so a credential cannot be decided from this session.
          Enrol one at <Link href={`/account/security?next=${encodeURIComponent(next)}`}>account security</Link>.
        </p>
      ) : null}

      <section className="admin-section two-column-admin">
        <div className="admin-panel" aria-labelledby="issuer-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="issuer-heading">Issuer and scope</h2>
              <p>The authority that issued it, the jurisdiction it applies to and the document on file.</p>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Issuing body</dt>
              <dd>{review.credential.issuingBody}</dd>
            </div>
            <div>
              <dt>Jurisdiction</dt>
              <dd>
                {review.credential.jurisdictionCode ?? 'Not supplied'}
                {review.provider.marketCode ? ` · provider market ${review.provider.marketCode}` : ''}
              </dd>
            </div>
            <div>
              <dt>Reference the provider gave</dt>
              <dd>{review.credential.referenceLabel ?? 'None recorded'}</dd>
            </div>
            <div>
              <dt>Document reference on file</dt>
              <dd>{review.credential.documentReference ?? 'Nothing on file for this credential'}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>
                {review.credential.expiresAt
                  ? `${new Date(review.credential.expiresAt).toLocaleDateString('en-GB')}${expired ? ' · already past' : ''}`
                  : 'No expiry recorded'}
              </dd>
            </div>
            <div>
              <dt>Reviewer&apos;s last note</dt>
              <dd>{review.credential.reviewNote ?? 'No note recorded'}</dd>
            </div>
          </dl>
          <p className="admin-incident-meta">
            As with a verification, this platform holds the reference the provider typed and makes no call to
            the issuing authority. Confirming a licence with the issuer is work done outside the console, and
            the reason code plus your note is how that work is recorded.
          </p>
        </div>

        <div className="admin-panel" aria-labelledby="owner-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="owner-heading">The provider</h2>
              <p>Who holds it, and where the record sits.</p>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Provider</dt>
              <dd>
                {review.provider.displayName} · {review.provider.status.replaceAll('_', ' ')}
                {' · '}
                {review.provider.isPublic ? 'published' : 'not published'}
              </dd>
            </div>
            <div>
              <dt>Market</dt>
              <dd>
                {review.provider.marketName ?? 'No market recorded'}
                {review.provider.marketCode ? ` (${review.provider.marketCode})` : ''}
              </dd>
            </div>
            <div>
              <dt>Owning account</dt>
              <dd>{review.owner.displayName} · {review.owner.accountStatus.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Contact on file</dt>
              <dd>{review.owner.contactMasked ?? 'No email address recorded'}</dd>
            </div>
          </dl>
          <div className="admin-row-actions">
            {review.owner.accountId ? (
              <Link className="text-button" href={`/admin/accounts/${review.owner.accountId}`}>
                Open the account <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            <Link className="text-button" href={`/admin/providers?q=${encodeURIComponent(review.provider.displayName)}`}>
              Open in supply
            </Link>
            <ExternalProfileLink slug={review.provider.publicSlug} />
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="impact-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="impact-heading">What this covers today</h2>
            <p>The service categories this credential is evidence for, and what else covers them.</p>
          </div>
          <span>{review.services.length} categor{review.services.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className="admin-panel">
          <ServiceImpactList services={review.services} credentialStatus={review.credential.status} />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="decide-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="decide-heading">Decide this credential</h2>
            <p>
              Every decision needs a reason code, a note and the policy version. An expiry is optional and is
              written onto the credential record.
            </p>
          </div>
        </div>

        <div className="admin-incident-grid">
          <div className="admin-incident">
            <h3>Verify</h3>
            <p>Accepts the credential as evidence and recomputes the provider&apos;s readiness and progress.</p>
            <form action={decideCredentialAction} className="admin-row-actions">
              <input type="hidden" name="credential_id" value={review.credential.id} />
              <input type="hidden" name="decision" value="verified" />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel={alreadyVerified ? 'Re-verify credential' : 'Verify credential'}
                triggerClassName="admin-confirm-amber"
                title={`Verify the ${review.credential.credentialType.replaceAll('_', ' ')} for ${review.provider.displayName}`}
                description="This records that a person checked the credential. The platform makes no call to the issuing body, so the note is the only evidence of how it was confirmed."
                confirmLabel="Record verification"
                confirmClassName="admin-confirm-amber"
                reasons={reasons.credential_decision}
                noteLabel="How you confirmed it"
                tone="standard"
                disabled={!canDecide || stepUpPending}
                disabledReason={disabledReason}
                extraFields={
                  <>
                    <label className="admin-field-label" htmlFor="verify-policy">Policy version</label>
                    <input id="verify-policy" name="policy_version" defaultValue={review.policyVersions.credential} maxLength={60} className="admin-field" />
                    <label className="admin-field-label" htmlFor="verify-expiry">Expires on (optional)</label>
                    <input id="verify-expiry" name="expires_at" type="date" className="admin-field" />
                  </>
                }
              />
            </form>
          </div>

          <div className="admin-incident">
            <h3>Reject</h3>
            <p>
              Refuses the credential. The provider reads your note on their credentials screen and can upload a
              corrected document, which is a new decision rather than an edit of this one.
            </p>
            <form action={decideCredentialAction} className="admin-row-actions">
              <input type="hidden" name="credential_id" value={review.credential.id} />
              <input type="hidden" name="decision" value="rejected" />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel="Reject credential"
                triggerClassName="admin-trigger-danger"
                title={`Reject the credential for ${review.provider.displayName}`}
                description="The provider sees this decision and your note. Say what would make the next submission acceptable."
                confirmLabel="Record rejection"
                confirmClassName="admin-confirm-danger"
                reasons={reasons.credential_decision}
                noteLabel="Why it is refused"
                disabled={!canDecide || stepUpPending}
                disabledReason={disabledReason}
                extraFields={
                  <>
                    <label className="admin-field-label" htmlFor="reject-cred-policy">Policy version</label>
                    <input id="reject-cred-policy" name="policy_version" defaultValue={review.policyVersions.credential} maxLength={60} className="admin-field" />
                  </>
                }
              />
            </form>
          </div>

          <div className="admin-incident">
            <h3>Revoke an accepted credential</h3>
            <p>
              Withdraws a credential the platform had already accepted — an issuer withdrawal, a lapse, or a
              decision that it should not have been accepted. The provider sees a rejected credential with your
              note; the history records that it was revoked rather than refused, which is the difference anybody
              asking later cares about.
            </p>
            <form action={decideCredentialAction} className="admin-row-actions">
              <input type="hidden" name="credential_id" value={review.credential.id} />
              <input type="hidden" name="decision" value="revoked" />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel="Revoke credential"
                triggerClassName="admin-trigger-danger"
                title={`Revoke the credential for ${review.provider.displayName}`}
                description="Revoking is recorded distinctly from rejecting. The covered categories stay on the provider's service list — see the coverage note above — and their readiness is recomputed."
                confirmLabel="Record revocation"
                confirmClassName="admin-confirm-danger"
                reasons={reasons.credential_decision}
                noteLabel="Why it is being withdrawn"
                disabled={!canDecide || stepUpPending}
                disabledReason={disabledReason}
                extraFields={
                  <>
                    <label className="admin-field-label" htmlFor="revoke-policy">Policy version</label>
                    <input id="revoke-policy" name="policy_version" defaultValue={review.policyVersions.credential} maxLength={60} className="admin-field" />
                  </>
                }
              />
            </form>
          </div>

          <div className="admin-incident">
            <h3>Request information</h3>
            <p>
              Asks the provider for something the platform cannot verify by itself — a clearer document, the
              right jurisdiction, a renewal certificate. The credential returns to awaiting review.
            </p>
            <form action={decideCredentialAction} className="admin-row-actions">
              <input type="hidden" name="credential_id" value={review.credential.id} />
              <input type="hidden" name="decision" value="information_requested" />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel="Request information"
                triggerClassName="admin-trigger-quiet"
                title={`Request information about the credential for ${review.provider.displayName}`}
                description="The credential goes back to awaiting review with your note on it. The provider sees the note on their credentials screen."
                confirmLabel="Record the request"
                confirmClassName="admin-confirm-amber"
                reasons={reasons.credential_decision}
                noteLabel="Exactly what is needed"
                tone="standard"
                disabled={!canDecide || stepUpPending}
                disabledReason={disabledReason}
                extraFields={
                  <>
                    <label className="admin-field-label" htmlFor="request-cred-policy">Policy version</label>
                    <input id="request-cred-policy" name="policy_version" defaultValue={review.policyVersions.credential} maxLength={60} className="admin-field" />
                  </>
                }
              />
            </form>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Decision history</h2>
            <p>Append-only, with the reason code and the policy version each decision was made under.</p>
          </div>
          <span>{review.decisions.length}</span>
        </div>
        <DecisionHistory decisions={review.decisions} kind="credential" />
      </section>
    </div>
  );
}
