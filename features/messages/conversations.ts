import { createSupabaseServerClient } from '@/lib/supabase/server';
import { initialsOf } from '@/features/settings/shell';
import {
  conversationKind,
  participantRole,
  type ConversationFilter,
  type ConversationKind,
  type ParticipantRole,
} from '@/features/messages/copy';

/**
 * The read layer for /messages.
 *
 * ⚠️ THERE IS NO THREAD TABLE AND NOTHING NEW IS WRITTEN. The directory is built from the two message
 * tables the platform already has — the conversation about an assignment, and the conversation between a
 * customer and one provider about a request — plus one new piece of state per account: when it last read
 * a thread, and whether it archived it. The migration's header has the full argument.
 *
 * ⚠️ PARTICIPANTS COME FROM THE MESSAGES. There is no membership table for a thread, so a person appears
 * in the header only after they have said something. That is a real limitation of deriving the directory
 * rather than storing one, and the page does not pretend otherwise — the count above the list is
 * "messages you have not read", not "people waiting on you".
 */

export type ConversationParticipant = {
  name: string;
  role: ParticipantRole;
  initials: string;
};

export type ConversationThread = {
  key: string;
  kind: ConversationKind;
  title: string;
  contextLabel: string;
  href: string;
  participants: ConversationParticipant[];
  unreadCount: number;
  awaitingMe: boolean;
  lastExcerpt: string | null;
  lastAuthor: string | null;
  lastActivityAt: string | null;
  archived: boolean;
};

export type ConversationsRead = {
  threads: ConversationThread[];
  counts: { open: number; unreadThreads: number; archived: number };
  /** True when the directory could not be read at all — not the same as a directory with no threads. */
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const countFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

function toParticipants(value: unknown): ConversationParticipant[] {
  return rowsFrom(value)
    .map(raw => {
      const name = textFrom(raw.name);
      if (!name) return null;
      return {
        name,
        role: participantRole(textFrom(raw.role)),
        initials: initialsOf(name),
      } satisfies ConversationParticipant;
    })
    .filter((entry): entry is ConversationParticipant => entry !== null);
}

function toThread(raw: Raw): ConversationThread | null {
  const key = textFrom(raw.key);
  const kind = conversationKind(textFrom(raw.kind));
  const title = textFrom(raw.title);
  const href = textFrom(raw.href);
  if (!key || !kind || !title || !href) return null;

  return {
    key,
    kind,
    title,
    contextLabel: textFrom(raw.contextLabel) ?? 'Your project',
    href,
    participants: toParticipants(raw.participants),
    unreadCount: countFrom(raw.unreadCount),
    awaitingMe: raw.awaitingMe === true,
    lastExcerpt: textFrom(raw.lastExcerpt),
    lastAuthor: textFrom(raw.lastAuthor),
    lastActivityAt: textFrom(raw.lastActivityAt),
    archived: raw.archived === true,
  };
}

export async function getMyConversations(
  query: string | null,
  filter: ConversationFilter,
): Promise<ConversationsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_conversations_command', {
    p_query: query && query.trim().length > 0 ? query.trim() : null,
    p_filter: filter,
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[messages] could not read the conversation directory: ${error.message}`);
    }
    return { threads: [], counts: { open: 0, unreadThreads: 0, archived: 0 }, unavailable: true };
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) {
    return { threads: [], counts: { open: 0, unreadThreads: 0, archived: 0 }, unavailable: true };
  }

  const counts = objectFrom(raw.counts);

  return {
    threads: rowsFrom(raw.threads)
      .map(toThread)
      .filter((thread): thread is ConversationThread => thread !== null),
    counts: {
      open: countFrom(counts.open),
      unreadThreads: countFrom(counts.unreadThreads),
      archived: countFrom(counts.archived),
    },
    unavailable: false,
  };
}

/**
 * One line summarising what is at the top of a thread.
 *
 * The excerpt is already truncated by the database; this only decides whether to attribute it. An
 * excerpt with no author would read as something the platform said.
 */
export function lastActivityLine(thread: ConversationThread): string | null {
  if (!thread.lastExcerpt) return null;
  return thread.lastAuthor ? `${thread.lastAuthor}: ${thread.lastExcerpt}` : thread.lastExcerpt;
}
