import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import {
  FeedIntro,
  MarkAllReadForm,
  NotificationFeed,
  NotificationFilters,
  NotificationsEmpty,
  NotificationsUnavailable,
  NotificationsActionNotice,
} from '@/components/notifications/NotificationSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { NOTIFICATIONS_PATH } from '@/features/settings/paths';
import { getAccountShell } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyNotifications, groupByDay } from '@/features/notifications/notifications';
import { notificationCategory, notificationFailureCode, NOTIFICATION_FAILURE_COPY } from '@/features/notifications/copy';

/**
 * The notifications centre — /notifications.
 *
 * ⚠️ THE FEED IS A VIEW OF WHAT IS OUTSTANDING, NOT A LOG, AND THE PAGE SAYS SO. Every item is derived from
 * the row that caused it, so it disappears when the thing it describes is dealt with rather than lingering as
 * a stale record. That is the right default for a page whose job is "what needs me now", and it is also why
 * acting on an item can come back with "no longer in the feed" — a state this page has its own sentence for.
 *
 * ⚠️ UNREAD MEANS "ADDED SINCE YOU LOOKED", NOT "IMPORTANT". The badge counts what the account has not read,
 * and the severity badge says what needs action. Two different questions, deliberately answered by two
 * different marks on the row: merging them would make a security notice and a marketing note look alike.
 *
 * ⚠️ NOINDEX HERE AND IN THE LAYOUT. This page is per-account and contains project names and money amounts.
 */
export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Everything that needs your attention across your projects, quotes and account.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  category?: string;
  failed?: string;
  read?: string;
  dismissed?: string;
}>;

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const category = notificationCategory(params.category);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(hrefWith(AUTH_PATHS.signIn, { next: category === 'all' ? NOTIFICATIONS_PATH : `${NOTIFICATIONS_PATH}?category=${category}` }));
  }

  const [shell, feed] = await Promise.all([getAccountShell(), getMyNotifications(category)]);

  const now = new Date();
  const failure = notificationFailureCode(params.failed);
  const readCount = Number.parseInt(params.read ?? '', 10);

  return (
    <div className={PAGE_SHELL}>
      <AccountSettingsHeader shell={shell} showAccountNav current="notifications" />

      <header className="mt-6">
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Notifications
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Actionable updates from your projects, your money and your account, newest first. Nothing here is
          generated for engagement: each item exists because a row in the platform says something changed.
        </p>
      </header>

      {failure ? (
        <div className="mt-5">
          <NotificationsActionNotice tone="warning">{NOTIFICATION_FAILURE_COPY[failure]}</NotificationsActionNotice>
        </div>
      ) : null}

      {Number.isFinite(readCount) ? (
        <div className="mt-5">
          <NotificationsActionNotice tone="success">
            {readCount > 0
              ? `Marked ${readCount} item${readCount === 1 ? '' : 's'} as read.`
              : 'Nothing was unread in that view, so nothing changed.'}
          </NotificationsActionNotice>
        </div>
      ) : null}

      {params.dismissed === '1' ? (
        <div className="mt-5">
          <NotificationsActionNotice tone="success">
            Dismissed. It has left the list and stopped counting towards the badge — the task, payment or case it
            was about is unchanged.
          </NotificationsActionNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5">
        <NotificationFilters active={category} />

        {feed.unavailable ? (
          <NotificationsUnavailable />
        ) : feed.items.length === 0 ? (
          <NotificationsEmpty category={category} />
        ) : (
          <>
            <FeedIntro
              category={category}
              unread={feed.counts.unread}
              actionRequired={feed.counts.actionRequired}
            />
            <div className="flex justify-end">
              <MarkAllReadForm category={category} unread={feed.counts.unread} />
            </div>
            <NotificationFeed groups={groupByDay(feed.items, now)} category={category} now={now} />
          </>
        )}
      </div>
    </div>
  );
}
