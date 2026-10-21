import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProjectAgreement, type ProjectAgreement } from '@/features/customer/agreement';
import { getCustomerPayment, type PaymentLedgerRow } from '@/features/customer/payments';
import type { QuoteRow } from '@/features/customer/requests';

/**
 * Project completion — what the provider submitted, and the three answers the customer can give.
 *
 * ⚠️ THE AGREED CRITERIA ARE DERIVED FROM THE ACCEPTED QUOTE, NOT INVENTED HERE. The brief asks for an
 * "agreed criteria checklist". There is no separate criteria table, and there should not be one: what the
 * customer agreed to is the locked quote version — its itemised lines, the materials it does and does not
 * include, its exclusions, its timeline, whether an inspection was needed, and any warranty the provider
 * stated. Building the checklist from that row means the thing being checked against is exactly the thing
 * that was accepted, and it cannot drift from it.
 *
 * ⚠️ NOTHING HERE APPROVES ANYTHING. This module reads. The approval is an explicit form submission that the
 * database command re-checks, which is what makes completion auditable rather than automatic.
 */

export type CompletionCriterion = { key: string; label: string };

export type CompletionEvidence = {
  id: string;
  kind: string;
  note: string | null;
  externalUrl: string | null;
  storageObjectPath: string | null;
  submittedAt: string;
};

export type CompletionApproval = {
  id: string;
  note: string | null;
  approvedAt: string;
  acknowledgedCriteria: CompletionCriterion[];
};

export type CompletionCorrection = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
};

export type CompletionDispute = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type ProjectCompletion = {
  agreement: ProjectAgreement;
  evidence: CompletionEvidence[];
  approval: CompletionApproval | null;
  corrections: CompletionCorrection[];
  disputes: CompletionDispute[];
  /** The ledger row for this job's obligation, so the page can say whether a payout has gone out. */
  payment: PaymentLedgerRow | null;
  /** True when the provider has submitted and the customer has not yet answered. */
  awaitingDecision: boolean;
  evidenceUnavailable: boolean;
};

/**
 * The checklist, from the accepted quote.
 *
 * ⚠️ EVERY LINE IS SOMETHING THE PROVIDER COMMITTED TO. Nothing here is a generic quality statement — a
 * checklist of "was it good?" items would be a survey, not a gate. Each entry names a term from the version the
 * customer locked, so ticking it means "I checked this specific promise".
 */
export function completionCriteria(quote: QuoteRow): CompletionCriterion[] {
  const criteria: CompletionCriterion[] = [];

  if (quote.summary?.trim()) {
    criteria.push({ key: 'scope', label: `The work described: ${excerpt(quote.summary)}` });
  }
  for (const [index, item] of quote.lineItems.entries()) {
    criteria.push({ key: `line-${index}`, label: `Charged for: ${item.label}` });
  }
  if (quote.materialsIncluded === true) {
    criteria.push({
      key: 'materials',
      label: `Materials included, as quoted${quote.materialsNote ? `: ${excerpt(quote.materialsNote)}` : ''}`,
    });
  }
  if (quote.exclusions) {
    criteria.push({ key: 'exclusions', label: `Agreed as NOT included: ${excerpt(quote.exclusions)}` });
  }
  if (quote.timelineDays !== null) {
    criteria.push({
      key: 'timeline',
      label: `About ${quote.timelineDays} day${quote.timelineDays === 1 ? '' : 's'} of work${quote.timelineNote ? ` (${excerpt(quote.timelineNote)})` : ''}`,
    });
  }
  if (quote.inspectionRequired === true) {
    criteria.push({ key: 'inspection', label: 'The inspection that was required first was carried out' });
  }
  if (quote.warrantyTerms) {
    criteria.push({ key: 'warranty', label: `Warranty as stated: ${excerpt(quote.warrantyTerms)}` });
  }

  // A job with nothing on the quote but a total still has to be checked against something, and the honest
  // something is the request the provider quoted.
  if (criteria.length === 0) {
    criteria.push({ key: 'scope', label: 'The work you asked for in the request' });
  }

  return criteria;
}

/**
 * ⚠️ THE LABEL IS BOUNDED, THE TERM IS NOT, AND THAT IS WHY THIS EXISTS. Quote terms run to 2,000 characters —
 * a provider's written scope, a warranty, a list of exclusions. The checklist label column is capped at 300, and
 * a criterion built by pasting a full term into a label would make the approval FAIL at the database, which is
 * the worst possible place to discover it. So the label carries an excerpt and the completion page prints the
 * whole term beside it, from the same locked quote row.
 */
function excerpt(value: string, max = 220): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

type EvidenceRow = {
  id: string;
  kind: string;
  note: string | null;
  external_url: string | null;
  storage_object_path: string | null;
  submitted_at: string;
};

type ApprovalRow = {
  id: string;
  note: string | null;
  approved_at: string;
  acknowledged_criteria: unknown;
};

function parseCriteria(value: unknown): CompletionCriterion[] {
  if (!Array.isArray(value)) return [];
  const criteria: CompletionCriterion[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { key?: unknown; label?: unknown };
    if (typeof record.key !== 'string' || typeof record.label !== 'string') continue;
    criteria.push({ key: record.key, label: record.label });
  }
  return criteria;
}

export async function getProjectCompletion(projectId: string): Promise<ProjectCompletion | null> {
  // The agreement read is the ownership check for the whole page: it returns null for an assignment that is
  // not this account's, and it carries the accepted quote the checklist is built from.
  const agreement = await getProjectAgreement(projectId);
  if (!agreement) return null;

  const supabase = await createSupabaseServerClient();
  const [evidenceResult, approvalResult, correctionsResult, disputesResult] = await Promise.all([
    supabase
      .from('work_evidence')
      .select('id,kind,note,external_url,storage_object_path,submitted_at')
      .eq('assignment_id', agreement.assignmentId)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('completion_approvals')
      .select('id,note,approved_at,acknowledged_criteria')
      .eq('assignment_id', agreement.assignmentId)
      .maybeSingle(),
    supabase
      .from('completion_correction_requests')
      .select('id,message,status,created_at')
      .eq('assignment_id', agreement.assignmentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('completion_disputes')
      .select('id,reason,status,created_at,resolved_at')
      .eq('assignment_id', agreement.assignmentId)
      .order('created_at', { ascending: false }),
  ]);

  const payment = agreement.obligation ? (await getCustomerPayment(agreement.obligation.id)).row : null;

  return {
    agreement,
    evidence: ((evidenceResult.data ?? []) as EvidenceRow[]).map(row => ({
      id: row.id,
      kind: row.kind,
      note: row.note,
      externalUrl: row.external_url,
      storageObjectPath: row.storage_object_path,
      submittedAt: row.submitted_at,
    })),
    approval: approvalResult.data
      ? {
          id: (approvalResult.data as ApprovalRow).id,
          note: (approvalResult.data as ApprovalRow).note,
          approvedAt: (approvalResult.data as ApprovalRow).approved_at,
          acknowledgedCriteria: parseCriteria((approvalResult.data as ApprovalRow).acknowledged_criteria),
        }
      : null,
    corrections: (correctionsResult.data ?? []).map(row => ({
      id: row.id,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    })),
    disputes: (disputesResult.data ?? []).map(row => ({
      id: row.id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    payment,
    awaitingDecision: agreement.requestState === 'submitted_for_approval' && !approvalResult.data,
    // ⚠️ A READ FAILURE IS REPORTED, NOT SWALLOWED. Evidence is the whole point of this page; showing "nothing
    // was submitted" because a query errored would invite an approval against work nobody can see.
    evidenceUnavailable: Boolean(evidenceResult.error),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Failure vocabulary — fixed, because these travel in the query string.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const COMPLETION_FAILURES = [
  'not_found',
  'not_authorized',
  'not_waiting',
  'no_evidence',
  'payment_unfunded',
  'already_decided',
  'criteria_required',
  'already_open',
  'past_point',
  'too_short',
  'failed',
] as const;
export type CompletionFailure = (typeof COMPLETION_FAILURES)[number];

export const COMPLETION_FAILURE_COPY: Record<CompletionFailure, string> = {
  not_found: 'That job is no longer on your account.',
  not_authorized: 'That is not yours to decide. Sign in again if you were signed in as somebody else.',
  not_waiting: 'This job is not waiting for your decision any more.',
  no_evidence: 'The provider has not submitted anything yet, so there is nothing to review.',
  payment_unfunded:
    'The payment for this job has not cleared. Nothing can be released until the money is actually there — check the payment record.',
  already_decided: 'You have already approved this work.',
  criteria_required: 'Tick every item on the checklist — the record of what you confirmed is the point of it.',
  already_open: 'You already have an open request about this job.',
  past_point: 'This job has moved past the point where that applies.',
  too_short: 'Add a sentence or two — a reason nobody can read is not a reason.',
  failed: 'That did not work, and nothing was changed. Try again.',
};

export function completionFailureCode(value: string | undefined | null): CompletionFailure | null {
  if (!value) return null;
  return (COMPLETION_FAILURES as readonly string[]).includes(value) ? (value as CompletionFailure) : null;
}

export function completionFailureFromMessage(message: string): CompletionFailure {
  const text = message.toLowerCase();
  if (text.includes('checklist') || text.includes('key and a label')) return 'criteria_required';
  if (text.includes('completion evidence required') || text.includes('nothing to review')) return 'no_evidence';
  if (text.includes('must be funded')) return 'payment_unfunded';
  if (text.includes('not waiting for your')) return 'not_waiting';
  if (text.includes('not waiting for your approval')) return 'not_waiting';
  if (text.includes('not authorized') || text.includes('forbidden')) return 'not_authorized';
  if (text.includes('not found')) return 'not_found';
  if (text.includes('already')) return 'already_open';
  if (text.includes('not in a state')) return 'past_point';
  if (text.includes('sentence') || text.includes('say what')) return 'too_short';
  return 'failed';
}
