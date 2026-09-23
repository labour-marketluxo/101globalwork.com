import { createSupabaseServerClient } from '@/lib/supabase/server';
import { providerActionKind, type ProviderActionKind } from '@/features/provider-workspace/paths';

/**
 * The read layer for /provider — the provider's own day.
 *
 * EVERYTHING COMES FROM ONE COMMAND, `get_my_provider_day_command`, for the reason written into the
 * migration: this page is opened on a phone, on site, and five parallel reads would be five chances
 * for the widgets to disagree about how many jobs are active.
 *
 * THIS MODULE IS THE ONLY PLACE THAT KNOWS THE WIRE SHAPE. The command returns jsonb assembled field
 * by field, so a field the database did not have is ABSENT rather than null — every value is read
 * defensively here and nothing outside this file touches the raw object. Same discipline as
 * features/settings/sessions.ts, for the same reason.
 */

export type ProviderDayJob = {
  assignmentId: string;
  requestId: string;
  needText: string;
  requestState: string;
  urgency: string;
  locationName: string | null;
  /** From the newest accepted scope version. The platform holds no street address.
   *  Both are needed to render a `title` attribute, hence string | null rather than boolean. */
  landmark: string | null;
  accessNotes: string | null;
  assignedAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleTimezone: string | null;
  scheduleStatus: string;
  confirmedAt: string | null;
  fieldState: FieldProgressState | null;
  fieldStateAt: string | null;
  openProposal: boolean;
  evidenceCount: number;
  obligationStatus: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  /** The assignment command's own start rule, computed in SQL so the button cannot promise more
   *  than the command will accept. */
  startAllowed: boolean;
};

export type FieldProgressState = 'en_route' | 'on_site' | 'work_started';

export const FIELD_PROGRESS_COPY: Record<FieldProgressState, string> = {
  en_route: 'On my way',
  on_site: 'On site',
  work_started: 'Work started',
};

export type ProviderDayOpportunity = {
  requestId: string;
  needText: string;
  requestState: string;
  serviceName: string | null;
  locationName: string | null;
  createdAt: string | null;
  quoteId: string | null;
  quoteStatus: string | null;
};

export type ProviderDayAction = {
  kind: ProviderActionKind;
  assignmentId: string | null;
  requestId: string | null;
  credentialId: string | null;
  detail: string | null;
  dueAt: string | null;
};

export type ProviderEarningsLine = {
  currencyCode: string;
  /** `payouts.status = 'paid'` — the platform has actually sent it. */
  clearedMinor: number;
  /** eligible, queued or processing: owed, on its way, not yet sent. */
  pendingMinor: number;
  /** failed or blocked: owed, and not going anywhere until something is fixed. */
  blockedMinor: number;
};

export type ProviderAwaitingFunding = { currencyCode: string; amountMinor: number };

export type ProviderDay = {
  provider: {
    id: string;
    displayName: string;
    status: string;
    isPublic: boolean;
    slug: string | null;
    acceptsNewWork: boolean;
    payoutVerified: boolean;
  };
  readiness: { totalScore: number; readiness: string; reasons: string[]; evaluatedAt: string | null };
  counts: { activeJobs: number; opportunities: number; unansweredOpportunities: number; actions: number };
  schedule: ProviderDayJob[];
  opportunities: ProviderDayOpportunity[];
  actions: ProviderDayAction[];
  earnings: ProviderEarningsLine[];
  awaitingFunding: ProviderAwaitingFunding[];
};

export type ProviderDayRead = {
  day: ProviderDay | null;
  /**
   * True when the read failed. The page renders an honest failure rather than an empty day: "nothing
   * is scheduled" and "we could not check what is scheduled" are very different things to tell a
   * provider who may be about to drive somewhere.
   */
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const bool = (value: unknown): boolean => value === true;

const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : []);

const fieldState = (value: unknown): FieldProgressState | null =>
  value === 'en_route' || value === 'on_site' || value === 'work_started' ? value : null;

function toJob(raw: Raw): ProviderDayJob | null {
  const assignmentId = text(raw.assignment_id);
  const requestId = text(raw.request_id);
  if (!assignmentId || !requestId) return null;
  return {
    assignmentId,
    requestId,
    needText: text(raw.need_text) ?? 'Assigned work',
    requestState: text(raw.request_state) ?? 'scheduled',
    urgency: text(raw.urgency) ?? 'normal',
    locationName: text(raw.location_name),
    landmark: text(raw.landmark),
    accessNotes: text(raw.access_notes),
    assignedAt: text(raw.assigned_at),
    scheduledStart: text(raw.scheduled_start),
    scheduledEnd: text(raw.scheduled_end),
    scheduleTimezone: text(raw.schedule_timezone),
    scheduleStatus: text(raw.schedule_status) ?? 'unscheduled',
    confirmedAt: text(raw.confirmed_at),
    fieldState: fieldState(raw.field_state),
    fieldStateAt: text(raw.field_state_at),
    openProposal: bool(raw.open_proposal),
    evidenceCount: num(raw.evidence_count) ?? 0,
    obligationStatus: text(raw.obligation_status),
    amountMinor: num(raw.amount_minor),
    currencyCode: text(raw.currency_code),
    startAllowed: bool(raw.start_allowed),
  };
}

function toOpportunity(raw: Raw): ProviderDayOpportunity | null {
  const requestId = text(raw.request_id);
  if (!requestId) return null;
  return {
    requestId,
    needText: text(raw.need_text) ?? 'A request you can quote',
    requestState: text(raw.request_state) ?? 'matching',
    serviceName: text(raw.service_name),
    locationName: text(raw.location_name),
    createdAt: text(raw.created_at),
    quoteId: text(raw.quote_id),
    quoteStatus: text(raw.quote_status),
  };
}

function toAction(raw: Raw): ProviderDayAction | null {
  const kind = providerActionKind(raw.kind);
  if (!kind) return null;
  return {
    kind,
    assignmentId: text(raw.assignment_id),
    requestId: text(raw.request_id),
    credentialId: text(raw.credential_id),
    detail: text(raw.detail),
    dueAt: text(raw.due_at),
  };
}

export async function getProviderDay(providerId: string): Promise<ProviderDayRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_provider_day_command', { p_provider_id: providerId });

  if (error) {
    // A tolerant read that hid its own failure is a mistake this project has already made once. The
    // difference here is that the caller is TOLD: `unavailable` reaches the UI.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read the day: ${error.message}`);
    }
    return { day: null, unavailable: true };
  }

  const raw = obj(data);
  const provider = obj(raw.provider);
  const id = text(provider.id);
  if (!id) return { day: null, unavailable: true };

  const readiness = obj(raw.readiness);
  const counts = obj(raw.counts);
  const providerRow = {
    id,
    displayName: text(provider.display_name) ?? 'Your business',
    status: text(provider.status) ?? 'draft',
    isPublic: bool(provider.is_public),
    slug: text(provider.slug),
    acceptsNewWork: provider.accepts_new_work !== false,
    payoutVerified: bool(provider.payout_verified),
  };

  const schedule = rows(raw.schedule).map(toJob).filter((job): job is ProviderDayJob => job !== null);

  return {
    day: {
      provider: providerRow,
      readiness: {
        totalScore: num(readiness.total_score) ?? 0,
        readiness: text(readiness.readiness) ?? 'not_ready',
        reasons: Array.isArray(readiness.reasons)
          ? (readiness.reasons as unknown[]).filter((reason): reason is string => typeof reason === 'string')
          : [],
        evaluatedAt: text(readiness.evaluated_at),
      },
      counts: {
        activeJobs: num(counts.active_jobs) ?? schedule.length,
        opportunities: num(counts.opportunities) ?? 0,
        unansweredOpportunities: num(counts.unanswered_opportunities) ?? 0,
        actions: num(counts.actions) ?? 0,
      },
      schedule,
      opportunities: rows(raw.opportunities)
        .map(toOpportunity)
        .filter((item): item is ProviderDayOpportunity => item !== null),
      actions: rows(raw.actions).map(toAction).filter((action): action is ProviderDayAction => action !== null),
      earnings: rows(raw.earnings)
        .map(line => {
          const currencyCode = text(line.currency_code);
          if (!currencyCode) return null;
          return {
            currencyCode,
            clearedMinor: num(line.cleared_minor) ?? 0,
            pendingMinor: num(line.pending_minor) ?? 0,
            blockedMinor: num(line.blocked_minor) ?? 0,
          };
        })
        .filter((line): line is ProviderEarningsLine => line !== null),
      awaitingFunding: rows(raw.awaiting_funding)
        .map(line => {
          const currencyCode = text(line.currency_code);
          const amountMinor = num(line.amount_minor);
          if (!currencyCode || amountMinor === null) return null;
          return { currencyCode, amountMinor };
        })
        .filter((line): line is ProviderAwaitingFunding => line !== null),
    },
    unavailable: false,
  };
}

/**
 * The calendar date a moment falls on, in a named timezone.
 *
 * `en-CA` is used deliberately: it is the locale whose short date format is ISO-8601, so the parts
 * arrive in the order we want without re-assembling them from a formatter's punctuation.
 */
function localDateKey(value: Date, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(value);
  } catch {
    // An invalid timezone in the row must not remove the job from the list.
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  }
}

/**
 * Jobs that are happening today, and the ones that are not scheduled at all.
 *
 * ⚠️ "TODAY" IS THE DATE IN THE TIMEZONE THE JOB WAS SCHEDULED IN, not the server's, and not
 * "within 24 hours". A provider in Lagos on a job scheduled in Africa/Lagos at 23:00 sees it under
 * today at 23:00 today; a server running in UTC would otherwise file it under tomorrow for most of
 * the evening. Jobs with no schedule at all are their own group, because "tomorrow" is a claim about
 * a time that does not exist yet.
 */
export function splitDayJobs(jobs: ProviderDayJob[], now: Date): { today: ProviderDayJob[]; later: ProviderDayJob[]; unscheduled: ProviderDayJob[] } {
  const today: ProviderDayJob[] = [];
  const later: ProviderDayJob[] = [];
  const unscheduled: ProviderDayJob[] = [];

  for (const job of jobs) {
    if (!job.scheduledStart) {
      unscheduled.push(job);
      continue;
    }
    const start = new Date(job.scheduledStart);
    if (!Number.isFinite(start.getTime())) {
      unscheduled.push(job);
      continue;
    }
    const sameDay = localDateKey(start, job.scheduleTimezone) === localDateKey(now, job.scheduleTimezone);
    (sameDay ? today : later).push(job);
  }

  return { today, later, unscheduled };
}
