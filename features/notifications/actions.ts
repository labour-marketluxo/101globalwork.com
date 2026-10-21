'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { NOTIFICATIONS_PATH } from '@/features/settings/paths';
import { notificationCategory, type NotificationFailureCode } from '@/features/notifications/copy';

/**
 * The feed's actions.
 *
 * Server actions rather than API routes, for the reason every other write in this app is one: the
 * outcome travels in a query parameter as a CODE, never as a sentence, because that parameter is
 * user-editable and this page renders inside an authenticated surface.
 *
 * ⚠️ `not_found` IS A NORMAL OUTCOME, NOT AN ERROR. The feed is derived from rows that exist right now,
 * so an item can be resolved between the page being rendered and the button being pressed — somebody
 * else accepted the change, the payment cleared, the dispute was closed. The RPC raises a distinct error
 * for it and it gets its own message, because "this is no longer outstanding" and "something went wrong"
 * call for different reactions.
 */

function failureCode(message: string): NotificationFailureCode {
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('not found')) return 'not_found';
  if (message.includes('required') || message.includes('unknown filter') || message.includes('a value')) {
    return 'bad_request';
  }
  return 'unavailable';
}

/** `?a=1&b=2` appended to a path that may already carry a query string. */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  const [base, existing] = path.split('?');
  if (existing) new URLSearchParams(existing).forEach((value, key) => search.set(key, value));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${base}?${encoded}` : base;
}

/** Back to the filter the visitor was looking at, so acting on one item does not lose their place. */
function feedPath(category: FormDataEntryValue | null | undefined): string {
  const raw = category === null || category === undefined ? null : String(category);
  const selected = notificationCategory(raw);
  return selected === 'all' ? NOTIFICATIONS_PATH : withQuery(NOTIFICATIONS_PATH, { category: selected });
}

async function requireSession(path: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: path }));
  return supabase;
}

export async function markNotificationReadAction(formData: FormData) {
  const path = feedPath(formData.get('category'));
  const supabase = await requireSession(path);

  const key = String(formData.get('key') ?? '');
  const { error } = await supabase.rpc('mark_my_notification_read_command', { p_key: key });
  if (error) redirect(withQuery(path, { failed: failureCode(error.message) }));

  redirect(path);
}

export async function dismissNotificationAction(formData: FormData) {
  const path = feedPath(formData.get('category'));
  const supabase = await requireSession(path);

  const key = String(formData.get('key') ?? '');
  const { error } = await supabase.rpc('dismiss_my_notification_command', { p_key: key });
  if (error) redirect(withQuery(path, { failed: failureCode(error.message) }));

  redirect(withQuery(path, { dismissed: 1 }));
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const path = feedPath(formData.get('category'));
  const supabase = await requireSession(path);

  const selected = notificationCategory(String(formData.get('category') ?? ''));
  const { data, error } = await supabase.rpc('mark_all_my_notifications_read_command', {
    p_category: selected === 'all' ? null : selected,
  });
  if (error) redirect(withQuery(path, { failed: failureCode(error.message) }));

  // The count is reported back rather than a bare "done": pressing a button that changed nothing,
  // because everything was already read, should say so rather than pretend something happened.
  const changed = typeof data === 'number' && Number.isFinite(data) ? data : 0;
  redirect(withQuery(path, { read: changed }));
}
