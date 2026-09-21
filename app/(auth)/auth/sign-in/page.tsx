import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PasswordField, SubmitButton } from '@/components/auth/AuthFormFields';
import {
  AUTH_LINK,
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
 * the exact place a visitor is deciding whether it is safe to sign in on a shared machine, so the
 * page states the real behaviour instead, in the note below the form.
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
}>;

export default async function AuthSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params);
  const code = authErrorCode(params.error);

  // Already signed in? The form is not the page they want — but only when the destination is not
  // this page, or a stale `?next=/auth/sign-in` would loop.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && destination !== AUTH_PATHS.signIn) redirect(destination);

  const credentialsRejected = code === 'invalid_credentials';

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your account"
      lede="Pick up where you left off: your requests, your quotes and the work you are managing."
      notice={code ? <AuthNotice tone="error">{authErrorMessage(code)}</AuthNotice> : null}
      footer={
        <>
          Don&rsquo;t have an account?{' '}
          <Link href={hrefWith(AUTH_PATHS.signUp, { redirect: destination })} className={AUTH_LINK}>
            Create one
          </Link>
          .
        </>
      }
    >
      <SocialAuth destination={destination} />

      <AuthDivider label="or use your email" />

      <form action={signInAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        <AuthField
          id="email"
          label="Email"
          hint="Sign-in is by email address. Phone sign-in is not enabled on this platform yet, so no phone field is offered rather than one that cannot work."
        >
          <AuthInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={credentialsRejected || undefined}
            aria-describedby="email-hint"
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

      {/* The honest replacement for the checkbox — see the header. Colour and copy both matter
          here: this is a security statement, not small print, so it is not grey-on-grey. */}
      <p className="mt-5 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-900">About staying signed in.</span> This platform
        keeps you signed in on this device for up to 400 days, which is the behaviour of its session
        library and cannot be switched off per sign-in — so there is no &ldquo;remember me&rdquo;
        checkbox that would not work. On a shared or public computer, use a private window, and use{' '}
        <span className="font-semibold text-slate-900">Sign out</span> from the workspace when you
        are finished. Signing out ends the session on this device.
      </p>
    </AuthShell>
  );
}
