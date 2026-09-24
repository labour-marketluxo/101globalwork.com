import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * What the account shell needs: who is looking, and the two unread counts in the header.
 *
 * ⚠️ ONE SET OF READS PER REQUEST, SHARED BY THE LAYOUT AND EVERY PAGE UNDER IT. React's `cache` makes
 * the second caller free, which matters because the shell is drawn by the settings layout and the
 * inboxes draw their own copy of it — four queries repeated on every page would be four queries nobody
 * asked for. Same reasoning, and the same shape, as features/admin/context.ts.
 *
 * ⚠️ IT FAILS SOFT, AND SAYS SO. A badge is not worth a 500: if the counts cannot be read, the header
 * renders without them and the inbox pages show their own "could not be read" state. What it must never
 * do is print a zero in their place — "no unread messages" and "we could not check" are different
 * claims, and the header is the one place a person glances at to decide whether to look further.
 */

export type AccountShell = {
  signedIn: boolean;
  accountId: string | null;
  displayName: string;
  initials: string;
  email: string | null;
  notifications: { unread: number; actionRequired: number; unavailable: boolean };
  messages: { unreadThreads: number; unreadMessages: number; unavailable: boolean };
};

const EMPTY: AccountShell = {
  signedIn: false,
  accountId: null,
  displayName: '',
  initials: '?',
  email: null,
  notifications: { unread: 0, actionRequired: 0, unavailable: true },
  messages: { unreadThreads: 0, unreadMessages: 0, unavailable: true },
};

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * "Ada Okonkwo" → "AO", "ada" → "A", no name at all → the first letter of the address, and failing
 * that a question mark. Deriving it here rather than storing it means a display-name change cannot
 * leave a stale monogram behind.
 */
export function initialsOf(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const value = (candidate ?? '').trim();
    if (!value) continue;
    const words = value.split(/\s+/).slice(0, 2);
    const letters = words.map(word => word[0]).join('').toUpperCase();
    if (letters) return letters;
  }
  return '?';
}

export const getAccountShell = cache(async (): Promise<AccountShell> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const [profile, account, notifications, conversations] = await Promise.all([
    supabase.from('profiles').select('display_name').maybeSingle(),
    supabase.from('accounts').select('id').maybeSingle(),
    supabase.rpc('get_my_notification_badge_command'),
    supabase.rpc('get_my_conversation_badge_command'),
  ]);

  const displayName = (profile.data?.display_name ?? '').trim();
  const notificationCounts = objectFrom(notifications.data);
  const conversationCounts = objectFrom(conversations.data);

  return {
    signedIn: true,
    accountId: account.data?.id ?? null,
    displayName,
    initials: initialsOf(displayName, user.email ?? null),
    email: user.email ?? null,
    notifications: {
      unread: numberFrom(notificationCounts.unread),
      actionRequired: numberFrom(notificationCounts.actionRequired),
      unavailable: Boolean(notifications.error) || notificationCounts.allowed === false,
    },
    messages: {
      unreadThreads: numberFrom(conversationCounts.unreadThreads),
      unreadMessages: numberFrom(conversationCounts.unreadMessages),
      unavailable: Boolean(conversations.error) || conversationCounts.allowed === false,
    },
  };
});
