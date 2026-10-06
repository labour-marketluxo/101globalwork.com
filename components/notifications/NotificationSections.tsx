import Link from 'next/link';
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  CreditCard,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from '@/components/ui/icons';
import { BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { NOTIFICATION_SETTINGS_PATH } from '@/features/settings/paths';
import { formatRelativeTime } from '@/features/settings/device-label';
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/features/notifications/actions';
import {
  CATEGORY_COPY,
  NOTIFICATION_CATEGORIES,
  SEVERITY_COPY,
  notificationsHref,
  type NotificationCategory,
} from '@/features/notifications/copy';
import type { NotificationGroup, NotificationItem } from '@/features/notifications/notifications';

/**
 * The notification centre's presentation, all server components.
 *
 * WHAT THIS PAGE CAN SAY AND WHAT IT CANNOT, because the difference shapes the whole design:
 *
 *   It CAN say what is outstanding right now, in plain words, with a link to the thing it is about. The
 *   feed is derived from the rows that caused each event, so "a task is waiting for your review" is true at
 *   the moment it is rendered.
 *
 *   It CANNOT promise that acting on an item will succeed. Somebody else may resolve the same thing between
 *   the render and the click, which is why the actions carry a distinct "no longer in the feed" outcome
 *   rather than an error.
 *
 *   It CANNOT translate. Every summary is the platform's own language; nothing here is a message a person
 *   wrote, so there is no original text being replaced by a translation. Where a person's words appear, they
 *   are the words they wrote.
 *
 * ⚠️ UNREAD IS A DOT PLUS A WORD, NEVER A DOT ALONE. The accessible text says "Unread" and the visual is a
 * small teal dot; a colour-only signal is unreadable to somebody with a colour vision deficiency, and this is
 * the exact place where that matters.
 */

const CATEGORY_ICON: Record<NotificationCategory, typeof CreditCard> = {
  work_updates: MessagesSquare,
  financials: CreditCard,
  security: ShieldCheck,
  payment_disputes: Banknote,
  legal: ShieldAlert,
  marketing: Sparkles,
};

/** Full date and time, in the words somebody would say out loud. `dateTime` keeps the machine form. */
function exactTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function NotificationFilters({ active }: { active: NotificationCategory | 'all' }) {
  return (
    <nav aria-label="Filter notifications" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1.5">
        {(['all', ...NOTIFICATION_CATEGORIES] as const).map(value => {
          const isCurrent = value === active;
          const label = value === 'all' ? 'All' : CATEGORY_COPY[value].label;

          return (
            <li key={value}>
              <Link
                href={notificationsHref(value)}
                aria-current={isCurrent ? 'page' : undefined}
                title={value === 'all' ? 'Every category' : CATEGORY_COPY[value].description}
                className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold no-underline transition-colors ${
                  isCurrent
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The one-line explanation of the current filter, plus the way out of the feed entirely. */
export function FeedIntro({
  category,
  unread,
  actionRequired,
}: {
  category: NotificationCategory | 'all';
  unread: number;
  actionRequired: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
        {category === 'all'
          ? 'Everything that needs your attention, newest first. Items disappear from here when the thing they describe is dealt with — they are a view of what is outstanding, not a log.'
          : CATEGORY_COPY[category].description}
      </p>
      <p className="font-sans text-xs text-slate-500">
        {unread} unread · {actionRequired} needing action ·{' '}
        <Link href={NOTIFICATION_SETTINGS_PATH} className={LINK_ARROW}>
          Delivery settings
        </Link>
      </p>
    </div>
  );
}

export function NotificationsUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">The feed could not be read.</p>
        <p className="mt-1">
          This page cannot tell you whether anything is waiting — that is different from there being
          nothing. Reload to try again, and check{' '}
          <Link href={NOTIFICATION_SETTINGS_PATH} className={LINK_ARROW}>
            your delivery settings
          </Link>{' '}
          if this keeps happening.
        </p>
      </div>
    </div>
  );
}

export function NotificationsEmpty({ category }: { category: NotificationCategory | 'all' }) {
  return (
    <div className="rounded-xl border border-solid border-slate-200 bg-white p-8 text-center">
      <CircleCheck aria-hidden="true" className="mx-auto h-6 w-6 text-primary" />
      <p className="mt-3 text-sm font-semibold text-slate-800">
        {category === 'all'
          ? 'Nothing is waiting on you.'
          : `Nothing in ${CATEGORY_COPY[category].label} right now.`}
      </p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
        {category === 'all'
          ? 'Tasks, quotes, payments and security notices appear here as they happen. Nothing has been dismissed or hidden from this list.'
          : 'This category is empty at the moment. “All” shows every category, including any that are filtered out here.'}
      </p>
      {category !== 'all' ? (
        <p className="mt-3">
          <Link href={notificationsHref('all')} className={LINK_ARROW}>
            Show everything
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function MarkAllReadForm({
  category,
  unread,
}: {
  category: NotificationCategory | 'all';
  unread: number;
}) {
  return (
    <form action={markAllNotificationsReadAction}>
      <input type="hidden" name="category" value={category} />
      <button
        type="submit"
        disabled={unread === 0}
        className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        Mark {category === 'all' ? 'everything' : 'this category'} as read
      </button>
    </form>
  );
}

export function NotificationFeed({
  groups,
  category,
  now,
}: {
  groups: NotificationGroup[];
  category: NotificationCategory | 'all';
  now: Date;
}) {
  return (
    <div className="grid gap-6">
      {groups.map(group => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {group.label}
          </h2>
          <ul className="mt-3 grid gap-3">
            {group.items.map(item => (
              <li key={item.key}>
                <NotificationRow item={item} category={category} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({
  item,
  category,
  now,
}: {
  item: NotificationItem;
  category: NotificationCategory | 'all';
  now: Date;
}) {
  const Icon = CATEGORY_ICON[item.category];
  const severity = SEVERITY_COPY[item.severity];
  const exact = exactTimestamp(item.occurredAt);
  const relative = formatRelativeTime(item.occurredAt, now);

  return (
    <article className={`${CARD} p-4 sm:p-5 ${item.actionRequired && item.unread ? 'border-primary-subtle' : ''}`}>
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            item.unread ? 'bg-primary-subtle text-primary' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold tracking-tight text-slate-900">{item.title}</h3>
            {item.unread ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2 py-0.5 font-sans text-[11px] font-bold tracking-wide text-primary uppercase">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                Unread
              </span>
            ) : (
              <span className={BADGE_SLATE}>Read</span>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[11px] font-bold tracking-wide uppercase ${severity.className}`}>
              {severity.label}
            </span>
          </div>

          {item.entityLabel ? (
            <p className="mt-1 font-sans text-xs text-slate-500">{item.entityLabel}</p>
          ) : null}

          {item.summary ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.summary}</p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
            {exact ? (
              <time dateTime={item.occurredAt ?? undefined} title={relative}>
                {exact} · {relative}
              </time>
            ) : (
              <span>{relative}</span>
            )}
            {item.href ? (
              <Link href={item.href} className={LINK_ARROW}>
                Open what this is about
              </Link>
            ) : null}
            {item.locked ? (
              <span className="text-slate-400">
                Security, legal and dispute notices cannot be switched off
              </span>
            ) : (
              <Link href={NOTIFICATION_SETTINGS_PATH} className="text-slate-500 underline underline-offset-2 hover:text-slate-800">
                Turn this kind of notice off
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
          {item.unread ? (
            <form action={markNotificationReadAction}>
              <input type="hidden" name="key" value={item.key} />
              <input type="hidden" name="category" value={category} />
              <button
                type="submit"
                className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Mark as read
              </button>
            </form>
          ) : null}
          <form action={dismissNotificationAction}>
            <input type="hidden" name="key" value={item.key} />
            <input type="hidden" name="category" value={category} />
            <ConfirmSubmit
              label="Dismiss"
              triggerClassName="w-full rounded-lg border border-solid border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
              icon="danger"
              title="Dismiss this notification?"
              description={
                item.actionRequired
                  ? 'It will leave this list and stop counting towards the badge. The thing it is about is not changed — the task, payment or case is still there, and it will reappear if anything about it changes.'
                  : 'It will leave this list and stop counting towards the badge. Nothing about the project is changed.'
              }
              confirmLabel="Dismiss"
            />
          </form>
        </div>
      </div>
    </article>
  );
}

/** Shown after an action, as a quiet confirmation or a warning rather than a modal. */
export function NotificationsActionNotice({
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
