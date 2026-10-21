'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { PROFILE_PATH } from '@/features/settings/paths';
import type { ProfileFailureCode } from '@/features/settings/copy';

/**
 * The profile editor's writes.
 *
 * ⚠️ TWO KINDS OF WRITE, ON PURPOSE. Display name, language and timezone go through
 * `update_my_profile_command`; contacts go through their own commands because adding one is not a field
 * change — it starts a verification. Nothing here writes the sign-in address at all: that value belongs to
 * the authentication provider, and the page links to the provider's own confirmation flow instead of
 * showing a field that would have to lie about what saving it means.
 */

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function failureCode(message: string): ProfileFailureCode {
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('already on the account')) return 'duplicate_contact';
  if (message.includes('too many unverified')) return 'too_many_pending';
  if (message.includes('not correct')) return 'wrong_code';
  if (message.includes('expired')) return 'expired_code';
  if (message.includes('too many attempts')) return 'too_many_attempts';
  if (message.includes('verify that contact first')) return 'unverified_contact';
  return 'bad_request';
}

function backWith(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${PROFILE_PATH}?${encoded}` : PROFILE_PATH;
}

async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: PROFILE_PATH }));
  return supabase;
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('update_my_profile_command', {
    p_display_name: String(formData.get('display_name') ?? '').trim(),
    p_language_code: String(formData.get('language_code') ?? '').trim() || null,
    p_timezone: String(formData.get('timezone') ?? '').trim() || null,
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'saved' }));
}

/**
 * The avatar.
 *
 * ⚠️ THE OBJECT PATH IS DERIVED HERE, NOT ACCEPTED. It is always `<account id>/avatar` — the same value the
 * storage policy permits and the same value `set_my_avatar_command` insists on, so the three cannot disagree
 * about where a profile's picture is allowed to live. The upload runs on the visitor's own session, so the
 * storage policy is what actually authorises it.
 *
 * ⚠️ STORING A FILE IS NOT ATOMIC WITH RECORDING IT, so the order matters: the object is uploaded first and
 * the profile row is pointed at it second. A failure between the two leaves an orphaned object with nothing
 * referencing it — recoverable and invisible. The other order would leave a profile pointing at an image
 * that does not exist, which is a broken picture on every page that shows one.
 */
export async function uploadAvatarAction(formData: FormData) {
  const supabase = await requireSession();

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) redirect(backWith({ failed: 'bad_request' }));
  if (file.size > MAX_AVATAR_BYTES || !AVATAR_TYPES.has(file.type)) {
    redirect(backWith({ failed: 'avatar_unavailable' }));
  }

  const { data: account } = await supabase.from('accounts').select('id').maybeSingle();
  if (!account?.id) redirect(backWith({ failed: 'not_authorized' }));

  const path = `${account.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from('account-avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not store the avatar: ${uploadError.message}`);
    }
    redirect(backWith({ failed: 'avatar_unavailable' }));
  }

  const { error } = await supabase.rpc('set_my_avatar_command', {
    p_object_path: path,
    p_content_type: file.type,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ saved: 'saved' }));
}

export async function removeAvatarAction() {
  const supabase = await requireSession();

  const { error } = await supabase.rpc('clear_my_avatar_command');
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  // The row is cleared first: an object left behind with nothing pointing at it is invisible, whereas a
  // row pointing at a deleted object is a broken image. The delete is best-effort for the same reason.
  const { data: account } = await supabase.from('accounts').select('id').maybeSingle();
  if (account?.id) {
    await supabase.storage.from('account-avatars').remove([`${account.id}/avatar`]);
  }

  redirect(backWith({ saved: 'avatar_removed' }));
}

export async function addContactAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('add_my_contact_method_command', {
    p_kind: String(formData.get('kind') ?? ''),
    p_value: String(formData.get('value') ?? '').trim(),
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'contact_added' }));
}

export async function resendContactCodeAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('resend_my_contact_verification_command', {
    p_id: String(formData.get('contact_id') ?? ''),
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'code_sent' }));
}

export async function verifyContactAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('verify_my_contact_method_command', {
    p_id: String(formData.get('contact_id') ?? ''),
    p_code: String(formData.get('code') ?? ''),
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'contact_verified' }));
}

export async function setPrimaryContactAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('set_my_primary_contact_method_command', {
    p_id: String(formData.get('contact_id') ?? ''),
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'primary_set' }));
}

export async function removeContactAction(formData: FormData) {
  const supabase = await requireSession();
  const { error } = await supabase.rpc('remove_my_contact_method_command', {
    p_id: String(formData.get('contact_id') ?? ''),
  });

  if (error) redirect(backWith({ failed: failureCode(error.message) }));
  redirect(backWith({ saved: 'contact_removed' }));
}

/**
 * Change the sign-in address.
 *
 * ⚠️ THIS IS THE PROVIDER'S FLOW, AND THE ACTION ONLY STARTS IT. `updateUser({ email })` asks the
 * authentication provider to begin a change: it mails a confirmation to the new address, and — on a
 * deployment configured for secure email change — to the address being left as well. Nothing is written to
 * a table of ours, and the action's success message says "does not change until that link is followed"
 * rather than "saved", because that is what actually happened.
 *
 * ⚠️ NO PHONE EQUIVALENT IS OFFERED HERE. A number change goes through the same provider with an SMS code,
 * and this deployment has no SMS transport configured — a form that could only ever fail is worse than a
 * line saying the number cannot be verified here, which is what the page shows instead.
 */
export async function changeSignInEmailAction(formData: FormData) {
  const supabase = await requireSession();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    redirect(backWith({ failed: 'bad_request' }));
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not start the sign-in email change: ${error.message}`);
    }
    redirect(backWith({ failed: 'email_change_failed' }));
  }

  redirect(backWith({ saved: 'email_change_started' }));
}
