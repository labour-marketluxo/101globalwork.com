'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { MESSAGES_PATH } from '@/features/settings/paths';
import {
  conversationFilter,
  type ConversationFailureCode,
} from '@/features/messages/copy';

/**
 * The directory's two writes: mark read and archive.
 *
 * There is no "send" action here, and that is deliberate rather than an omission. Replying happens in the
 * thread it belongs to — the project's own messages page, or the customer/provider quote page — because
 * a reply composed from a directory has to guess which context it is about, and the message tables store
 * the context as a column that a guess would get wrong.
 */

function failureCode(message: string): ConversationFailureCode {
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('not found')) return 'not_found';
  if (message.includes('required') || message.includes('a thread') || message.includes('a value')) return 'bad_request';
  return 'unavailable';
}

/** Preserve the search and the filter across an action, so acting does not reset the view. */
function directoryPath(formData: FormData): string {
  const search = new URLSearchParams();
  const filter = conversationFilter(String(formData.get('filter') ?? ''));
  const query = String(formData.get('q') ?? '').trim();
  if (filter !== 'all') search.set('filter', filter);
  if (query) search.set('q', query);
  const encoded = search.toString();
  return encoded ? `${MESSAGES_PATH}?${encoded}` : MESSAGES_PATH;
}

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

async function requireSession(path: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: path }));
  return supabase;
}

export async function markConversationReadAction(formData: FormData) {
  const path = directoryPath(formData);
  const supabase = await requireSession(path);

  const { error } = await supabase.rpc('mark_my_conversation_read_command', {
    p_thread_key: String(formData.get('thread_key') ?? ''),
  });
  if (error) redirect(withQuery(path, { failed: failureCode(error.message) }));

  redirect(path);
}

export async function archiveConversationAction(formData: FormData) {
  const path = directoryPath(formData);
  const supabase = await requireSession(path);

  const archived = String(formData.get('archived') ?? '') !== 'false';
  const { error } = await supabase.rpc('archive_my_conversation_command', {
    p_thread_key: String(formData.get('thread_key') ?? ''),
    p_archived: archived,
  });
  if (error) redirect(withQuery(path, { failed: failureCode(error.message) }));

  // Archiving implies reading, for the same reason dismissing a notification does: a thread that has left
  // the list but is still counted as unread makes the badge disagree with the list.
  if (archived) {
    await supabase.rpc('mark_my_conversation_read_command', {
      p_thread_key: String(formData.get('thread_key') ?? ''),
    });
  }

  redirect(withQuery(path, { [archived ? 'archived' : 'restored']: 1 }));
}
