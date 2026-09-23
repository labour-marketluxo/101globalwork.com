import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The shared project workspace: one assignment, seen by both parties.
 *
 * ⚠️ `projectId` IS AN ASSIGNMENT ID. There is no projects table in this schema and this module does not pretend
 * there is: the unit of agreed work is the assignment, created when a customer accepts a quote. The route keeps the
 * brief's shape so a real projects table could be pointed at it later, and this comment is the only place the
 * mapping needs explaining.
 *
 * ⚠️ AUTHORISATION IS THE COMMAND'S ANSWER, NOT THIS MODULE'S. Every read returns `{allowed:false}` for a caller who
 * is neither the customer, the provider nor an admin with `platform.projects.read`, and the pages turn that into a
 * not-found response. A page never decides who may look at a project.
 *
 * ⚠️ THE PAYLOAD IS CACHED PER REQUEST. The layout needs the header for every tab and the page needs the same
 * document, so both call `getProject` and React's `cache` makes it one round trip.
 */

export type ProjectRole = 'customer' | 'provider' | 'admin';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'submitted' | 'completed';
export type MessageContext = 'project' | 'task' | 'quote' | 'scope_change' | 'milestone' | 'dispute';

export const TASK_STATUS_COPY: Record<TaskStatus, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  not_started: { label: 'Not started', tone: 'slate' },
  in_progress: { label: 'In progress', tone: 'amber' },
  blocked: { label: 'Blocked', tone: 'amber' },
  submitted: { label: 'Awaiting approval', tone: 'amber' },
  completed: { label: 'Completed', tone: 'teal' },
};

export const ROLE_LABEL: Record<ProjectRole, string> = {
  customer: 'Customer',
  provider: 'Provider',
  admin: 'Platform',
};

/** The job's own state, said in words rather than as an enum value. */
export const PROJECT_STATE_COPY: Record<string, string> = {
  accepted: 'Accepted, no time agreed yet',
  scheduled: 'Scheduled',
  in_progress: 'Work under way',
  submitted_for_approval: 'Awaiting the customer’s approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export type ProjectTask = {
  id: string;
  ordinal: number;
  title: string;
  status: TaskStatus;
  blockedReason: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assigneeRole: 'customer' | 'provider' | null;
  criteriaTotal: number;
  criteriaDone: number;
  completedAt: string | null;
  updatedAt: string | null;
};

export type ProjectStage = {
  id: string;
  ordinal: number;
  title: string;
  description: string | null;
  taskCount: number;
  doneCount: number;
  tasks: ProjectTask[];
};

export type ProjectRisk = { key: string; severity: 'high' | 'medium'; label: string; detail: string | null };

export type ProjectMilestone = { key: string; label: string; at: string | null; done: boolean };

export type ProjectNextAction = { key: string; title: string; detail: string; hrefKind: string };

export type ProjectEvidence = { id: string; kind: string; note: string | null; storagePath?: string | null; submittedAt: string | null };

export type ProjectChange = { id: string; kind: string; message: string; status: string; createdAt: string | null };

export type Project = {
  role: ProjectRole;
  header: {
    assignmentId: string;
    requestId: string;
    outcome: string;
    state: string;
    urgency: string;
    assignedAt: string | null;
    completedAt: string | null;
    serviceName: string | null;
    locationName: string | null;
    cityName: string | null;
    currencyCode: string | null;
    customerName: string | null;
    providerName: string | null;
    /** Posted by the assignment control, never rendered: the names above are what a person reads. */
    customerAccountId: string | null;
    providerAccountId: string | null;
  };
  schedule: { scheduledStart: string | null; scheduledEnd: string | null; timezone: string | null; status: string; confirmedAt: string | null } | null;
  agreement: { quoteVersion: string; totalMinor: number; currencyCode: string; acceptedAt: string | null; authMethod: string } | null;
  money: { obligationStatus: string | null; amountMinor: number | null; currencyCode: string | null; payoutStatus: string | null; payoutAmountMinor: number | null };
  risks: ProjectRisk[];
  nextAction: ProjectNextAction | null;
  progress: { tasksTotal: number; tasksDone: number; tasksBlocked: number; tasksAwaitingApproval: number; tasksOverdue: number; stages: number };
  stages: ProjectStage[];
  milestones: ProjectMilestone[];
  evidence: ProjectEvidence[];
  changes: ProjectChange[];
};

export type ProjectRead = { project: Project | null; denied: boolean; unavailable: boolean };

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

function toStatus(value: unknown): TaskStatus {
  return value === 'in_progress' || value === 'blocked' || value === 'submitted' || value === 'completed'
    ? value
    : 'not_started';
}

export const getProject = cache(async (assignmentId: string): Promise<ProjectRead> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_command', { p_assignment_id: assignmentId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[projects] could not read the project: ${error.message}`);
    }
    return { project: null, denied: false, unavailable: true };
  }

  const raw = obj(data);
  if (!bool(raw.allowed)) return { project: null, denied: true, unavailable: false };

  const header = obj(raw.project);
  const scheduleRaw = raw.schedule && typeof raw.schedule === 'object' ? obj(raw.schedule) : null;
  const money = obj(raw.money);
  const progress = obj(raw.progress);
  const role = raw.role === 'provider' || raw.role === 'admin' ? raw.role : 'customer';

  return {
    project: {
      role,
      header: {
        assignmentId: text(header.assignment_id) ?? assignmentId,
        requestId: text(header.request_id) ?? '',
        outcome: text(header.outcome) ?? 'Agreed work',
        state: text(header.state) ?? 'accepted',
        urgency: text(header.urgency) ?? 'normal',
        assignedAt: text(header.assigned_at),
        completedAt: text(header.completed_at),
        serviceName: text(header.service_name),
        locationName: text(header.location_name),
        cityName: text(header.city_name),
        currencyCode: text(header.currency_code),
        customerName: text(header.customer_name),
        providerName: text(header.provider_name),
        customerAccountId: text(header.customer_account_id),
        providerAccountId: text(header.provider_account_id),
      },
      schedule: scheduleRaw
        ? {
            scheduledStart: text(scheduleRaw.scheduled_start),
            scheduledEnd: text(scheduleRaw.scheduled_end),
            timezone: text(scheduleRaw.timezone),
            status: text(scheduleRaw.status) ?? 'unscheduled',
            confirmedAt: text(scheduleRaw.confirmed_at),
          }
        : null,
      agreement: raw.agreement && typeof raw.agreement === 'object'
        ? {
            quoteVersion: text(obj(raw.agreement).quote_version) ?? 'v1.0',
            totalMinor: num(obj(raw.agreement).total_minor) ?? 0,
            currencyCode: text(obj(raw.agreement).currency_code) ?? 'NGN',
            acceptedAt: text(obj(raw.agreement).accepted_at),
            authMethod: text(obj(raw.agreement).auth_method) ?? 'unknown',
          }
        : null,
      money: {
        obligationStatus: text(money.obligation_status),
        amountMinor: num(money.amount_minor),
        currencyCode: text(money.currency_code),
        payoutStatus: text(money.payout_status),
        payoutAmountMinor: num(money.payout_amount_minor),
      },
      risks: rows(raw.risks).map(risk => ({
        key: text(risk.key) ?? 'risk',
        severity: risk.severity === 'high' ? 'high' : 'medium',
        label: text(risk.label) ?? 'Something needs attention',
        detail: text(risk.detail),
      })),
      nextAction: raw.next_action && typeof raw.next_action === 'object'
        ? {
            key: text(obj(raw.next_action).key) ?? 'none',
            title: text(obj(raw.next_action).title) ?? '',
            detail: text(obj(raw.next_action).detail) ?? '',
            hrefKind: text(obj(raw.next_action).href_kind) ?? 'none',
          }
        : null,
      progress: {
        tasksTotal: num(progress.tasks_total) ?? 0,
        tasksDone: num(progress.tasks_done) ?? 0,
        tasksBlocked: num(progress.tasks_blocked) ?? 0,
        tasksAwaitingApproval: num(progress.tasks_awaiting_approval) ?? 0,
        tasksOverdue: num(progress.tasks_overdue) ?? 0,
        stages: num(progress.stages) ?? 0,
      },
      stages: rows(raw.stages).map(stage => ({
        id: text(stage.id) ?? '',
        ordinal: num(stage.ordinal) ?? 1,
        title: text(stage.title) ?? 'Stage',
        description: text(stage.description),
        taskCount: num(stage.task_count) ?? 0,
        doneCount: num(stage.done_count) ?? 0,
        tasks: rows(stage.tasks).map(task => ({
          id: text(task.id) ?? '',
          ordinal: num(task.ordinal) ?? 1,
          title: text(task.title) ?? 'Task',
          status: toStatus(task.status),
          blockedReason: text(task.blocked_reason),
          scheduledStart: text(task.scheduled_start),
          scheduledEnd: text(task.scheduled_end),
          assigneeRole:
            task.assignee_role === 'customer'
              ? ('customer' as const)
              : task.assignee_role === 'provider'
                ? ('provider' as const)
                : null,
          criteriaTotal: num(task.criteria_total) ?? 0,
          criteriaDone: num(task.criteria_done) ?? 0,
          completedAt: text(task.completed_at),
          updatedAt: text(task.updated_at),
        })),
      })).filter(stage => stage.id !== ''),
      milestones: rows(raw.milestones).map(milestone => ({
        key: text(milestone.key) ?? 'milestone',
        label: text(milestone.label) ?? 'Milestone',
        at: text(milestone.at),
        done: bool(milestone.done),
      })),
      evidence: rows(raw.evidence).map(item => ({
        id: text(item.id) ?? '',
        kind: text(item.kind) ?? 'photo',
        note: text(item.note),
        storagePath: text(item.storage_path),
        submittedAt: text(item.submitted_at),
      })).filter(item => item.id !== ''),
      changes: rows(raw.changes).map(change => ({
        id: text(change.id) ?? '',
        kind: text(change.kind) ?? 'change',
        message: text(change.message) ?? '',
        status: text(change.status) ?? 'open',
        createdAt: text(change.created_at),
      })).filter(change => change.id !== ''),
    },
    denied: false,
    unavailable: false,
  };
});

/**
 * Where a next-action card points, per role.
 *
 * ⚠️ THE DATABASE SAYS WHAT THE ACTION IS; THIS SAYS WHERE IT LIVES. Building the href in SQL would put customer and
 * provider routes inside a command that knows nothing about either workspace, and the two would drift the first time
 * a route moved. Unknown kinds resolve to null and the card renders without a button rather than pointing anywhere.
 */
export function nextActionHref(kind: string, project: Project): string | null {
  switch (kind) {
    case 'provider_work':
    case 'provider_evidence':
      return `${PROVIDER_PATHS.work}/${project.header.assignmentId}${kind === 'provider_evidence' ? '/evidence' : ''}`;
    case 'customer_request':
      return `/customer/requests/${project.header.requestId}`;
    case 'customer_booking':
      return `/customer/bookings`;
    case 'customer_completion':
      return `/customer/projects/${project.header.assignmentId}/completion`;
    case 'project_work':
      return `/projects/${project.header.assignmentId}/work`;
    default:
      return null;
  }
}

/** The tabs the shared workspace offers, with the routes that exist and the sections that do not. */
