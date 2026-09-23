import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { TaskStatus } from '@/features/projects/project';

/**
 * One task, and the moves this caller may make on it.
 *
 * ⚠️ THE TRANSITIONS COME FROM THE DATABASE. `get_project_task_command` computes which status changes are legal for
 * the caller's role from the status the row is in, and the page renders exactly those buttons. The command refuses
 * everything else, so the UI cannot offer a move that will fail — and it cannot hide one that would work either.
 *
 * ⚠️ NO OPTIMISTIC STATUS. The buttons are server-action forms; the page re-renders from the database after the
 * write, and the notice it shows is the outcome the database reported. A task that says "in progress" because a
 * click said so, before the write landed, is exactly the state this platform refuses to show.
 */

export type TaskCriterion = { label: string; done: boolean };

export type ProjectTaskDetail = {
  role: 'customer' | 'provider' | 'admin';
  task: {
    id: string;
    assignmentId: string;
    stageId: string;
    stageTitle: string;
    ordinal: number;
    title: string;
    description: string | null;
    status: TaskStatus;
    blockedReason: string | null;
    statusNote: string | null;
    scopeParameters: Record<string, string>;
    criteria: TaskCriterion[];
    scheduledStart: string | null;
    scheduledEnd: string | null;
    submittedAt: string | null;
    completedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    assigneeRole: 'customer' | 'provider' | null;
    assigneeName: string | null;
  };
  allowedTransitions: { status: TaskStatus; label: string }[];
  siblings: { id: string; ordinal: number; title: string; status: TaskStatus }[];
  money: { obligationStatus: string | null; amountMinor: number | null; currencyCode: string | null; payoutStatus: string | null };
  requestState: string;
  evidence: { id: string; kind: string; note: string | null; submittedAt: string | null }[];
};

export type TaskRead = { detail: ProjectTaskDetail | null; denied: boolean; unavailable: boolean };

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

function toStatus(value: unknown): TaskStatus {
  return value === 'in_progress' || value === 'blocked' || value === 'submitted' || value === 'completed'
    ? value
    : 'not_started';
}

export async function getProjectTask(assignmentId: string, taskId: string): Promise<TaskRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_task_command', {
    p_assignment_id: assignmentId,
    p_task_id: taskId,
  });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[projects] could not read the task: ${error.message}`);
    }
    return { detail: null, denied: false, unavailable: true };
  }
  const raw = obj(data);
  if (raw.allowed !== true) return { detail: null, denied: true, unavailable: false };

  const task = obj(raw.task);
  const money = obj(raw.money);
  const role = raw.role === 'provider' || raw.role === 'admin' ? raw.role : 'customer';

  const scope: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj(task.scope_parameters))) {
    const rendered = text(value);
    if (rendered) scope[key] = rendered;
  }

  return {
    detail: {
      role,
      task: {
        id: text(task.id) ?? taskId,
        assignmentId: text(task.assignment_id) ?? assignmentId,
        stageId: text(task.stage_id) ?? '',
        stageTitle: text(task.stage_title) ?? 'Stage',
        ordinal: num(task.ordinal) ?? 1,
        title: text(task.title) ?? 'Task',
        description: text(task.description),
        status: toStatus(task.status),
        blockedReason: text(task.blocked_reason),
        statusNote: text(task.status_note),
        scopeParameters: scope,
        criteria: rows(task.completion_criteria).map(entry => ({
          label: text(entry.label) ?? 'Criterion',
          done: entry.done === true,
        })),
        scheduledStart: text(task.scheduled_start),
        scheduledEnd: text(task.scheduled_end),
        submittedAt: text(task.submitted_at),
        completedAt: text(task.completed_at),
        createdAt: text(task.created_at),
        updatedAt: text(task.updated_at),
        assigneeRole: task.assignee_role === 'customer' || task.assignee_role === 'provider' ? task.assignee_role : null,
        assigneeName: text(task.assignee_name),
      },
      allowedTransitions: rows(raw.allowed_transitions).map(entry => ({
        status: toStatus(entry.status),
        label: text(entry.label) ?? 'Move',
      })),
      siblings: rows(raw.siblings).map(entry => ({
        id: text(entry.id) ?? '',
        ordinal: num(entry.ordinal) ?? 1,
        title: text(entry.title) ?? 'Task',
        status: toStatus(entry.status),
      })).filter(entry => entry.id !== ''),
      money: {
        obligationStatus: text(money.obligation_status),
        amountMinor: num(money.amount_minor),
        currencyCode: text(money.currency_code),
        payoutStatus: text(money.payout_status),
      },
      requestState: text(raw.request_state) ?? 'accepted',
      evidence: rows(raw.evidence).map(entry => ({
        id: text(entry.id) ?? '',
        kind: text(entry.kind) ?? 'photo',
        note: text(entry.note),
        submittedAt: text(entry.submitted_at),
      })).filter(entry => entry.id !== ''),
    },
    denied: false,
    unavailable: false,
  };
}
