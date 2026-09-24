import Link from 'next/link';
import { BadgeCheck, CircleAlert, CircleCheck, Info, KeyRound, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { AUTH_PATHS } from '@/features/auth/post-auth';
import { SESSIONS_PATH, SECURITY_PATH } from '@/features/settings/paths';
import { changePasswordAction, removeFactorAction } from '@/features/settings/security-actions';
import { factorLabel } from '@/features/settings/copy';
import { verifiedFactorTypes, type SecurityRead } from '@/features/settings/security';

/**
 * The account protection hub's presentation, all server components.
 *
 * WHAT THIS PAGE PROMISES, AND WHAT IT REFUSES TO PRETEND:
 *
 *   Password      real, and gated. The provider's password update has no assurance requirement of its own, so
 *                 the step-up check in the action is the only thing standing between a stolen session and a
 *                 password change. That is why the gate is stated on the page before the form.
 *
 *   TOTP          real, and enrolment stays at /account/security where it already worked. Removing one runs
 *                 through the admin API on the server, after an aal2 check — the browser never holds the
 *                 credential that deletes a factor.
 *
 *   SMS           not available on this deployment, and shown as unavailable with the reason. The provider
 *                 only enrols a phone factor when it has an SMS transport configured; there is none.
 *
 *   Passkeys      listed, and removable if the account somehow has one, but not offered for enrolment: this
 *                 deployment's authentication provider does not expose WebAuthn factors to the client.
 *
 *   Recovery      THE HONEST ONE. The provider issues no backup codes — it has no such concept — so this page
 *                 does not print a grid of them or a "use a backup code" link that would be a dead end at the
 *                 worst possible moment. It says what recovery actually is: a link to the confirmed address,
 *                 plus the note that a factor can only be removed by somebody who can already sign in.
 *
 *   Sessions      summarised here and managed one click away, because revoking a device is its own page with
 *                 its own record of what each device claimed to be.
 */
export function SecurityNotice({ tone, children }: { tone: 'success' | 'warning' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        tone === 'success'
          ? 'border-primary-subtle bg-primary-surface text-slate-700'
          : tone === 'warning'
            ? 'border-secondary bg-secondary-light text-amber-900'
            : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          tone === 'success' ? 'text-primary' : tone === 'warning' ? 'text-amber-800' : 'text-slate-400'
        }`}
      />
      <div>{children}</div>
    </div>
  );
}

export function SecurityUnavailable() {
  return (
    <SecurityNotice tone="warning">
      <p className="font-semibold">Your security state could not be read.</p>
      <p className="mt-1">
        Nothing has been changed, and no control on this page is shown while the platform cannot tell you what
        is currently protecting the account. Reload to try again — and if you believe somebody else has access,
        use{' '}
        <Link href={AUTH_PATHS.recovery} className="font-semibold underline underline-offset-2">
          account recovery
        </Link>{' '}
        to change the password from the confirmed email address, which works whether or not this page loads.
      </p>
    </SecurityNotice>
  );
}

/** The one line that explains what a step-up prompt is before it appears. */
function StepUpDisclosure({ pending, action }: { pending: boolean; action: string }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
      <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        {pending
          ? `This account has a second factor and this session has not passed it, so ${action} will ask for your authenticator code first.`
          : `This account has no second factor, so the confirmation below is the only check the platform can make — there is no password re-entry step available to it.`}
      </span>
    </p>
  );
}

export function PasswordPanel({ stepUpPending }: { stepUpPending: boolean }) {
  return (
    <section aria-labelledby="password-heading" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="password-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Password
        </h2>
        <span className={BADGE_SLATE}>
          <KeyRound aria-hidden="true" className="h-3 w-3" />
          Required to sign in
        </span>
      </div>

      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
        At least 10 characters. Changing it here does not sign your other devices out immediately — each keeps
        working until it next needs a new token, which it will then have to earn by signing in again.
      </p>

      <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          The platform does not show a &ldquo;last changed&rdquo; date, because the authentication provider does
          not record when a password was set. A date derived from the account row would move for unrelated
          reasons and would be a claim nobody could check.
        </span>
      </p>

      <form action={changePasswordAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="password">
            New password
          </label>
          <input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="confirm_password">
            Repeat the new password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark"
          >
            Change password
          </button>
          <StepUpDisclosure pending={stepUpPending} action="changing the password" />
        </div>
      </form>
    </section>
  );
}

export function FactorsPanel({
  factors,
  stepUpPending,
}: {
  factors: SecurityRead['factors'];
  stepUpPending: boolean;
}) {
  const verified = factors.filter(factor => factor.status === 'verified');
  const pending = factors.filter(factor => factor.status !== 'verified');
  const kinds = verifiedFactorTypes(factors);

  return (
    <section aria-labelledby="factors-heading" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="factors-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Two-factor authentication
        </h2>
        {verified.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-primary uppercase">
            <ShieldCheck aria-hidden="true" className="h-3 w-3" />
            Active
          </span>
        ) : (
          <span className={BADGE_AMBER}>Not set up</span>
        )}
      </div>

      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
        A second factor is required before money movement, dispute decisions and other high-risk actions. Signing
        in with a password alone is refused on an account that has one.
      </p>

      <ul className="mt-4 grid gap-3">
        {verified.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            No factor is enrolled. Nothing here is protecting the account beyond your password.
          </li>
        ) : (
          verified.map(factor => (
            <li key={factor.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-solid border-slate-200 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                  {factor.friendlyName ?? factorLabel(factor.type)}
                  <span className={BADGE_SLATE}>{factorLabel(factor.type)}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {factor.createdAt
                    ? `Enrolled ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(factor.createdAt))}.`
                    : 'Enrolled, on a date the provider did not record.'}
                </p>
              </div>
              <form action={removeFactorAction}>
                <input type="hidden" name="factor_id" value={factor.id} />
                <ConfirmSubmit
                  label="Remove factor"
                  triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
                  icon="danger"
                  title="Remove this factor?"
                  description="The account will fall back to a password alone, and the provider ends every signed-in session when a verified factor is deleted — including this one. You will be asked to sign in again."
                  confirmLabel="Remove factor"
                />
              </form>
            </li>
          ))
        )}

        {pending.map(factor => (
          <li key={factor.id} className="rounded-lg border border-dashed border-slate-300 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-700" />
              An unfinished {factorLabel(factor.type).toLowerCase()} enrolment
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              It was started and never verified, so it protects nothing — an unconfirmed factor cannot be used to
              sign in and is not counted as protection anywhere on this platform. Removing it is bookkeeping.
            </p>
            <form action={removeFactorAction} className="mt-3">
              <input type="hidden" name="factor_id" value={factor.id} />
              <button
                type="submit"
                className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Discard it
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-solid border-slate-200 pt-4">
        <h3 className="text-xs font-bold tracking-tight text-slate-900 uppercase">Available methods</h3>
        <dl className="mt-3 grid gap-3">
          <MethodRow
            label="Authenticator app (TOTP)"
            status={kinds.includes('totp') ? 'Enrolled' : 'Available'}
            available
            note="A six-digit code from an app on your phone. This is the method the platform can set up for you today."
            action={
              <Link
                href="/account/security?next=/settings/security"
                className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
              >
                {kinds.includes('totp') ? 'Add another' : 'Set up'}
              </Link>
            }
          />
          <MethodRow
            label="Text message (SMS)"
            status="Unavailable"
            available={false}
            note="The provider only enrols a phone factor when the deployment has an SMS transport configured. This one does not, so there is nothing here to switch on."
          />
          <MethodRow
            label="Passkey"
            status={kinds.includes('webauthn') ? 'Enrolled' : 'Unavailable'}
            available={kinds.includes('webauthn')}
            note={
              kinds.includes('webauthn')
                ? 'A passkey is enrolled on this account. It can sign you in and satisfy the second factor without a code.'
                : 'This deployment’s authentication provider does not expose passkey enrolment to the application, so a button here could only ever fail.'
            }
          />
        </dl>
        <StepUpDisclosure pending={stepUpPending} action="removing a factor" />
      </div>
    </section>
  );
}

function MethodRow({
  label,
  status,
  available,
  note,
  action,
}: {
  label: string;
  status: string;
  available: boolean;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <dt className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-800">
          {label}
          <span className={available ? BADGE_SLATE : BADGE_AMBER}>{status}</span>
        </dt>
        <dd className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">{note}</dd>
      </div>
      {action}
    </div>
  );
}

/**
 * Recovery, and the paragraph that had to be written rather than a grid of codes.
 *
 * The brief asks for recovery codes to be managed. The authentication provider has no such concept: there is
 * no endpoint that issues one and none that accepts one, so a set of codes printed here could not sign
 * anybody in. What recovery actually is on this platform — a link to the confirmed address, then a password
 * of your choosing — is what the panel describes, in the same words the challenge screen already uses, so two
 * screens cannot disagree about how somebody gets back in.
 */
export function RecoveryPanel({
  email,
  emailVerified,
  factorCount,
}: {
  email: string | null;
  emailVerified: boolean;
  factorCount: number;
}) {
  return (
    <section aria-labelledby="recovery-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="recovery-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Recovery codes
      </h2>

      <div className="mt-3 flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <p className="font-semibold text-slate-800">This platform does not issue backup codes.</p>
          <p className="mt-1">
            The authentication provider has no concept of them: it can issue no code and accept none, so a set
            printed here would be a dead end at the worst possible moment. Saying so is better than a grid of
            numbers that cannot sign anybody in.
          </p>
          <p className="mt-1">
            {factorCount > 0
              ? 'A factor can only be removed by somebody who can already sign in, which is the point of it — so if the authenticator is lost, use account recovery with access to the email below to set a new password, and ask support to remove the factor.'
              : 'This account has no second factor, so recovery is ordinary: a link to the address below and a new password of your choosing.'}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-solid border-slate-200 px-3.5 py-3">
          <dt className="text-slate-500">Recovery address</dt>
          <dd className="flex flex-wrap items-center gap-2 font-mono text-slate-800">
            {email ?? 'No address on this account'}
            {email ? (
              emailVerified ? (
                <span className="font-sans text-[11px] font-bold tracking-wide text-primary uppercase">
                  Confirmed
                </span>
              ) : (
                <span className={BADGE_AMBER}>Not confirmed</span>
              )
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="mt-4">
        <Link href={AUTH_PATHS.recovery} className={LINK_ARROW}>
          Start account recovery
        </Link>
      </p>
    </section>
  );
}

export function SessionsPanel({
  total,
  others,
  stepUpPending,
}: {
  total: number;
  others: number;
  stepUpPending: boolean;
}) {
  return (
    <section aria-labelledby="sessions-heading" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sessions-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Sessions and devices
        </h2>
        <span className={BADGE_SLATE}>
          {total} signed in · {others} other{others === 1 ? '' : 's'}
        </span>
      </div>

      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
        {others === 0
          ? 'This account is signed in on one device: the one you are using.'
          : 'This account is signed in on more than one device. The sessions page names each one by the client it claimed to be, with the address it connected from and when it was last known to be in use.'}
      </p>

      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          {stepUpPending
            ? 'Revoking another device requires a session that has passed your second factor, so you will be asked for a code before the list acts on anything.'
            : 'Revocation ends a device’s ability to get a new token. A token already issued stays valid until it expires, which is a property of the platform’s sessions rather than a promise this page can make differently.'}
        </span>
      </p>

      <p className="mt-4 flex flex-wrap gap-4">
        <Link href={SESSIONS_PATH} className={LINK_ARROW}>
          Review devices and revoke access
        </Link>
        <Link href={`${SECURITY_PATH}#password-heading`} className={LINK_ARROW}>
          Change the password instead
        </Link>
      </p>
    </section>
  );
}
