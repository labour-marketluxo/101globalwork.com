import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import MfaClient from '@/components/auth/MfaClient';
import { AUTH_LINK, AuthNotice, AuthShell } from '@/components/auth/AuthSections';
import { cancelChallengeAction } from '@/features/auth/actions';
import { AUTH_PATHS, hrefWith, maskContact, postAuthTarget } from '@/features/auth/post-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Second factor — /auth/challenge
 *
 * WHERE THIS IS REACHED FROM, and why it exists at all: signInAction checks the session's
 * assurance level after a correct password. If the account has a verified authenticator,
 * `nextLevel` is `aal2` while the fresh session is `aal1`, and the action sends the visitor here
 * instead of to their destination. So a password alone is no longer sufficient for an account that
 * has a factor — before this, the second factor was only enforced when someone happened to open a
 * sensitive screen that asked for it.
 *
 * IT IS NOT AN ENROLMENT PAGE. Enrolment lives at /account/security, and stays voluntary — this
 * route never asks anyone to set a factor up. The shared component covers both states, so if the
 * factor is removed between the password being accepted and this page rendering, the visitor sees
 * the enrolling state rather than an error: the truthful answer to "there is no factor any more" is
 * to carry on, and the component's copy says so.
 *
 * THE DESTINATION RIDES THROUGH. `?redirect=` (or the older `?next=`) is validated and handed to
 * the client component as `nextPath`, so the session arrives where it was going — the locality page
 * someone was browsing, the request form, or /admin on the way to a sensitive action.
 *
 * NO SESSION, NO PAGE: without a signed-in user there is nothing to raise, so the visitor is sent
 * back to sign-in rather than shown a code field that cannot work. That state is reachable by
 * opening this URL directly or by signing out in another tab.
 */

export const metadata: Metadata = {
  title: 'Confirm it is you',
  description: 'Enter the code from your authenticator app to continue.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ next?: string; redirect?: string }>;

export default async function AuthChallengePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // No session, nothing to raise: this state is reachable by opening the URL directly, by signing
  // out in another tab, or by coming back after the challenge session expired.
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { redirect: destination }));

  // The masked destination is computed here, on the server, and only the mask crosses to the
  // browser. It answers the question the visitor actually has — "which of my devices is this
  // talking about?" — without putting an address or a number on a screen someone may be sharing.
  const masked = maskContact(user.email ?? user.phone);

  return (
    <AuthShell
      eyebrow="Two-factor"
      title="Security verification"
      lede={
        masked
          ? `Your password was accepted. Enter the current code from the authenticator app registered to ${masked} to finish signing in.`
          : 'Your password was accepted. Enter the current code from your authenticator app to finish signing in.'
      }
      notice={
        <AuthNotice tone="info">
          Nothing on the account is reachable until this step is finished. Codes change every 30
          seconds, so if one is rejected, wait for the next rather than retrying the same six
          digits — and check the clock on the device if that keeps happening.
        </AuthNotice>
      }
      footer={
        <>
          Lost the authenticator? Use{' '}
          <Link href={AUTH_PATHS.recovery} className={AUTH_LINK}>
            account recovery
          </Link>{' '}
          if you still have access to the email on the account, or ask support to remove the factor
          — a factor can only be removed by someone who can already sign in, which is the point of
          it.
        </>
      }
    >
      <MfaClient nextPath={destination} />

      {/* Cancelling ends this session rather than leaving it half-open. An aal1 session on an
          account whose policy expects aal2 is not a useful thing to hand back to the browser. */}
      <form action={cancelChallengeAction} className="mt-5 border-t border-solid border-slate-200 pt-4">
        <button
          type="submit"
          className="text-sm font-semibold text-slate-600 underline underline-offset-2 transition-colors hover:text-slate-900"
        >
          Cancel and return to sign in
        </button>
      </form>
    </AuthShell>
  );
}
