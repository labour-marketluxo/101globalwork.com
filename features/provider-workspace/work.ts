import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The provider's job list, and one job in the field.
 *
 * ⚠️ FOUR TABS, FOUR STATES, ONE ROW EACH. A job is in exactly one tab, and which one is derived from the
 * request state and the assignment status — never stored, because a stored "tab" is a second copy of the state
 * machine that drifts the first time a transition is added. The precedence is written down in `workTabOf`
 * below, including the two cases that could belong to two tabs at once.
 *
 * ⚠️ THE CUSTOMER'S NAME IS SHOWN AND THEIR CONTACT DETAILS ARE NOT. That decision is made in SQL
 * (`get_my_work_command`) and explained there; this module only carries it. There is no avatar: `profiles` has
 * no image column, so the page renders initials and says there is no photograph on file rather than showing a
 * generated identicon that pretends to be one.
 */

export type WorkTab = 'active' | 'scheduled' | 'review' | 'completed';

export const WORK_TABS: readonly { key: WorkTab; label: string; note: string }[] = [
  { key: 'active', label: 'Active jobs', note: 'Accepted work that is not yet under way or happening now.' },
  { key: 'scheduled', label: 'Scheduled', note: 'A time is agreed with the customer.' },
  { key: 'review', label: 'Pending sign-off', note: 'Submitted to the customer, waiting on their approval.' },
  { key: 'completed', label: 'Completed history', note: 'Approved, or ended without being finished.' },
] as const;

export type WorkRow = {
  assignmentId: string;
  requestId: string;
  needText: string;
  requestState: string;
  urgency: string;
  assignmentStatus: string;
  assignedAt: string | null;
  endedAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleTimezone: string | null;
  scheduleStatus: string;
  confirmedAt: string | null;
  fieldState: string | null;
  fieldStateAt: string | null;
  obligationStatus: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  evidenceCount: number;
  stepsTotal: number;
  stepsDone: number;
  openBlockerReason: string | null;
  correctionOpen: boolean;
  approvedAt: string | null;
  locationName: string | null;
  cityName: string | null;
  serviceName: string | null;
  customerDisplayName: string | null;
};

/**
 * Which tab a job belongs to, and why the order matters.
 *
 * ⚠️ THE OVERLAPS ARE RESOLVED IN THIS ORDER, TOP DOWN. A job can be "active" and "scheduled" at the same time
 * — scheduled work is still active — so scheduled wins, because that is the tab a provider opens in the morning.
 * A submitted job whose customer asked for a correction is back in the provider's hands, so it is "active"
 * rather than "pending sign-off", and the card says why.
 */
export function workTabOf(row: Pick<WorkRow, 'assignmentStatus' | 'requestState' | 'correctionOpen'>): WorkTab {
  if (row.assignmentStatus !== 'active') return 'completed';
  if (row.correctionOpen) return 'active';
  switch (row.requestState) {
    case 'submitted_for_approval':
      return 'review';
    case 'completed':
    case 'cancelled':
    case 'disputed':
      return 'completed';
    case 'scheduled':
      return 'scheduled';
    default:
      return 'active';
  }
}

/**
 * The field checkpoint, as a sentence.
 *
 * These are the provider's own records, not request states: "on my way" does not move the job, and the page
 * never implies that it does.
 */
export const FIELD_STATE_COPY: Record<string, string> = {
  en_route: 'On my way',
  on_site: 'On site',
  work_started: 'Work started',
};

export const BLOCKER_REASON_COPY: Record<string, string> = {
  no_access: 'No access to the site',
  missing_material: 'Waiting on a material or part',
  unsafe_conditions: 'The site is not safe to work in',
  customer_unavailable: 'The customer was not available',
  scope_unclear: 'The scope needs clarifying',
  weather: 'Weather',
  other: 'Something else',
};

export const BLOCKER_REASONS = Object.keys(BLOCKER_REASON_COPY);

export type WorkStatusTone = 'teal' | 'amber' | 'slate';

/**
 * The status pill, and the payment indicator beside it.
 *
 * ⚠️ THE PAYMENT INDICATOR IS A FACT, NOT AN ELIGIBILITY CLAIM. `payment_obligations.status` says whether the
 * money is funded; `start_allowed` in the day read is what decides whether work may begin, and the database
 * refuses a start that ignores it. The card shows "Paid" / "Not funded yet" / "No payment required" and leaves
 * the rule where it is enforced.
 */
export function workStatusPill(row: WorkRow): { label: string; tone: WorkStatusTone } {
  if (row.openBlockerReason) return { label: 'Blocked', tone: 'amber' };
  if (row.assignmentStatus !== 'active') {
    return row.approvedAt
      ? { label: 'Completed', tone: 'teal' }
      : { label: row.assignmentStatus === 'cancelled' ? 'Cancelled' : 'Ended', tone: 'slate' };
  }
  if (row.correctionOpen) return { label: 'Sent back for correction', tone: 'amber' };
  switch (row.requestState) {
    case 'scheduled':
      return { label: row.confirmedAt ? 'Confirmed' : 'Awaiting customer confirmation', tone: row.confirmedAt ? 'teal' : 'amber' };
    case 'in_progress':
      return { label: 'Work under way', tone: 'teal' };
    case 'submitted_for_approval':
      return { label: 'Awaiting sign-off', tone: 'amber' };
    case 'completed':
      return { label: 'Completed', tone: 'teal' };
    case 'accepted':
      return { label: 'No time agreed yet', tone: 'amber' };
    default:
      return { label: row.requestState.replaceAll('_', ' '), tone: 'slate' };
  }
}

export function paymentIndicator(row: WorkRow): { label: string; tone: WorkStatusTone; note: string } {
  if (!row.obligationStatus) {
    return {
      label: 'No payment required',
      tone: 'slate',
      note: 'This job carries no payment obligation, so there is nothing to fund before starting.',
    };
  }
  if (row.obligationStatus === 'funded') {
    return { label: 'Payment funded', tone: 'teal', note: 'The customer has funded this job.' };
  }
  if (['pending', 'funding'].includes(row.obligationStatus)) {
    return {
      label: 'Not funded yet',
      tone: 'amber',
      note: 'Paid work cannot be started until the payment obligation is funded. The start action will refuse.',
    };
  }
  return { label: row.obligationStatus.replaceAll('_', ' '), tone: 'slate', note: 'The payment record is in this state.' };
}

export function initialsOf(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const initials = parts.map(part => part[0]?.toUpperCase() ?? '').join('');
  return initials.length > 0 ? initials : null;
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────

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

function toWorkRow(raw: Raw): WorkRow | null {
  const assignmentId = text(raw.assignment_id);
  const requestId = text(raw.request_id);
  if (!assignmentId || !requestId) return null;
  return {
    assignmentId,
    requestId,
    needText: text(raw.need_text) ?? 'Assigned work',
    requestState: text(raw.request_state) ?? 'accepted',
    urgency: text(raw.urgency) ?? 'normal',
    assignmentStatus: text(raw.assignment_status) ?? 'active',
    assignedAt: text(raw.assigned_at),
    endedAt: text(raw.ended_at),
    scheduledStart: text(raw.scheduled_start),
    scheduledEnd: text(raw.scheduled_end),
    scheduleTimezone: text(raw.schedule_timezone),
    scheduleStatus: text(raw.schedule_status) ?? 'unscheduled',
    confirmedAt: text(raw.confirmed_at),
    fieldState: text(raw.field_state),
    fieldStateAt: text(raw.field_state_at),
    obligationStatus: text(raw.obligation_status),
    amountMinor: num(raw.amount_minor),
    currencyCode: text(raw.currency_code),
    evidenceCount: num(raw.evidence_count) ?? 0,
    stepsTotal: num(raw.steps_total) ?? 0,
    stepsDone: num(raw.steps_done) ?? 0,
    openBlockerReason: text(raw.open_blocker_reason),
    correctionOpen: bool(raw.correction_open),
    approvedAt: text(raw.approved_at),
    locationName: text(raw.location_name),
    cityName: text(raw.city_name),
    serviceName: text(raw.service_name),
    customerDisplayName: text(raw.customer_display_name),
  };
}

export type WorkListRead = { rows: WorkRow[]; unavailable: boolean };

export async function getProviderWork(providerId: string): Promise<WorkListRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_work_command', { p_provider_id: providerId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read the work list: ${error.message}`);
    }
    return { rows: [], unavailable: true };
  }
  return {
    rows: rows(data)
      .map(toWorkRow)
      .filter((row): row is WorkRow => row !== null),
    unavailable: false,
  };
}

export type TaskStep = { id: string; ordinal: number; label: string; state: 'todo' | 'doing' | 'done'; note: string | null };

export type EvidenceItem = {
  id: string;
  kind: string;
  note: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  taskStepId: string | null;
  submittedAt: string | null;
};

export type AssignmentDetail = {
  assignment: { id: string; status: string; assignedAt: string | null; endedAt: string | null; fieldState: string | null; fieldStateAt: string | null };
  request: {
    id: string;
    needText: string;
    state: string;
    urgency: string;
    timezone: string | null;
    serviceName: string | null;
    locationName: string | null;
    cityName: string | null;
    currencyCode: string | null;
  };
  customer: { displayName: string | null; hasPhoto: boolean };
  schedule: { scheduledStart: string | null; scheduledEnd: string | null; timezone: string | null; note: string | null; status: string; confirmedAt: string | null } | null;
  obligation: { status: string; amountMinor: number; currencyCode: string } | null;
  site: { landmark: string | null; accessNotes: string | null; areaText: string | null; hazardous: boolean };
  steps: TaskStep[];
  evidence: EvidenceItem[];
  blocker: { id: string; reasonCode: string; note: string | null; openedAt: string | null } | null;
  correction: { id: string; message: string; status: string; createdAt: string | null } | null;
  approvedAt: string | null;
  agreement: { quoteVersion: string; totalMinor: number; currencyCode: string; acceptedAt: string | null; authMethod: string } | null;
};

export type AssignmentRead = { detail: AssignmentDetail | null; unavailable: boolean };

export async function getAssignmentDetail(providerId: string, assignmentId: string): Promise<AssignmentRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_assignment_command', {
    p_provider_id: providerId,
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read the assignment: ${error.message}`);
    }
    return { detail: null, unavailable: true };
  }
  const raw = obj(data);
  const assignment = obj(raw.assignment);
  const id = text(assignment.id);
  // Null from the command means "not this provider's assignment"; that is a 404, not an error page.
  if (!id) return { detail: null, unavailable: false };

  const request = obj(raw.request);
  const customer = obj(raw.customer);
  const site = obj(raw.site);
  const scheduleRaw = raw.schedule && typeof raw.schedule === 'object' ? obj(raw.schedule) : null;
  const obligationRaw = raw.obligation && typeof raw.obligation === 'object' ? obj(raw.obligation) : null;
  const blockerRaw = raw.blocker && typeof raw.blocker === 'object' ? obj(raw.blocker) : null;
  const correctionRaw = raw.correction && typeof raw.correction === 'object' ? obj(raw.correction) : null;
  const agreementRaw = raw.agreement && typeof raw.agreement === 'object' ? obj(raw.agreement) : null;

  return {
    detail: {
      assignment: {
        id,
        status: text(assignment.status) ?? 'active',
        assignedAt: text(assignment.assigned_at),
        endedAt: text(assignment.ended_at),
        fieldState: text(assignment.field_state),
        fieldStateAt: text(assignment.field_state_at),
      },
      request: {
        id: text(request.id) ?? '',
        needText: text(request.need_text) ?? 'Assigned work',
        state: text(request.state) ?? 'accepted',
        urgency: text(request.urgency) ?? 'normal',
        timezone: text(request.timezone),
        serviceName: text(request.service_name),
        locationName: text(request.location_name),
        cityName: text(request.city_name),
        currencyCode: text(request.currency_code),
      },
      customer: { displayName: text(customer.display_name), hasPhoto: bool(customer.has_photo) },
      schedule: scheduleRaw
        ? {
            scheduledStart: text(scheduleRaw.scheduled_start),
            scheduledEnd: text(scheduleRaw.scheduled_end),
            timezone: text(scheduleRaw.timezone),
            note: text(scheduleRaw.note),
            status: text(scheduleRaw.status) ?? 'unscheduled',
            confirmedAt: text(scheduleRaw.confirmed_at),
          }
        : null,
      obligation: obligationRaw
        ? {
            status: text(obligationRaw.status) ?? 'pending',
            amountMinor: num(obligationRaw.amount_minor) ?? 0,
            currencyCode: text(obligationRaw.currency_code) ?? 'NGN',
          }
        : null,
      site: {
        landmark: text(site.landmark),
        accessNotes: text(site.access_notes),
        areaText: text(site.area_text),
        hazardous: bool(site.hazardous),
      },
      steps: rows(raw.steps).map(step => ({
        id: text(step.id) ?? '',
        ordinal: num(step.ordinal) ?? 1,
        label: text(step.label) ?? 'Step',
        state: step.state === 'done' ? ('done' as const) : step.state === 'doing' ? ('doing' as const) : ('todo' as const),
        note: text(step.note),
      })).filter(step => step.id !== ''),
      evidence: rows(raw.evidence).map(item => ({
        id: text(item.id) ?? '',
        kind: text(item.kind) ?? 'photo',
        note: text(item.note),
        storagePath: text(item.storage_path),
        externalUrl: text(item.external_url),
        taskStepId: text(item.task_step_id),
        submittedAt: text(item.submitted_at),
      })).filter(item => item.id !== ''),
      blocker: blockerRaw
        ? {
            id: text(blockerRaw.id) ?? '',
            reasonCode: text(blockerRaw.reason_code) ?? 'other',
            note: text(blockerRaw.note),
            openedAt: text(blockerRaw.opened_at),
          }
        : null,
      correction: correctionRaw
        ? {
            id: text(correctionRaw.id) ?? '',
            message: text(correctionRaw.message) ?? '',
            status: text(correctionRaw.status) ?? 'open',
            createdAt: text(correctionRaw.created_at),
          }
        : null,
      approvedAt: text(raw.approved_at),
      agreement: agreementRaw
        ? {
            quoteVersion: text(agreementRaw.quote_version) ?? 'v1.0',
            totalMinor: num(agreementRaw.total_minor) ?? 0,
            currencyCode: text(agreementRaw.currency_code) ?? 'NGN',
            acceptedAt: text(agreementRaw.accepted_at),
            authMethod: text(agreementRaw.auth_method) ?? 'unknown',
          }
        : null,
    },
    unavailable: false,
  };
}

/** Where a job's pages live, so a link is built in one place. */
export function workPath(assignmentId: string): string {
  return `${PROVIDER_PATHS.work}/${assignmentId}`;
}

/**
 * The list-shaped view of one job.
 *
 * ⚠️ ONE PLACE THAT KNOWS HOW A DETAIL BECOMES A ROW. The job page needs the same status pill and payment
 * indicator the list shows, and the alternative — building a row-shaped literal at the call site — is a
 * twenty-seven-field object written twice and kept in step by hand. It was written twice once already while this
 * was being built, which is why it lives here now.
 */
export function workRowFromDetail(detail: AssignmentDetail): WorkRow {
  const stepsDone = detail.steps.filter(step => step.state === 'done').length;
  return {
    assignmentId: detail.assignment.id,
    requestId: detail.request.id,
    needText: detail.request.needText,
    requestState: detail.request.state,
    urgency: detail.request.urgency,
    assignmentStatus: detail.assignment.status,
    assignedAt: detail.assignment.assignedAt,
    endedAt: detail.assignment.endedAt,
    scheduledStart: detail.schedule?.scheduledStart ?? null,
    scheduledEnd: detail.schedule?.scheduledEnd ?? null,
    scheduleTimezone: detail.schedule?.timezone ?? null,
    scheduleStatus: detail.schedule?.status ?? 'unscheduled',
    confirmedAt: detail.schedule?.confirmedAt ?? null,
    fieldState: detail.assignment.fieldState,
    fieldStateAt: detail.assignment.fieldStateAt,
    obligationStatus: detail.obligation?.status ?? null,
    amountMinor: detail.obligation?.amountMinor ?? null,
    currencyCode: detail.obligation?.currencyCode ?? null,
    evidenceCount: detail.evidence.length,
    stepsTotal: detail.steps.length,
    stepsDone,
    openBlockerReason: detail.blocker?.reasonCode ?? null,
    correctionOpen: Boolean(detail.correction),
    approvedAt: detail.approvedAt,
    locationName: detail.request.locationName,
    cityName: detail.request.cityName,
    serviceName: detail.request.serviceName,
    customerDisplayName: detail.customer.displayName,
  };
}

export function evidencePath(assignmentId: string): string {
  return `${PROVIDER_PATHS.work}/${assignmentId}/evidence`;
}
