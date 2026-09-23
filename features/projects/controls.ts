import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Change requests, the escrow checkpoint, and issue cases.
 *
 * ⚠️ ONE CHECKPOINT HOLDS MONEY. This platform releases escrow exactly once per job — the completion approval,
 * against one funded obligation. The milestones read reports that checkpoint with its real amount and treats the
 * plan's stages as non-financial checkpoints, because five milestone payouts would be five numbers the schema cannot
 * pay.
 *
 * ⚠️ A LEGAL HOLD IS NOT DECORATION. `request_my_payout_command` refuses to queue a payout while a safety, privacy
 * or financial case is open on the job; the case page shows the money it is holding.
 */

export type ChangeRequest = {
  id: string;
  title: string;
  description: string;
  changeKind: string;
  status: string;
  baselineTotalMinor: number | null;
  baselineCurrencyCode: string | null;
  baselineScheduledStart: string | null;
  proposedTotalMinor: number | null;
  proposedCurrencyCode: string | null;
  proposedScheduledStart: string | null;
  priceDeltaMinor: number | null;
  scheduleShiftDays: number | null;
  evidenceIds: string[];
  createdByRole: 'customer' | 'provider';
  createdByMe: boolean;
  decidedByRole: 'customer' | 'provider' | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string | null;
};

export type BaselineVersion = {
  id: string;
  version: number;
  totalMinor: number | null;
  currencyCode: string | null;
  scheduledStart: string | null;
  source: string;
  changeRequestId: string | null;
  createdAt: string | null;
};

export type ChangesRead = { role: string | null; changes: ChangeRequest[]; baselines: BaselineVersion[]; denied: boolean; unavailable: boolean };

export type MilestoneIssue = { id: string; kind: string; status: string; summary: string; legalHold: boolean; responseDueAt: string | null; createdAt: string | null };

export type MilestonesRead = {
  role: string | null;
  state: string;
  checkpoint: {
    amountMinor: number | null;
    currencyCode: string | null;
    obligationStatus: string | null;
    payoutStatus: string | null;
    payoutVerifiedDestination: boolean;
    requiredApprover: string;
    tasksTotal: number;
    tasksDone: number;
    evidenceCount: number;
    approvedAt: string | null;
    correctionOpen: boolean;
  };
  stages: { id: string; ordinal: number; title: string; taskCount: number; doneCount: number }[];
  issues: MilestoneIssue[];
  denied: boolean;
  unavailable: boolean;
};

export type IssueResponse = { id: string; kind: string; body: string; evidenceId: string | null; authorRole: string; authorName: string; createdAt: string | null };

export type IssueRead = {
  role: string | null;
  issue: {
    id: string;
    kind: string;
    status: string;
    summary: string;
    raisedByRole: 'customer' | 'provider';
    raisedByName: string;
    responseDueAt: string | null;
    legalHold: boolean;
    resolution: string | null;
    resolvedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  responses: IssueResponse[];
  money: { obligationStatus: string | null; amountMinor: number | null; currencyCode: string | null; payoutStatus: string | null; heldMinor: number | null };
  canIntervene: boolean;
  denied: boolean;
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
const side = (value: unknown): 'customer' | 'provider' => (value === 'customer' ? 'customer' : 'provider');

export const CHANGE_KIND_COPY: Record<string, string> = {
  scope: 'Scope',
  schedule: 'Schedule',
  price: 'Price',
  mixed: 'Scope, schedule and price',
};

export const CHANGE_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  draft: { label: 'Draft', tone: 'slate' },
  proposed: { label: 'Awaiting a decision', tone: 'amber' },
  accepted: { label: 'Accepted — baseline adjusted', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'slate' },
  withdrawn: { label: 'Withdrawn', tone: 'slate' },
};

export async function getProjectChanges(assignmentId: string): Promise<ChangesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_changes_command', { p_assignment_id: assignmentId });
  if (error) return { role: null, changes: [], baselines: [], denied: false, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { role: null, changes: [], baselines: [], denied: true, unavailable: false };

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    changes: rows(raw.changes).map(entry => ({
      id: text(entry.id) ?? '',
      title: text(entry.title) ?? 'Change request',
      description: text(entry.description) ?? '',
      changeKind: text(entry.change_kind) ?? 'scope',
      status: text(entry.status) ?? 'proposed',
      baselineTotalMinor: num(entry.baseline_total_minor),
      baselineCurrencyCode: text(entry.baseline_currency_code),
      baselineScheduledStart: text(entry.baseline_scheduled_start),
      proposedTotalMinor: num(entry.proposed_total_minor),
      proposedCurrencyCode: text(entry.proposed_currency_code),
      proposedScheduledStart: text(entry.proposed_scheduled_start),
      priceDeltaMinor: num(entry.price_delta_minor),
      scheduleShiftDays: num(entry.schedule_shift_days),
      evidenceIds: Array.isArray(entry.evidence_ids)
        ? (entry.evidence_ids as unknown[]).filter((item): item is string => typeof item === 'string')
        : [],
      createdByRole: side(entry.created_by_role),
      createdByMe: bool(entry.created_by_me),
      decidedByRole:
        entry.decided_by_role === 'customer'
          ? ('customer' as const)
          : entry.decided_by_role === 'provider'
            ? ('provider' as const)
            : null,
      decidedAt: text(entry.decided_at),
      decisionNote: text(entry.decision_note),
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
    baselines: rows(raw.baselines).map(entry => ({
      id: text(entry.id) ?? '',
      version: num(entry.version) ?? 1,
      totalMinor: num(entry.total_minor),
      currencyCode: text(entry.currency_code),
      scheduledStart: text(entry.scheduled_start),
      source: text(entry.source) ?? 'accepted_quote',
      changeRequestId: text(entry.change_request_id),
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
  };
}

export async function getProjectMilestones(assignmentId: string): Promise<MilestonesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_milestones_command', { p_assignment_id: assignmentId });
  const empty: MilestonesRead = {
    role: null,
    state: '',
    checkpoint: {
      amountMinor: null,
      currencyCode: null,
      obligationStatus: null,
      payoutStatus: null,
      payoutVerifiedDestination: false,
      requiredApprover: 'customer',
      tasksTotal: 0,
      tasksDone: 0,
      evidenceCount: 0,
      approvedAt: null,
      correctionOpen: false,
    },
    stages: [],
    issues: [],
    denied: false,
    unavailable: false,
  };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };
  const checkpoint = obj(raw.checkpoint);

  return {
    role: text(raw.role),
    state: text(raw.state) ?? '',
    denied: false,
    unavailable: false,
    checkpoint: {
      amountMinor: num(checkpoint.amount_minor),
      currencyCode: text(checkpoint.currency_code),
      obligationStatus: text(checkpoint.obligation_status),
      payoutStatus: text(checkpoint.payout_status),
      payoutVerifiedDestination: bool(checkpoint.payout_verified_destination),
      requiredApprover: text(checkpoint.required_approver) ?? 'customer',
      tasksTotal: num(checkpoint.tasks_total) ?? 0,
      tasksDone: num(checkpoint.tasks_done) ?? 0,
      evidenceCount: num(checkpoint.evidence_count) ?? 0,
      approvedAt: text(checkpoint.approved_at),
      correctionOpen: bool(checkpoint.correction_open),
    },
    stages: rows(raw.stages).map(entry => ({
      id: text(entry.id) ?? '',
      ordinal: num(entry.ordinal) ?? 1,
      title: text(entry.title) ?? 'Stage',
      taskCount: num(entry.task_count) ?? 0,
      doneCount: num(entry.done_count) ?? 0,
    })).filter(entry => entry.id !== ''),
    issues: rows(raw.issues).map(entry => ({
      id: text(entry.id) ?? '',
      kind: text(entry.kind) ?? 'operational',
      status: text(entry.status) ?? 'open',
      summary: text(entry.summary) ?? '',
      legalHold: bool(entry.legal_hold),
      responseDueAt: text(entry.response_due_at),
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
  };
}

export const ISSUE_KIND_COPY: Record<string, string> = {
  operational: 'Operational issue',
  safety: 'Safety incident',
  privacy: 'Privacy incident',
  financial_dispute: 'Financial dispute',
};

export const ISSUE_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  draft: { label: 'Draft', tone: 'slate' },
  open: { label: 'Open', tone: 'amber' },
  investigation: { label: 'Under investigation', tone: 'amber' },
  escalated: { label: 'Escalated to the platform', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'teal' },
  closed: { label: 'Closed', tone: 'slate' },
};

export async function getProjectIssue(assignmentId: string, issueId: string): Promise<IssueRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_issue_command', {
    p_assignment_id: assignmentId,
    p_issue_id: issueId,
  });
  const empty: IssueRead = {
    role: null,
    issue: {
      id: '',
      kind: 'operational',
      status: 'open',
      summary: '',
      raisedByRole: 'customer',
      raisedByName: '',
      responseDueAt: null,
      legalHold: false,
      resolution: null,
      resolvedAt: null,
      createdAt: null,
      updatedAt: null,
    },
    responses: [],
    money: { obligationStatus: null, amountMinor: null, currencyCode: null, payoutStatus: null, heldMinor: null },
    canIntervene: false,
    denied: false,
    unavailable: false,
  };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };
  const issue = obj(raw.issue);
  const money = obj(raw.money);
  const platform = obj(raw.platform);
  if (!text(issue.id)) return { ...empty, denied: true };

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    issue: {
      id: text(issue.id) ?? '',
      kind: text(issue.kind) ?? 'operational',
      status: text(issue.status) ?? 'open',
      summary: text(issue.summary) ?? '',
      raisedByRole: side(issue.raised_by_role),
      raisedByName: text(issue.raised_by_name) ?? 'A participant',
      responseDueAt: text(issue.response_due_at),
      legalHold: bool(issue.legal_hold),
      resolution: text(issue.resolution),
      resolvedAt: text(issue.resolved_at),
      createdAt: text(issue.created_at),
      updatedAt: text(issue.updated_at),
    },
    responses: rows(raw.responses).map(entry => ({
      id: text(entry.id) ?? '',
      kind: text(entry.kind) ?? 'response',
      body: text(entry.body) ?? '',
      evidenceId: text(entry.evidence_id),
      authorRole: text(entry.author_role) ?? 'customer',
      authorName: text(entry.author_name) ?? 'A participant',
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
    money: {
      obligationStatus: text(money.obligation_status),
      amountMinor: num(money.amount_minor),
      currencyCode: text(money.currency_code),
      payoutStatus: text(money.payout_status),
      heldMinor: num(money.held_minor),
    },
    canIntervene: bool(platform.can_intervene),
  };
}
