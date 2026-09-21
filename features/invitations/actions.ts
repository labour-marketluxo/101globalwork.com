'use server';

import { redirect } from 'next/navigation';
import { classifyInvitationError } from '@/features/invitations/invitation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The three things a recipient can do with an invitation.
 *
 * The failure vocabulary and its copy live in features/invitations/invitation.ts — a `'use server'`
 * module may export only async functions, and a vocabulary plus its copy is neither.
 */

function invitationPath(token: string): string {
  return `/invitations/${encodeURIComponent(token)}`;
}

/** Accept: the actual grant. Permission-checked, audited and reversible from the admin surface. */
export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/onboarding');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Signed out, accepting is impossible — the command requires a session whose address matches. The
  // token rides along so the visitor comes straight back here after signing in.
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(invitationPath(token))}`);

  const { error } = await supabase.rpc('accept_platform_admin_invitation_command', { p_token: token });

  if (error) {
    const code = classifyInvitationError(error.message);
    // A wrong-account attempt is not a dead end: the page offers to sign in as somebody else, which is
    // the only thing that can resolve it.
    redirect(`${invitationPath(token)}?error=${code}`);
  }

  // Into the workspace the invitation actually grants. `/admin` is the administrative surface; a
  // "joined" flag lets it acknowledge the change rather than looking like an ordinary landing.
  redirect('/admin?joined=1');
}

/**
 * Decline.
 *
 * Needs no session (see the decline command: the token is the credential), which is what makes it
 * possible for someone who does not want an account here to say so — and, more importantly, it
 * invalidates the link. That is the only lever a recipient has if the invitation arrived unexpectedly.
 */
export async function declineInvitationAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/onboarding');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('decline_platform_admin_invitation_command', { p_token: token });

  if (error) {
    redirect(`${invitationPath(token)}?error=${classifyInvitationError(error.message)}`);
  }

  redirect(`${invitationPath(token)}?declined=1`);
}

/**
 * "Sign in as a different user."
 *
 * The invitation is bound to an email address, so a visitor signed into the wrong account cannot
 * accept it — the database refuses, correctly. The only useful answer is to end this session and go
 * back to sign-in with the invitation preserved. `scope: 'local'` keeps every other device signed in:
 * this is a switching action, not a security response.
 */
export async function switchInvitationAccountAction(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect(`/auth/sign-in?next=${encodeURIComponent(invitationPath(token))}`);
}
