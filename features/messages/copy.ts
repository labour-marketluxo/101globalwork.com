/**
 * The conversation directory's vocabulary.
 *
 * The database returns a thread kind and a participant role; the words for them live here, in one map,
 * so the list, the filter chips and the empty states cannot describe the same thread differently.
 */

export type ConversationKind =
  | 'project'
  | 'task'
  | 'quote'
  | 'scope_change'
  | 'milestone'
  | 'dispute';

export type ParticipantRole = 'customer' | 'provider' | 'platform';

export const CONVERSATION_KINDS: readonly ConversationKind[] = [
  'project',
  'task',
  'quote',
  'scope_change',
  'milestone',
  'dispute',
];

export const KIND_COPY: Record<ConversationKind, string> = {
  project: 'Project',
  task: 'Task',
  quote: 'Quote',
  scope_change: 'Scope',
  milestone: 'Milestone',
  dispute: 'Dispute',
};

/**
 * Role badges.
 *
 * Customer and provider are the two parties to the work; "platform" is the third thing a participant can
 * be — a support or trust operator who has posted in the thread. Labelling an operator as a provider
 * would be the worst of the three errors, because it would read as the person who is being paid.
 */
export const ROLE_COPY: Record<ParticipantRole, string> = {
  customer: 'Customer',
  provider: 'Provider',
  platform: 'Platform',
};

export function participantRole(value: string | null | undefined): ParticipantRole {
  if (value === 'customer' || value === 'platform') return value;
  return 'provider';
}

export function conversationKind(value: string | null | undefined): ConversationKind | null {
  return (CONVERSATION_KINDS as readonly string[]).includes(String(value))
    ? (value as ConversationKind)
    : null;
}

/** The three views of the directory. `unread` and `archived` are the two the brief names. */
export const CONVERSATION_FILTERS = ['all', 'unread', 'archived'] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const CONVERSATION_FILTER_COPY: Record<ConversationFilter, string> = {
  all: 'All open',
  unread: 'Unread',
  archived: 'Archived',
};

export function conversationFilter(value: string | null | undefined): ConversationFilter {
  return (CONVERSATION_FILTERS as readonly string[]).includes(String(value))
    ? (value as ConversationFilter)
    : 'all';
}

export const CONVERSATION_FAILURE_CODES = ['not_authorized', 'bad_request', 'not_found', 'unavailable'] as const;
export type ConversationFailureCode = (typeof CONVERSATION_FAILURE_CODES)[number];

export const CONVERSATION_FAILURE_COPY: Record<ConversationFailureCode, string> = {
  not_authorized: 'That conversation belongs to a different account, so nothing was changed.',
  bad_request: 'That request was missing the conversation it was meant to act on.',
  not_found:
    'That conversation is not in your directory. It may belong to a project that has since closed — reload to see the current list.',
  unavailable: 'The change could not be saved. Reload this page before assuming it was.',
};

export function conversationFailureCode(value: string | undefined | null): ConversationFailureCode | null {
  if (!value) return null;
  return (CONVERSATION_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as ConversationFailureCode)
    : null;
}
