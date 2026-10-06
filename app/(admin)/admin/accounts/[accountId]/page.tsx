import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ShieldAlert } from '@/components/ui/icons';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import RevealContactControl from '@/components/admin/RevealContactControl';
import {
  AccessDenied,
  RawIdentifier,
  RestrictionBadge,
  StandingBadge,
  formatWhen,
} from '@/components/admin/AdminSections';
import { ACCOUNT_STANDINGS, STANDING_COPY, adminFailureCopy } from '@/features/admin/copy';
import { getAccountDetail } from '@/features/admin/accounts';
import { changeAccountStandingAction, revokeAccountSessionsAction } from '@/features/admin/actions';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { describeDevice } from '@/features/settings/device-label';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Account', robots: { index: false, follow: false } };

/**
 * /admin/accounts/[accountId] — the deep investigation hub.
 *
 * ⚠️ WHAT IS ON THE PAGE IS MASKED, AND THE TWO RAW READS ARE SEPARATE ON PURPOSE.
 *   · The account ID is in the URL and in a `<details>`: an operator already has it, so revealing it is
 *     not a disclosure and is not audited.
 *   · The contact address is not in the payload at all, and the control that returns it writes an audit
 *     row naming the operator, the reason code and their note before it answers.
 *   A page that showed both without distinction would make the audit trail meaningless noise.
 *
 * ⚠️ CONSEQUENTIAL ACTIONS ARE GATED ON A SECOND FACTOR BEFORE THEY ARE ATTEMPTED. The database refuses
 * them without `aal2`; this page reads the session's assurance level and, when the account has a factor but
 * this session has not passed it, links to the challenge instead of offering a control that would fail.
 * When the account has no factor at all it says so and points at enrolment, because there is no challenge
 * to send them to.
 */
export default async function AdminAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ changed?: string; sessions?: string; failed?: string; step_up?: string }>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);

  const [context, detail, reasons, assurance] = await Promise.all([
    getAdminContext(),
    getAccountDetail(accountId),
    getReasonCodes(),
    (async () => {
      const supabase = await createSupabaseServerClient();
      return supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    })(),
  ]);

  if (!detail.allowed) {
    return (
      <div className="admin-page">
        <AccessDenied what="Account investigation" />
      </div>
    );
  }
  if (detail.unavailable) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>That account could not be loaded</h1>
          <p>Nothing has changed. Reload the page to try again.</p>
        </section>
      </div>
    );
  }
  if (!detail.found) notFound();

  const levels = assurance.data;
  const hasFactor = levels?.nextLevel === 'aal2';
  const stepUpPending = hasFactor && levels?.currentLevel !== 'aal2';
  // ⚠️ EXACT CAPABILITIES, NOT PREFIXES: 'platform.support' would also match nothing here, but
  // 'platform.admin' would match 'platform.admin.view_audit' and show an auditor the suspend control.
  const canIntervene = Boolean(context?.has('platform.support.intervene') || context?.has('platform.admin.manage'));
  const canReveal = Boolean(context?.has('platform.support.read') || context?.has('platform.admin.manage'));
  const failure = adminFailureCopy(query.failed);
  const endedSessions = query.sessions === undefined ? null : Number.parseInt(query.sessions, 10);
  const next = `/admin/accounts/${accountId}`;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Accounts · investigation</p>
          <h1>{detail.displayName}</h1>
          <p>
            Authentication state, roles and scopes, devices, organisations and verification history for one
            account. Contact details are masked; revealing them is a separate, audited act.
          </p>
        </div>
        <Link className="secondary-button" href="/admin/accounts">
          Back to accounts
        </Link>
      </header>

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not save.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {query.step_up === '1' ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Try the action again — nothing was saved by
          the attempt that was refused.
        </p>
      ) : null}

      {query.changed ? (
        <p className="notice" role="status">
          Standing changed to <strong>{STANDING_COPY[query.changed as keyof typeof STANDING_COPY]?.label ?? query.changed}</strong>.
          {query.changed === 'active'
            ? ' The account can act for itself again on its next request.'
            : ' Every session on the account was ended, and the database will refuse its requests from now on.'}
        </p>
      ) : null}

      {endedSessions !== null && Number.isFinite(endedSessions) ? (
        <p className="notice" role="status">
          {endedSessions > 0
            ? `Ended ${endedSessions} session${endedSessions === 1 ? '' : 's'}. A device holding an access token already issued keeps working until that token expires — within the hour — but it cannot refresh, and the session row is gone.`
            : 'No session was active on that account, so nothing changed.'}
        </p>
      ) : null}

      {stepUpPending ? (
        <p className="notice" role="alert">
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          <strong> This session has not passed your second factor.</strong> Changing a standing or ending
          another account&apos;s sessions needs one.{' '}
          <Link href={`/auth/challenge?redirect=${encodeURIComponent(`${next}?step_up=1`)}`}>Confirm it is you</Link>{' '}
          and come back.
        </p>
      ) : !hasFactor && canIntervene ? (
        <p className="notice" role="status">
          Your account has no authenticator enrolled, so the two consequential actions on this page cannot be
          performed under your current session. A second factor is voluntary inside the platform and required
          for these writes — enrol one at{' '}
          <Link href={`/account/security?next=${encodeURIComponent(next)}`}>account security</Link> if your role
          needs to suspend accounts or end their sessions.
        </p>
      ) : null}

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Account</h2>
              <p>Standing, contact state and activity. The raw contact value is not on this page.</p>
            </div>
          </div>
          <p className="admin-incident-meta">
            <StandingBadge standing={detail.accountStatus} />
            {detail.isPlatformOwner ? <span className="admin-severity" data-severity="high">Platform owner</span> : null}
            {detail.isSelf ? <span className="admin-severity" data-severity="high">This is your account</span> : null}
          </p>
          <dl className="admin-facts">
            <div>
              <dt>Contact on file</dt>
              <dd>
                {detail.contactMasked
                  ? `${detail.contactKind === 'email' ? 'Email' : 'Phone'}: ${detail.contactMasked}`
                  : 'No email or phone recorded'}
              </dd>
            </div>
            <div>
              <dt>Confirmation</dt>
              <dd>{detail.contactConfirmed ? 'Confirmed' : 'Not confirmed'}</dd>
            </div>
            <div>
              <dt>Last sign-in</dt>
              <dd>{formatWhen(detail.lastSignInAt, 'never signed in')}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatWhen(detail.createdAt, 'not recorded')}</dd>
            </div>
          </dl>

          <RawIdentifier label="Raw account ID (audited acts only)" value={detail.accountId} />

          <RevealContactControl
            accountId={detail.accountId}
            reasons={reasons.contact_reveal}
            canReveal={canReveal}
            disabledReason="Your role does not cover support reads."
          />
        </div>

        <div className="admin-panel" id="recovery">
          <div className="admin-section-heading">
            <div>
              <h2>Standing</h2>
              <p>
                Suspension is enforced by the database on the account&apos;s next request, not at its next
                sign-in: every read and write resolves the caller through <code>status = &apos;active&apos;</code>.
              </p>
            </div>
          </div>

          {detail.isPlatformOwner || detail.isSelf ? (
            <p className="hint">
              {detail.isSelf
                ? 'This is your own account, so its standing cannot be changed from here.'
                : 'The platform owner account cannot be suspended or closed — the platform would be left without an owner.'}
            </p>
          ) : (
            <form action={changeAccountStandingAction} className="admin-row-actions">
              <input type="hidden" name="account_id" value={detail.accountId} />
              <input type="hidden" name="next" value={next} />
              <ReasonCodeControl
                triggerLabel="Change standing"
                triggerClassName="admin-trigger-danger"
                title={`Change the standing of ${detail.displayName}`}
                description="Suspending an account ends its sessions and leaves the database refusing it on every request. Reactivating it restores that on the next request; it does not restore any session that was ended."
                confirmLabel="Change standing"
                confirmClassName="admin-confirm-danger"
                reasons={reasons.account_standing}
                noteLabel="Why this standing is right"
                disabled={!canIntervene || stepUpPending}
                disabledReason={
                  stepUpPending
                    ? 'Confirm it is you on this session first.'
                    : 'Your administrator role does not cover account intervention.'
                }
                extraFields={
                  <>
                    <label className="admin-field-label" htmlFor="standing">
                      New standing
                    </label>
                    <select id="standing" name="status" required defaultValue="" className="admin-field">
                      <option value="" disabled>
                        Choose a standing
                      </option>
                      {ACCOUNT_STANDINGS.filter(value => value !== detail.accountStatus).map(value => (
                        <option key={value} value={value}>
                          {STANDING_COPY[value].label}
                        </option>
                      ))}
                    </select>
                  </>
                }
              />
            </form>
          )}

          <div className="admin-section-heading" style={{ marginTop: 22 }}>
            <div>
              <h2>Devices</h2>
              <p>
                Active sessions only — a session whose refresh tokens are all revoked cannot come back and is
                not listed. Addresses are reduced to their network.
              </p>
            </div>
            <span>{detail.sessions.length}</span>
          </div>

          {detail.sessions.length === 0 ? (
            <p className="empty-admin">No device is currently signed in to this account.</p>
          ) : (
            <ul className="admin-session-list">
              {detail.sessions.map(session => {
                const device = describeDevice(session.userAgent);
                return (
                  <li key={session.sessionRef}>
                    <strong>{device.label}</strong>
                    <span>
                      {session.ipMasked ?? 'address not recorded'} · {session.aal === 'aal2' ? 'second factor' : 'password'}
                      {' · session ref '}
                      {session.sessionRef}
                    </span>
                    <small>
                      Started {formatWhen(session.createdAt, 'not recorded')} · last refreshed{' '}
                      {formatWhen(session.refreshedAt, 'never')}
                    </small>
                  </li>
                );
              })}
            </ul>
          )}

          <form action={revokeAccountSessionsAction} className="admin-row-actions" style={{ marginTop: 14 }}>
            <input type="hidden" name="account_id" value={detail.accountId} />
            <input type="hidden" name="next" value={next} />
            <ReasonCodeControl
              triggerLabel="End every session"
              triggerClassName="admin-trigger-danger"
              title={`End every session on ${detail.displayName}`}
              description="The session rows are deleted, which is what actually stops this GoTrue version refreshing a token — marking them revoked was measured not to. The account holder will have to sign in again on each device."
              confirmLabel="End every session"
              confirmClassName="admin-confirm-danger"
              reasons={reasons.session_revocation}
              noteLabel="Why these sessions should end"
              disabled={!canIntervene || stepUpPending || detail.isSelf}
              disabledReason={
                detail.isSelf
                  ? 'Use the security settings page to end your own sessions.'
                  : stepUpPending
                    ? 'Confirm it is you on this session first.'
                    : 'Your administrator role does not cover account intervention.'
              }
            />
          </form>
        </div>
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Platform roles and scopes</h2>
              <p>Administrator authority is separate from marketplace identity, and is granted role by role.</p>
            </div>
            <Link className="text-button" href="/admin/access">Manage access</Link>
          </div>
          {detail.adminRoles.length === 0 ? (
            <p className="empty-admin">No platform administrator role.</p>
          ) : (
            <ul className="admin-facts">
              {detail.adminRoles.map(role => (
                <li key={`${role.key}-${role.status}`}>
                  <strong>{role.name}</strong>
                  <span>
                    {role.status.replaceAll('_', ' ')}
                    {role.grantedAt ? ` · granted ${formatWhen(role.grantedAt)}` : ''}
                    {role.revokedAt ? ` · revoked ${formatWhen(role.revokedAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Connected organisations</h2>
              <p>Memberships of business entities, with the role that constrains what they may act on.</p>
            </div>
            <span>{detail.organisationCount}</span>
          </div>
          {detail.organisations.length === 0 ? (
            <p className="empty-admin">Not a member of any organisation.</p>
          ) : (
            <ul className="admin-facts">
              {detail.organisations.map(org => (
                <li key={org.organisationId}>
                  <Link href={`/org/${org.organisationId}`}>{org.name}</Link>
                  <span>
                    {org.role.replaceAll('_', ' ')} · {org.status}
                    {org.joinedAt ? ` · joined ${formatWhen(org.joinedAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Provider identities</h2>
            <p>Supply the account operates, with its readiness and any hold the platform has placed on it.</p>
          </div>
          <span>{detail.providers.length}</span>
        </div>
        {detail.providers.length === 0 ? (
          <p className="empty-admin">This account has no provider identity.</p>
        ) : (
          <div className="admin-list">
            {detail.providers.map(provider => (
              <article key={provider.id}>
                <div>
                  <strong>{provider.displayName}</strong>
                  <span>
                    {provider.status.replaceAll('_', ' ')} · {provider.isPublic ? 'published' : 'not published'}
                    {provider.readinessScore !== null ? ` · readiness ${provider.readinessScore}/100` : ' · not scored'}
                    {provider.setupPercent !== null ? ` · setup ${provider.setupPercent}%` : ''}
                  </span>
                  {provider.restriction ? (
                    <span className="admin-incident-meta">
                      <RestrictionBadge kind={provider.restriction.kind} />
                      <span>
                        applied {formatWhen(provider.restriction.appliedAt)} · {provider.restriction.reasonCode.replaceAll('_', ' ')}
                      </span>
                    </span>
                  ) : null}
                </div>
                <Link className="text-button" href={`/admin/providers?q=${encodeURIComponent(provider.displayName)}`}>
                  Open in supply
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section two-column-admin">
        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Verification history</h2>
              <p>Every submission, decided or not, with the reviewer&apos;s note where one was left.</p>
            </div>
            <Link className="text-button" href="/admin/trust/verifications">
              Trust &amp; safety
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {detail.verifications.length === 0 ? (
            <p className="empty-admin">No verification submission from this account.</p>
          ) : (
            <div className="admin-list">
              {detail.verifications.map(verification => (
                <article key={verification.id}>
                  <div>
                    <strong>{verification.providerName} · {verification.kind.replaceAll('_', ' ')}</strong>
                    <span>
                      {verification.status.replaceAll('_', ' ')}
                      {verification.jurisdictionCode ? ` · ${verification.jurisdictionCode}` : ' · jurisdiction not supplied'}
                    </span>
                    {verification.reviewNote ? <span>Note: {verification.reviewNote}</span> : null}
                  </div>
                  <small>
                    {verification.reviewedAt
                      ? `Reviewed ${formatWhen(verification.reviewedAt)}`
                      : `Submitted ${formatWhen(verification.createdAt)}`}
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Recent requests</h2>
              <p>The account&apos;s most recent ten requests, as the customer side sees them.</p>
            </div>
            <Link className="text-button" href="/admin/projects">
              Projects
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {detail.requests.length === 0 ? (
            <p className="empty-admin">No customer request recorded.</p>
          ) : (
            <div className="admin-list">
              {detail.requests.map(request => (
                <article key={request.id}>
                  <div>
                    <strong>{request.needText}</strong>
                    <span>{request.state.replaceAll('_', ' ')}</span>
                  </div>
                  <small>{formatWhen(request.createdAt)}</small>
                </article>
              ))}
            </div>
          )}

          <div className="admin-section-heading" style={{ marginTop: 20 }}>
            <div>
              <h2>Connected trust cases</h2>
              <p>
                Verification submissions still awaiting a decision, plus disputed requests, across this
                account&apos;s provider identities and its own commissioning.
              </p>
            </div>
            <span>{detail.openCaseCount}</span>
          </div>
          <p className="admin-row-actions">
            <Link className="text-button" href="/admin/trust/verifications">
              View connected verification cases
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <Link className="text-button" href="/admin/projects">
              View disputed work
            </Link>
            {/* ⚠️ THE INTAKE IS PREFILLED FROM HERE, WHICH IS WHY THE CASE FORM TAKES AN ACCOUNT ID. A moderator
                who has just read an account should be able to open a case about it without copying an
                identifier out of another screen and hoping. */}
            <Link className="text-button" href={`/admin/trust/cases?subject_account=${detail.accountId}`}>
              Open a safety case about this account
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
