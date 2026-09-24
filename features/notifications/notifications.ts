import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { NotificationCategory, NotificationSeverity } from '@/features/notifications/copy';

/**
 * The read layer for /notifications.
 *
 * ⚠️ THE DATABASE DERIVES THE FEED; THIS ONLY SHAPES IT. Every item is a statement about a row that
 * exists right now — a task that is still submitted, a payment that is still due — which is why acting
 * on one can legitimately fail with "no longer in the feed". The migration's header has the full
 * argument for that design; the practical consequence for this file is that nothing here caches and
 * nothing here invents an item.
 *
 * ⚠️ THIS MODULE IS THE ONLY PLACE THAT KNOWS THE WIRE SHAPE. The RPC returns jsonb built field by
 * field, so every field is read defensively and the components see a typed object or nothing.
 */

export type NotificationItem = {
  key: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  summary: string | null;
  entityLabel: string | null;
  href: string | null;
  actionRequired: boolean;
  locked: boolean;
  unread: boolean;
  occurredAt: string | null;
};

export type NotificationsRead = {
  items: NotificationItem[];
  counts: { unread: number; actionRequired: number };
  /** True when the feed could not be read at all, which is not the same as an empty feed. */
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

const SEVERITIES: readonly NotificationSeverity[] = ['info', 'attention', 'action'];
const CATEGORIES: readonly NotificationCategory[] = [
  'work_updates',
  'financials',
  'marketing',
  'security',
  'legal',
  'payment_disputes',
];

function toItem(raw: Raw): NotificationItem | null {
  const key = textFrom(raw.key);
  const title = textFrom(raw.title);
  const category = textFrom(raw.category);
  if (!key || !title || !category || !CATEGORIES.includes(category as NotificationCategory)) return null;

  const severity = textFrom(raw.severity);

  return {
    key,
    category: category as NotificationCategory,
    severity: SEVERITIES.includes(severity as NotificationSeverity)
      ? (severity as NotificationSeverity)
      : 'info',
    title,
    summary: textFrom(raw.summary),
    entityLabel: textFrom(raw.entityLabel),
    href: textFrom(raw.href),
    actionRequired: raw.actionRequired === true,
    locked: raw.locked === true,
    unread: raw.unread !== false,
    occurredAt: textFrom(raw.occurredAt),
  };
}

export async function getMyNotifications(
  category: NotificationCategory | 'all',
): Promise<NotificationsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_notifications_command', {
    p_category: category === 'all' ? null : category,
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[notifications] could not read the feed: ${error.message}`);
    }
    return { items: [], counts: { unread: 0, actionRequired: 0 }, unavailable: true };
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) {
    // A signed-in account with no accounts row is not reachable through the UI, but returning an empty
    // feed would be a lie about a real state, so it is reported as unavailable like any other failure.
    return { items: [], counts: { unread: 0, actionRequired: 0 }, unavailable: true };
  }

  const counts = objectFrom(raw.counts);

  return {
    items: rowsFrom(raw.items)
      .map(toItem)
      .filter((item): item is NotificationItem => item !== null)
      // The RPC orders chronologically; this only makes that explicit, and keeps the order stable when
      // two events share a timestamp.
      .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? '')),
    counts: {
      unread: countFrom(counts.unread),
      actionRequired: countFrom(counts.actionRequired),
    },
    unavailable: false,
  };
}

/**
 * The feed grouped by day, which is how the page reads.
 *
 * Grouping happens here rather than in SQL because it is presentation: the same rows are the same rows
 * whatever a page does with them. `now` is a parameter so every group on a page is measured against one
 * instant — two headings rendered a moment apart could otherwise disagree about which day it is.
 */
export type NotificationGroup = { label: string; items: NotificationItem[] };

export function groupByDay(items: NotificationItem[], now: Date): NotificationGroup[] {
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const groups: NotificationGroup[] = [];

  for (const item of items) {
    const occurred = item.occurredAt ? new Date(item.occurredAt) : null;
    const label =
      occurred && !Number.isNaN(occurred.getTime())
        ? occurred >= today
          ? 'Today'
          : occurred >= yesterday
            ? 'Yesterday'
            : new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(occurred)
        : 'Undated';

    const existing = groups.find(group => group.label === label);
    if (existing) existing.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return groups;
}

function startOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
