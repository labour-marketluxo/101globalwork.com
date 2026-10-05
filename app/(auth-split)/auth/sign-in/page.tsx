import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PasswordField, SubmitButton } from '@/components/auth/AuthFormFields';
import {
  AuthDivider,
  AuthField,
  AuthInput,
  AuthNotice,
  AuthShell,
  SocialAuth,
} from '@/components/auth/AuthSections';
import { signInAction } from '@/features/auth/actions';
import {
  AUTH_PATHS,
  authErrorCode,
  authErrorMessage,
  hrefWith,
  postAuthTarget,
} from '@/features/auth/post-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IS_MOCK_MODE } from '@/lib/supabase/mock';

/**
 * Sign in — /auth/sign-in
 *
 * The canonical sign-in route. /sign-in still answers, as a permanent redirect that carries the
 * query string over, because it is in browser histories, in links the platform itself published
 * (the provider and marketing pages sent visitors there until this change), and quite possibly in
 * something a crawler already recorded.
 *
 * DESTINATION PRESERVATION. `?redirect=/ng/lagos/ikeja/plumbers` — and the older `?next=` — are
 * both read, validated as internal paths, and carried: to the Google flow, into the password
 * form, and onward to the sign-up link, so a visitor who was halfway through choosing a trade in
 * a particular locality comes back to that page rather than to the homepage. Validation lives in
 * post-auth.ts, because "return to where you were" is also the shape of an open redirect.
 *
 * ⚠️ NO "REMEMBER ME" CHECKBOX, AND IT IS NOT AN OVERSIGHT.
 *
 * The brief asks for one. This platform cannot honour it: `@supabase/ssr` writes the auth cookies
 * with `maxAge: 400 * 24 * 60 * 60` and applies it AFTER spreading `cookieOptions`, so the
 * override a caller passes is discarded
 * (node_modules/@supabase/ssr/dist/main/cookies.js, both setter branches). Sessions here are
 * therefore persistent for 400 days by default, and an unchecked box could not shorten them —
 * worse, the middleware rewrites those cookies on every request, so any lifetime set at sign-in
 * would be silently undone on the next navigation. A checkbox that does nothing is a lie told in
 * the exact place a visitor is deciding whether it is safe to sign in on a shared machine. The
 * brief asked for the small print to go, so the session note that used to explain this below the
 * form has been removed; the behaviour itself is unchanged and the fix still belongs to the
 * session layer rather than to this page.
 *
 * Making it real is two changes, and both belong to the session layer rather than to this page: a
 * preference cookie that the middleware reads, or a custom cookie adapter in lib/supabase. It
 * cannot be verified without a confirmed account, which this environment does not have.
 *
 * WHAT THE STATES ARE, and where each one comes from:
 *
 *   pending              the submit button, via useFormStatus (client)
 *   invalid credentials  `?error=invalid_credentials` — one code for every credential failure, so
 *                        the page cannot be used to discover which addresses have accounts
 *   rate limited         `?error=rate_limited`, its own copy, because it is not the visitor's fault
 *                        and the right action is to wait rather than to retype the password
 *   account locked       `?error=locked`
 *   unconfirmed email    `?error=unconfirmed`, with a link to /auth/verify
 *   MFA challenge        not rendered here — signInAction redirects to /auth/challenge when the
 *                        account has a verified factor, before the session is usable
 */

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your 101GlobalWork account and continue where you left off.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  error?: string;
  next?: string;
  redirect?: string;
  /**
   * A reason for arriving here, as opposed to an error. Two today: `session_revoked`, set by the
   * sessions page when somebody ends the session they were holding, and `factor_removed`, set by the
   * security hub after a second factor is deleted — which the provider answers by ending every session.
   * It is a separate parameter from `error` because nothing went wrong — the visitor asked for this — and the notice is
   * informational rather than a warning.
   */
  reason?: string;
}>;

/**
 * Reasons this page is willing to display, as a fixed map.
 *
 * Same rule as the error vocabulary: the parameter is user-editable and this is a sign-in card, so an
 * unrecognised value renders nothing at all rather than echoing whatever arrived.
 */
const ARRIVAL_NOTICES: Record<string, { title: string; body: string }> = {
  factor_removed: {
    title: 'That security method was removed.',
    body: 'The account falls back to a password alone, and the authentication provider ended every signed-in session when the factor was deleted — including the one you were using. Sign in again with your password.',
  },
  session_revoked: {
    title: 'You signed out of that device.',
    body: 'The session ended, so this device no longer has access to your account. Sign in again to carry on — the other devices on your account were not touched.',
  },
};

export default async function AuthSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params);
  const code = authErrorCode(params.error);
  const arrival = params.reason ? ARRIVAL_NOTICES[params.reason] : undefined;

  // Already signed in? The form is not the page they want — but only when the destination is not
  // this page, or a stale `?next=/auth/sign-in` would loop.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // MOCK MODE: the dummy user always exists, so the "already signed in" bounce would hide the
  // very form we are here to exercise. The redirect stays for the live path only.
  if (!IS_MOCK_MODE && user && destination !== AUTH_PATHS.signIn) redirect(destination);

  const credentialsRejected = code === 'invalid_credentials';

  return (
    <AuthShell
      insideCard
      eyebrow="Welcome back"
      title="Sign in to your account"
      notice={
        code ? (
          <AuthNotice tone="error">{authErrorMessage(code)}</AuthNotice>
        ) : arrival ? (
          <AuthNotice tone="info" title={arrival.title}>
            {arrival.body}
          </AuthNotice>
        ) : null
      }
    >
      <SocialAuth destination={destination} />

      <AuthDivider label="or use your email" />

      <form action={signInAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        <AuthField id="email" label="Email">
          <AuthInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={credentialsRejected || undefined}
          />
        </AuthField>

        <PasswordField
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          describedBy={credentialsRejected ? 'credentials-error' : undefined}
          labelAction={
            <Link
              href={AUTH_PATHS.recovery}
              className="text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
            >
              Forgot password?
            </Link>
          }
        />
        {credentialsRejected ? (
          <p id="credentials-error" className="sr-only">
            The password was not accepted for that email address.
          </p>
        ) : null}

        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </form>

      {/* The account switch sits directly under the primary action, inside the card, so the next
          step is part of the form's flow rather than a footer below it. It replaces both the
          header's "Need an account?" pill and the shell's footer slot on this page. */}
      <p className="mt-4 pt-2 text-center font-sans text-sm text-slate-600">
        Don&rsquo;t have an account?{' '}
        <Link
          href={hrefWith(AUTH_PATHS.signUp, { redirect: destination })}
          className="font-semibold text-amber-600 underline underline-offset-4 transition-colors hover:text-amber-700"
        >
          Create one
        </Link>
        .
      </p>
    </AuthShell>
  );
}
