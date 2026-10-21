/**
 * The recurring workspace's vocabulary.
 *
 * The database returns enums; the words live here, once each, so the list, the forms and the notices cannot
 * describe the same plan differently.
 */

export const CADENCES = ['weekly', 'monthly', 'quarterly'] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_COPY: Record<Cadence, { label: string; adverb: string }> = {
  weekly: { label: 'Weekly', adverb: 'every week' },
  monthly: { label: 'Monthly', adverb: 'every month' },
  quarterly: { label: 'Quarterly', adverb: 'every three months' },
};

export function cadenceValue(value: string | null | undefined): Cadence {
  return (CADENCES as readonly string[]).includes(String(value)) ? (value as Cadence) : 'monthly';
}

export const PLAN_STATUSES = ['active', 'paused', 'ended'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_COPY: Record<PlanStatus, { label: string; className: string; explains: string }> = {
  active: {
    label: 'Active',
    className: 'bg-primary-subtle text-primary',
    explains: 'The schedule is running and the next visit is on the calendar.',
  },
  paused: {
    label: 'Paused',
    className: 'bg-secondary-light text-amber-800',
    explains:
      'No visits are expected while it is paused. The dates are kept rather than thrown away, and resuming moves the next one to the first date that is not in the past.',
  },
  ended: {
    label: 'Ended',
    className: 'bg-slate-100 text-slate-500',
    explains: 'The arrangement is over. Its record stays here; no further visits are scheduled.',
  },
};

export function planStatus(value: string | null | undefined): PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(String(value)) ? (value as PlanStatus) : 'active';
}

export const BILLING_BASIS_COPY: Record<string, string> = {
  per_visit: 'per visit',
  per_period: 'per billing period',
};

export const VISIT_STATE_COPY: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-slate-100 text-slate-600' },
  completed: { label: 'Recorded as done', className: 'bg-primary-subtle text-primary' },
  skipped: { label: 'Skipped', className: 'bg-secondary-light text-amber-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400' },
};

/**
 * ⚠️ THE ONE SENTENCE THIS FEATURE MUST NOT SOFTEN.
 *
 * A plan records an agreed price. The platform has no card on file, no mandate and no charging job, so it does
 * not take that money automatically — and a scheduler that implied otherwise would be describing a recurring
 * charge nobody authorised. Work that is carried out is funded on its project, through the same agreement and
 * payment path as any other job.
 */
export const BILLING_DISCLOSURE =
  'The agreed price is recorded on the plan; the platform does not charge it automatically. There is no card on file and no mandate, so work that is actually carried out is funded on its project through the normal agreement and payment path.';

export const RECURRING_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'not_found',
  'no_history',
  'ended',
  'pending_request',
  'already_decided',
  'unavailable',
] as const;
export type RecurringFailureCode = (typeof RECURRING_FAILURE_CODES)[number];

export const RECURRING_FAILURE_COPY: Record<RecurringFailureCode, string> = {
  not_authorized: 'That plan does not belong to this account, so nothing was changed.',
  bad_request: 'That request was missing something it needed, or carried a value the platform does not accept.',
  not_found: 'That plan could not be found on this account. Reload the list to see your plans.',
  no_history:
    'A recurring plan can only be created with a provider you have already worked with on this platform. There is no assignment between the two accounts, so this one was refused.',
  ended: 'That plan has ended. Its record stays, but its schedule cannot be restarted — a new arrangement is a new plan.',
  pending_request: 'There is already a cadence change waiting for a decision on that plan.',
  already_decided: 'That cadence request has already been answered.',
  unavailable: 'The change could not be completed. Nothing was changed — try again.',
};

export function recurringFailureCode(value: string | undefined | null): RecurringFailureCode | null {
  if (!value) return null;
  return (RECURRING_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as RecurringFailureCode)
    : null;
}

export const RECURRING_SUCCESS_CODES = ['created', 'paused', 'resumed', 'ended', 'requested', 'accepted', 'declined'] as const;
export type RecurringSuccessCode = (typeof RECURRING_SUCCESS_CODES)[number];

export const RECURRING_SUCCESS_COPY: Record<RecurringSuccessCode, string> = {
  created: 'The plan is active and its first six visits are on the calendar.',
  paused: 'The plan is paused. No visits are expected until it is resumed, and the dates have been kept.',
  resumed: 'The plan is active again, and the next visit has been moved to the first date that is not in the past.',
  ended: 'The plan has ended and its upcoming visits were removed. Completed and skipped visits stay in the record.',
  requested: 'The cadence change has been sent for a decision. The cadence in force stays in force until the other side answers.',
  accepted: 'The cadence change was accepted, the plan was updated, and the forward calendar was rebuilt.',
  declined: 'The cadence change was declined. The plan and its schedule are unchanged.',
};

export function recurringSuccessCode(value: string | undefined | null): RecurringSuccessCode | null {
  if (!value) return null;
  return (RECURRING_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as RecurringSuccessCode)
    : null;
}

/** Minor units, as money. Kept here so the plan card and the form agree on how a price is written. */
export function formatMinor(amountMinor: number, currencyCode: string): string {
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unknown currency code must not take a page down; the amount and the code are still the truth.
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}
