import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The accounts directory and one account in depth.
 *
 * ⚠️ CONTACT VALUES ARRIVE MASKED AND THAT IS NOT A PRESENTATION CHOICE. `admin_account_directory_command`
 * and `admin_account_detail_command` build the mask in SQL and never select the raw column, so nothing
 * in this file can leak an address by rendering it. The one raw read is
 * `reveal_admin_account_contact_command`, which writes an audit row first — see
 * features/admin/actions.ts.
 *
 * ⚠️ SESSION IDS ARE NOT IN THE DETAIL PAYLOAD. The database returns an eight-character `session_ref` and
 * a masked network address; an operator matching devices does not need either in full, and a page that
 * holds them is a page that can lose them.
 */

export type AccountRole = { key: string; name: string; status: string };
export type AccountOrganisation = { organisationId: string; name: string; role: string; status: string; joinedAt: string | null };
export type VerificationSummary = { pending: number; verified: number; other: number };

export type AccountDirectoryItem = {
  accountId: string;
  displayName: string;
  contactMasked: string | null;
  contactKind: 'email' | 'phone' | 'none';
  contactConfirmed: boolean;
  lastSignInAt: string | null;
  accountStatus: string;
  createdAt: string | null;
  providerCount: number;
  requestCount: number;
  adminRoles: AccountRole[];
  organisations: AccountOrganisation[];
  verification: VerificationSummary;
};

export type AccountDirectory = {
  allowed: boolean;
  accounts: AccountDirectoryItem[];
  unavailable: boolean;
};

export type AccountSession = {
  sessionRef: string;
  createdAt: string | null;
  updatedAt: string | null;
  refreshedAt: string | null;
  aal: string | null;
  ipMasked: string | null;
  userAgent: string | null;
};

export type AccountProvider = {
  id: string;
  displayName: string;
  status: string;
  isPublic: boolean;
  readinessScore: number | null;
  readiness: string | null;
  setupPercent: number | null;
  nextAction: string | null;
  restriction: { id: string; kind: string; reasonCode: string; appliedAt: string | null; note: string | null } | null;
};

export type AccountVerification = {
  id: string;
  providerId: string;
  providerName: string;
  kind: string;
  status: string;
  jurisdictionCode: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type AccountRequest = { id: string; needText: string; state: string; createdAt: string | null };

export type AccountDetail = {
  allowed: boolean;
  found: boolean;
  unavailable: boolean;
  accountId: string;
  displayName: string;
  contactMasked: string | null;
  contactKind: 'email' | 'phone' | 'none';
  hasEmail: boolean;
  hasPhone: boolean;
  contactConfirmed: boolean;
  confirmations: { kind: string; valueMasked: string | null; confirmedAt: string | null }[];
  lastSignInAt: string | null;
  accountStatus: string;
  createdAt: string | null;
  isPlatformOwner: boolean;
  isSelf: boolean;
  adminRoles: (AccountRole & { grantedAt: string | null; revokedAt: string | null })[];
  organisations: AccountOrganisation[];
  providers: AccountProvider[];
  sessions: AccountSession[];
  verifications: AccountVerification[];
  requests: AccountRequest[];
  organisationCount: number;
  openCaseCount: number;
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

const contactKind = (value: unknown): 'email' | 'phone' | 'none' =>
  value === 'email' || value === 'phone' ? value : 'none';

function roleRows(value: unknown): AccountRole[] {
  return rows(value).map(entry => ({
    key: text(entry.key) ?? '',
    name: text(entry.name) ?? 'Administrator',
    status: text(entry.status) ?? 'unknown',
  })).filter(entry => entry.key !== '');
}

function organisationRows(value: unknown): AccountOrganisation[] {
  return rows(value).map(entry => ({
    organisationId: text(entry.organisation_id) ?? '',
    name: text(entry.name) ?? 'Organisation',
    role: text(entry.role) ?? 'member',
    status: text(entry.status) ?? 'active',
    joinedAt: text(entry.joined_at),
  })).filter(entry => entry.organisationId !== '');
}

function verificationSummary(value: unknown): VerificationSummary {
  const raw = obj(value);
  return { pending: num(raw.pending) ?? 0, verified: num(raw.verified) ?? 0, other: num(raw.other) ?? 0 };
}

export async function getAccountDirectory(filters: {
  search?: string;
  standing?: string;
}): Promise<AccountDirectory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_account_directory_command', {
    p_search: filters.search ?? null,
    p_standing: filters.standing || null,
    p_limit: 100,
  });
  if (error) return { allowed: false, accounts: [], unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, accounts: [], unavailable: false };

  return {
    allowed: true,
    unavailable: false,
    accounts: rows(raw.accounts).map(entry => ({
      accountId: text(entry.account_id) ?? '',
      displayName: text(entry.display_name) ?? 'Profile not completed',
      contactMasked: text(entry.contact_masked),
      contactKind: contactKind(entry.contact_kind),
      contactConfirmed: bool(entry.contact_confirmed),
      lastSignInAt: text(entry.last_sign_in_at),
      accountStatus: text(entry.account_status) ?? 'active',
      createdAt: text(entry.created_at),
      providerCount: num(entry.provider_count) ?? 0,
      requestCount: num(entry.request_count) ?? 0,
      adminRoles: roleRows(entry.admin_roles),
      organisations: organisationRows(entry.organisations),
      verification: verificationSummary(entry.verification_summary),
    })).filter(entry => entry.accountId !== ''),
  };
}

const missingDetail = (accountId: string): AccountDetail => ({
  allowed: true,
  found: false,
  unavailable: false,
  accountId,
  displayName: 'Account',
  contactMasked: null,
  contactKind: 'none',
  hasEmail: false,
  hasPhone: false,
  contactConfirmed: false,
  confirmations: [],
  lastSignInAt: null,
  accountStatus: 'unknown',
  createdAt: null,
  isPlatformOwner: false,
  isSelf: false,
  adminRoles: [],
  organisations: [],
  providers: [],
  sessions: [],
  verifications: [],
  requests: [],
  organisationCount: 0,
  openCaseCount: 0,
});

export async function getAccountDetail(accountId: string): Promise<AccountDetail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_account_detail_command', { p_account_id: accountId });
  if (error) return { ...missingDetail(accountId), allowed: false, unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return { ...missingDetail(accountId), allowed: false };
  if (raw.found !== true) return missingDetail(accountId);

  const account = obj(raw.account);

  return {
    allowed: true,
    found: true,
    unavailable: false,
    accountId: text(account.account_id) ?? accountId,
    displayName: text(account.display_name) ?? 'Profile not completed',
    contactMasked: text(account.contact_masked),
    contactKind: contactKind(account.contact_kind),
    hasEmail: bool(account.has_email),
    hasPhone: bool(account.has_phone),
    contactConfirmed: bool(account.contact_confirmed),
    confirmations: rows(account.confirmations).map(entry => ({
      kind: text(entry.kind) ?? 'email',
      valueMasked: text(entry.value_masked),
      confirmedAt: text(entry.confirmed_at),
    })),
    lastSignInAt: text(account.last_sign_in_at),
    accountStatus: text(account.account_status) ?? 'active',
    createdAt: text(account.created_at),
    isPlatformOwner: bool(account.is_platform_owner),
    isSelf: bool(account.is_self),
    adminRoles: rows(raw.admin_roles).map(entry => ({
      key: text(entry.key) ?? '',
      name: text(entry.name) ?? 'Administrator',
      status: text(entry.status) ?? 'unknown',
      grantedAt: text(entry.granted_at),
      revokedAt: text(entry.revoked_at),
    })).filter(entry => entry.key !== ''),
    organisations: organisationRows(raw.organisations),
    providers: rows(raw.providers).map(entry => {
      const restriction = obj(entry.active_restriction);
      return {
        id: text(entry.id) ?? '',
        displayName: text(entry.display_name) ?? 'Provider',
        status: text(entry.status) ?? 'draft',
        isPublic: bool(entry.is_public),
        readinessScore: num(entry.readiness_score),
        readiness: text(entry.readiness),
        setupPercent: num(entry.setup_percent),
        nextAction: text(entry.next_action),
        restriction: text(restriction.id)
          ? {
              id: String(restriction.id),
              kind: text(restriction.kind) ?? 'suspended',
              reasonCode: text(restriction.reason_code) ?? 'unknown',
              appliedAt: text(restriction.applied_at),
              note: text(restriction.note),
            }
          : null,
      };
    }).filter(entry => entry.id !== ''),
    sessions: rows(raw.sessions).map(entry => ({
      sessionRef: text(entry.session_ref) ?? '',
      createdAt: text(entry.created_at),
      updatedAt: text(entry.updated_at),
      refreshedAt: text(entry.refreshed_at),
      aal: text(entry.aal),
      ipMasked: text(entry.ip_masked),
      userAgent: text(entry.user_agent),
    })).filter(entry => entry.sessionRef !== ''),
    verifications: rows(raw.verifications).map(entry => ({
      id: text(entry.id) ?? '',
      providerId: text(entry.provider_id) ?? '',
      providerName: text(entry.provider_name) ?? 'Provider',
      kind: text(entry.kind) ?? 'identity',
      status: text(entry.status) ?? 'pending',
      jurisdictionCode: text(entry.jurisdiction_code),
      createdAt: text(entry.created_at),
      reviewedAt: text(entry.reviewed_at),
      reviewNote: text(entry.review_note),
    })).filter(entry => entry.id !== ''),
    requests: rows(raw.requests).map(entry => ({
      id: text(entry.id) ?? '',
      needText: text(entry.need_text) ?? 'Request',
      state: text(entry.state) ?? 'submitted',
      createdAt: text(entry.created_at),
    })).filter(entry => entry.id !== ''),
    organisationCount: num(raw.organisations_count) ?? 0,
    openCaseCount: num(raw.open_case_count) ?? 0,
  };
}
