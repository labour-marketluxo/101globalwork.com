import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Evidence, the timeline and documents.
 *
 * ⚠️ THE TIMELINE IS THE AUDIT LOG, NOT A DERIVED FEED. `get_project_timeline_command` projects `audit_events` for
 * one project — actor, exact instant, the record it is about — with platform and system actions flagged. It is
 * read-only here because it is read-only there: nothing in this app can edit an audit row, and the page offers no
 * control that pretends otherwise.
 *
 * ⚠️ FILES ARE SERVED BY SIGNED URL, NEVER BY A PUBLIC LINK. The download routes mint a short-lived signed URL and
 * redirect to it, so the bucket stays private and only participants can ask for one.
 */

export type EvidenceFlag = {
  id: string;
  reasonCode: string;
  note: string | null;
  status: string;
  raisedByRole: 'customer' | 'provider';
  raisedByMe: boolean;
  createdAt: string | null;
};

export type EvidenceItem = {
  id: string;
  kind: string;
  note: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  source: string | null;
  submittedAt: string | null;
  stepLabel: string | null;
  uploaderRole: 'customer' | 'provider';
  uploaderName: string;
  openFlagCount: number;
  flags: EvidenceFlag[];
  verification: 'flagged' | 'approved' | 'submitted';
};

export type EvidenceRead = { role: string | null; requestState: string; items: EvidenceItem[]; denied: boolean; unavailable: boolean };

export type TimelineEvent = {
  kind: string;
  at: string | null;
  actorRole: 'customer' | 'provider' | 'platform' | 'system';
  actorType: string;
  description: string;
  resourceType: string | null;
  resourceId: string | null;
  reasonCode: string | null;
  isOverride: boolean;
};

export type TimelineRead = { role: string | null; events: TimelineEvent[]; denied: boolean; unavailable: boolean };

export type DocumentVersion = {
  id: string;
  versionMajor: number;
  title: string;
  documentType: string;
  mimeType: string | null;
  sizeBytes: number | null;
  accessScope: string;
  createdAt: string | null;
  uploaderRole: 'customer' | 'provider';
  uploaderName: string;
  uploadedByMe: boolean;
  decisions: { decision: string; role: 'customer' | 'provider'; note: string | null; decidedAt: string | null }[];
  signerStatus: string;
};

export type ProjectDocument = {
  groupId: string;
  title: string;
  documentType: string;
  latestVersion: number;
  latestCreatedAt: string | null;
  accessScope: string;
  versions: DocumentVersion[];
};

export type DocumentsRead = {
  role: string | null;
  agreementAcceptance: { version: string; acceptedAt: string | null; authMethod: string } | null;
  documents: ProjectDocument[];
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
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];
const role = (value: unknown): 'customer' | 'provider' => (value === 'customer' ? 'customer' : 'provider');

export const EVIDENCE_KIND_COPY: Record<string, string> = {
  photo: 'Photo',
  document: 'Document',
  note: 'Note',
  link: 'Link',
};

export const FLAG_REASON_COPY: Record<string, string> = {
  not_this_job: 'This is not from this job',
  unreadable: 'I cannot read it',
  incomplete: 'It does not show enough',
  misleading: 'It is misleading',
  other: 'Something else',
};

export async function getProjectEvidence(assignmentId: string): Promise<EvidenceRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_evidence_command', { p_assignment_id: assignmentId });
  if (error) return { role: null, requestState: '', items: [], denied: false, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { role: null, requestState: '', items: [], denied: true, unavailable: false };

  return {
    role: text(raw.role),
    requestState: text(raw.request_state) ?? '',
    denied: false,
    unavailable: false,
    items: rows(raw.items)
      .map(entry => {
        const id = text(entry.id);
        if (!id) return null;
        return {
          id,
          kind: text(entry.kind) ?? 'photo',
          note: text(entry.note),
          storagePath: text(entry.storage_path),
          externalUrl: text(entry.external_url),
          source: text(entry.source),
          submittedAt: text(entry.submitted_at),
          stepLabel: text(entry.step_label),
          uploaderRole: role(entry.uploader_role),
          uploaderName: text(entry.uploader_name) ?? 'A participant',
          openFlagCount: num(entry.open_flag_count) ?? 0,
          flags: rows(entry.flags).map(flag => ({
            id: text(flag.id) ?? '',
            reasonCode: text(flag.reason_code) ?? 'other',
            note: text(flag.note),
            status: text(flag.status) ?? 'open',
            raisedByRole: role(flag.raised_by_role),
            raisedByMe: flag.raised_by_me === true,
            createdAt: text(flag.created_at),
          })).filter(flag => flag.id !== ''),
          verification:
            entry.verification === 'flagged' || entry.verification === 'approved' ? entry.verification : ('submitted' as const),
        } satisfies EvidenceItem;
      })
      .filter((entry): entry is EvidenceItem => entry !== null),
  };
}

export async function getProjectTimeline(assignmentId: string): Promise<TimelineRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_timeline_command', { p_assignment_id: assignmentId });
  if (error) return { role: null, events: [], denied: false, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { role: null, events: [], denied: true, unavailable: false };

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    events: rows(raw.events).map(entry => ({
      kind: text(entry.kind) ?? 'event',
      at: text(entry.at),
      actorRole:
        entry.actor_role === 'customer' || entry.actor_role === 'provider' || entry.actor_role === 'platform'
          ? entry.actor_role
          : ('system' as const),
      actorType: text(entry.actor_type) ?? 'system',
      description: text(entry.description) ?? 'Something happened',
      resourceType: text(entry.resource_type),
      resourceId: text(entry.resource_id),
      reasonCode: text(entry.reason_code),
      isOverride: entry.is_override === true,
    })),
  };
}

/**
 * Where a timeline entry points, when it points anywhere.
 *
 * ⚠️ THE DATABASE SAYS WHICH RECORD; THIS SAYS WHICH PAGE. A task change is a task; a payment or payout is the
 * agreement and payment behind it, which for both parties is the project overview. Building hrefs in SQL would put
 * route knowledge where routes are not.
 */
export function timelineHref(event: TimelineEvent, assignmentId: string): string | null {
  if (!event.resourceId) return null;
  switch (event.resourceType) {
    case 'assignment':
      return `/projects/${assignmentId}`;
    case 'request':
      return `/projects/${assignmentId}`;
    case 'payment_obligation':
    case 'payout':
      return `/projects/${assignmentId}#milestones`;
    default:
      return null;
  }
}

export async function getProjectDocuments(assignmentId: string): Promise<DocumentsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_documents_command', { p_assignment_id: assignmentId });
  if (error) return { role: null, agreementAcceptance: null, documents: [], denied: false, unavailable: true };
  const raw = obj(data);
  if (raw.allowed !== true) return { role: null, agreementAcceptance: null, documents: [], denied: true, unavailable: false };

  const acceptance = raw.agreement_acceptance && typeof raw.agreement_acceptance === 'object' ? obj(raw.agreement_acceptance) : null;

  return {
    role: text(raw.role),
    denied: false,
    unavailable: false,
    agreementAcceptance: acceptance
      ? {
          version: text(acceptance.version) ?? 'v1.0',
          acceptedAt: text(acceptance.accepted_at),
          authMethod: text(acceptance.auth_method) ?? 'unknown',
        }
      : null,
    documents: rows(raw.documents)
      .map(entry => {
        const groupId = text(entry.document_group_id);
        if (!groupId) return null;
        return {
          groupId,
          title: text(entry.title) ?? 'Document',
          documentType: text(entry.document_type) ?? 'other',
          latestVersion: num(entry.latest_version) ?? 1,
          latestCreatedAt: text(entry.latest_created_at),
          accessScope: text(entry.access_scope) ?? 'participants',
          versions: rows(entry.versions).map(version => ({
            id: text(version.id) ?? '',
            versionMajor: num(version.version_major) ?? 1,
            title: text(version.title) ?? 'Document',
            documentType: text(version.document_type) ?? 'other',
            mimeType: text(version.mime_type),
            sizeBytes: num(version.size_bytes),
            accessScope: text(version.access_scope) ?? 'participants',
            createdAt: text(version.created_at),
            uploaderRole: role(version.uploader_role),
            uploaderName: text(version.uploader_name) ?? 'A participant',
            uploadedByMe: version.uploaded_by_me === true,
            decisions: rows(version.decisions).map(decision => ({
              decision: text(decision.decision) ?? 'approved',
              role: role(decision.role),
              note: text(decision.note),
              decidedAt: text(decision.decided_at),
            })),
            signerStatus: text(version.signer_status) ?? 'awaiting_acknowledgement',
          })).filter(version => version.id !== ''),
        } satisfies ProjectDocument;
      })
      .filter((entry): entry is ProjectDocument => entry !== null),
  };
}

export const SIGNER_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  signed: { label: 'Signed', tone: 'teal' },
  approved: { label: 'Approved', tone: 'teal' },
  declined: { label: 'Declined', tone: 'amber' },
  awaiting_acknowledgement: { label: 'Awaiting acknowledgement', tone: 'amber' },
  awaiting_customer_signature: { label: 'Awaiting the customer’s signature', tone: 'amber' },
};

