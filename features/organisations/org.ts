import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The organisation workspace's reads.
 *
 * ⚠️ MEMBERSHIP IS DECIDED IN SQL. `get_organisation_command` checks the member row and returns `{allowed:false}`
 * for anybody else, including a signed-in account with no relationship to the entity — so a page learns nothing from
 * a guessed id. Budgets and obligations are not readable through RLS by a member who did not commission a job, which
 * is why this is a definer read rather than a widened policy on a financial table.
 */

export type OrgRole = 'admin' | 'member' | 'platform';

export type OrgProject = {
  requestId: string;
  title: string;
  state: string;
  urgency: string;
  createdAt: string | null;
  completedAt: string | null;
  locationName: string | null;
  serviceName: string | null;
  ownerAccountId: string | null;
  ownerName: string | null;
  assignmentId: string | null;
  assignmentStatus: string | null;
  scheduledEnd: string | null;
  obligationStatus: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  budgetCommittedMinor: number | null;
  providerId: string | null;
  providerName: string | null;
  blocked: boolean;
  openCase: boolean;
  needsOrgApproval: boolean;
  sla: 'complete' | 'blocked' | 'late' | 'no_window' | 'on_track';
  nextAction: string;
};

export type Organisation = {
  role: OrgRole;
  entity: {
    id: string;
    displayName: string;
    legalName: string | null;
    organisationType: string;
    currencyCode: string | null;
    timezone: string | null;
    subscriptionPlan: string;
    status: string;
    primaryContactName: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    marketName: string | null;
    policies: Record<string, unknown>;
  };
  locations: { id: string; locationId: string; name: string; kind: string; label: string | null; isPrimary: boolean }[];
  members: { accountId: string; name: string; role: string; joinedAt: string | null }[];
  budgets: {
    id: string;
    locationId: string | null;
    locationName: string | null;
    periodStart: string;
    periodEnd: string;
    currencyCode: string;
    committedMinor: number;
    actualMinor: number;
  }[];
  projects: OrgProject[];
  approvals: { requestId: string; title: string; kind: string; amountMinor: number | null; currencyCode: string | null; state: string; providerName: string | null }[];
  exceptions: { kind: string; severity: string; label: string; detail: string | null; locationName: string | null }[];
  providers: { providerId: string; name: string; jobs: number; completed: number; onTime: number; late: number }[];
  totals: { projects: number; active: number; completed: number; preWork: number; committedFundedMinor: number; approvals: number; exceptions: number };
};

export type OrganisationRead = { organisation: Organisation | null; denied: boolean; unavailable: boolean };

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

/** The organisation's own projects and the ones awaiting its decision, from one read per request. */
export const getOrganisation = cache(async (organisationId: string): Promise<OrganisationRead> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_organisation_command', { p_organisation_id: organisationId });
  if (error) return { organisation: null, denied: false, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { organisation: null, denied: true, unavailable: false };

  const entity = obj(raw.organisation);
  const totals = obj(raw.totals);
  const role = raw.role === 'admin' || raw.role === 'platform' ? raw.role : 'member';

  return {
    denied: false,
    unavailable: false,
    organisation: {
      role,
      entity: {
        id: text(entity.id) ?? organisationId,
        displayName: text(entity.display_name) ?? 'Organisation',
        legalName: text(entity.legal_name),
        organisationType: text(entity.organisation_type) ?? 'business_customer',
        currencyCode: text(entity.currency_code),
        timezone: text(entity.timezone),
        subscriptionPlan: text(entity.subscription_plan) ?? 'standard',
        status: text(entity.status) ?? 'active',
        primaryContactName: text(entity.primary_contact_name),
        primaryContactEmail: text(entity.primary_contact_email),
        primaryContactPhone: text(entity.primary_contact_phone),
        marketName: text(entity.market_name),
        policies: obj(entity.policies),
      },
      locations: rows(raw.locations).map(entry => ({
        id: text(entry.id) ?? '',
        locationId: text(entry.location_id) ?? '',
        name: text(entry.name) ?? 'Location',
        kind: text(entry.kind) ?? 'site',
        label: text(entry.label),
        isPrimary: bool(entry.is_primary),
      })).filter(entry => entry.id !== ''),
      members: rows(raw.members).map(entry => ({
        accountId: text(entry.account_id) ?? '',
        name: text(entry.name) ?? 'A member',
        role: text(entry.role) ?? 'member',
        joinedAt: text(entry.joined_at),
      })).filter(entry => entry.accountId !== ''),
      budgets: rows(raw.budgets).map(entry => ({
        id: text(entry.id) ?? '',
        locationId: text(entry.location_id),
        locationName: text(entry.location_name),
        periodStart: text(entry.period_start) ?? '',
        periodEnd: text(entry.period_end) ?? '',
        currencyCode: text(entry.currency_code) ?? 'NGN',
        committedMinor: num(entry.committed_minor) ?? 0,
        actualMinor: num(entry.actual_minor) ?? 0,
      })).filter(entry => entry.id !== ''),
      projects: rows(raw.projects).map(entry => ({
        requestId: text(entry.request_id) ?? '',
        title: text(entry.title) ?? 'Organisation request',
        state: text(entry.state) ?? 'submitted',
        urgency: text(entry.urgency) ?? 'normal',
        createdAt: text(entry.created_at),
        completedAt: text(entry.completed_at),
        locationName: text(entry.location_name),
        serviceName: text(entry.service_name),
        ownerAccountId: text(entry.owner_account_id),
        ownerName: text(entry.owner_name),
        assignmentId: text(entry.assignment_id),
        assignmentStatus: text(entry.assignment_status),
        scheduledEnd: text(entry.scheduled_end),
        obligationStatus: text(entry.obligation_status),
        amountMinor: num(entry.amount_minor),
        currencyCode: text(entry.currency_code),
        budgetCommittedMinor: num(entry.budget_committed_minor),
        providerId: text(entry.provider_id),
        providerName: text(entry.provider_name),
        blocked: bool(entry.blocked),
        openCase: bool(entry.open_case),
        needsOrgApproval: bool(entry.needs_org_approval),
        sla:
          entry.sla === 'complete'
            ? ('complete' as const)
            : entry.sla === 'blocked'
              ? ('blocked' as const)
              : entry.sla === 'late'
                ? ('late' as const)
                : entry.sla === 'no_window'
                  ? ('no_window' as const)
                  : ('on_track' as const),
        nextAction: text(entry.next_action) ?? 'none',
      })).filter(entry => entry.requestId !== ''),
      approvals: rows(raw.approvals).map(entry => ({
        requestId: text(entry.request_id) ?? '',
        title: text(entry.title) ?? 'Organisation request',
        kind: text(entry.kind) ?? 'quote',
        amountMinor: num(entry.amount_minor),
        currencyCode: text(entry.currency_code),
        state: text(entry.state) ?? 'quoted',
        providerName: text(entry.provider_name),
      })).filter(entry => entry.requestId !== ''),
      exceptions: rows(raw.exceptions).map(entry => ({
        kind: text(entry.kind) ?? 'exception',
        severity: text(entry.severity) ?? 'medium',
        label: text(entry.label) ?? 'Something needs attention',
        detail: text(entry.detail),
        locationName: text(entry.location_name),
      })),
      providers: rows(raw.providers).map(entry => ({
        providerId: text(entry.provider_id) ?? '',
        name: text(entry.name) ?? 'Provider',
        jobs: num(entry.jobs) ?? 0,
        completed: num(entry.completed) ?? 0,
        onTime: num(entry.on_time) ?? 0,
        late: num(entry.late) ?? 0,
      })).filter(entry => entry.providerId !== ''),
      totals: {
        projects: num(totals.projects) ?? 0,
        active: num(totals.active) ?? 0,
        completed: num(totals.completed) ?? 0,
        preWork: num(totals.pre_work) ?? 0,
        committedFundedMinor: num(totals.committed_funded_minor) ?? 0,
        approvals: num(totals.approvals) ?? 0,
        exceptions: num(totals.exceptions) ?? 0,
      },
    },
  };
});

/** The organisation the signed-in account belongs to, for the switcher and the index redirect. */
export async function getMyOrganisations(): Promise<{ id: string; displayName: string; role: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle();
  if (!account) return [];
  const { data } = await supabase
    .from('organisation_members')
    .select('role, organisations(id, display_name)')
    .eq('account_id', account.id)
    .is('removed_at', null);
  return (data ?? [])
    .map(row => {
      const organisation = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
      const entity = (organisation ?? null) as { id?: string; display_name?: string } | null;
      if (!entity?.id) return null;
      return { id: entity.id, displayName: entity.display_name ?? 'Organisation', role: String(row.role) };
    })
    .filter((entry): entry is { id: string; displayName: string; role: string } => entry !== null);
}

/**
 * ⚠️ RE-EXPORTED FROM THE SHARED MODULE rather than defined here. The admin project console lists the same
 * states, and two literal maps would drift the first time a state is added. The name stays `ORG_STATE_COPY`
 * so every existing import keeps working.
 */
export { REQUEST_STATE_COPY as ORG_STATE_COPY } from '@/features/requests/state-copy';

export const SLA_COPY: Record<OrgProject['sla'], { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  complete: { label: 'Complete', tone: 'teal' },
  on_track: { label: 'On track', tone: 'teal' },
  no_window: { label: 'No date agreed', tone: 'slate' },
  late: { label: 'Past its date', tone: 'amber' },
  blocked: { label: 'Blocked', tone: 'amber' },
};

export const NEXT_ACTION_COPY: Record<string, string> = {
  organisation_decision: 'Your organisation decides',
  provider_schedule: 'The provider sets a time',
  confirm_or_start: 'Time agreed — waiting on the provider',
  provider_evidence: 'Waiting on completion evidence',
  none: 'Nothing needed',
};
