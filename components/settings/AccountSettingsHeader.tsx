import Link from 'next/link';
import { Bell, CalendarClock, LifeBuoy, MessagesSquare, Settings } from '@/components/ui/icons';
import type { AccountShell } from '@/features/settings/shell';
import { MESSAGES_PATH, NOTIFICATIONS_PATH, PROFILE_PATH } from '@/features/settings/paths';
import { RECURRING_PATH } from '@/features/recurring/paths';
import { SUPPORT_PATH } from '@/features/support/paths';

/**
 * The account shell's header: who is signed in, and what is waiting.
 *
 * ⚠️ THE BADGES ARE LINKS WITH REAL COUNTS, NOT DECORATION. The whole reason a person opens this header is
 * to decide whether to look at their notifications or their messages, so both numbers are the entry point
 * to the thing they count. A badge that is not a link makes that decision a second one.
 *
 * ⚠️ IT SAYS NOTHING WHEN IT DOES NOT KNOW. `unavailable` counts render as "—" rather than 0. "No unread
 * messages" and "the count could not be read" are different claims, and this header is exactly where
 * somebody glances and moves on, so a wrong zero is worse than an honest dash.
 *
 * ⚠️ THE WORKSPACE LINE IS THE ACCOUNT, NOT A PROJECT. This platform has one account behind one sign-in
 * that can act as a customer, a provider and a member of several organisations; the header names the person
 * and their sign-in address, and the switcher that picks between those roles lives on the profile page where
 * the choice can be explained. Monogram rather than an <img>: the account's own avatar is served from
 * /settings/profile/avatar, and a header that fired that request on every page would fetch it for people who
 * never open their profile.
 */
export default function AccountSettingsHeader({
  shell,
  showAccountNav = false,
  current,
}: {
  shell: AccountShell;
  /** True on the surfaces that are not under the settings tab bar: the two inboxes and support. */
  showAccountNav?: boolean;
  current?: 'notifications' | 'messages' | 'recurring' | 'support' | 'settings';
}) {
  const notificationGroup = shell.notifications.unavailable ? '—' : String(shell.notifications.unread);
  const messageGroup = shell.messages.unavailable ? '—' : String(shell.messages.unreadMessages);

  return (
    <header className="border-b border-solid border-slate-200 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-sans text-sm font-bold tracking-wide text-primary"
          >
            {shell.initials}
          </span>
          <div className="min-w-0">
            <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
              Account
            </p>
            <p className="truncate text-sm font-bold tracking-tight text-slate-900">
              {shell.displayName || 'Your account'}
            </p>
            {shell.email ? (
              <p className="truncate font-sans text-xs text-slate-500">{shell.email}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={NOTIFICATIONS_PATH}
            aria-current={current === 'notifications' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border border-solid px-3.5 py-2 text-sm font-semibold no-underline transition-colors ${
              current === 'notifications'
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary'
            }`}
          >
            <Bell aria-hidden="true" className="h-4 w-4" />
            Notifications
            <span className={shell.notifications.unread > 0 ? badgeActive : badgeQuiet} aria-hidden="true">
              {notificationGroup}
            </span>
            <span className="sr-only">
              {shell.notifications.unavailable
                ? 'unread count unavailable'
                : `${shell.notifications.unread} unread, ${shell.notifications.actionRequired} needing action`}
            </span>
          </Link>

          <Link
            href={MESSAGES_PATH}
            aria-current={current === 'messages' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border border-solid px-3.5 py-2 text-sm font-semibold no-underline transition-colors ${
              current === 'messages'
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary'
            }`}
          >
            <MessagesSquare aria-hidden="true" className="h-4 w-4" />
            Messages
            <span className={shell.messages.unreadMessages > 0 ? badgeActive : badgeQuiet} aria-hidden="true">
              {messageGroup}
            </span>
            <span className="sr-only">
              {shell.messages.unavailable
                ? 'unread count unavailable'
                : `${shell.messages.unreadMessages} unread messages in ${shell.messages.unreadThreads} conversations`}
            </span>
          </Link>

          {/* No badge here on purpose. A case has a deadline attached to it rather than a running unread total,
              and a number that counted something different from the other two would be read as the same kind
              of number. The support page itself shows which cases are waiting on you. */}
          <Link
            href={RECURRING_PATH}
            aria-current={current === 'recurring' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border border-solid px-3.5 py-2 text-sm font-semibold no-underline transition-colors ${
              current === 'recurring'
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary'
            }`}
          >
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
            Recurring
          </Link>

          <Link
            href={SUPPORT_PATH}
            aria-current={current === 'support' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border border-solid px-3.5 py-2 text-sm font-semibold no-underline transition-colors ${
              current === 'support'
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary'
            }`}
          >
            <LifeBuoy aria-hidden="true" className="h-4 w-4" />
            Support
          </Link>
        </div>
      </div>

      {showAccountNav ? (
        <nav aria-label="Account sections" className="mt-4">
          <ul className="flex flex-wrap items-center gap-1">
            {[
              { href: NOTIFICATIONS_PATH, label: 'Notifications', key: 'notifications' as const },
              { href: MESSAGES_PATH, label: 'Messages', key: 'messages' as const },
              { href: RECURRING_PATH, label: 'Recurring', key: 'recurring' as const },
              { href: SUPPORT_PATH, label: 'Support', key: 'support' as const },
              { href: PROFILE_PATH, label: 'Settings', key: 'settings' as const },
            ].map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current === item.key ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition-colors ${
                    current === item.key
                      ? 'bg-primary-subtle text-primary'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {item.key === 'settings' ? <Settings aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/** Amber-filled when something is waiting, quiet slate when it is not. Colour is not the only signal: the
 * number itself is in the badge, and the screen-reader sentence spells out both counts. */
const badgeActive =
  'inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 font-sans text-[11px] font-bold text-white';
const badgeQuiet =
  'inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-500';
