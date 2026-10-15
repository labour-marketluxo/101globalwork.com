import Link from 'next/link';
import { Bell, MessagesSquare } from '@/components/ui/icons';
import WorkspaceHero from '@/components/workspace/WorkspaceHero';
import type { AccountShell } from '@/features/settings/shell';
import { MESSAGES_PATH, NOTIFICATIONS_PATH } from '@/features/settings/paths';

/**
 * AccountHero — the teal band every account surface opens with.
 *
 * ⚠️ IT REPLACED A WHITE HEADER THAT HAD FORGOTTEN THE PALETTE. The account screens were the last
 * place in the signed-in product with no teal, no amber and no gold: a slate monogram, slate text and
 * a row of white buttons. They now open with the same band the customer and provider pages use, which
 * is also the honest signal that these four surfaces are one section rather than four loose pages.
 *
 * ⚠️ THE COUNTS ARE LINKS WITH REAL NUMBERS, NOT DECORATION. Somebody opens this band to decide
 * whether to look at their notifications or their messages, so each count is the way in to the thing
 * it counts. `unavailable` renders as an em dash rather than 0 — "nothing unread" and "the count could
 * not be read" are different claims, and a wrong zero is worse than an honest dash.
 */
const BADGE =
  'inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 font-sans text-xs font-bold text-white no-underline transition-colors hover:border-amber-400/40 hover:bg-white/20';

const COUNT_ACTIVE =
  'inline-flex min-w-5 items-center justify-center rounded-full bg-[#F59E0B] px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-950';

const COUNT_QUIET =
  'inline-flex min-w-5 items-center justify-center rounded-full bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-200';

export default function AccountHero({ shell }: { shell: AccountShell }) {
  const notificationGroup = shell.notifications.unavailable ? '—' : String(shell.notifications.unread);
  const messageGroup = shell.messages.unavailable ? '—' : String(shell.messages.unreadMessages);

  return (
    <WorkspaceHero
      eyebrow="Account"
      title={shell.displayName || 'Your account'}
      description={shell.email ?? undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link href={NOTIFICATIONS_PATH} className={BADGE}>
          <Bell aria-hidden="true" className="h-4 w-4" />
          Notifications
          <span className={shell.notifications.unread > 0 ? COUNT_ACTIVE : COUNT_QUIET} aria-hidden="true">
            {notificationGroup}
          </span>
          <span className="sr-only">
            {shell.notifications.unavailable
              ? 'unread count unavailable'
              : `${shell.notifications.unread} unread, ${shell.notifications.actionRequired} needing action`}
          </span>
        </Link>

        <Link href={MESSAGES_PATH} className={BADGE}>
          <MessagesSquare aria-hidden="true" className="h-4 w-4" />
          Messages
          <span className={shell.messages.unreadMessages > 0 ? COUNT_ACTIVE : COUNT_QUIET} aria-hidden="true">
            {messageGroup}
          </span>
          <span className="sr-only">
            {shell.messages.unavailable
              ? 'unread count unavailable'
              : `${shell.messages.unreadMessages} unread messages in ${shell.messages.unreadThreads} conversations`}
          </span>
        </Link>
      </div>
    </WorkspaceHero>
  );
}
