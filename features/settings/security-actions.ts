'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SECURITY_PATH } from '@/features/settings/paths';
import type { SecurityFailureCode } from '@/features/settings/copy';

/**
 * The writes behind /settings/security.
 *
 * ── STEP-UP RE-AUTHENTICATION, AND WHERE IT ACTUALLY BITES ────────────────────────────────────
 *
 * The brief is explicit that a password change, a factor removal and revoking a session must require
 * step-up. All three are different shapes of action, and they are enforced in three different places
 * because they fail in three different ways:
 *
 *   REVOKING A SESSION   the RPC itself refuses at an aal1 session, and the action sends the visitor to
 *                        /auth/challenge first. Written when the sessions page was built.
 *
 *   CHANGING A PASSWORD  enforced HERE. The provider's `updateUser({ password })` has no assurance
 *                        requirement of its own, so this action is the only gate — if it did not check,
 *                        nothing would.
 *
 *   REMOVING A FACTOR    enforced HERE AND AGAIN BY THE PROVIDER. Delete runs against the admin API from
 *                        the server, so the browser never holds the credential that performs it, and this
 *                        action refuses to reach for that credential without an aal2 session.
 *
 * ⚠️ AN ACCOUNT WITH NO FACTOR IS NOT BLOCKED, WHICH IS A LIMIT RATHER THAN A DESIGN. There is no password
 * re-entry endpoint in GoTrue: faking one by calling `signInWithPassword` server-side would create a NEW
 * session row — a device nobody holds — purely to prove the caller knows their password. So an account with
 * a factor is challenged, and an account without one gets the confirmation dialog and the honest note that
 * this is all the platform can ask for. The security page states that before anybody presses anything.
 */

function failureCode(message: string): SecurityFailureCode {
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('step-up') || message.includes('aal2')) return 'step_up_required';
  if (message.includes('required') || message.includes('password')) return 'bad_request';
  return 'unavailable';
}

function backWith(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${SECURITY_PATH}?${encoded}` : SECURITY_PATH;
}

async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SECURITY_PATH }));
  return { supabase, user };
}

/**
 * The two levels, read from the provider rather than from a stored flag.
 *
 * `nextLevel === 'aal2'` means the account HAS a verified factor — the provider derives that from the factor
 * list, so this is the same fact `get_my_security_overview_command` reports and the two cannot disagree.
 * `stepUpPending` is then "has one, this session has not passed it", which is deliberately the same condition
 * the sessions page uses: an account with no factor has `nextLevel === 'aal1'` and is never challenged, because
 * there is nothing it could answer a challenge with.
 */
async function assurance(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = data?.currentLevel ?? 'aal1';
  const nextLevel = data?.nextLevel ?? 'aal1';
  return { currentLevel, nextLevel, hasFactor: nextLevel === 'aal2', pending: nextLevel === 'aal2' && currentLevel !== 'aal2' };
}

export async function changePasswordAction(formData: FormData) {
  const { supabase } = await requireSession();

  const levels = await assurance(supabase);
  if (levels.pending) {
    // The challenge carries the destination back here WITH the reason, so the visitor lands on the page
    // they were on and is told to try again rather than silently starting over.
    redirect(hrefWith(AUTH_PATHS.challenge, { next: backWith({ failed: 'step_up_required' }) }));
  }

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  if (password.length < 10) redirect(backWith({ failed: 'weak_password' }));
  if (password !== confirm) redirect(backWith({ failed: 'password_mismatch' }));

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not change the password: ${error.message}`);
    }
    redirect(backWith({ failed: failureCode(error.message) }));
  }

  await supabase.rpc('record_my_security_event_command', {
    p_action: 'ACCOUNT_PASSWORD_CHANGED',
    p_detail: { hadSecondFactor: levels.hasFactor },
  });

  redirect(backWith({ changed: 'password_changed' }));
}

export async function removeFactorAction(formData: FormData) {
  const { supabase, user } = await requireSession();

  const levels = await assurance(supabase);
  if (levels.pending) {
    redirect(hrefWith(AUTH_PATHS.challenge, { next: backWith({ failed: 'step_up_required' }) }));
  }

  const factorId = String(formData.get('factor_id') ?? '');
  if (!factorId) redirect(backWith({ failed: 'bad_request' }));

  // Ownership is checked against the caller's own factor list before the admin API is reached for. The
  // deletion below is scoped by `user.id`, so this is belt and braces — but it turns "no such factor"
  // from the provider into a sentence that says which thing was wrong.
  const { data: overview } = await supabase.rpc('get_my_security_overview_command');
  const factors = overview && typeof overview === 'object' ? (overview as Record<string, unknown>).factors : null;
  const owned = Array.isArray(factors)
    ? factors.some(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === factorId)
    : false;
  if (!owned) redirect(backWith({ failed: 'not_authorized' }));

  const factorType = Array.isArray(factors)
    ? String(
        (factors.find(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === factorId) as Record<string, unknown> | undefined)?.type ?? '',
      )
    : '';

  // ⚠️ THE REDIRECT IS OUTSIDE THE try/catch, AND THAT MATTERS. `redirect()` works by throwing a control-flow
  // value that Next catches at the framework boundary. Called inside a try block, that value is caught by this
  // catch instead and the failure path replaces a legitimate redirect with "unavailable" — a bug that looks
  // exactly like the provider refusing the request.
  let deletionFailure: string | null = null;
  try {
    const admin = createSupabaseServiceClient();
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factorId, userId: user.id });
    if (error) deletionFailure = error.message;
  } catch (cause) {
    // A missing service credential is an environment problem, not the visitor's. It is reported as an
    // unavailable action rather than a 500, because "this did not run" is the part they need to know.
    deletionFailure = cause instanceof Error ? cause.message : 'unavailable';
  }
  if (deletionFailure) redirect(backWith({ failed: failureCode(deletionFailure) }));

  await supabase.rpc('record_my_security_event_command', {
    p_action: 'ACCOUNT_FACTOR_REMOVED',
    p_detail: { factorType },
  });

  /**
   * THE PROVIDER ENDS EVERY SESSION WHEN A VERIFIED FACTOR IS DELETED, so this action does not pretend
   * otherwise: it signs the browser out itself and says why on the way to sign-in. Leaving the visitor on
   * a settings page whose session is already gone would produce a broken next click and no explanation.
   */
  await supabase.auth.signOut({ scope: 'local' });
  redirect(hrefWith(AUTH_PATHS.signIn, { reason: 'factor_removed' }));
}
