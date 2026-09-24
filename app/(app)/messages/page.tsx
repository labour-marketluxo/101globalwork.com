import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import {
  ArchiveDisclosure,
  ConversationList,
  ConversationSearch,
  ConversationSummary,
  ConversationsEmpty,
  ConversationsUnavailable,
  ConversationsActionNotice,
} from '@/components/messages/ConversationSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { MESSAGES_PATH } from '@/features/settings/paths';
import { getAccountShell } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyConversations } from '@/features/messages/conversations';
import { conversationFailureCode, conversationFilter, CONVERSATION_FAILURE_COPY } from '@/features/messages/copy';

/**
 * The messages inbox — /messages.
 *
 * ⚠️ EVERY THREAD THE ACCOUNT IS IN, IN ONE LIST. Projects, tasks, quote conversations, scope questions and
 * disputes are different objects in the database and the directory does not pretend otherwise — each row says
 * which it is — but a person does not think in tables, and "where was that conversation about the roof"
 * should not require knowing which namespace it lives in.
 *
 * ⚠️ THE ROW OPENS THE THREAD; IT DOES NOT LET YOU REPLY. A composer here would have to guess which context a
 * reply belongs to, and the message tables store that context as a column a guess would get wrong. Every row
 * links to the page that already knows.
 *
 * ⚠️ SEARCH AND FILTER ARE IN THE URL. A shared or bookmarked link has to show the same list it showed when it
 * was copied, and a list that lives in component state cannot survive the Back button.
 */
export const metadata: Metadata = {
  title: 'Messages',
  description: 'Every conversation across your projects, quotes and disputes.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  q?: string;
  filter?: string;
  failed?: string;
  archived?: string;
  restored?: string;
}>;

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = conversationFilter(params.filter);
  const query = (params.q ?? '').trim();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: MESSAGES_PATH }));

  const [shell, directory] = await Promise.all([getAccountShell(), getMyConversations(query, filter)]);

  const now = new Date();
  const failure = conversationFailureCode(params.failed);

  return (
    <div className={PAGE_SHELL}>
      <AccountSettingsHeader shell={shell} showAccountNav current="messages" />

      <header className="mt-6">
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Messages
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Every conversation you are part of, in one place: project threads, task questions, quote discussions
          and disputes. Open a row to read it and reply where the conversation lives.
        </p>
      </header>

      {failure ? (
        <div className="mt-5">
          <ConversationsActionNotice tone="warning">{CONVERSATION_FAILURE_COPY[failure]}</ConversationsActionNotice>
        </div>
      ) : null}

      {params.archived === '1' ? (
        <div className="mt-5">
          <ConversationsActionNotice tone="success">
            Archived. It has left your list and stopped counting towards the badge; the other party is not told
            and nothing was deleted. It is under the Archived filter whenever you want it back.
          </ConversationsActionNotice>
        </div>
      ) : null}

      {params.restored === '1' ? (
        <div className="mt-5">
          <ConversationsActionNotice tone="success">Restored to your list.</ConversationsActionNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5">
        <ConversationSearch query={query} filter={filter} />

        {directory.unavailable ? (
          <ConversationsUnavailable />
        ) : (
          <>
            <ConversationSummary
              open={directory.counts.open}
              unreadThreads={directory.counts.unreadThreads}
              unreadMessages={shell.messages.unreadMessages}
              filtered={filter !== 'all'}
              query={query}
            />
            {directory.threads.length === 0 ? (
              <ConversationsEmpty filter={filter} query={query} />
            ) : (
              <>
                <ConversationList threads={directory.threads} filter={filter} query={query} now={now} />
                <ArchiveDisclosure />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
