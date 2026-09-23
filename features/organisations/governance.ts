import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Approvals, cost centres and analytics.
 *
 * ⚠️ EVERY MONEY FIGURE IS ANCHORED. An allocation is the only typed number; committed spend is funded obligations on
 * the projects linked to a cost centre, paid is what the ledger sent, and variance is computed from those. Nothing on
 * these pages is a percentage of a number the platform cannot point at.
 *
 * ⚠️ REPORT GROUPS BELOW THREE ROWS ARE SUPPRESSED IN SQL, with the count of withheld groups returned so an empty
 * chart is explained. These readers never un-suppress anything.
 */

export type ApprovalItem = {
  requestId: string;
  title: string;
  state: string;
  kind: 'quote' | 'completion';
  amountMinor: number | null;
  currencyCode: string | null;
  locationName: string | null;
  requesterName: string;
  ownerName: string | null;
  providerName: string | null;
  evidenceCount: number;
  ageDays: number;
  thresholdMinor: number;
  requiresSeniorRole: boolean;
};

export type ApprovalDecision = {
  id: string;
  requestId: string;
  title: string;
  kind: string;
  decision: string;
  amountMinor: number | null;
  currencyCode: string | null;
  thresholdMinor: number | null;
  note: string | null;
  delegateName: string | null;
  decidedByName: string;
  decidedAt: string | null;
};

export type ApprovalsRead = {
  role: string | null;
  myRole: string | null;
  thresholdMinor: number;
  items: ApprovalItem[];
  history: ApprovalDecision[];
  members: { accountId: string; name: string; role: string }[];
  denied: boolean;
  unavailable: boolean;
};

export type CostCentre = {
  id: string;
  name: string;
  code: string;
  currencyCode: string;
  allocatedMinor: number;
  locationName: string | null;
  committedMinor: number;
  paidMinor: number;
  varianceMinor: number;
  variancePercent: number | null;
  projectCount: number;
  activeProjectCount: number;
};

export type CostCentreTransaction = {
  requestId: string;
  reference: string;
  title: string;
  costCentre: string | null;
  state: string;
  obligationStatus: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  payoutStatus: string | null;
  paidMinor: number | null;
  at: string | null;
};

export type BudgetsRead = {
  role: string | null;
  centres: CostCentre[];
  periods: { id: string; locationName: string | null; periodStart: string; periodEnd: string; currencyCode: string; committedMinor: number; actualMinor: number; remainingMinor: number }[];
  transactions: CostCentreTransaction[];
  projects: { requestId: string; title: string }[];
  denied: boolean;
  unavailable: boolean;
};

export type ReportsRead = {
  role: string | null;
  generatedAt: string | null;
  dataAsOf: string | null;
  threshold: number;
  suppressedGroups: number;
  completion: { projects: number; completed: number; endedBadly: number; avgDays: number };
  sla: { onTime: number; late: number; currentlyOverdue: number; noDate: number };
  spendBySite: { label: string; projects: number; fundedMinor: number; paidMinor: number }[];
  spendByService: { label: string; projects: number; fundedMinor: number; paidMinor: number }[];
  reliability: { providerId: string; name: string; jobs: number; completed: number; onTime: number; late: number; disputed: number }[];
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

export const DECISION_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  approved: { label: 'Approved', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'amber' },
  information_requested: { label: 'Information requested', tone: 'amber' },
  delegated: { label: 'Delegated', tone: 'slate' },
};

export async function getApprovals(organisationId: string): Promise<ApprovalsRead> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: members }] = await Promise.all([
    supabase.rpc('get_organisation_approvals_command', { p_organisation_id: organisationId }),
    supabase
      .from('organisation_members')
      .select('account_id, role, status, profiles(display_name)')
      .eq('organisation_id', organisationId)
      .eq('status', 'active')
      .is('removed_at', null),
  ]);
  const empty: ApprovalsRead = { role: null, myRole: null, thresholdMinor: 0, items: [], history: [], members: [], denied: false, unavailable: false };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };

  return {
    role: text(raw.role),
    myRole: text(raw.my_role),
    thresholdMinor: num(raw.threshold_minor) ?? 0,
    denied: false,
    unavailable: false,
    items: rows(raw.items).map(entry => ({
      requestId: text(entry.request_id) ?? '',
      title: text(entry.title) ?? 'Organisation request',
      state: text(entry.state) ?? 'quoted',
      kind: entry.kind === 'completion' ? ('completion' as const) : ('quote' as const),
      amountMinor: num(entry.amount_minor),
      currencyCode: text(entry.currency_code),
      locationName: text(entry.location_name),
      requesterName: text(entry.requester_name) ?? 'A member',
      ownerName: text(entry.owner_name),
      providerName: text(entry.provider_name),
      evidenceCount: num(entry.evidence_count) ?? 0,
      ageDays: num(entry.age_days) ?? 0,
      thresholdMinor: num(entry.threshold_minor) ?? 0,
      requiresSeniorRole: bool(entry.requires_senior_role),
    })).filter(entry => entry.requestId !== ''),
    history: rows(raw.history).map(entry => ({
      id: text(entry.id) ?? '',
      requestId: text(entry.request_id) ?? '',
      title: text(entry.title) ?? 'Organisation request',
      kind: text(entry.kind) ?? 'quote',
      decision: text(entry.decision) ?? 'approved',
      amountMinor: num(entry.amount_minor),
      currencyCode: text(entry.currency_code),
      thresholdMinor: num(entry.threshold_minor),
      note: text(entry.note),
      delegateName: text(entry.delegate_name),
      decidedByName: text(entry.decided_by_name) ?? 'A member',
      decidedAt: text(entry.decided_at),
    })).filter(entry => entry.id !== ''),
    members: (members ?? []).map(row => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        accountId: row.account_id,
        name: (profile as { display_name?: string } | null)?.display_name ?? 'A member',
        role: String(row.role),
      };
    }),
  };
}

export async function getBudgets(organisationId: string): Promise<BudgetsRead> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: projects }] = await Promise.all([
    supabase.rpc('get_organisation_budgets_command', { p_organisation_id: organisationId }),
    supabase.from('requests').select('id, need_text').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(200),
  ]);
  const empty: BudgetsRead = { role: null, centres: [], periods: [], transactions: [], projects: [], denied: false, unavailable: false };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    centres: rows(raw.centres).map(entry => ({
      id: text(entry.id) ?? '',
      name: text(entry.name) ?? 'Cost centre',
      code: text(entry.code) ?? '',
      currencyCode: text(entry.currency_code) ?? 'NGN',
      allocatedMinor: num(entry.allocated_minor) ?? 0,
      locationName: text(entry.location_name),
      committedMinor: num(entry.committed_minor) ?? 0,
      paidMinor: num(entry.paid_minor) ?? 0,
      varianceMinor: num(entry.variance_minor) ?? 0,
      variancePercent: num(entry.variance_percent),
      projectCount: num(entry.project_count) ?? 0,
      activeProjectCount: num(entry.active_project_count) ?? 0,
    })).filter(entry => entry.id !== ''),
    periods: rows(raw.periods).map(entry => ({
      id: text(entry.id) ?? '',
      locationName: text(entry.location_name),
      periodStart: text(entry.period_start) ?? '',
      periodEnd: text(entry.period_end) ?? '',
      currencyCode: text(entry.currency_code) ?? 'NGN',
      committedMinor: num(entry.committed_minor) ?? 0,
      actualMinor: num(entry.actual_minor) ?? 0,
      remainingMinor: num(entry.remaining_minor) ?? 0,
    })).filter(entry => entry.id !== ''),
    transactions: rows(raw.transactions).map(entry => ({
      requestId: text(entry.request_id) ?? '',
      reference: text(entry.reference) ?? '',
      title: text(entry.title) ?? 'Organisation request',
      costCentre: text(entry.cost_centre),
      state: text(entry.state) ?? 'submitted',
      obligationStatus: text(entry.obligation_status),
      amountMinor: num(entry.amount_minor),
      currencyCode: text(entry.currency_code),
      payoutStatus: text(entry.payout_status),
      paidMinor: num(entry.paid_minor),
      at: text(entry.at),
    })).filter(entry => entry.requestId !== ''),
    projects: (projects ?? []).map(row => ({ requestId: row.id, title: String(row.need_text ?? 'Request') })),
  };
}

export async function getReports(
  organisationId: string,
  filters: { from?: string; to?: string; locationId?: string; serviceId?: string },
): Promise<ReportsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_organisation_reports_command', {
    p_organisation_id: organisationId,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_location_id: filters.locationId || null,
    p_service_entity_id: filters.serviceId || null,
  });
  const empty: ReportsRead = {
    role: null,
    generatedAt: null,
    dataAsOf: null,
    threshold: 3,
    suppressedGroups: 0,
    completion: { projects: 0, completed: 0, endedBadly: 0, avgDays: 0 },
    sla: { onTime: 0, late: 0, currentlyOverdue: 0, noDate: 0 },
    spendBySite: [],
    spendByService: [],
    reliability: [],
    denied: false,
    unavailable: false,
  };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };
  const completion = obj(raw.completion);
  const sla = obj(raw.sla);
  const spendRows = (value: unknown) =>
    rows(value).map(entry => ({
      label: text(entry.label) ?? 'Unknown',
      projects: num(entry.projects) ?? 0,
      fundedMinor: num(entry.funded_minor) ?? 0,
      paidMinor: num(entry.paid_minor) ?? 0,
    })).filter(entry => entry.projects > 0);

  return {
    role: text(raw.role),
    generatedAt: text(raw.generated_at),
    dataAsOf: text(raw.data_as_of),
    threshold: num(raw.aggregation_threshold) ?? 3,
    suppressedGroups: num(raw.suppressed_groups) ?? 0,
    denied: false,
    unavailable: false,
    completion: {
      projects: num(completion.projects) ?? 0,
      completed: num(completion.completed) ?? 0,
      endedBadly: num(completion.ended_badly) ?? 0,
      avgDays: num(completion.avg_days) ?? 0,
    },
    sla: {
      onTime: num(sla.on_time) ?? 0,
      late: num(sla.late) ?? 0,
      currentlyOverdue: num(sla.currently_overdue) ?? 0,
      noDate: num(sla.no_date) ?? 0,
    },
    spendBySite: spendRows(raw.spend_by_site),
    spendByService: spendRows(raw.spend_by_service),
    reliability: rows(raw.provider_reliability).map(entry => ({
      providerId: text(entry.provider_id) ?? '',
      name: text(entry.name) ?? 'Provider',
      jobs: num(entry.jobs) ?? 0,
      completed: num(entry.completed) ?? 0,
      onTime: num(entry.on_time) ?? 0,
      late: num(entry.late) ?? 0,
      disputed: num(entry.disputed) ?? 0,
    })).filter(entry => entry.providerId !== ''),
  };
}
