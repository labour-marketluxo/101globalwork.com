'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  AUTH_PATHS,
  classifyAuthError,
  hrefWith,
  recoveryErrorCode,
  safeInternalPath,
  type AuthErrorCode,
} from '@/features/auth/post-auth';
import {
  clearPendingVerification,
  readPendingVerification,
  rememberPendingVerification,
} from '@/features/auth/verify-cookie';

/**
 * The authentication server actions.
 *
 * WHAT CHANGED WITH THE /auth/* ROUTES, and why each change is here rather than in a page:
 *
 *   Paths come from AUTH_PATHS. Every redirect below used to spell `/sign-in?next=…` by hand,
 *   in six places, next to twenty-odd call sites that did the same in other files.
 *
 *   Failures return a CODE, not a sentence. The pages own the copy. A URL that carries
 *   user-editable text rendered inside the sign-in card is a phishing primitive — see the
 *   header of post-auth.ts for the whole argument.
 *
 *   The destination is read from `redirect` first and `next` second, so both the documented
 *   parameter and the one this codebase grew up with work.
 *
 *   Consent is verified HERE, not only by the browser. `required` on a checkbox is a courtesy to
 *   the person filling the form; a POST does not have to arrive from a browser, and an account
 *   created without the agreement is exactly the record you do not want to discover later.
 */

/** Validated internal path, from a form field. See safeInternalPath for what is rejected. */
function safeNext(value: FormDataEntryValue | null, fallback = '/'): string {
  return safeInternalPath(value === null ? null : String(value), fallback);
}

/** A redirect back to an auth page with a coded error and the destination preserved. */
function failure(path: string, code: AuthErrorCode, extra: Record<string, string | undefined> = {}) {
  return hrefWith(path, { error: code, ...extra });
}

function withFlag(path: string, key: string, value = '1') {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (!host) throw new Error('Unable to resolve site origin');
  return `${proto}://${host}`;
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();
  const intent = formData.get('intent') === 'provider' ? 'provider' : 'customer';
  const consented = formData.get('consent') !== null;
  const requested = safeNext(formData.get('next'), '');
  // The journey is CHOSEN on /onboarding rather than assumed from the intent captured here, which is
  // why both intents fall back to the same place. The intent is not discarded: it pre-selects the
  // matching card, so the visitor is confirming a choice rather than making one from scratch. Sending a
  // provider-intent account straight into /provider/onboarding skipped that confirmation and left the
  // customer journey invisible to anyone who had not thought about it.
  const fallback = '/onboarding';
  const next = requested || fallback;
  const back = { next: requested || undefined, intent };

  // Cheapest checks first: no point creating an auth call to be told the password was short.
  if (!consented) redirect(failure(AUTH_PATHS.signUp, 'unknown', back));
  if (!email || password.length < 10) {
    redirect(failure(AUTH_PATHS.signUp, password.length < 10 ? 'weak_password' : 'unknown', back));
  }

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // `intent` is an INTENT HINT stored on the account, not a grant. Provider capability is
      // decided in the database after verification; nothing here can confer it. It is stored so
      // the onboarding flow can start the visitor on the path they chose.
      data: { display_name: displayName, signup_intent: intent },
      emailRedirectTo: `${origin}${AUTH_PATHS.callback}?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) redirect(failure(AUTH_PATHS.signUp, classifyAuthError(error.message), back));

  // Some projects return a usable session immediately; others require email confirmation. Never
  // tell someone to check their email when Auth has already signed them in.
  if (data.session) redirect(withFlag(next, 'welcome'));

  // The address is remembered in an httpOnly cookie rather than put in this URL: query strings end
  // up in access logs, proxy logs and referrer headers, and the verification page has to be able to
  // name the destination a code went to. See features/auth/verify-cookie.ts for the trade-off.
  await rememberPendingVerification(email);
  redirect(hrefWith(AUTH_PATHS.verify, { sent: '1', next: requested || undefined }));
}

/**
 * Verify the six-digit code.
 *
 * THE ADDRESS COMES FROM THE COOKIE, not from the form: it is the address the platform actually
 * sent a code to, which is the only thing the code can be verified against. The field on the page
 * exists for the direct-visit case (someone opening /auth/verify with no pending verification), and
 * is read only as a fallback.
 *
 * `type: 'signup'` is the confirmation flow, not sign-in — the two differ in the provider's API
 * and using the wrong one rejects a valid code. On success the provider issues a session, so the
 * visitor goes straight to the destination rather than back through the sign-in form: the address
 * has just been proven, which is the same thing a password proves.
 */
export async function verifyCodeAction(formData: FormData) {
  const token = String(formData.get('token') ?? '').replace(/\D/g, '');
  // A confirmed address with nowhere to go lands on the journey chooser. Signing in does not: an
  // existing account has already chosen.
  const next = safeNext(formData.get('next'), '/onboarding');
  const back = { next };

  if (token.length !== 6) redirect(failure(AUTH_PATHS.verify, 'invalid_code', back));

  const pending = await readPendingVerification();
  const posted = String(formData.get('email') ?? '').trim().toLowerCase();
  const address = pending.email ?? posted;
  if (!address) redirect(failure(AUTH_PATHS.verify, 'unknown', back));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email: address, token, type: 'signup' });

  if (error) {
    const code = classifyAuthError(error.message);
    // An address that is already confirmed is not a failure to retry — there is nothing left to
    // verify, so the honest next step is the sign-in form with the reason attached.
    if (code === 'already_verified') {
      await clearPendingVerification();
      redirect(failure(AUTH_PATHS.signIn, code, back));
    }
    redirect(failure(AUTH_PATHS.verify, code, back));
  }

  await clearPendingVerification();
  redirect(withFlag(next, 'verified'));
}

/**
 * Forget the pending address, so the visitor can start again with the right one.
 *
 * This is what "change email address" has to mean here. The account was created against the
 * address that received the code, so changing it is not an edit — it is a new account with the
 * correct address, which is why this clears the cookie and hands over to sign-up with the copy it
 * needs to explain that. The unconfirmed account holds nothing and cannot sign in, so nothing is
 * lost by leaving it behind.
 */
export async function forgetPendingContactAction() {
  await clearPendingVerification();
  redirect(AUTH_PATHS.signUp);
}

export async function resendConfirmationAction(formData: FormData) {
  const next = safeNext(formData.get('next'), '');
  const back = { next: next || undefined };
  const pending = await readPendingVerification();

  // The address is the one a code already went to; the form's field is only used when there is no
  // pending verification (a direct visit, or a browser that cleared cookies).
  const email = pending.email ?? String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect(failure(AUTH_PATHS.verify, 'unknown', back));

  // THE COOLDOWN IS ENFORCED HERE, not by the disabled attribute on the button. Someone can post
  // this form directly, and the answer they get is the same one the button would have given — the
  // countdown on screen and the server's rule cannot disagree.
  if (pending.sentAt !== null && (pending.availableAt - Date.now()) > 0) {
    redirect(failure(AUTH_PATHS.verify, 'rate_limited', back));
  }

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}${AUTH_PATHS.callback}?next=${encodeURIComponent(next || '/')}` },
  });

  // Same rule as recovery: a rate limit is the visitor's business, everything else is not, and
  // saying more would turn this form into an account-existence oracle.
  const code = recoveryErrorCode(error?.message);
  if (code) redirect(failure(AUTH_PATHS.verify, code, back));

  await rememberPendingVerification(email);
  redirect(hrefWith(AUTH_PATHS.verify, { resent: '1', ...back }));
}

/**
 * Finish a recovery: set the new password on the session the recovery link produced.
 *
 * THE SESSION IS THE PROOF. Reaching this action without one means the link was never exchanged —
 * expired, already used, or opened in a different browser — so the answer is the expired-link state
 * rather than a password form that would fail anyway.
 *
 * NOT DONE HERE, deliberately: signing other devices out. `signOut({ scope: 'others' })` after a
 * recovery is defensible — if someone else had a session, changing the password should evict them —
 * but it also logs the visitor out of their own phone and laptop, which is a product decision
 * rather than a security default, and one nobody has made yet. Written down so it is not
 * rediscovered as an oversight.
 */
export async function resetPasswordAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  const next = safeNext(formData.get('next'), '/');
  const back = { reset: '1', next };

  if (password.length < 10) redirect(failure(AUTH_PATHS.recovery, 'weak_password', back));
  if (password !== confirm) redirect(failure(AUTH_PATHS.recovery, 'password_mismatch', back));

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(failure(AUTH_PATHS.recovery, 'link_expired', {}));

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(failure(AUTH_PATHS.recovery, classifyAuthError(error.message), back));

  // The recovery exchange already proved the address, so the session stands: the visitor continues
  // signed in rather than being asked for the password they just replaced. The confirmation is a
  // view on the recovery page rather than a flag on the destination, because the destination is
  // often a page that would have no idea what the flag meant.
  redirect(hrefWith(AUTH_PATHS.recovery, { updated: '1', ...(next !== '/' ? { next } : {}) }));
}

/**
 * Abandon a challenge and end the half-authenticated session.
 *
 * `scope: 'local'` on purpose: this session has only proved one factor, and leaving it alive would
 * be worse than useless — it is an aal1 session for an account whose policy expects aal2. Other
 * devices are untouched, because cancelling here says nothing about them.
 */
export async function cancelChallengeAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect(AUTH_PATHS.signIn);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'), '/');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // One code for every credential failure: telling the visitor whether the address exists is
    // what turns a sign-in form into an enumeration oracle. Rate limits and locked accounts are
    // different stories the visitor can act on, so they keep their own copy.
    redirect(failure(AUTH_PATHS.signIn, classifyAuthError(error.message), { next }));
  }

  // MFA STEP-UP. `nextLevel === 'aal2'` means this account has a verified factor, so a password
  // alone is not the whole credential: the session is raised from aal1 to aal2 on the challenge
  // page before it goes anywhere. Enrolment stays voluntary (/account/security); what this
  // guarantees is that an account which HAS a factor cannot be used with the password alone.
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    redirect(hrefWith(AUTH_PATHS.challenge, { next }));
  }

  const { data: activationRequired } = await supabase.rpc('platform_admin_activation_required_command');
  if (activationRequired) redirect('/account/activate-admin-access');
  redirect(withFlag(next, 'signed_in'));
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = safeNext(formData.get('next'), '/');
  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}${AUTH_PATHS.callback}?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  });
  if (error || !data.url) redirect(failure(AUTH_PATHS.signIn, 'oauth_unavailable', { next }));
  redirect(data.url);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // The link lands on the shared callback first, because only a route handler can write the
    // session cookies the exchange produces — a Server Component cannot. It then forwards to the
    // recovery page, which is where the visitor sets the new password.
    redirectTo: `${origin}${AUTH_PATHS.callback}?next=${encodeURIComponent(`${AUTH_PATHS.recovery}?reset=1`)}`,
  });

  // The success state is deliberately identical whether or not the address exists — this form
  // must not become an account-existence oracle. A rate limit is the one failure the visitor can
  // act on and the one that reveals nothing, so it is the only one surfaced.
  const code = recoveryErrorCode(error?.message);
  if (code) redirect(failure(AUTH_PATHS.recovery, code));
  redirect(hrefWith(AUTH_PATHS.recovery, { sent: '1' }));
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/');
}
