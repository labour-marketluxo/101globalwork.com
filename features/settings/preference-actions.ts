'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { NOTIFICATION_SETTINGS_PATH } from '@/features/settings/paths';
import type { PreferenceFailureCode } from '@/features/settings/copy';

/**
 * One action for one cell of the matrix.
 *
 * ⚠️ THE MATRIX IS A SET OF FORMS, NOT A SAVE BUTTON. A preferences screen with one Save at the bottom
 * cannot say which change was refused, and the one change that CAN be refused — a locked notice — is the one
 * where the reason matters most. Each cell posts its new value and comes back with either the saved state or
 * the reason it was not saved.
 *
 * ⚠️ THE LOCK IS ENFORCED BY THE COMMAND. The disabled attribute on the control is a courtesy; a POST that
 * never came from this page gets the same refusal, mapped onto the same sentence.
 */

function failureCode(message: string): PreferenceFailureCode {
  if (message.includes('cannot be switched off')) return 'locked';
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  return 'bad_request';
}

function backWith(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${NOTIFICATION_SETTINGS_PATH}?${encoded}` : NOTIFICATION_SETTINGS_PATH;
}

export async function setNotificationPreferenceAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: NOTIFICATION_SETTINGS_PATH }));

  const eventCode = String(formData.get('event_code') ?? '');
  const channel = String(formData.get('channel') ?? '');
  // The form posts the value it WANTS, not the state of a checkbox: a browser that omits an unchecked box
  // must not be readable as "turn everything off".
  const enabled = String(formData.get('enabled') ?? '') === 'true';

  const { error } = await supabase.rpc('set_my_notification_preference_command', {
    p_event_code: eventCode,
    p_channel: channel,
    p_enabled: enabled,
  });
  if (error) redirect(backWith({ failed: failureCode(error.message) }));

  redirect(backWith({ changed: `${eventCode}:${channel}` }));
}
