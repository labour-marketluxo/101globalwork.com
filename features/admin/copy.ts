/**
 * The administrator workspace's vocabulary: failure codes, labels and the mapping from a database
 * refusal onto words.
 *
 * ⚠️ THIS MODULE IS PURE, AND THAT IS LOAD-BEARING. The server actions live in a `'use server'` file,
 * where every export must be an async function — so the error-to-code mapper and the copy tables live
 * here and both the actions and the pages import them. The same mistake in the organisation workspace
 * broke the whole build; the note is repeated because the next person to add a helper will reach for
 * the actions file first.
 *
 * ⚠️ NO DATABASE MESSAGE IS EVER SHOWN. Actions translate a refusal into one of these codes and put the
 * code in the query string; the page renders the sentence. A raw error message in a URL is a leak of
 * schema detail and an untranslatable page for the operator reading it.
 */

export const ADMIN_FAILURE_CODES = [
  'not_authorized',
  'step_up_required',
  'reason_required',
  'note_too_short',
  'hold_blocks',
  'invalid',
  'conflict',
  'not_found',
  'unavailable',
] as const;

export type AdminFailureCode = (typeof ADMIN_FAILURE_CODES)[number];

export const ADMIN_FAILURE_COPY: Record<AdminFailureCode, string> = {
  not_authorized: 'Your administrator role does not cover that action, so nothing changed.',
  step_up_required:
    'That action needs a second factor on this session. Confirm it is you, then try again — nothing changed.',
  reason_required: 'Choose a reason code. A decision without a stated reason is not an audit record.',
  note_too_short:
    'Write at least ten characters explaining the decision. The note is what somebody reads in six months.',
  hold_blocks:
    'A legal hold is in force on that case, and the platform refuses this until it is lifted — with its own reason code, on the case itself.',
  invalid: 'Some of that was not valid for the record you picked, so nothing was saved.',
  conflict: 'The record has moved on since this page was loaded — reload and check the current state.',
  not_found: 'That record no longer exists.',
  unavailable: 'That did not work and nothing was saved. Try again.',
};

/**
 * Which sentence a refusal deserves.
 *
 * ⚠️ IT MATCHES ON THE MESSAGES THIS PLATFORM'S COMMANDS RAISE, and the fallback is deliberately
 * `unavailable` rather than `invalid`: guessing "your input was wrong" for an error we did not
 * recognise sends an operator to fix a form that was fine.
 */
export function adminFailureCode(message: string | undefined | null): AdminFailureCode {
  const text = String(message ?? '').toLowerCase();
  if (!text) return 'unavailable';
  if (text.includes('step-up') || text.includes('second factor') || text.includes('aal2')) return 'step_up_required';
  if (text.includes('reason')) return 'reason_required';
  if (text.includes('note of at least')) return 'note_too_short';
  if (text.includes('legal hold')) return 'hold_blocks';
  if (text.includes('not authorized') || text.includes('only an administrator') || text.includes('cannot')) return 'not_authorized';
  if (text.includes('already') || text.includes('active restriction') || text.includes('not awaiting review')) return 'conflict';
  if (text.includes('not found')) return 'not_found';
  if (
    text.includes('is not a standing')
    || text.includes('not valid')
    || text.includes('required')
    || text.includes('unknown')
    || text.includes('not about this account')
    || text.includes('not a decision this platform records')
  ) return 'invalid';
  return 'unavailable';
}

export function adminFailureCopy(code: string | undefined | null): string | null {
  if (!code) return null;
  return ADMIN_FAILURE_COPY[code as AdminFailureCode] ?? ADMIN_FAILURE_COPY.unavailable;
}

/** The three standings the platform records on an account. */
export const ACCOUNT_STANDINGS = ['active', 'suspended', 'closed'] as const;
export type AccountStanding = (typeof ACCOUNT_STANDINGS)[number];

export const STANDING_COPY: Record<AccountStanding, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  active: { label: 'Active', tone: 'teal' },
  suspended: { label: 'Suspended', tone: 'amber' },
  closed: { label: 'Closed', tone: 'slate' },
};

/**
 * ⚠️ "UNDER REVIEW" IS ABSENT ON PURPOSE. The brief lists it as a standing; `public.account_status` is
 * `active | suspended | closed`, and inventing a fourth option would filter to nothing while looking
 * like a feature. The accounts page states this rather than offering a control that cannot work.
 */

export const INCIDENT_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const SEVERITY_COPY: Record<IncidentSeverity, { label: string; tone: 'amber' | 'slate' | 'teal' }> = {
  critical: { label: 'Critical', tone: 'amber' },
  high: { label: 'High', tone: 'amber' },
  medium: { label: 'Medium', tone: 'slate' },
  low: { label: 'Low', tone: 'slate' },
};

export const INCIDENT_AREAS: Record<string, string> = {
  trust: 'Trust',
  financials: 'Financials',
  projects: 'Projects',
  operations: 'Operations',
  accounts: 'Accounts',
};

/** The window choices the overview offers, in hours. */
export const INCIDENT_WINDOWS = [
  { value: '1', label: 'Last hour' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
] as const;

export const PROVIDER_QUEUES = [
  { value: 'all', label: 'Every provider' },
  { value: 'awaiting_verification', label: 'Awaiting verification' },
  { value: 'restricted', label: 'Under restriction' },
  { value: 'expiring_credentials', label: 'Credentials expiring' },
  { value: 'not_live', label: 'Not published' },
] as const;

export const RESTRICTION_KIND_COPY: Record<string, { label: string; tone: 'amber' | 'slate' }> = {
  information_required: { label: 'Information requested', tone: 'amber' },
  credential_hold: { label: 'Credential hold', tone: 'amber' },
  availability_paused: { label: 'Availability paused', tone: 'slate' },
  suspended: { label: 'Suspended', tone: 'amber' },
};

export type ReasonCode = { code: string; label: string };
export type ReasonCodeScope =
  | 'account_standing'
  | 'session_revocation'
  | 'contact_reveal'
  | 'provider_restriction'
  | 'restriction_lift'
  | 'incident_ack'
  | 'verification_decision'
  | 'credential_decision'
  | 'trust_case_action'
  | 'trust_case_hold'
  | 'trust_case_hold_lift'
  | 'trust_case_closure'
  | 'project_override'
  | 'job_retry'
  | 'reconciliation_retry'
  | 'ledger_adjustment'
  | 'payout_hold'
  | 'payout_hold_release'
  | 'money_case_decision'
  | 'taxonomy_change'
  | 'market_change';

export type ReasonCodeCatalogue = Record<ReasonCodeScope, ReasonCode[]>;

// ── Trust review vocabulary ────────────────────────────────────────────────────────────────────

export const VERIFICATION_DECISIONS = ['verified', 'rejected', 'information_requested', 'escalated'] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export const VERIFICATION_DECISION_COPY: Record<VerificationDecision, string> = {
  verified: 'Approved',
  rejected: 'Rejected',
  information_requested: 'More proof requested',
  escalated: 'Escalated',
};

export const CREDENTIAL_DECISIONS = ['verified', 'rejected', 'revoked', 'information_requested'] as const;
export type CredentialDecision = (typeof CREDENTIAL_DECISIONS)[number];

export const CREDENTIAL_DECISION_COPY: Record<CredentialDecision, string> = {
  verified: 'Verified',
  rejected: 'Rejected',
  revoked: 'Revoked',
  information_requested: 'Information requested',
};

/** How a decision is shown beside a credential status, which has fewer values than the decisions do. */
export const CREDENTIAL_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  verified: { label: 'Verified', tone: 'teal' },
  pending: { label: 'Awaiting review', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'amber' },
  expired: { label: 'Expired', tone: 'amber' },
  not_started: { label: 'Not started', tone: 'slate' },
};

export const VERIFICATION_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  verified: { label: 'Verified', tone: 'teal' },
  pending: { label: 'Awaiting review', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'amber' },
  expired: { label: 'Expired', tone: 'amber' },
  not_started: { label: 'Not started', tone: 'slate' },
};

export const CASE_TYPES = ['safety', 'abuse', 'harassment', 'policy_violation', 'fraud', 'dispute', 'other'] as const;
export type TrustCaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_COPY: Record<string, string> = {
  safety: 'Safety',
  abuse: 'Abuse',
  harassment: 'Harassment',
  policy_violation: 'Policy violation',
  fraud: 'Fraud',
  dispute: 'Dispute',
  other: 'Other',
};

export const CASE_SEVERITIES = ['low', 'medium', 'critical'] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_STATES = ['open', 'investigating', 'awaiting_response', 'escalated', 'resolved', 'closed'] as const;
export type TrustCaseState = (typeof CASE_STATES)[number];

export const CASE_STATE_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  open: { label: 'Open', tone: 'amber' },
  investigating: { label: 'Under investigation', tone: 'amber' },
  awaiting_response: { label: 'Awaiting response', tone: 'slate' },
  escalated: { label: 'Escalated', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'teal' },
  closed: { label: 'Closed', tone: 'slate' },
};

/**
 * The badge the brief calls "severity (Low, Medium, Critical, Legal Hold)".
 *
 * ⚠️ A HOLD OUTRANKS SEVERITY IN THE BADGE BECAUSE IT CHANGES WHAT AN OPERATOR MAY DO — a held case cannot be
 * closed and holds the subject's reinstatement — while severity only changes the order of the queue. The two
 * stay separate fields, so "was this preserved for litigation?" is answerable without reading a colour.
 */
export function caseBadge(caseItem: { severity: string; legalHold: boolean }): { label: string; tone: 'amber' | 'slate' | 'teal' } {
  if (caseItem.legalHold) return { label: 'Legal hold', tone: 'amber' };
  if (caseItem.severity === 'critical') return { label: 'Critical', tone: 'amber' };
  if (caseItem.severity === 'medium') return { label: 'Medium', tone: 'slate' };
  return { label: 'Low', tone: 'slate' };
}

// ── Project operations vocabulary ──────────────────────────────────────────────────────────────

/**
 * The two commands this console may run.
 *
 * ⚠️ THE DATABASE VALIDATES THE KEY, AND THIS IS ONLY THE LABEL. `run_project_override_command` accepts
 * `force_state` and `retry_delivery` and refuses anything else, so a drift between this list and the function
 * fails closed — an operator would see a refusal, not an unexplained write.
 */
export const PROJECT_OVERRIDE_COMMANDS = ['force_state', 'retry_delivery'] as const;
export type ProjectOverrideCommand = (typeof PROJECT_OVERRIDE_COMMANDS)[number];

export const PROJECT_OVERRIDE_COPY: Record<ProjectOverrideCommand, { label: string; detail: string }> = {
  force_state: {
    label: 'Force a state transition',
    detail:
      'Moves the request to a state the state machine would not choose by itself. It moves the state and nothing else: no money, no notification, no stage work.',
  },
  retry_delivery: {
    label: 'Retry a failed delivery',
    detail:
      'Clears the delivery bookkeeping on one outbox event so the next publisher cycle picks it up again. It does not publish it here, and it cannot undo an effect that already landed.',
  },
};

/** What each exception tag means, in the words an operator needs to triage it. */
export const PROJECT_EXCEPTION_COPY: Record<string, string> = {
  legal_hold: 'A legal hold is in force',
  open_issue: 'An issue case is open',
  blocked_task: 'A task is marked blocked',
  trust_case_hold: 'A trust case is holding this project',
  disputed: 'The request is in dispute',
  stale: 'Nothing has moved for two weeks',
  completed_without_release: 'Completed, but the money is still held',
  cancelled_with_funds_held: 'Cancelled, but funds are still held',
  paid_before_completion: 'Paid out before the work was completed',
  dispute_without_hold: 'In dispute, with nothing holding the money',
  work_without_funding: 'Work committed without funded money',
};

export const PROJECT_EXCEPTIONS = [
  'any',
  'blocked',
  'disputed',
  'stale',
  'financially_inconsistent',
] as const;

export const PROJECT_EXCEPTION_FILTER_COPY: Record<string, string> = {
  any: 'Any project',
  blocked: 'Blocked or held',
  disputed: 'In dispute',
  stale: 'Stale',
  financially_inconsistent: 'Financially inconsistent',
};

// ── Money vocabulary ───────────────────────────────────────────────────────────────────────────

/** Why an attempt is in the monitor's exception list. Each is a disagreement between three records. */
export const PAYMENT_ANOMALY_COPY: Record<string, string> = {
  unreconciled_event: 'The provider told us something we have not acted on',
  mismatch: 'The event did not match the attempt',
  rejected_event: 'An event failed its integrity check',
  missing_event: 'We think it succeeded; the provider has not confirmed',
  stuck_funding: 'Stuck mid-funding for over an hour',
  multiple_attempts: 'More than one attempt on this obligation',
};

export const PAYMENT_ANOMALY_FILTERS = [
  'any',
  'unreconciled',
  'mismatch',
  'rejected',
  'missing_event',
  'stuck_funding',
  'multiple_attempts',
] as const;

export const PAYMENT_ANOMALY_FILTER_COPY: Record<string, string> = {
  any: 'Every payment',
  unreconciled: 'Unreconciled events',
  mismatch: 'Mismatched',
  rejected: 'Rejected events',
  missing_event: 'Missing provider event',
  stuck_funding: 'Stuck mid-funding',
  multiple_attempts: 'Repeated attempts',
};

export const PAYMENT_ATTEMPT_STATUSES = ['created', 'pending_provider', 'succeeded', 'failed', 'cancelled'] as const;
export const PAYOUT_STATUSES = ['eligible', 'queued', 'processing', 'paid', 'failed', 'blocked', 'cancelled'] as const;

/**
 * The block reasons the platform's eligibility function returns, in words.
 *
 * ⚠️ `policy_hold` IS OURS AND THE REST ARE THE RULES'. An operator seeing "blocked" needs to know whether a
 * colleague stopped it or the platform did, because only one of those is theirs to release.
 */
export const PAYOUT_BLOCK_COPY: Record<string, string> = {
  payout_not_found: 'The payout record is missing',
  obligation_not_funded: 'The obligation is not funded',
  work_not_completed: 'The work is not marked complete',
  refund_pending_or_completed: 'A refund is in flight or settled',
  dispute_not_cleared: 'A chargeback is unresolved',
  verified_payout_destination_required: 'No verified payout destination',
  policy_hold: 'A policy hold is in force',
  transfer_failed: 'The last transfer failed',
  refund_pending: 'A refund is in flight',
  dispute_open: 'A dispute is open',
};

export const CHARGEBACK_RESOLUTIONS = [
  'cleared_for_payout',
  'provider_liable',
  'customer_liable',
  'pending_further_evidence',
] as const;

export const CHARGEBACK_RESOLUTION_COPY: Record<string, string> = {
  cleared_for_payout: 'Cleared — the payout may proceed',
  provider_liable: 'The provider is liable for the chargeback',
  customer_liable: 'Decided in the customer\u2019s favour',
  pending_further_evidence: 'Waiting on more evidence',
};
