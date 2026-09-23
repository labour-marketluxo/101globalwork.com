import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The organisation directory: members, invitations, sites and preferred providers.
 *
 * ⚠️ LEAST PRIVILEGE IS THE COMMANDS' JOB, AND THE READ ONLY REPORTS. Every member row carries the role and the site
 * scope the platform will enforce; the pages render controls only where an owner or administrator would be allowed,
 * and the command refuses everybody else. Hiding a button is a courtesy, never the control.
 *
 * ⚠️ A PREFERRED PROVIDER'S VERIFICATION IS READ LIVE, BESIDE WHAT IT WAS WHEN CHOSEN. `verification_at_add` is the
 * platform's snapshot from the moment the preference was saved; the live badge is today's state. A provider whose
 * credential expired since then shows as unverified now and verified then — which is the whole reason both are shown.
 */

export type OrgMember = {
  accountId: string;
  name: string;
  role: string;
  status: string;
  scopeLocationIds: string[];
  scopeNames: string[];
  scopeNote: string | null;
  joinedAt: string | null;
  suspendedAt: string | null;
  lastActivityAt: string | null;
};

export type OrgInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  scopeLocationIds: string[];
  expiresAt: string | null;
  createdAt: string | null;
  invitedByName: string;
};

export type OrgLocation = {
  id: string;
  locationId: string;
  name: string;
  areaName: string;
  kind: string;
  isPrimary: boolean;
  archived: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  timezone: string | null;
  siteManagerName: string | null;
  siteManagerPhone: string | null;
  accessNotes: string | null;
  safetyNotes: string | null;
  activeProjects: number;
  totalProjects: number;
};

export type PreferredProvider = {
  id: string;
  providerId: string;
  name: string;
  status: string;
  contractReference: string | null;
  note: string | null;
  addedAt: string | null;
  identityVerified: boolean;
  verifiedCredentials: number;
  providerStatus: string;
  readinessScore: number | null;
  services: string[];
  areas: string[];
  jobsForUs: number;
  verificationAtAdd: Record<string, unknown>;
};

export type OrgDirectory = {
  role: string | null;
  members: OrgMember[];
  invitations: OrgInvitation[];
  locations: OrgLocation[];
  providers: PreferredProvider[];
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
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const ORG_ROLE_COPY: Record<string, string> = {
  owner: 'Owner',
  admin: 'Organisation admin',
  project_manager: 'Site manager',
  finance_approver: 'Approver',
  provider_team_member: 'Procurement officer',
  member: 'Member',
};

export const ORG_ROLE_OPTIONS = Object.keys(ORG_ROLE_COPY);

export const PREFERENCE_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  preferred: { label: 'Preferred', tone: 'teal' },
  contract: { label: 'Under contract', tone: 'teal' },
  watch: { label: 'Watch list', tone: 'amber' },
};

export async function getOrganisationDirectory(organisationId: string): Promise<OrgDirectory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_organisation_directory_command', { p_organisation_id: organisationId });
  const empty: OrgDirectory = { role: null, members: [], invitations: [], locations: [], providers: [], denied: false, unavailable: false };
  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { ...empty, denied: true };

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    members: rows(raw.members).map(entry => ({
      accountId: text(entry.account_id) ?? '',
      name: text(entry.name) ?? 'A member',
      role: text(entry.role) ?? 'member',
      status: text(entry.status) ?? 'active',
      scopeLocationIds: strings(entry.scope_location_ids),
      scopeNames: strings(entry.scope_names),
      scopeNote: text(entry.scope_note),
      joinedAt: text(entry.joined_at),
      suspendedAt: text(entry.suspended_at),
      lastActivityAt: text(entry.last_activity_at),
    })).filter(entry => entry.accountId !== ''),
    invitations: rows(raw.invitations).map(entry => ({
      id: text(entry.id) ?? '',
      email: text(entry.email) ?? '',
      role: text(entry.role) ?? 'member',
      status: text(entry.status) ?? 'pending',
      scopeLocationIds: strings(entry.scope_location_ids),
      expiresAt: text(entry.expires_at),
      createdAt: text(entry.created_at),
      invitedByName: text(entry.invited_by_name) ?? 'A member',
    })).filter(entry => entry.id !== ''),
    locations: rows(raw.locations).map(entry => ({
      id: text(entry.id) ?? '',
      locationId: text(entry.location_id) ?? '',
      name: text(entry.name) ?? 'Site',
      areaName: text(entry.area_name) ?? '',
      kind: text(entry.kind) ?? 'site',
      isPrimary: bool(entry.is_primary),
      archived: bool(entry.archived),
      addressLine1: text(entry.address_line1),
      addressLine2: text(entry.address_line2),
      locality: text(entry.locality),
      region: text(entry.region),
      postalCode: text(entry.postal_code),
      countryCode: text(entry.country_code),
      timezone: text(entry.timezone),
      siteManagerName: text(entry.site_manager_name),
      siteManagerPhone: text(entry.site_manager_phone),
      accessNotes: text(entry.access_notes),
      safetyNotes: text(entry.safety_notes),
      activeProjects: num(entry.active_projects) ?? 0,
      totalProjects: num(entry.total_projects) ?? 0,
    })).filter(entry => entry.id !== ''),
    providers: rows(raw.providers).map(entry => ({
      id: text(entry.id) ?? '',
      providerId: text(entry.provider_id) ?? '',
      name: text(entry.name) ?? 'Provider',
      status: text(entry.status) ?? 'preferred',
      contractReference: text(entry.contract_reference),
      note: text(entry.note),
      addedAt: text(entry.added_at),
      identityVerified: bool(entry.identity_verified),
      verifiedCredentials: num(entry.verified_credentials) ?? 0,
      providerStatus: text(entry.provider_status) ?? 'draft',
      readinessScore: num(entry.readiness_score),
      services: strings(entry.services),
      areas: strings(entry.areas),
      jobsForUs: num(entry.jobs_for_us) ?? 0,
      verificationAtAdd: obj(entry.verification_at_add),
    })).filter(entry => entry.id !== ''),
  };
}

/** A copyable invitation link. The platform sends no email of its own, so the inviter passes this on. */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/org/join/${token}`;
}
