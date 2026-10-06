import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, KeyRound } from '@/components/ui/icons';
import { PasswordField, SubmitButton } from '@/components/auth/AuthFormFields';
import { AUTH_LINK, AuthField, AuthInput, AuthNotice, AuthShell } from '@/components/auth/AuthSections';
import { requestPasswordResetAction, resetPasswordAction } from '@/features/auth/actions';
import {
  AUTH_PATHS,
  authErrorCode,
  authErrorMessage,
  hrefWith,
  postAuthTarget,
  type AuthErrorCode,
} from '@/features/auth/post-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Account recovery — /auth/recovery
 *
 * The brief calls this `/auth/recovery`; the platform called it `/forgot-password`, which now
 * redirects here with its query string intact. The old name is the clearer one for a visitor and
 * the worse one for the codebase — "forgot password" describes a state, "recovery" describes the
 * flow — so the URL is the new one and the copy stays in the visitor's language.
 *
 * ⚠️ THE FORM MUST NOT REVEAL WHETHER AN ACCOUNT EXISTS, and that constraint shapes every sentence
 * on this page: the success state is identical for a real address and an invented one, and the
 * action's failure path is silent unless the failure is a rate limit. That is why the confirmation
 * reads "if an account exists…" rather than "we sent a message to…". It is also why the page says
 * so out loud — a visitor who knows why the wording is careful is not confused by it.
 *
 * The reset link itself goes through /auth/callback, which exchanges the token for a session and
 * then lands on /account/update-password. A link that has already been used, or has expired, fails
 * there and comes back here as `link_expired` with copy that says which of the two likely happened.
 */

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a secure password recovery link for your 101GlobalWork account.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  sent?: string;
  error?: string;
  /** Present when the link points straight here with its token rather than at the callback. */
  code?: string;
  token_hash?: string;
  type?: string;
  /** Set by the callback once the token has been exchanged for a session. */
  reset?: string;
  /** Set after a successful update, so the page can confirm rather than ask again. */
  updated?: string;
  next?: string;
  redirect?: string;
}>;

export default async function AuthRecoveryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  /* ------------------------------------------- a token that still needs exchanging */
  // The link normally goes through /auth/callback, which is a route handler and can therefore
  // write the session cookies the exchange produces. A Server Component cannot, so a link that
  // arrives here with a token is handed straight on rather than being exchanged and silently
  // dropped. This keeps the documented /auth/recovery?token=... shape working for any mail
  // template, without pretending the page can do the exchange itself.
  if (params.code || params.token_hash) {
    redirect(
      hrefWith(AUTH_PATHS.callback, {
        code: params.code,
        token_hash: params.token_hash,
        type: params.type ?? 'recovery',
        next: `${AUTH_PATHS.recovery}?reset=1`,
      }),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const code = authErrorCode(params.error);
  const destination = postAuthTarget(params, '');

  /* ------------------------------------------------------------------- success */
  if (params.updated === '1') return <RecoveryUpdatedView destination={destination} />;

  /* --------------------------------------------------------------- set a new one */
  if (params.reset === '1' && user) {
    return <RecoveryResetView code={code} destination={destination} />;
  }

  /* ---------------------------------------------- request, or an expired link */
  // `?reset=1` without a session means the link was opened after its exchange failed — expired, or
  // already used, or opened in a different browser from the one that requested it. The honest
  // answer is the request form with the reason attached, which is exactly what this renders.
  return (
    <RecoveryRequestView
      code={code}
      sent={params.sent === '1'}
      linkExpired={params.reset === '1'}
    />
  );
}

/**
 * Ask for a recovery link.
 *
 * THE NEUTRAL ANSWER IS THE WHOLE POINT. The same confirmation is shown whether or not an account
 * exists for the address, and the only failure ever surfaced is a rate limit — which is the one
 * failure that reveals nothing and is the one the visitor can act on. Anything else would turn this
 * form into a way to ask the platform whether a given person has an account here.
 */
function RecoveryRequestView({
  code,
  sent,
  linkExpired,
}: {
  code: AuthErrorCode | null;
  sent: boolean;
  linkExpired: boolean;
}) {
  return (
    <AuthShell
      insideCard
      eyebrow="Account recovery"
      title="Reset your password"
      lede="Enter the email address on your account and we will send a secure link to set a new password."
      notice={
        linkExpired ? (
          <AuthNotice tone="error" title="That link is no longer valid.">
            {authErrorMessage('link_expired')} Request another below — a used or expired link cannot
            be retried.
          </AuthNotice>
        ) : code ? (
          <AuthNotice tone="error">{authErrorMessage(code)}</AuthNotice>
        ) : sent ? (
          <AuthNotice tone="success" title="Check your inbox.">
            If an account exists for that address, a recovery message is on its way. The link can be
            used once and expires shortly, so request another if it does not arrive.
          </AuthNotice>
        ) : null
      }
    >
      <form action={requestPasswordResetAction} className="grid gap-4">
        <AuthField id="recovery-email" label="Email">
          <AuthInput
            id="recovery-email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </AuthField>

        <SubmitButton pendingLabel="Sending the link…">Send Reset Instructions</SubmitButton>
      </form>

      <p className="mt-4 pt-2 text-center font-sans text-sm text-slate-600">
        Remembered it?{' '}
        <Link
          href={AUTH_PATHS.signIn}
          className="font-semibold text-amber-600 underline underline-offset-4 transition-colors hover:text-amber-700"
        >
          Back to sign in
        </Link>
        .
      </p>
    </AuthShell>
  );
}

/**
 * Set the new password, on the session the recovery link produced.
 *
 * The session is the proof of ownership: reaching this view means a one-time token was exchanged
 * for it, in this browser, minutes ago. That is why nothing here asks for the old password — the
 * whole point of recovery is not having it.
 */
function RecoveryResetView({
  code,
  destination,
}: {
  code: AuthErrorCode | null;
  destination: string;
}) {
  return (
    <AuthShell
      insideCard
      eyebrow="Account recovery"
      title="Set new password"
      lede="Choose a new password for your account. The recovery link has already proved the address, so this is the last step."
      notice={
        code ? (
          <AuthNotice tone="error">{authErrorMessage(code)}</AuthNotice>
        ) : (
          <AuthNotice tone="info" title="Use something you have not used here before.">
            Changing the password ends nothing else on its own: if you think someone else has had
            access to this account, sign out of your other devices afterwards from{' '}
            <Link href="/account/security" className={AUTH_LINK}>
              account security
            </Link>
            .
          </AuthNotice>
        )
      }
    >
      <form action={resetPasswordAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        <PasswordField
          id="new-password"
          name="password"
          label="New password"
          autoComplete="new-password"
          minLength={10}
          meter
        />

        <AuthField id="confirm-password" label="Confirm new password">
          <AuthInput
            id="confirm-password"
            name="confirm_password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
          />
        </AuthField>

        <SubmitButton pendingLabel="Updating your password…">Update Password &amp; Sign In</SubmitButton>
      </form>

      <p className="mt-5 flex gap-2 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <KeyRound aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          Saving the new password keeps you signed in on this device. Other devices stay signed in
          until their sessions expire, unless you end them from account security.
        </span>
      </p>

      <p className="mt-4 pt-2 text-center font-sans text-sm text-slate-600">
        Change your mind?{' '}
        <Link
          href={AUTH_PATHS.signIn}
          className="font-semibold text-amber-600 underline underline-offset-4 transition-colors hover:text-amber-700"
        >
          Return to sign in
        </Link>{' '}
        — the old password still works until you save a new one.
      </p>
    </AuthShell>
  );
}

/** Confirmation, with somewhere to go — rather than a form that has already been submitted. */
function RecoveryUpdatedView({ destination }: { destination: string }) {
  return (
    <AuthShell
      insideCard
      eyebrow="Account recovery"
      title="Password updated"
      lede="Your new password is saved and this session is signed in with it."
      notice={
        <AuthNotice tone="success" title="You are signed in.">
          Nothing else is needed. If you did not make this change, reset the password again and
          contact support — the recovery link is the only route that can change it.
        </AuthNotice>
      }
    >
      <Link
        href={destination || '/'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-secondary px-5 py-3 font-mono text-sm font-bold tracking-wide text-primary-deep uppercase shadow-sm no-underline transition-colors hover:bg-amber-500"
      >
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        Continue
      </Link>

      <p className="mt-4 pt-2 text-center font-sans text-sm text-slate-600">
        Prefer to sign in again?{' '}
        <Link
          href={AUTH_PATHS.signIn}
          className="font-semibold text-amber-600 underline underline-offset-4 transition-colors hover:text-amber-700"
        >
          Go to sign in
        </Link>
        .
      </p>
    </AuthShell>
  );
}
