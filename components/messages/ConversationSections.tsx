import Link from 'next/link';
import { Archive, ArchiveRestore, CircleAlert, CircleCheck, Inbox, Search } from '@/components/ui/icons';
import { BADGE_SLATE, CARD, FIELD, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { MESSAGES_PATH } from '@/features/settings/paths';
import { formatRelativeTime } from '@/features/settings/device-label';
import {
  archiveConversationAction,
  markConversationReadAction,
} from '@/features/messages/actions';
import {
  CONVERSATION_FILTER_COPY,
  KIND_COPY,
  ROLE_COPY,
  type ConversationFilter,
} from '@/features/messages/copy';
import { lastActivityLine, type ConversationThread } from '@/features/messages/conversations';

/**
 * The conversation directory's presentation, all server components.
 *
 * ⚠️ HIGH DENSITY IS THE POINT, AND IT IS ACHIEVED BY REMOVING WORDS RATHER THAN SHRINKING TYPE. Every row
 * carries the same six fields — what it is, what project or request it belongs to, who is in it, how much is
 * unread, when it last moved, and what was last said — and nothing else. No previews of more than one
 * message, no metadata that only matters once you are inside the thread, no per-row explanation of what a
 * role badge means. The explanation is above the list, once.
 *
 * ⚠️ NO REPLY BOX. A reply composed from a directory has to guess which context it is about, and the message
 * tables store that context as a column a guess would get wrong. Every row opens the thread it belongs to,
 * where the composer already knows.
 *
 * ⚠️ WHAT AN UNREAD COUNT MEANS HERE. It is messages written by somebody else since this account last opened
 * the thread — not "people waiting on you". A thread somebody read and did not reply to stays at zero, and
 * the page says so rather than implying a queue of obligations that does not exist.
 */
export function ConversationSearch({
  query,
  filter,
}: {
  query: string;
  filter: ConversationFilter;
}) {
  return (
    <div className="grid gap-3">
      <form method="get" action={MESSAGES_PATH} className="flex flex-wrap items-center gap-2">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="conversation-search" className="sr-only">
          Search conversations
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="conversation-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by title, project, participant or message text"
            className={`${FIELD} pl-9`}
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark"
        >
          Search
        </button>
      </form>

      <nav aria-label="Filter conversations" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max items-center gap-1.5">
          {(['all', 'unread', 'archived'] as const).map(value => {
            const isCurrent = value === filter;
            const params = new URLSearchParams();
            if (value !== 'all') params.set('filter', value);
            if (query) params.set('q', query);
            const href = params.toString() ? `${MESSAGES_PATH}?${params}` : MESSAGES_PATH;

            return (
              <li key={value}>
                <Link
                  href={href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold no-underline transition-colors ${
                    isCurrent
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {CONVERSATION_FILTER_COPY[value]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function ConversationSummary({
  open,
  unreadThreads,
  unreadMessages,
  filtered,
  query,
}: {
  open: number;
  unreadThreads: number;
  unreadMessages: number;
  filtered: boolean;
  query: string;
}) {
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      {filtered || query ? (
        <>
          Showing the threads that match{query ? ` “${query}”` : ''} — {unreadThreads} with unread messages.
        </>
      ) : (
        <>
          {open} open conversation{open === 1 ? '' : 's'} · {unreadThreads} with something unread ·{' '}
          {unreadMessages} unread message{unreadMessages === 1 ? '' : 's'} in total. An unread count is what
          was written since you last opened the thread, not a reply that is owed.
        </>
      )}
    </p>
  );
}

export function ConversationsUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">The conversations could not be read.</p>
        <p className="mt-1">
          This page cannot tell you what is waiting — that is different from there being nothing. Reload to
          try again. Project and quote threads remain reachable from the project itself in the meantime.
        </p>
      </div>
    </div>
  );
}

export function ConversationsEmpty({
  filter,
  query,
}: {
  filter: ConversationFilter;
  query: string;
}) {
  const searching = query.length > 0;

  return (
    <div className="rounded-xl border border-solid border-slate-200 bg-white p-8 text-center">
      <Inbox aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
      <p className="mt-3 text-sm font-semibold text-slate-800">
        {searching
          ? `No conversations match “${query}”.`
          : filter === 'archived'
            ? 'Nothing is archived.'
            : filter === 'unread'
              ? 'Everything has been read.'
              : 'No conversations yet.'}
      </p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
        {searching
          ? 'Search covers thread titles, the project or request they belong to, participant names and the text of the messages themselves.'
          : filter === 'archived'
            ? 'Archiving a conversation hides it from this list and from the unread count. Nothing is deleted and the other party is not told.'
            : 'A thread appears here as soon as either side writes in a project, a task, a quote or a dispute — including ones you have already read.'}
      </p>
      {searching ? (
        <p className="mt-3">
          <Link href={MESSAGES_PATH} className={LINK_ARROW}>
            Clear the search
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function ConversationList({
  threads,
  filter,
  query,
  now,
}: {
  threads: ConversationThread[];
  filter: ConversationFilter;
  query: string;
  now: Date;
}) {
  return (
    <ul className="grid gap-3">
      {threads.map(thread => (
        <li key={thread.key}>
          <ConversationRow thread={thread} filter={filter} query={query} now={now} />
        </li>
      ))}
    </ul>
  );
}

function ConversationRow({
  thread,
  filter,
  query,
  now,
}: {
  thread: ConversationThread;
  filter: ConversationFilter;
  query: string;
  now: Date;
}) {
  const excerpt = lastActivityLine(thread);
  const relative = formatRelativeTime(thread.lastActivityAt, now, 'No messages yet');
  const exact = thread.lastActivityAt ? new Date(thread.lastActivityAt) : null;
  const exactLabel =
    exact && !Number.isNaN(exact.getTime())
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(exact)
      : null;
  const openLabel =
    thread.kind === 'quote' ? 'Open quote conversation' : 'Open project messages';

  return (
    <article className={`${CARD} p-4 ${thread.unreadCount > 0 ? 'border-primary-subtle' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={BADGE_SLATE}>{KIND_COPY[thread.kind]}</span>
            <h3 className="truncate text-sm font-bold tracking-tight text-slate-900">{thread.title}</h3>
            {thread.unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 font-sans text-[11px] font-bold text-white">
                {thread.unreadCount} unread
                <span className="sr-only">
                  {thread.unreadCount === 1 ? ' message' : ' messages'} written since you last opened this
                  thread
                </span>
              </span>
            ) : null}
            {thread.archived ? <span className={BADGE_SLATE}>Archived</span> : null}
          </div>

          <p className="mt-1 truncate text-xs text-slate-500">{thread.contextLabel}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {thread.participants.length === 0 ? (
              <span className="text-xs text-slate-400">No messages yet</span>
            ) : (
              <>
                <ul className="flex items-center -space-x-2">
                  {thread.participants.slice(0, 4).map(participant => (
                    <li key={`${participant.name}-${participant.role}`}>
                      <span
                        title={`${participant.name} · ${ROLE_COPY[participant.role]}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-solid border-white bg-slate-200 font-sans text-[10px] font-bold text-slate-700"
                      >
                        <span aria-hidden="true">{participant.initials}</span>
                        <span className="sr-only">
                          {participant.name}, {ROLE_COPY[participant.role]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-wrap items-center gap-1">
                  {[...new Map(thread.participants.map(p => [p.role, p])).values()].map(participant => (
                    <li
                      key={participant.role}
                      className="rounded-full bg-slate-100 px-2 py-0.5 font-sans text-[10px] font-bold tracking-wide text-slate-500 uppercase"
                    >
                      {ROLE_COPY[participant.role]}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {excerpt ? (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{excerpt}</p>
          ) : null}

          <p className="mt-2 font-sans text-xs text-slate-500" title={exactLabel ?? undefined}>
            Last activity {relative}
            {exactLabel ? <span className="sr-only"> — {exactLabel}</span> : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Link
            href={thread.href}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white no-underline transition-colors hover:bg-primary-dark"
          >
            {openLabel}
          </Link>

          {thread.unreadCount > 0 ? (
            <form action={markConversationReadAction}>
              <input type="hidden" name="thread_key" value={thread.key} />
              <input type="hidden" name="filter" value={filter} />
              <input type="hidden" name="q" value={query} />
              <button
                type="submit"
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Mark read
              </button>
            </form>
          ) : null}

          <form action={archiveConversationAction}>
            <input type="hidden" name="thread_key" value={thread.key} />
            <input type="hidden" name="archived" value={thread.archived ? 'false' : 'true'} />
            <input type="hidden" name="filter" value={filter} />
            <input type="hidden" name="q" value={query} />
            {thread.archived ? (
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />
                Restore
              </button>
            ) : (
              <ConfirmSubmit
                label="Archive conversation"
                triggerClassName="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-solid border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
                icon="danger"
                title="Archive this conversation?"
                description="It leaves this list and stops counting towards your unread badge. Nothing is deleted, and the other party is not told — their copy stays exactly where it was. A new message does not bring it back; restore it whenever you want to read it again."
                confirmLabel="Archive"
              />
            )}
          </form>
        </div>
      </div>
    </article>
  );
}

/** The trailing line under the list: what archiving does, stated once rather than on every row. */
export function ArchiveDisclosure() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
      <Archive aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        Archiving is yours alone. It hides a thread from this list and from your unread count; it does not
        delete anything and it does not tell the other party.
      </span>
    </p>
  );
}

/** Shown after an action, as a quiet confirmation or a warning rather than a modal. */
export function ConversationsActionNotice({
  tone,
  children,
}: {
  tone: 'success' | 'warning';
  children: React.ReactNode;
}) {
  const isSuccess = tone === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        isSuccess
          ? 'border-primary-subtle bg-primary-surface text-slate-700'
          : 'border-secondary bg-secondary-light text-amber-900'
      }`}
    >
      {isSuccess ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      )}
      <div>{children}</div>
    </div>
  );
}
