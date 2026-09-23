import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import {
  AttemptList,
  DecisionHistory,
  DocumentReference,
  ExternalProfileLink,
  SignalList,
  StatusBadge,
} from '@/components/admin/TrustSections';
import { adminFailureCopy, VERIFICATION_DECISION_COPY } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getVerificationCase } from '@/features/admin/trust';
import { decideVerificationAction } from '@/features/admin/trust-actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Verification review', robots: { index: false, follow: false } };

/**
 * /admin/trust/verifications/[caseId] — the evidence inspection hub for one submission.
 *
 * ⚠️ WHAT IS ON THIS PAGE IS WHAT THE PLATFORM ACTUALLY HAS. It has the claim (kind, jurisdiction, reference
 * label), the document REFERENCE the provider typed, the audit history of every submission and decision, and
 * a set of checks that compare rows. It does not have an uploaded identity document with an image viewer,
 * because no storage bucket for one exists, and it does not have a registry integration. The page says both
 * things where a reader would otherwise assume them: pretending a reference number is a scanned passport is
 * the kind of quiet claim that gets somebody verified on the strength of a string.
 *
 * ⚠️ THE DECISION CONTROLS ARE FOUR FORMS, NOT ONE WITH A MODE SWITCH. Approve and reject carry an optional
 * expiry; a request for more proof carries neither; an escalation carries an assignee. Four forms say that in
 * the markup, so a browser without scripting cannot post "escalated" with no destination.
 */
export default async function VerificationReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ decided?: string; failed?: string; step_up?: string }>;
}) {
  const [{ caseId }, query] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  const [context, review, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getVerificationCase(caseId),
    getReasonCodes(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const reviewers = review.allowed ? await getReviewers() : [];

  if (!review.allowed) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>
            Verification review is behind the trust capability. Nothing has changed, and nothing here is broken
            — ask a platform owner or a trust lead if you need it.
          </p>
        </section>
      </div>
    );
  }
  if (review.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>That submission could not be loaded</h1>
          <p>Nothing has changed. Reload the page to try again.</p>
        </section>
      </div>
    );
  }
  if (!review.found) notFound();

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = hasFactor && levels?.currentLevel !== 'aal2';
  const canDecide = Boolean(context?.has('platform.trust.verify') || context?.has('platform.trust.moderate') || context?.has('platform.admin.manage'));
  const failure = adminFailureCopy(query.failed);
  const next = `/admin/trust/verifications/${caseId}`;
  const decided = query.decided ? VERIFICATION_DECISION_COPY[query.decided as keyof typeof VERIFICATION_DECISION_COPY] : undefined;
  const pending = review.verification.status === 'pending';
  const disabledReason = stepUpPending
    ? 'Confirm it is you on this session first.'
    : 'Your role cannot decide verifications.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust · verification review</p>
          <h1>{review.provider.displayName}</h1>
          <p>
            {review.verification.kind.replaceAll('_', ' ')} verification
            {review.verification.jurisdictionCode ? ` · ${review.verification.jurisdictionCode}` : ' · jurisdiction not supplied'}
            {' · submitted '}
            {review.verification.createdAt ? new Date(review.verification.createdAt).toLocaleString('en-GB') : 'at an unrecorded time'}
          </p>
        </div>
        <div className="admin-row-actions">
          <StatusBadge status={review.verification.status} kind="verification" />
          <Link className="secondary-button" href="/admin/trust/verifications">Back to the queue</Link>
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
          Recorded: <strong>{decided}</strong>. The decision is in the case history below and in the audit
          stream; it cannot be edited, and a later decision is another row rather than a correction of this one.
        </p>
      ) : null}

      {stepUpPending ? (
        <p className="notice" role="alert">
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          <strong> This session has not passed your second factor.</strong> Deciding a verification needs one.{' '}
          <Link href={`/auth/challenge?redirect=${encodeURIComponent(`${next}?step_up=1`)}`}>Confirm it is you</Link>{' '}
          and come back.
        </p>
      ) : !hasFactor && canDecide ? (
        <p className="notice" role="status">
          Your account has no authenticator enrolled, so a verification cannot be decided from this session. A
          second factor is required for this class of write — enrol one at{' '}
          <Link href={`/account/security?next=${encodeURIComponent(next)}`}>account security</Link> if deciding
          verifications is part of your role.
        </p>
      ) : null}

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>The claim</h2>
              <p>What the provider submitted, and what the platform holds for it.</p>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Kind</dt>
              <dd>{review.verification.kind.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Jurisdiction</dt>
              <dd>{review.verification.jurisdictionCode ?? 'Not supplied'}</dd>
            </div>
            <div>
              <dt>Reference the provider gave</dt>
              <dd>{review.verification.referenceLabel ?? 'None recorded'}</dd>
            </div>
            <DocumentReference
              label="Document reference on file"
              reference={review.verification.documentReference}
              attachedAt={review.verification.documentAttachedAt}
            />
            <div>
              <dt>Expiry on the record</dt>
              <dd>
                {review.verification.expiresAt
                  ? new Date(review.verification.expiresAt).toLocaleDateString('en-GB')
                  : 'No expiry set'}
              </dd>
            </div>
            <div>
              <dt>Reviewed before</dt>
              <dd>{review.verification.reviewedAt ? new Date(review.verification.reviewedAt).toLocaleString('en-GB') : 'Not yet'}</dd>
            </div>
          </dl>
          <p className="admin-incident-meta">
            The platform stores the reference the provider typed and the note a reviewer left. It holds no
            scanned document, because no private store for one exists, and it makes no registry or identity
            call — a check against a register is work somebody does outside this console and records here.
          </p>
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Who and where</h2>
              <p>The provider behind the claim, and the account that owns it.</p>
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
              <dd>
                {review.owner.displayName} · {review.owner.accountStatus.replaceAll('_', ' ')}
              </dd>
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
          <p className="admin-incident-meta">
            The account page is where the raw contact address can be revealed, against a reason that is written
            to the audit log. It is masked here, and stays masked.
          </p>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="signals-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="signals-heading">Checks that fired</h2>
            <p>Comparisons the platform ran over its own rows for this submission.</p>
          </div>
          <span>{review.signals.length} fired</span>
        </div>
        <div className="admin-panel">
          <SignalList signals={review.signals} />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="decision-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="decision-heading">{pending ? 'Decide this submission' : 'This submission is settled'}</h2>
            <p>
              {pending
                ? 'Every decision needs a reason code, a note and the policy version it was made under. The expiry is optional and is written onto the verification record.'
                : 'A settled submission cannot be re-decided from here. A later disagreement is a new submission from the provider, which keeps this decision in the history.'}
            </p>
          </div>
        </div>

        {!pending ? (
          <p className="empty-admin">
            Status: {review.verification.status.replaceAll('_', ' ')}. The history below is the record of how it
            got here.
          </p>
        ) : (
          <div className="admin-incident-grid">
            <div className="admin-incident">
              <h3>Approve</h3>
              <p>
                Records the claim as verified, optionally sets its expiry, and recomputes the provider&apos;s
                onboarding progress and readiness.
              </p>
              <form action={decideVerificationAction} className="admin-row-actions">
                <input type="hidden" name="verification_id" value={review.verification.id} />
                <input type="hidden" name="decision" value="verified" />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Approve verification"
                  triggerClassName="admin-confirm-amber"
                  title={`Approve the ${review.verification.kind.replaceAll('_', ' ')} claim for ${review.provider.displayName}`}
                  description="This is a record that a person checked the claim. The platform cannot check it for you, and nothing here does."
                  confirmLabel="Record approval"
                  confirmClassName="admin-confirm-amber"
                  reasons={reasons.verification_decision}
                  noteLabel="What you checked"
                  tone="standard"
                  disabled={!canDecide || stepUpPending}
                  disabledReason={disabledReason}
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="approve-policy">Policy version</label>
                      <input id="approve-policy" name="policy_version" defaultValue={review.policyVersions.verification} maxLength={60} className="admin-field" />
                      <label className="admin-field-label" htmlFor="approve-expiry">Expires on (optional)</label>
                      <input id="approve-expiry" name="expires_at" type="date" className="admin-field" />
                    </>
                  }
                />
              </form>
            </div>

            <div className="admin-incident">
              <h3>Reject</h3>
              <p>
                Records the claim as refused. The note is shown to the provider, who may submit again with
                better evidence — that is the only path back, and it keeps this decision visible.
              </p>
              <form action={decideVerificationAction} className="admin-row-actions">
                <input type="hidden" name="verification_id" value={review.verification.id} />
                <input type="hidden" name="decision" value="rejected" />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Reject verification"
                  triggerClassName="admin-trigger-danger"
                  title={`Reject the claim for ${review.provider.displayName}`}
                  description="The provider reads your note in their own workspace. Write what would have to change for the next attempt."
                  confirmLabel="Record rejection"
                  confirmClassName="admin-confirm-danger"
                  reasons={reasons.verification_decision}
                  noteLabel="Why it is refused, and what would change it"
                  disabled={!canDecide || stepUpPending}
                  disabledReason={disabledReason}
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="reject-policy">Policy version</label>
                      <input id="reject-policy" name="policy_version" defaultValue={review.policyVersions.verification} maxLength={60} className="admin-field" />
                    </>
                  }
                />
              </form>
            </div>

            <div className="admin-incident">
              <h3>Request additional proof</h3>
              <p>
                Keeps the submission pending and writes your note where the provider will see it. Nothing is
                sent by email: the provider&apos;s verification screen is the channel.
              </p>
              <form action={decideVerificationAction} className="admin-row-actions">
                <input type="hidden" name="verification_id" value={review.verification.id} />
                <input type="hidden" name="decision" value="information_requested" />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Request more proof"
                  triggerClassName="admin-trigger-quiet"
                  title={`Request more proof from ${review.provider.displayName}`}
                  description="The submission stays pending. Your note appears on the provider's verification screen, and this request is recorded in the case history so the next reviewer can see it."
                  confirmLabel="Record the request"
                  confirmClassName="admin-confirm-amber"
                  reasons={reasons.verification_decision}
                  noteLabel="Exactly what is needed"
                  tone="standard"
                  disabled={!canDecide || stepUpPending}
                  disabledReason={disabledReason}
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="request-policy">Policy version</label>
                      <input id="request-policy" name="policy_version" defaultValue={review.policyVersions.verification} maxLength={60} className="admin-field" />
                    </>
                  }
                />
              </form>
            </div>

            <div className="admin-incident">
              <h3>Escalate to a trust lead</h3>
              <p>
                Keeps the submission pending and puts it in somebody else&apos;s hands, with your note. The
                provider is not told; an escalation is internal.
              </p>
              <form action={decideVerificationAction} className="admin-row-actions">
                <input type="hidden" name="verification_id" value={review.verification.id} />
                <input type="hidden" name="decision" value="escalated" />
                <input type="hidden" name="next" value={next} />
                <ReasonCodeControl
                  triggerLabel="Escalate"
                  triggerClassName="admin-trigger-quiet"
                  title="Escalate this verification to a trust lead"
                  description="The escalation is recorded with the reason code and the person it went to. The submission stays pending, and the provider is not notified."
                  confirmLabel="Record the escalation"
                  confirmClassName="admin-confirm-amber"
                  reasons={reasons.verification_decision}
                  noteLabel="What the trust lead needs to know"
                  tone="standard"
                  disabled={!canDecide || stepUpPending}
                  disabledReason={disabledReason}
                  extraFields={
                    <>
                      <label className="admin-field-label" htmlFor="escalate-policy">Policy version</label>
                      <input id="escalate-policy" name="policy_version" defaultValue={review.policyVersions.verification} maxLength={60} className="admin-field" />
                      <label className="admin-field-label" htmlFor="escalate-assignee">Send it to</label>
                      <select id="escalate-assignee" name="assignee_account_id" required defaultValue="" className="admin-field">
                        <option value="" disabled>Choose a trust reviewer</option>
                        {reviewers.map(reviewer => (
                          <option key={reviewer.accountId} value={reviewer.accountId}>
                            {reviewer.name} · {reviewer.role}
                          </option>
                        ))}
                      </select>
                    </>
                  }
                />
              </form>
            </div>
          </div>
        )}
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Decision history</h2>
              <p>Append-only. A correction is a further decision, not an edit of this one.</p>
            </div>
            <span>{review.decisions.length}</span>
          </div>
          <DecisionHistory decisions={review.decisions} kind="verification" />
        </div>
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Every attempt</h2>
              <p>
                From the audit stream, because a re-submission replaces the submission row and would otherwise
                erase the fact that it happened.
              </p>
            </div>
          </div>
          <AttemptList attempts={review.attempts} />
        </div>
      </section>
    </div>
  );
}

/**
 * The people an escalation can go to, read once per render.
 *
 * ⚠️ IT IS A SEPARATE READ BECAUSE THE ESCALATION SELECT IS THE ONLY PLACE THAT NEEDS IT. Folding it into the
 * case read would put a directory of administrators into a payload that is otherwise about one submission.
 */
async function getReviewers(): Promise<{ accountId: string; name: string; role: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('admin_trust_reviewers_command');
  const raw = (data ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw.reviewers) ? raw.reviewers : [];
  return list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map(entry => ({
      accountId: typeof entry.account_id === 'string' ? entry.account_id : '',
      name: typeof entry.name === 'string' ? entry.name : 'Administrator',
      role: typeof entry.role === 'string' ? entry.role : 'Trust',
    }))
    .filter(entry => entry.accountId !== '');
}
