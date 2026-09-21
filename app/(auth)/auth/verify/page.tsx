import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MailCheck, ShieldCheck } from 'lucide-react';
import { OtpInput } from '@/components/auth/OtpInput';
import { ResendCode } from '@/components/auth/ResendCode';
import { SubmitButton } from '@/components/auth/AuthFormFields';
import { AUTH_LINK, AuthField, AuthInput, AuthNotice, AuthShell } from '@/components/auth/AuthSections';
import {
  forgetPendingContactAction,
  resendConfirmationAction,
  verifyCodeAction,
} from '@/features/auth/actions';
import {
  AUTH_PATHS,
  authErrorCode,
  authErrorMessage,
  hrefWith,
  maskContact,
  postAuthTarget,
} from '@/features/auth/post-auth';
import { readPendingVerification } from '@/features/auth/verify-cookie';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Confirm your email — /auth/verify
 *
 * Where a sign-up lands when the auth provider wants the address confirmed before it will issue a
 * session. The brief asks for the transition to this route; what makes it worth having rather than
 * a bare confirmation string is the second half — a confirmation email that never arrives is the
 * single most common way an account gets stuck, and until now the only answer the platform offered
 * was "check your email again".
 *
 * WHAT THE PAGE KNOWS, AND HOW. It does not ask the visitor to retype their address, and it does
 * not put one in the URL. The address a code went to is remembered server-side for fifteen minutes
 * (see features/auth/verify-cookie.ts) and only a MASK of it is rendered — enough to recognise
 * which inbox to open, and the full address never reaches the browser.
 *
 * THE RESEND COOLDOWN IS REAL, not decorative. The server records when it last sent and refuses a
 * second send inside the window; this page renders the countdown from that same timestamp, so a
 * reload does not buy a fresh minute and a hand-posted form gets the same refusal as the button.
 *
 * "CHANGE EMAIL ADDRESS" MEANS START AGAIN. The account exists against the address the code went
 * to, so correcting it is not an edit that can happen from here — it is a new account with the
 * right address. The button clears the pending record and hands over to sign-up, and says as much
 * rather than implying an edit that is not possible. An unconfirmed account cannot sign in and
 * holds nothing, so leaving it behind loses nothing.
 */

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Enter the code we sent to confirm your 101GlobalWork email address.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  sent?: string;
  resent?: string;
  error?: string;
  next?: string;
  redirect?: string;
}>;

export default async function AuthVerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params, '');
  const code = authErrorCode(params.error);
  const resent = params.resent === '1';

  // Nothing left to verify if this browser is already authenticated: that is what happens when
  // someone opens the confirmation link in the browser that signed up, or returns with Back.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(destination || '/');

  const pending = await readPendingVerification();
  const masked = maskContact(pending.email);
  const waiting = pending.sentAt !== null && pending.secondsUntilAvailable > 0;

  return (
    <AuthShell
      eyebrow="One more step"
      title="Verify your email"
      lede={
        masked
          ? `We sent a 6-digit code to ${masked}. Enter it below and your account is ready.`
          : 'Enter your email address plus the 6-digit code from the message we sent, and your account is ready.'
      }
      notice={
        code ? (
          <AuthNotice tone="error">{authErrorMessage(code)}</AuthNotice>
        ) : resent ? (
          <AuthNotice tone="success" title="A new code is on its way.">
            Use the code from the newest message. An older code stops working as soon as a new one
            has been sent, and codes expire quickly.
          </AuthNotice>
        ) : waiting ? (
          <AuthNotice tone="info" title="Waiting for the code.">
            Nothing else is needed from you. If the message has not arrived in a minute or two you
            can send another — check the junk folder first.
          </AuthNotice>
        ) : null
      }
      footer={
        <>
          Already confirmed?{' '}
          <Link href={hrefWith(AUTH_PATHS.signIn, { redirect: destination })} className={AUTH_LINK}>
            Sign in
          </Link>
          .
        </>
      }
    >
      <form action={verifyCodeAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        {/* Only when there is no pending record. Once the server knows which address the code went
            to, a second field would only invite a mismatch between the two. */}
        {masked ? null : (
          <AuthField
            id="verify-email"
            label="Email"
            hint="Use the address you signed up with. We answer the same way whether or not it is registered here."
          >
            <AuthInput
              id="verify-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-describedby="verify-email-hint"
            />
          </AuthField>
        )}

        <OtpInput
          name="token"
          label="6-digit code"
          autoFocus
          describedBy={code ? 'verify-error' : undefined}
        />
        {code ? (
          <p id="verify-error" className="sr-only">
            {authErrorMessage(code)}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Checking the code…">Verify &amp; Continue</SubmitButton>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-solid border-slate-200 pt-4">
        {pending.sentAt !== null ? (
          <form action={resendConfirmationAction}>
            <input type="hidden" name="next" value={destination} />
            <ResendCode availableAt={pending.availableAt} initialSeconds={pending.secondsUntilAvailable} />
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            No code yet?{' '}
            <Link href={hrefWith(AUTH_PATHS.signUp, { redirect: destination })} className={AUTH_LINK}>
              Create your account
            </Link>{' '}
            and we will send one.
          </p>
        )}

        {masked ? (
          <form action={forgetPendingContactAction}>
            <button
              type="submit"
              className="text-sm font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
            >
              Change email address
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <p className="flex gap-2">
          <MailCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            If your email shows a <span className="font-semibold text-slate-900">link</span> instead
            of a code, opening it confirms the address just the same and takes you straight to the
            page you were heading for. Whether the message carries a code or a link is a setting in
            the platform&rsquo;s mail template, so both are supported rather than one being assumed.
          </span>
        </p>
        <p className="flex gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            Confirming proves the address is yours, which is how the platform reaches you about a
            request and how account recovery stays possible. Verifying publishes nothing about you.
          </span>
        </p>
      </div>
    </AuthShell>
  );
}
