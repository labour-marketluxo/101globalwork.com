'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SESSIONS_PATH, type SessionFailureCode } from '@/features/settings/paths';

/**
 * Session actions.
 *
 * Both are server actions rather than API routes, so the destructive buttons work with the same
 * redirect-plus-code pattern as every other form in this app: the outcome travels in a query
 * parameter as a CODE, never as a sentence, because that parameter is user-editable and this page
 * renders inside an authenticated surface.
 */

/** Maps the RPC's own error text onto the fixed vocabulary the page renders. */
function failureCode(message: string): SessionFailureCode {
  if (message.includes('not authorized')) return 'not_authorized';
  if (message.includes('required')) return 'bad_request';
  return 'unavailable';
}

export async function revokeSessionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SESSIONS_PATH }));

  const sessionId = String(formData.get('session_id') ?? '');
  const { data, error } = await supabase.rpc('revoke_my_session_command', {
    p_session_id: sessionId,
  });

  if (error) redirect(`${SESSIONS_PATH}?failed=${failureCode(error.message)}`);

  /**
   * SELF-REVOCATION. The RPC returns true when the session it just ended is the one holding this
   * request, and the brief is explicit about what happens then: sign out and go to sign-in with a
   * reason. `scope: 'local'` because the other devices are none of this action's business — and
   * because a visitor who ended one device did not ask to end the rest.
   *
   * The redirect carries `reason=session_revoked` rather than `error=`, which is a different kind of
   * message: nothing went wrong, and the sign-in page says so in an informational tone.
   */
  if (data === true) {
    await supabase.auth.signOut({ scope: 'local' });
    redirect(hrefWith(AUTH_PATHS.signIn, { reason: 'session_revoked' }));
  }

  redirect(`${SESSIONS_PATH}?revoked=1`);
}

/**
 * Sign out every device except this one — the high-impact action.
 *
 * STEP-UP GATE. If the account has a verified second factor, this refuses to act at an aal1 session
 * and sends the visitor to the challenge instead. They land back here and press the button again,
 * which is deliberate: a redirect target that performed the revocation on arrival would be a GET
 * request that ends sessions, and browsers, proxies and mail scanners follow GETs on their own.
 *
 * ACCOUNTS WITHOUT A FACTOR ARE NOT BLOCKED, and that is a limit rather than a design: there is no
 * password re-entry endpoint in GoTrue, and faking one by calling signInWithPassword server-side
 * would create a NEW session row (a device nobody has) purely to prove the caller knows their
 * password. So those accounts get the confirmation dialog and nothing else. The page states this
 * instead of implying a challenge that will not come.
 */
export async function revokeOtherSessionsAction() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SESSIONS_PATH }));

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    redirect(hrefWith(AUTH_PATHS.challenge, { next: SESSIONS_PATH }));
  }

  const { data, error } = await supabase.rpc('revoke_other_sessions_command');
  if (error) redirect(`${SESSIONS_PATH}?failed=unavailable`);

  const ended = typeof data === 'number' ? data : 0;
  redirect(`${SESSIONS_PATH}?ended=${ended}`);
}
