import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The trust console's reads.
 *
 * ⚠️ EVERY SHAPE HERE IS PARSED DEFENSIVELY, LIKE THE REST OF features/admin. The RPCs build their jsonb field
 * by field, so a column that does not exist in this deployment is ABSENT rather than null; a page that
 * destructured the raw object would render "undefined" the first time a database drifted from the code.
 *
 * ⚠️ NOTHING HERE DECIDES ANYTHING. The reads describe what a reviewer is looking at — including the checks
 * that fired and the decisions already recorded — and every decision goes through a command that re-derives
 * the caller's capability, the reason code and the second factor for itself.
 */

export type TrustPolicyVersions = { verification: string; credential: string; moderation: string };

export type RiskSignal = { key: string; level: string; label: string; detail: string };

export type VerificationDecisionRecord = {
  id: string;
  decision: string;
  reasonCode: string;
  note: string;
  policyVersion: string;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedBy: string;
  assignedTo: string | null;
};

export type AuditAttempt = {
  action: string;
  occurredAt: string | null;
  actorType: string;
  actor: string;
  reasonCode: string | null;
};

export type VerificationCase = {
  allowed: boolean;
  found: boolean;
  unavailable: boolean;
  policyVersions: TrustPolicyVersions;
  verification: {
    id: string;
    providerId: string;
    kind: string;
    status: string;
    jurisdictionCode: string | null;
    referenceLabel: string | null;
    documentReference: string | null;
    documentAttachedAt: string | null;
    reviewNote: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    reviewedAt: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
  };
  provider: {
    id: string;
    displayName: string;
    status: string;
    isPublic: boolean;
    publicSlug: string | null;
    marketCode: string | null;
    marketName: string | null;
    createdAt: string | null;
  };
  owner: { accountId: string; displayName: string; contactMasked: string | null; accountStatus: string; createdAt: string | null };
  signals: RiskSignal[];
  decisions: VerificationDecisionRecord[];
  attempts: AuditAttempt[];
};

export type CredentialServiceImpact = {
  serviceEntityId: string;
  serviceName: string;
  coveredByThisCredential: boolean;
  coveredByAnotherCredential: boolean;
  providerOffersIt: boolean;
};

export type CredentialCase = {
  allowed: boolean;
  found: boolean;
  unavailable: boolean;
  policyVersions: TrustPolicyVersions;
  credential: {
    id: string;
    providerId: string;
    credentialType: string;
    issuingBody: string;
    jurisdictionCode: string | null;
    referenceLabel: string | null;
    documentReference: string | null;
    expiresAt: string | null;
    status: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  provider: {
    id: string;
    displayName: string;
    status: string;
    isPublic: boolean;
    publicSlug: string | null;
    marketCode: string | null;
    marketName: string | null;
  };
  owner: { accountId: string; displayName: string; contactMasked: string | null; accountStatus: string };
  services: CredentialServiceImpact[];
  decisions: (Omit<VerificationDecisionRecord, 'assignedTo'>)[];
};

export type CredentialQueueItem = {
  credentialId: string;
  providerId: string;
  providerName: string;
  providerStatus: string;
  credentialType: string;
  issuingBody: string;
  jurisdictionCode: string | null;
  referenceLabel: string | null;
  expiresAt: string | null;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  decisionCount: number;
  expired: boolean;
  expiringSoon: boolean;
  serviceCount: number;
};

export type TrustCase = {
  id: string;
  caseType: string;
  severity: string;
  state: string;
  summary: string;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
  slaDueAt: string | null;
  overdue: boolean;
  legalHold: boolean;
  legalHoldReason: string | null;
  legalHoldAt: string | null;
  legalHoldBy: string | null;
  resolution: string | null;
  closedAt: string | null;
  assignedAccountId: string | null;
  assignedTo: string | null;
  reporter: { accountId: string; name: string; contactMasked: string | null } | null;
  subjectAccount: { accountId: string; name: string; contactMasked: string | null; accountStatus: string } | null;
  subjectProvider: { providerId: string; name: string; status: string } | null;
  subjectRequest: { requestId: string; title: string; state: string } | null;
  evidence: { id: string; kind: string; submittedAt: string | null; assignmentId: string }[];
  events: { eventType: string; reasonCode: string | null; note: string | null; occurredAt: string | null; actor: string }[];
};

export type TrustCaseCounts = {
  open: number;
  investigating: number;
  awaitingResponse: number;
  escalated: number;
  held: number;
  overdue: number;
  unassigned: number;
  closed: number;
};

export type TrustCaseQueue = {
  allowed: boolean;
  unavailable: boolean;
  cases: TrustCase[];
  counts: TrustCaseCounts;
  reviewers: { accountId: string; name: string; role: string }[];
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return 0;
};
const bool = (value: unknown): boolean => value === true;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const emptyPolicies: TrustPolicyVersions = { verification: '', credential: '', moderation: '' };

function policies(value: unknown): TrustPolicyVersions {
  const raw = obj(value);
  return {
    verification: text(raw.verification) ?? '',
    credential: text(raw.credential) ?? '',
    moderation: text(raw.moderation) ?? '',
  };
}

function decisions(value: unknown): VerificationDecisionRecord[] {
  return rows(value).map(entry => ({
    id: text(entry.id) ?? '',
    decision: text(entry.decision) ?? 'rejected',
    reasonCode: text(entry.reason_code) ?? 'unknown',
    note: text(entry.note) ?? '',
    policyVersion: text(entry.policy_version) ?? '',
    expiresAt: text(entry.expires_at),
    decidedAt: text(entry.decided_at),
    decidedBy: text(entry.decided_by) ?? 'An operator',
    assignedTo: text(entry.assigned_to),
  })).filter(entry => entry.id !== '');
}

export async function getVerificationCase(verificationId: string): Promise<VerificationCase> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_verification_case_command', { p_verification_id: verificationId });

  const empty: VerificationCase = {
    allowed: false,
    found: false,
    unavailable: false,
    policyVersions: emptyPolicies,
    verification: {
      id: verificationId, providerId: '', kind: 'identity', status: 'pending', jurisdictionCode: null,
      referenceLabel: null, documentReference: null, documentAttachedAt: null, reviewNote: null,
      createdAt: null, updatedAt: null, reviewedAt: null, verifiedAt: null, expiresAt: null,
    },
    provider: { id: '', displayName: 'Provider', status: 'draft', isPublic: false, publicSlug: null, marketCode: null, marketName: null, createdAt: null },
    owner: { accountId: '', displayName: 'Account holder', contactMasked: null, accountStatus: 'active', createdAt: null },
    signals: [],
    decisions: [],
    attempts: [],
  };

  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return empty;
  if (raw.found !== true) return { ...empty, allowed: true, found: false };

  const v = obj(raw.verification);
  const p = obj(raw.provider);
  const o = obj(raw.owner);

  return {
    allowed: true,
    found: true,
    unavailable: false,
    policyVersions: policies(raw.policy_versions),
    verification: {
      id: text(v.id) ?? verificationId,
      providerId: text(v.provider_id) ?? '',
      kind: text(v.kind) ?? 'identity',
      status: text(v.status) ?? 'pending',
      jurisdictionCode: text(v.jurisdiction_code),
      referenceLabel: text(v.reference_label),
      documentReference: text(v.document_reference),
      documentAttachedAt: text(v.document_attached_at),
      reviewNote: text(v.review_note),
      createdAt: text(v.created_at),
      updatedAt: text(v.updated_at),
      reviewedAt: text(v.reviewed_at),
      verifiedAt: text(v.verified_at),
      expiresAt: text(v.expires_at),
    },
    provider: {
      id: text(p.id) ?? '',
      displayName: text(p.display_name) ?? 'Provider',
      status: text(p.status) ?? 'draft',
      isPublic: bool(p.is_public),
      publicSlug: text(p.public_slug),
      marketCode: text(p.market_code),
      marketName: text(p.market_name),
      createdAt: text(p.created_at),
    },
    owner: {
      accountId: text(o.account_id) ?? '',
      displayName: text(o.display_name) ?? 'Account holder',
      contactMasked: text(o.contact_masked),
      accountStatus: text(o.account_status) ?? 'active',
      createdAt: text(o.created_at),
    },
    signals: rows(raw.signals).map(entry => ({
      key: text(entry.key) ?? '',
      level: text(entry.level) ?? 'info',
      label: text(entry.label) ?? 'Check',
      detail: text(entry.detail) ?? '',
    })).filter(entry => entry.key !== ''),
    decisions: decisions(raw.decisions),
    attempts: rows(raw.attempts).map(entry => ({
      action: text(entry.action) ?? 'EVENT',
      occurredAt: text(entry.occurred_at),
      actorType: text(entry.actor_type) ?? 'unknown',
      actor: text(entry.actor) ?? 'Unknown',
      reasonCode: text(entry.reason_code),
    })),
  };
}

export async function getCredentialCase(credentialId: string): Promise<CredentialCase> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_credential_case_command', { p_credential_id: credentialId });

  const empty: CredentialCase = {
    allowed: false,
    found: false,
    unavailable: false,
    policyVersions: emptyPolicies,
    credential: {
      id: credentialId, providerId: '', credentialType: 'licence', issuingBody: '', jurisdictionCode: null,
      referenceLabel: null, documentReference: null, expiresAt: null, status: 'pending',
      submittedAt: null, reviewedAt: null, reviewNote: null, createdAt: null, updatedAt: null,
    },
    provider: { id: '', displayName: 'Provider', status: 'draft', isPublic: false, publicSlug: null, marketCode: null, marketName: null },
    owner: { accountId: '', displayName: 'Account holder', contactMasked: null, accountStatus: 'active' },
    services: [],
    decisions: [],
  };

  if (error) return { ...empty, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return empty;
  if (raw.found !== true) return { ...empty, allowed: true, found: false };

  const c = obj(raw.credential);
  const p = obj(raw.provider);
  const o = obj(raw.owner);

  return {
    allowed: true,
    found: true,
    unavailable: false,
    policyVersions: policies(raw.policy_versions),
    credential: {
      id: text(c.id) ?? credentialId,
      providerId: text(c.provider_id) ?? '',
      credentialType: text(c.credential_type) ?? 'licence',
      issuingBody: text(c.issuing_body) ?? '',
      jurisdictionCode: text(c.jurisdiction_code),
      referenceLabel: text(c.reference_label),
      documentReference: text(c.document_reference),
      expiresAt: text(c.expires_at),
      status: text(c.status) ?? 'pending',
      submittedAt: text(c.submitted_at),
      reviewedAt: text(c.reviewed_at),
      reviewNote: text(c.review_note),
      createdAt: text(c.created_at),
      updatedAt: text(c.updated_at),
    },
    provider: {
      id: text(p.id) ?? '',
      displayName: text(p.display_name) ?? 'Provider',
      status: text(p.status) ?? 'draft',
      isPublic: bool(p.is_public),
      publicSlug: text(p.public_slug),
      marketCode: text(p.market_code),
      marketName: text(p.market_name),
    },
    owner: {
      accountId: text(o.account_id) ?? '',
      displayName: text(o.display_name) ?? 'Account holder',
      contactMasked: text(o.contact_masked),
      accountStatus: text(o.account_status) ?? 'active',
    },
    services: rows(raw.services).map(entry => ({
      serviceEntityId: text(entry.service_entity_id) ?? '',
      serviceName: text(entry.service_name) ?? 'Service',
      coveredByThisCredential: bool(entry.covered_by_this_credential),
      coveredByAnotherCredential: bool(entry.covered_by_another_credential),
      providerOffersIt: bool(entry.provider_offers_it),
    })).filter(entry => entry.serviceEntityId !== ''),
    decisions: decisions(raw.decisions).map(entry => ({
      id: entry.id,
      decision: entry.decision,
      reasonCode: entry.reasonCode,
      note: entry.note,
      policyVersion: entry.policyVersion,
      expiresAt: entry.expiresAt,
      decidedAt: entry.decidedAt,
      decidedBy: entry.decidedBy,
    })),
  };
}

export async function getCredentialQueue(filters: { status?: string; search?: string }): Promise<{
  allowed: boolean;
  unavailable: boolean;
  credentials: CredentialQueueItem[];
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_credential_queue_command', {
    p_status: filters.status || null,
    p_search: filters.search ?? null,
    p_limit: 100,
  });
  if (error) return { allowed: false, unavailable: true, credentials: [] };

  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, credentials: [] };

  return {
    allowed: true,
    unavailable: false,
    credentials: rows(raw.credentials).map(entry => ({
      credentialId: text(entry.credential_id) ?? '',
      providerId: text(entry.provider_id) ?? '',
      providerName: text(entry.provider_name) ?? 'Provider',
      providerStatus: text(entry.provider_status) ?? 'draft',
      credentialType: text(entry.credential_type) ?? 'licence',
      issuingBody: text(entry.issuing_body) ?? '',
      jurisdictionCode: text(entry.jurisdiction_code),
      referenceLabel: text(entry.reference_label),
      expiresAt: text(entry.expires_at),
      status: text(entry.status) ?? 'pending',
      submittedAt: text(entry.submitted_at),
      reviewedAt: text(entry.reviewed_at),
      reviewNote: text(entry.review_note),
      decisionCount: num(entry.decision_count),
      expired: bool(entry.expired),
      expiringSoon: bool(entry.expiring_soon),
      serviceCount: num(entry.service_count),
    })).filter(entry => entry.credentialId !== ''),
  };
}

export async function getTrustCases(filters: {
  state?: string;
  severity?: string;
  caseType?: string;
  assignee?: string;
}): Promise<TrustCaseQueue> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_trust_cases_command', {
    p_state: filters.state || null,
    p_severity: filters.severity || null,
    p_case_type: filters.caseType || null,
    p_assignee_account_id: filters.assignee || null,
    p_limit: 100,
  });

  const empty: TrustCaseQueue = {
    allowed: false,
    unavailable: false,
    cases: [],
    counts: { open: 0, investigating: 0, awaitingResponse: 0, escalated: 0, held: 0, overdue: 0, unassigned: 0, closed: 0 },
    reviewers: [],
  };
  if (error) return { ...empty, unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return empty;
  const counts = obj(raw.counts);

  return {
    allowed: true,
    unavailable: false,
    counts: {
      open: num(counts.open),
      investigating: num(counts.investigating),
      awaitingResponse: num(counts.awaiting_response),
      escalated: num(counts.escalated),
      held: num(counts.held),
      overdue: num(counts.overdue),
      unassigned: num(counts.unassigned),
      closed: num(counts.closed),
    },
    reviewers: rows(raw.reviewers).map(entry => ({
      accountId: text(entry.account_id) ?? '',
      name: text(entry.name) ?? 'Administrator',
      role: text(entry.role) ?? 'Trust',
    })).filter(entry => entry.accountId !== ''),
    cases: rows(raw.cases).map(entry => {
      const reporter = text(obj(entry.reporter).account_id)
        ? {
            accountId: text(obj(entry.reporter).account_id) ?? '',
            name: text(obj(entry.reporter).name) ?? 'Account holder',
            contactMasked: text(obj(entry.reporter).contact_masked),
          }
        : null;
      const subjectAccount = text(obj(entry.subject_account).account_id)
        ? {
            accountId: text(obj(entry.subject_account).account_id) ?? '',
            name: text(obj(entry.subject_account).name) ?? 'Account holder',
            contactMasked: text(obj(entry.subject_account).contact_masked),
            accountStatus: text(obj(entry.subject_account).account_status) ?? 'active',
          }
        : null;
      const subjectProvider = text(obj(entry.subject_provider).provider_id)
        ? {
            providerId: text(obj(entry.subject_provider).provider_id) ?? '',
            name: text(obj(entry.subject_provider).name) ?? 'Provider',
            status: text(obj(entry.subject_provider).status) ?? 'draft',
          }
        : null;
      const subjectRequest = text(obj(entry.subject_request).request_id)
        ? {
            requestId: text(obj(entry.subject_request).request_id) ?? '',
            title: text(obj(entry.subject_request).title) ?? 'Request',
            state: text(obj(entry.subject_request).state) ?? 'submitted',
          }
        : null;

      return {
        id: text(entry.id) ?? '',
        caseType: text(entry.case_type) ?? 'other',
        severity: text(entry.severity) ?? 'medium',
        state: text(entry.state) ?? 'open',
        summary: text(entry.summary) ?? '',
        source: text(entry.source) ?? 'operator',
        createdAt: text(entry.created_at),
        updatedAt: text(entry.updated_at),
        slaDueAt: text(entry.sla_due_at),
        overdue: bool(entry.overdue),
        legalHold: bool(entry.legal_hold),
        legalHoldReason: text(entry.legal_hold_reason),
        legalHoldAt: text(entry.legal_hold_at),
        legalHoldBy: text(entry.legal_hold_by),
        resolution: text(entry.resolution),
        closedAt: text(entry.closed_at),
        assignedAccountId: text(entry.assigned_account_id),
        assignedTo: text(entry.assigned_to),
        reporter,
        subjectAccount,
        subjectProvider,
        subjectRequest,
        evidence: rows(entry.evidence).map(item => ({
          id: text(item.id) ?? '',
          kind: text(item.kind) ?? 'photo',
          submittedAt: text(item.submitted_at),
          assignmentId: text(item.assignment_id) ?? '',
        })).filter(item => item.id !== ''),
        events: rows(entry.events).map(item => ({
          eventType: text(item.event_type) ?? 'note',
          reasonCode: text(item.reason_code),
          note: text(item.note),
          occurredAt: text(item.occurred_at),
          actor: text(item.actor) ?? 'An operator',
        })),
      };
    }).filter(entry => entry.id !== ''),
  };
}
