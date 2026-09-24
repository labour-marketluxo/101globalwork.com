import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supportStatus, type SupportStatus } from '@/features/support/copy';

/**
 * The read layer for the support workspace.
 *
 * ⚠️ THE DATABASE ENFORCES ISOLATION; THIS FILE ONLY SHAPES WHAT IT RETURNS. Every command re-derives the
 * caller's account and refuses a case that is not theirs with the same "not found" as a case that does not
 * exist. So a read that fails with `denied` here means the account has no such case — the page does not
 * distinguish the two, because the platform has no reason to and the difference is an existence oracle.
 *
 * ⚠️ THIS MODULE IS THE ONLY PLACE THAT KNOWS THE WIRE SHAPE. The commands return jsonb built field by field,
 * and the internal-note filter lives in the database rather than here — if this file had to strip notes out,
 * a second caller would eventually forget to.
 */

export type SupportCaseSummary = {
  id: string;
  reference: string;
  subject: string;
  kind: string;
  status: SupportStatus;
  priority: string;
  messageCount: number;
  attachmentCount: number;
  createdAt: string | null;
  awaitingYou: boolean;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionOverdue: boolean;
  link: { kind: string; label: string } | null;
};

export type SupportCasesRead = {
  available: boolean;
  cases: SupportCaseSummary[];
  counts: { open: number; closed: number };
};

export type SupportMessage = {
  id: string;
  authorRole: 'requester' | 'support' | 'system';
  authorName: string;
  body: string;
  createdAt: string | null;
};

export type SupportAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string | null;
  href: string;
};

export type SupportCaseDetail = {
  id: string;
  reference: string;
  subject: string;
  kind: string;
  status: SupportStatus;
  priority: string;
  createdAt: string | null;
  updatedAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  closedByYou: boolean;
  closeReason: string | null;
  reopenedCount: number;
  canReply: boolean;
  canClose: boolean;
  canGiveFeedback: boolean;
  slaState: string;
};

export type SupportLink = { kind: string; id: string; label: string; detail: string; href: string };

export type SupportFeedback = { rating: number; comment: string | null; submittedAt: string | null };

export type SupportCaseRead = {
  available: boolean;
  denied: boolean;
  detail: SupportCaseDetail | null;
  link: SupportLink | null;
  messages: SupportMessage[];
  attachments: SupportAttachment[];
  feedback: SupportFeedback | null;
};

export type SupportOption = { kind: string; id: string; label: string; detail: string };
export type SupportKindOption = { code: string; label: string; detail: string };
export type SupportOptionsRead = { available: boolean; targets: SupportOption[]; kinds: SupportKindOption[] };

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const boolFrom = (value: unknown): boolean => value === true;

const EMPTY_CASES: SupportCasesRead = { available: false, cases: [], counts: { open: 0, closed: 0 } };
const EMPTY_CASE: SupportCaseRead = {
  available: false,
  denied: false,
  detail: null,
  link: null,
  messages: [],
  attachments: [],
  feedback: null,
};

export async function getMySupportCases(filter: string): Promise<SupportCasesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_support_cases_command', { p_filter: filter });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[support] could not read the case list: ${error.message}`);
    }
    return EMPTY_CASES;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return EMPTY_CASES;
  const counts = objectFrom(raw.counts);

  return {
    available: true,
    cases: rowsFrom(raw.cases)
      .map((row) => {
        const id = textFrom(row.id);
        const reference = textFrom(row.reference);
        const subject = textFrom(row.subject);
        const status = supportStatus(textFrom(row.status));
        if (!id || !reference || !subject || !status) return null;
        const link = row.link && typeof row.link === 'object' ? objectFrom(row.link) : null;
        return {
          id,
          reference,
          subject,
          kind: textFrom(row.kind) ?? 'general',
          status,
          priority: textFrom(row.priority) ?? 'normal',
          messageCount: numberFrom(row.messageCount),
          attachmentCount: numberFrom(row.attachmentCount),
          createdAt: textFrom(row.createdAt),
          awaitingYou: boolFrom(row.awaitingYou),
          firstResponseDueAt: textFrom(row.firstResponseDueAt),
          resolutionDueAt: textFrom(row.resolutionDueAt),
          firstRespondedAt: textFrom(row.firstRespondedAt),
          resolvedAt: textFrom(row.resolvedAt),
          closedAt: textFrom(row.closedAt),
          resolutionOverdue: boolFrom(row.resolutionOverdue),
          link: link ? { kind: textFrom(link.kind) ?? 'record', label: textFrom(link.label) ?? 'Linked' } : null,
        } satisfies SupportCaseSummary;
      })
      .filter((entry): entry is SupportCaseSummary => entry !== null),
    counts: { open: numberFrom(counts.open), closed: numberFrom(counts.closed) },
  };
}

function toMessage(row: Raw): SupportMessage | null {
  const id = textFrom(row.id);
  const body = textFrom(row.body);
  if (!id || !body) return null;
  const role = textFrom(row.authorRole);
  return {
    id,
    authorRole: role === 'support' || role === 'system' ? role : 'requester',
    authorName: textFrom(row.authorName) ?? 'A participant',
    body,
    createdAt: textFrom(row.createdAt),
  };
}

function toAttachment(row: Raw): SupportAttachment | null {
  const id = textFrom(row.id);
  const href = textFrom(row.href);
  const fileName = textFrom(row.fileName);
  if (!id || !href || !fileName) return null;
  return {
    id,
    fileName,
    contentType: textFrom(row.contentType) ?? 'application/octet-stream',
    sizeBytes: numberFrom(row.sizeBytes),
    createdAt: textFrom(row.createdAt),
    href,
  };
}

export async function getMySupportCase(caseId: string): Promise<SupportCaseRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_support_case_command', { p_case_id: caseId });

  if (error) {
    // A malformed id reaches the uuid parameter as 22P02; the cast from a URL segment is not a reason to
    // render a 500, and "no such case on this account" is the truth from the caller's side either way.
    const denied = error.message.includes('case not found');
    if (!denied && process.env.NODE_ENV !== 'production') {
      console.warn(`[support] could not read the case: ${error.message}`);
    }
    return { ...EMPTY_CASE, denied, available: true };
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { ...EMPTY_CASE, denied: true, available: true };

  const detailRaw = objectFrom(raw.case);
  const status = supportStatus(textFrom(detailRaw.status));
  const id = textFrom(detailRaw.id);
  const reference = textFrom(detailRaw.reference);
  if (!status || !id || !reference) return { ...EMPTY_CASE, available: true };

  const linkRaw = raw.link && typeof raw.link === 'object' ? objectFrom(raw.link) : null;
  const feedbackRaw = raw.feedback && typeof raw.feedback === 'object' ? objectFrom(raw.feedback) : null;

  return {
    available: true,
    denied: false,
    detail: {
      id,
      reference,
      subject: textFrom(detailRaw.subject) ?? 'Support case',
      kind: textFrom(detailRaw.kind) ?? 'general',
      status,
      priority: textFrom(detailRaw.priority) ?? 'normal',
      createdAt: textFrom(detailRaw.createdAt),
      updatedAt: textFrom(detailRaw.updatedAt),
      firstResponseDueAt: textFrom(detailRaw.firstResponseDueAt),
      resolutionDueAt: textFrom(detailRaw.resolutionDueAt),
      firstRespondedAt: textFrom(detailRaw.firstRespondedAt),
      resolvedAt: textFrom(detailRaw.resolvedAt),
      closedAt: textFrom(detailRaw.closedAt),
      closedByYou: boolFrom(detailRaw.closedByYou),
      closeReason: textFrom(detailRaw.closeReason),
      reopenedCount: numberFrom(detailRaw.reopenedCount),
      canReply: detailRaw.canReply !== false,
      canClose: detailRaw.canClose !== false,
      canGiveFeedback: boolFrom(detailRaw.canGiveFeedback),
      slaState: textFrom(detailRaw.slaState) ?? 'on_track',
    },
    link: linkRaw
      ? {
          kind: textFrom(linkRaw.kind) ?? 'record',
          id: textFrom(linkRaw.id) ?? '',
          label: textFrom(linkRaw.label) ?? 'Linked record',
          detail: textFrom(linkRaw.detail) ?? '',
          href: textFrom(linkRaw.href) ?? '/support',
        }
      : null,
    messages: rowsFrom(raw.messages)
      .map(toMessage)
      .filter((entry): entry is SupportMessage => entry !== null),
    attachments: rowsFrom(raw.attachments)
      .map(toAttachment)
      .filter((entry): entry is SupportAttachment => entry !== null),
    feedback: feedbackRaw
      ? {
          rating: numberFrom(feedbackRaw.rating),
          comment: textFrom(feedbackRaw.comment),
          submittedAt: textFrom(feedbackRaw.submittedAt),
        }
      : null,
  };
}

export async function getMySupportCaseOptions(): Promise<SupportOptionsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_support_case_options_command');

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[support] could not read the case options: ${error.message}`);
    }
    return { available: false, targets: [], kinds: [] };
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { available: false, targets: [], kinds: [] };

  return {
    available: true,
    targets: rowsFrom(raw.targets)
      .map((row) => {
        const id = textFrom(row.id);
        const label = textFrom(row.label);
        if (!id || !label) return null;
        return {
          kind: textFrom(row.kind) ?? 'project',
          id,
          label,
          detail: textFrom(row.detail) ?? '',
        } satisfies SupportOption;
      })
      .filter((entry): entry is SupportOption => entry !== null),
    kinds: rowsFrom(raw.kinds)
      .map((row) => {
        const code = textFrom(row.code);
        const label = textFrom(row.label);
        if (!code || !label) return null;
        return { code, label, detail: textFrom(row.detail) ?? '' } satisfies SupportKindOption;
      })
      .filter((entry): entry is SupportKindOption => entry !== null),
  };
}
