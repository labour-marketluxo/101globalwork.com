/**
 * The support workspace's vocabulary.
 *
 * The database returns enums; the words live here, in one map each, so the list, the detail page and the
 * forms cannot describe the same case differently.
 */

export const SUPPORT_STATUSES = ['open', 'awaiting_response', 'investigating', 'resolved', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * Status pills.
 *
 * ⚠️ THE COLOURS ARE NOT DECORATION — they are the only thing that distinguishes "we are waiting on you" from
 * "we are working on it", and both of those read as "open" in a plain list. Each pill also carries its words,
 * because a colour is not a label.
 */
export const STATUS_COPY: Record<SupportStatus, { label: string; className: string; explains: string }> = {
  open: {
    label: 'Open',
    className: 'bg-primary-subtle text-primary',
    explains: 'The case is open and nobody has replied yet, or you have just replied and it is being read.',
  },
  awaiting_response: {
    label: 'Awaiting your reply',
    className: 'bg-secondary-light text-amber-800',
    explains: 'The platform has replied and is waiting on you before it can go further.',
  },
  investigating: {
    label: 'Investigating',
    className: 'bg-slate-200 text-slate-700',
    explains: 'Somebody is looking into it. This is set by the platform, not by you.',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-primary-subtle text-primary',
    explains:
      'The platform considers this answered. If it is not, reply to the case — doing so reopens it and records that the resolution did not hold.',
  },
  closed: {
    label: 'Closed',
    className: 'bg-slate-100 text-slate-500',
    explains:
      'Closed cases are final and cannot be replied to. A new problem is a new case, which is what keeps the record of the old one readable.',
  },
};

export function supportStatus(value: string | null | undefined): SupportStatus | null {
  return (SUPPORT_STATUSES as readonly string[]).includes(String(value)) ? (value as SupportStatus) : null;
}

export const KIND_COPY: Record<string, string> = {
  general: 'Something else',
  project: 'A project',
  payment: 'A payment',
  account: 'My account',
  verification: 'Verification',
  safety: 'A safety concern',
};

export const PRIORITY_COPY: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/**
 * The service-level state, in the terms the page prints.
 *
 * ⚠️ "ON TRACK" IS SAID ONLY WHEN IT IS. The database computes this from the two deadlines and the reply
 * timestamps; the page renders the sentence rather than deriving one, so a case that has slipped its
 * first-response deadline cannot be described as on-track by a component that forgot to check.
 */
export const SLA_COPY: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'done' }> = {
  on_track: { label: 'Within the target', tone: 'ok' },
  first_response_due_soon: { label: 'A reply is due soon', tone: 'warn' },
  resolution_due_soon: { label: 'Resolution target is close', tone: 'warn' },
  first_response_overdue: { label: 'Reply target has passed', tone: 'bad' },
  resolution_overdue: { label: 'Resolution target has passed', tone: 'bad' },
  met: { label: 'Target met', tone: 'done' },
  closed: { label: 'Closed', tone: 'done' },
};

export const SUPPORT_FILTERS = ['open', 'closed', 'all'] as const;
export type SupportFilter = (typeof SUPPORT_FILTERS)[number];

export const FILTER_COPY: Record<SupportFilter, string> = {
  open: 'Open cases',
  closed: 'Closed',
  all: 'All',
};

export function supportFilter(value: string | null | undefined): SupportFilter {
  return (SUPPORT_FILTERS as readonly string[]).includes(String(value))
    ? (value as SupportFilter)
    : 'open';
}

/** The kind a link may pre-select, as the help centre's safety card does with `?kind=safety`. */
export function supportKind(value: string | null | undefined): string {
  const candidate = String(value ?? '');
  return Object.prototype.hasOwnProperty.call(KIND_COPY, candidate) ? candidate : 'general';
}

export const SUPPORT_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'not_found',
  'closed_case',
  'not_resolved',
  'unavailable',
  'attachment_too_large',
  'attachment_type',
] as const;
export type SupportFailureCode = (typeof SUPPORT_FAILURE_CODES)[number];

export const SUPPORT_FAILURE_COPY: Record<SupportFailureCode, string> = {
  not_authorized: 'That case does not belong to this account, so nothing was changed.',
  bad_request: 'That request was missing something it needed. Nothing was changed.',
  not_found: 'That case could not be found on this account. Reload the list to see your cases.',
  closed_case: 'That case is closed. Closed cases are final — open a new one for a new problem.',
  not_resolved: 'Feedback can be given once a case has been resolved or closed.',
  unavailable: 'The change could not be completed. Nothing was changed — try again.',
  attachment_too_large: 'Files must be no larger than 10 MB. That one was larger, and nothing was stored.',
  attachment_type: 'That file type cannot be attached. Images, PDF, plain text and CSV are accepted.',
};

export function supportFailureCode(value: string | undefined | null): SupportFailureCode | null {
  if (!value) return null;
  return (SUPPORT_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as SupportFailureCode)
    : null;
}

export const SUPPORT_SUCCESS_CODES = ['created', 'replied', 'reopened', 'closed', 'feedback', 'attached'] as const;
export type SupportSuccessCode = (typeof SUPPORT_SUCCESS_CODES)[number];

export const SUPPORT_SUCCESS_COPY: Record<SupportSuccessCode, string> = {
  created:
    'Your case is open. The platform replies on this page, and the target for a first reply is shown below it.',
  replied: 'Your reply is on the case. It is now in the platform\u2019s queue.',
  reopened: 'Your reply reopened the case. It is back in the queue and counted as a resolution that did not hold.',
  closed: 'The case is closed. Nothing about the project or the payment it was about has changed.',
  feedback: 'Thank you — your rating is recorded against this case. You can change it by submitting again.',
  attached:
    'The file is attached to the case. It is stored privately and is download-listed only on this case.',
};

export function supportSuccessCode(value: string | undefined | null): SupportSuccessCode | null {
  if (!value) return null;
  return (SUPPORT_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as SupportSuccessCode)
    : null;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'text/csv',
];
