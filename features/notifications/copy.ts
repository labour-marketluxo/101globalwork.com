import { NOTIFICATIONS_PATH } from '@/features/settings/paths';

/**
 * The notification centre's vocabulary.
 *
 * The database returns facts — a category, a severity, a summary — and the sentences live here. Kept in
 * one map for the same reason the provider workspace keeps its action copy in one: two components
 * describing the same category differently is how a filter labelled one way starts returning rows
 * labelled another.
 */

export type NotificationCategory =
  | 'work_updates'
  | 'financials'
  | 'marketing'
  | 'security'
  | 'legal'
  | 'payment_disputes';

export type NotificationSeverity = 'info' | 'attention' | 'action';

export type CategoryCopy = {
  /** Used as the filter chip and as the group heading. */
  label: string;
  /** Shown once, under the page heading, when the filter is on this category. */
  description: string;
};

/**
 * ORDER IS THE PAGE'S ORDER, and it is deliberate: what needs a decision, then what touches money, then
 * what protects the account, then the legal notices, and marketing last. The filter bar reads left to
 * right in that order, so the first chip after "All" is the one that needs somebody to act.
 */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'work_updates',
  'financials',
  'security',
  'payment_disputes',
  'legal',
  'marketing',
];

export const CATEGORY_COPY: Record<NotificationCategory, CategoryCopy> = {
  work_updates: {
    label: 'Work updates',
    description: 'Tasks, messages, and changes to the projects you are part of.',
  },
  financials: {
    label: 'Financials',
    description: 'Quotes, payments you owe, and payouts for work you delivered.',
  },
  security: {
    label: 'Security',
    description: 'Sign-ins and changes to how you sign in. These notices cannot be switched off.',
  },
  payment_disputes: {
    label: 'Payment disputes',
    description: 'Money held while a dispute is open. These notices cannot be switched off.',
  },
  legal: {
    label: 'Legal & cases',
    description: 'Safety, privacy and operational cases raised on your projects.',
  },
  marketing: {
    label: 'Marketing',
    description: 'Occasional product news. Nothing here is about a project you are running.',
  },
};

/**
 * The badge tone per severity.
 *
 * `info`, `attention` and `action` are the three states the feed actually distinguishes; the copy for
 * each is the word the badge shows, so a person does not have to learn a colour code to read the list.
 */
export const SEVERITY_COPY: Record<NotificationSeverity, { label: string; className: string }> = {
  info: {
    label: 'Update',
    className: 'bg-slate-100 text-slate-600',
  },
  attention: {
    label: 'Needs a look',
    className: 'bg-secondary-light text-amber-800',
  },
  action: {
    label: 'Action needed',
    className: 'bg-primary-subtle text-primary',
  },
};

/**
 * Failure codes that may appear in `?failed=` on the feed.
 *
 * A fixed vocabulary for the same reason the sessions page has one: the parameter is user-editable, so
 * whatever it contains must not be rendered. `not_found` is a first-class outcome here — the feed is
 * derived, so an item can genuinely stop existing between the page loading and the button being
 * pressed, and saying "that is no longer outstanding" is different from "something went wrong".
 */
export const NOTIFICATION_FAILURE_CODES = ['not_authorized', 'bad_request', 'not_found', 'unavailable'] as const;
export type NotificationFailureCode = (typeof NOTIFICATION_FAILURE_CODES)[number];

export const NOTIFICATION_FAILURE_COPY: Record<NotificationFailureCode, string> = {
  not_authorized: 'That notification belongs to a different account, so nothing was changed.',
  bad_request: 'That request was missing the notification it was meant to act on.',
  not_found:
    'That item is no longer in the feed. It was most likely resolved or withdrawn in the meantime — reload to see what is still outstanding.',
  unavailable: 'The change could not be saved. Reload this page before assuming it was.',
};

export function notificationFailureCode(value: string | undefined | null): NotificationFailureCode | null {
  if (!value) return null;
  return (NOTIFICATION_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as NotificationFailureCode)
    : null;
}

/** The filter value from a URL parameter: a known category, or "all" for anything else. */
export function notificationCategory(value: string | undefined | null): NotificationCategory | 'all' {
  if (!value) return 'all';
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
    ? (value as NotificationCategory)
    : 'all';
}

/** Where a filter link points. Kept here so the chip, the empty state and the action agree. */
export function notificationsHref(category: NotificationCategory | 'all'): string {
  return category === 'all' ? NOTIFICATIONS_PATH : `${NOTIFICATIONS_PATH}?category=${category}`;
}
