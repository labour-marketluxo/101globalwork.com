import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { IncidentSeverity } from '@/features/admin/copy';

/**
 * The operational incident feed.
 *
 * ⚠️ AN INCIDENT IS DERIVED FROM ROWS, AND THE READ SAYS SO ON EVERY ITEM. Each entry carries the
 * column its window was measured on (`windowBasis`) and whether a market filter narrows it
 * (`marketScoped`), because an operator who filters by market and sees a number stay still needs to
 * know whether that number answered the filter or ignored it.
 *
 * ⚠️ `recurred` IS THE WHOLE POINT OF THE ACKNOWLEDGEMENT ROW. An acknowledgement records how many
 * items were outstanding when somebody looked; anything more than that is new, and this read reports
 * it rather than letting a blessing from last week cover today's backlog.
 */

export type IncidentItem = {
  key: string;
  area: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  count: number;
  oldestAt: string | null;
  windowBasis: string;
  marketScoped: boolean;
  deepLink: string;
  actionLabel: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedCount: number | null;
  acknowledgedBy: string | null;
  acknowledgementNote: string | null;
  recurred: boolean;
};

export type IncidentCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unacknowledged: number;
  recurred: number;
  outstanding: number;
};

export type IncidentFeed = {
  allowed: boolean;
  role: string | null;
  generatedAt: string | null;
  windowHours: number;
  since: string | null;
  counts: IncidentCounts;
  items: IncidentItem[];
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const bool = (value: unknown): boolean => value === true;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const emptyCounts: IncidentCounts = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  unacknowledged: 0,
  recurred: 0,
  outstanding: 0,
};

function severityOf(value: unknown): IncidentSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' ? value : 'low';
}

export async function getIncidentFeed(filters: {
  marketId?: string;
  windowHours?: number;
  severity?: string;
}): Promise<IncidentFeed> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_incident_feed_command', {
    p_market_id: filters.marketId || null,
    p_window_hours: filters.windowHours ?? 24,
    p_severity: filters.severity || null,
  });

  const empty: IncidentFeed = {
    allowed: false,
    role: null,
    generatedAt: null,
    windowHours: filters.windowHours ?? 24,
    since: null,
    counts: emptyCounts,
    items: [],
    unavailable: false,
  };
  if (error) return { ...empty, unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return empty;

  const counts = obj(raw.counts);

  return {
    allowed: true,
    unavailable: false,
    role: text(raw.role),
    generatedAt: text(raw.generated_at),
    windowHours: num(raw.window_hours) ?? (filters.windowHours ?? 24),
    since: text(raw.since),
    counts: {
      critical: num(counts.critical) ?? 0,
      high: num(counts.high) ?? 0,
      medium: num(counts.medium) ?? 0,
      low: num(counts.low) ?? 0,
      unacknowledged: num(counts.unacknowledged) ?? 0,
      recurred: num(counts.recurred) ?? 0,
      outstanding: num(counts.outstanding) ?? 0,
    },
    items: rows(raw.items).map(entry => ({
      key: text(entry.key) ?? '',
      area: text(entry.area) ?? 'operations',
      severity: severityOf(entry.severity),
      title: text(entry.title) ?? 'Operational exception',
      detail: text(entry.detail) ?? '',
      count: num(entry.count) ?? 0,
      oldestAt: text(entry.oldest_at),
      windowBasis: text(entry.window_basis) ?? 'record timestamp',
      marketScoped: bool(entry.market_scoped),
      deepLink: text(entry.deep_link) ?? '/admin',
      actionLabel: text(entry.action_label) ?? 'Open',
      acknowledged: bool(entry.acknowledged),
      acknowledgedAt: text(entry.acknowledged_at),
      acknowledgedCount: num(entry.acknowledged_count),
      acknowledgedBy: text(entry.acknowledged_by),
      acknowledgementNote: text(entry.acknowledgement_note),
      recurred: bool(entry.recurred),
    })).filter(entry => entry.key !== ''),
  };
}
