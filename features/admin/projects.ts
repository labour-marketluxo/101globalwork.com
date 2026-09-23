import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The project console's reads.
 *
 * ⚠️ THERE IS NO WRITE ANYWHERE IN THIS MODULE, AND THAT IS THE POINT OF IT. Every intervention goes through
 * `run_project_override_command` via features/admin/project-actions.ts. A read module cannot change a project,
 * so a page can be extended with a new panel without anybody auditing whether the panel can mutate.
 *
 * ⚠️ PARTY CONTACTS ARRIVE MASKED, as everywhere else in this console. A project investigation needs to know
 * which account it is looking at, not that account's address.
 */

export type ProjectParty = {
  accountId: string;
  name: string;
  contactMasked: string | null;
  organisationId?: string | null;
  accountStatus?: string;
};

export type ProjectIssueTag = {
  kind: string | null;
  status: string | null;
  legalHold: boolean;
  summary: string | null;
  trustCaseId: string | null;
  trustCaseState: string | null;
  trustCaseSeverity: string | null;
  trustCaseHold: boolean;
};

export type ProjectMoney = {
  obligationId: string | null;
  obligationStatus: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  payoutStatus: string | null;
};

export type ProjectRow = {
  requestId: string;
  title: string;
  state: string;
  phase: string;
  severityRank: number;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  exceptions: string[];
  marketName: string | null;
  marketCode: string | null;
  customer: ProjectParty;
  provider: { providerId: string; name: string; assignmentId: string; assignmentStatus: string } | null;
  issue: ProjectIssueTag | null;
  blockedTasks: number;
  money: ProjectMoney;
};

export type ProjectCounts = {
  total: number;
  blocked: number;
  disputed: number;
  stale: number;
  financiallyInconsistent: number;
};

export type ProjectDirectory = {
  allowed: boolean;
  unavailable: boolean;
  projects: ProjectRow[];
  counts: ProjectCounts;
};

export type ProjectTimelineEvent = {
  action: string;
  occurredAt: string | null;
  actor: string;
  actorType: string;
  resourceType: string;
  resourceId: string | null;
  reasonCode: string | null;
};

export type ProjectTaskRow = { id: string; title: string; status: string; ordinal: number; assignee: string | null };
export type ProjectStageRow = { stageId: string; ordinal: number; title: string; tasks: ProjectTaskRow[] };

export type ProjectJobRow = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  occurredAt: string | null;
  publishedAt: string | null;
  attemptCount: number;
  lastError: string | null;
};

export type ProjectOverrideRow = {
  id: string;
  commandKey: string;
  fromState: string | null;
  toState: string | null;
  fromDetail: string | null;
  toDetail: string | null;
  reasonCode: string;
  note: string;
  evidenceReference: string;
  result: string;
  executedAt: string | null;
  executedBy: string;
  targetId: string | null;
};

export type ProjectDiagnostics = {
  allowed: boolean;
  found: boolean;
  unavailable: boolean;
  project: {
    requestId: string;
    title: string;
    state: string;
    urgency: string;
    createdAt: string | null;
    updatedAt: string | null;
    submittedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    marketName: string | null;
    marketCode: string | null;
    serviceName: string | null;
    locationName: string | null;
    organisationId: string | null;
    organisationName: string | null;
  };
  customer: ProjectParty;
  provider: {
    providerId: string;
    name: string;
    status: string;
    assignmentId: string;
    assignmentStatus: string;
    assignedAt: string | null;
    acceptedQuoteId: string | null;
  } | null;
  schedule: { scheduledStart: string | null; scheduledEnd: string | null; timezone: string | null; note: string | null } | null;
  acceptedScope: { version: number | null; scope: unknown; acceptedAt: string | null } | null;
  acceptedQuote: { id: string; status: string; totalMinor: number | null; currencyCode: string | null; summary: string | null; validUntil: string | null } | null;
  stages: ProjectStageRow[];
  issues: {
    id: string; kind: string; status: string; summary: string; legalHold: boolean;
    responseDueAt: string | null; resolution: string | null; createdAt: string | null; resolvedAt: string | null;
  }[];
  changes: {
    id: string; title: string; status: string; changeKind: string;
    baselineTotalMinor: number | null; proposedTotalMinor: number | null; currencyCode: string | null; createdAt: string | null;
  }[];
  evidenceCount: number;
  documentCount: number;
  timeline: ProjectTimelineEvent[];
  money: {
    obligationId: string;
    status: string;
    amountMinor: number;
    currencyCode: string;
    createdAt: string | null;
    updatedAt: string | null;
    quoteId: string;
    payouts: { id: string; status: string; amountMinor: number; currencyCode: string; providerReference: string | null }[];
    refunds: { id: string; status: string; amountMinor: number; reason: string | null; createdAt: string | null }[];
    ledger: { entryCount: number; byAccountKind: Record<string, number>; lastEntryAt: string | null };
  } | null;
  jobs: ProjectJobRow[];
  overrides: ProjectOverrideRow[];
  legalTransitions: Record<string, string[]>;
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

const emptyCounts: ProjectCounts = { total: 0, blocked: 0, disputed: 0, stale: 0, financiallyInconsistent: 0 };

function party(raw: Raw): ProjectParty {
  return {
    accountId: text(raw.account_id) ?? '',
    name: text(raw.name) ?? 'Account holder',
    contactMasked: text(raw.contact_masked),
    organisationId: text(raw.organisation_id),
    accountStatus: text(raw.account_status) ?? undefined,
  };
}

export async function getProjectOperations(filters: {
  state?: string;
  marketId?: string;
  exception?: string;
  search?: string;
}): Promise<ProjectDirectory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_project_operations_command', {
    p_state: filters.state || null,
    p_market_id: filters.marketId || null,
    p_exception: filters.exception || null,
    p_search: filters.search ?? null,
    p_limit: 100,
  });
  if (error) return { allowed: false, unavailable: true, projects: [], counts: emptyCounts };

  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, projects: [], counts: emptyCounts };
  const counts = obj(raw.counts);

  return {
    allowed: true,
    unavailable: false,
    counts: {
      total: num(counts.total) ?? 0,
      blocked: num(counts.blocked) ?? 0,
      disputed: num(counts.disputed) ?? 0,
      stale: num(counts.stale) ?? 0,
      financiallyInconsistent: num(counts.financially_inconsistent) ?? 0,
    },
    projects: rows(raw.projects).map(entry => {
      const provider = obj(entry.provider);
      const issue = obj(entry.issue);
      const money = obj(entry.money);
      return {
        requestId: text(entry.request_id) ?? '',
        title: text(entry.title) ?? 'Request',
        state: text(entry.state) ?? 'submitted',
        phase: text(entry.phase) ?? 'pre_work',
        severityRank: num(entry.severity_rank) ?? 5,
        createdAt: text(entry.created_at),
        updatedAt: text(entry.updated_at),
        completedAt: text(entry.completed_at),
        exceptions: Array.isArray(entry.exceptions)
          ? entry.exceptions.filter((value): value is string => typeof value === 'string')
          : [],
        marketName: text(entry.market_name),
        marketCode: text(entry.market_code),
        customer: party(obj(entry.customer)),
        provider: text(provider.provider_id)
          ? {
              providerId: text(provider.provider_id) ?? '',
              name: text(provider.name) ?? 'Provider',
              assignmentId: text(provider.assignment_id) ?? '',
              assignmentStatus: text(provider.assignment_status) ?? 'active',
            }
          : null,
        issue: text(issue.status) || text(issue.trust_case_id)
          ? {
              kind: text(issue.kind),
              status: text(issue.status),
              legalHold: bool(issue.legal_hold),
              summary: text(issue.summary),
              trustCaseId: text(issue.trust_case_id),
              trustCaseState: text(issue.trust_case_state),
              trustCaseSeverity: text(issue.trust_case_severity),
              trustCaseHold: bool(issue.trust_case_hold),
            }
          : null,
        blockedTasks: num(entry.blocked_tasks) ?? 0,
        money: {
          obligationId: text(money.obligation_id),
          obligationStatus: text(money.obligation_status),
          amountMinor: num(money.amount_minor),
          currencyCode: text(money.currency_code),
          payoutStatus: text(money.payout_status),
        },
      };
    }).filter(entry => entry.requestId !== ''),
  };
}

const emptyDiagnostics = (requestId: string): ProjectDiagnostics => ({
  allowed: false,
  found: false,
  unavailable: false,
  project: {
    requestId, title: 'Request', state: 'submitted', urgency: 'normal',
    createdAt: null, updatedAt: null, submittedAt: null, completedAt: null, cancelledAt: null,
    marketName: null, marketCode: null, serviceName: null, locationName: null,
    organisationId: null, organisationName: null,
  },
  customer: { accountId: '', name: 'Account holder', contactMasked: null },
  provider: null,
  schedule: null,
  acceptedScope: null,
  acceptedQuote: null,
  stages: [],
  issues: [],
  changes: [],
  evidenceCount: 0,
  documentCount: 0,
  timeline: [],
  money: null,
  jobs: [],
  overrides: [],
  legalTransitions: {},
});

export async function getProjectDiagnostics(requestId: string): Promise<ProjectDiagnostics> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_project_diagnostics_command', { p_request_id: requestId });
  if (error) return { ...emptyDiagnostics(requestId), unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return emptyDiagnostics(requestId);
  if (raw.found !== true) return { ...emptyDiagnostics(requestId), allowed: true, found: false };

  const project = obj(raw.project);
  const provider = obj(raw.provider);
  const schedule = obj(raw.schedule);
  const scope = obj(raw.accepted_scope);
  const quote = obj(raw.accepted_quote);
  const money = obj(raw.money);
  const ledger = obj(money.ledger);
  const legalTransitions: Record<string, string[]> = {};
  for (const [state, targets] of Object.entries(obj(raw.legal_transitions))) {
    legalTransitions[state] = Array.isArray(targets) ? targets.filter((value): value is string => typeof value === 'string') : [];
  }

  const byAccountKind: Record<string, number> = {};
  for (const [kind, total] of Object.entries(obj(ledger.by_account_kind))) {
    const value = num(total);
    if (value !== null) byAccountKind[kind] = value;
  }

  return {
    allowed: true,
    found: true,
    unavailable: false,
    project: {
      requestId: text(project.request_id) ?? requestId,
      title: text(project.title) ?? 'Request',
      state: text(project.state) ?? 'submitted',
      urgency: text(project.urgency) ?? 'normal',
      createdAt: text(project.created_at),
      updatedAt: text(project.updated_at),
      submittedAt: text(project.submitted_at),
      completedAt: text(project.completed_at),
      cancelledAt: text(project.cancelled_at),
      marketName: text(project.market_name),
      marketCode: text(project.market_code),
      serviceName: text(project.service_name),
      locationName: text(project.location_name),
      organisationId: text(project.organisation_id),
      organisationName: text(project.organisation_name),
    },
    customer: party(obj(raw.customer)),
    provider: text(provider.assignment_id)
      ? {
          providerId: text(provider.provider_id) ?? '',
          name: text(provider.name) ?? 'Provider',
          status: text(provider.status) ?? 'draft',
          assignmentId: text(provider.assignment_id) ?? '',
          assignmentStatus: text(provider.assignment_status) ?? 'active',
          assignedAt: text(provider.assigned_at),
          acceptedQuoteId: text(provider.accepted_quote_id),
        }
      : null,
    schedule: text(schedule.scheduled_start) || text(schedule.timezone)
      ? {
          scheduledStart: text(schedule.scheduled_start),
          scheduledEnd: text(schedule.scheduled_end),
          timezone: text(schedule.timezone),
          note: text(schedule.note),
        }
      : null,
    acceptedScope: num(scope.version) !== null
      ? { version: num(scope.version), scope: scope.scope ?? null, acceptedAt: text(scope.accepted_at) }
      : null,
    acceptedQuote: text(quote.id)
      ? {
          id: text(quote.id) ?? '',
          status: text(quote.status) ?? 'accepted',
          totalMinor: num(quote.total_minor),
          currencyCode: text(quote.currency_code),
          summary: text(quote.summary),
          validUntil: text(quote.valid_until),
        }
      : null,
    stages: rows(raw.stages).map(entry => ({
      stageId: text(entry.stage_id) ?? '',
      ordinal: num(entry.ordinal) ?? 0,
      title: text(entry.title) ?? 'Stage',
      tasks: rows(entry.tasks).map(task => ({
        id: text(task.id) ?? '',
        title: text(task.title) ?? 'Task',
        status: text(task.status) ?? 'not_started',
        ordinal: num(task.ordinal) ?? 0,
        assignee: text(task.assignee),
      })),
    })).filter(entry => entry.stageId !== ''),
    issues: rows(raw.issues).map(entry => ({
      id: text(entry.id) ?? '',
      kind: text(entry.kind) ?? 'operational',
      status: text(entry.status) ?? 'open',
      summary: text(entry.summary) ?? '',
      legalHold: bool(entry.legal_hold),
      responseDueAt: text(entry.response_due_at),
      resolution: text(entry.resolution),
      createdAt: text(entry.created_at),
      resolvedAt: text(entry.resolved_at),
    })).filter(entry => entry.id !== ''),
    changes: rows(raw.changes).map(entry => ({
      id: text(entry.id) ?? '',
      title: text(entry.title) ?? 'Change request',
      status: text(entry.status) ?? 'draft',
      changeKind: text(entry.change_kind) ?? 'scope',
      baselineTotalMinor: num(entry.baseline_total_minor),
      proposedTotalMinor: num(entry.proposed_total_minor),
      currencyCode: text(entry.currency_code),
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
    evidenceCount: num(raw.evidence_count) ?? 0,
    documentCount: num(raw.document_count) ?? 0,
    timeline: rows(raw.timeline).map(entry => ({
      action: text(entry.action) ?? 'EVENT',
      occurredAt: text(entry.occurred_at),
      actor: text(entry.actor) ?? 'Unknown',
      actorType: text(entry.actor_type) ?? 'unknown',
      resourceType: text(entry.resource_type) ?? 'request',
      resourceId: text(entry.resource_id),
      reasonCode: text(entry.reason_code),
    })),
    money: text(money.obligation_id)
      ? {
          obligationId: text(money.obligation_id) ?? '',
          status: text(money.status) ?? 'pending',
          amountMinor: num(money.amount_minor) ?? 0,
          currencyCode: text(money.currency_code) ?? 'NGN',
          createdAt: text(money.created_at),
          updatedAt: text(money.updated_at),
          quoteId: text(money.quote_id) ?? '',
          payouts: rows(money.payouts).map(entry => ({
            id: text(entry.id) ?? '',
            status: text(entry.status) ?? 'eligible',
            amountMinor: num(entry.amount_minor) ?? 0,
            currencyCode: text(entry.currency_code) ?? 'NGN',
            providerReference: text(entry.provider_reference),
          })),
          refunds: rows(money.refunds).map(entry => ({
            id: text(entry.id) ?? '',
            status: text(entry.status) ?? 'requested',
            amountMinor: num(entry.amount_minor) ?? 0,
            reason: text(entry.reason),
            createdAt: text(entry.created_at),
          })),
          ledger: {
            entryCount: num(ledger.entry_count) ?? 0,
            byAccountKind,
            lastEntryAt: text(ledger.last_entry_at),
          },
        }
      : null,
    jobs: rows(raw.jobs).map(entry => ({
      id: text(entry.id) ?? '',
      aggregateType: text(entry.aggregate_type) ?? 'request',
      aggregateId: text(entry.aggregate_id) ?? '',
      eventType: text(entry.event_type) ?? 'EVENT',
      occurredAt: text(entry.occurred_at),
      publishedAt: text(entry.published_at),
      attemptCount: num(entry.attempt_count) ?? 0,
      lastError: text(entry.last_error),
    })).filter(entry => entry.id !== ''),
    overrides: rows(raw.overrides).map(entry => ({
      id: text(entry.id) ?? '',
      commandKey: text(entry.command_key) ?? 'force_state',
      fromState: text(entry.from_state),
      toState: text(entry.to_state),
      fromDetail: text(entry.from_detail),
      toDetail: text(entry.to_detail),
      reasonCode: text(entry.reason_code) ?? 'unknown',
      note: text(entry.note) ?? '',
      evidenceReference: text(entry.evidence_reference) ?? '',
      result: text(entry.result) ?? 'applied',
      executedAt: text(entry.executed_at),
      executedBy: text(entry.executed_by) ?? 'An operator',
      targetId: text(entry.target_id),
    })).filter(entry => entry.id !== ''),
    legalTransitions,
  };
}
