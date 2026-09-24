/**
 * The programmes vocabulary: state labels, role labels, and the failure vocabulary the actions map onto.
 */

export const PROGRAMME_KIND_COPY: Record<string, string> = {
  workforce_development: 'Workforce development',
  grant_funded: 'Grant funded',
  certified_pool: 'Certified provider pool',
};

export const PROGRAMME_STATUS_COPY: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
  active: { label: 'Active', className: 'bg-primary-subtle text-primary' },
  paused: { label: 'Paused', className: 'bg-secondary-light text-amber-800' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-500' },
};

export const ROLE_COPY: Record<string, { label: string; explains: string }> = {
  owner: { label: 'Owner', explains: 'Full control, including the worker pool, consent records and allocations.' },
  manager: { label: 'Manager', explains: 'Enrols workers, allocates them to projects and records consent.' },
  verifier: { label: 'Verifier', explains: 'Reads the pool and decides credentials, and sees pseudonyms rather than names.' },
  analyst: { label: 'Analyst', explains: 'Reads the pool as pseudonyms and the aggregate dashboards.' },
  platform: { label: 'Platform support', explains: 'Reads the programme for support purposes, and never sees a worker identity.' },
};

export const WORKER_STATE_COPY: Record<string, { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'bg-slate-100 text-slate-600' },
  enrolled: { label: 'Enrolled', className: 'bg-slate-100 text-slate-700' },
  active: { label: 'Active', className: 'bg-primary-subtle text-primary' },
  completed: { label: 'Completed', className: 'bg-primary-subtle text-primary' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-500' },
};

export const CREDENTIAL_KIND_COPY: Record<string, string> = {
  identity: 'Identity',
  trade_licence: 'Trade licence',
  insurance: 'Insurance',
  safety_training: 'Safety training',
  certificate: 'Certificate',
};

export const CREDENTIAL_STATE_COPY: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-secondary-light text-amber-800' },
  verified: { label: 'Verified', className: 'bg-primary-subtle text-primary' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700' },
  expired: { label: 'Expired', className: 'bg-slate-100 text-slate-500' },
};

export const CONSENT_SCOPE_COPY: Record<string, string> = {
  programme: 'The whole programme',
  project: 'One project',
};

export const CONSENT_SOURCE_COPY: Record<string, string> = {
  worker: 'Given by the worker from their own account',
  recorded_offline: 'Recorded by a steward from an offline consent',
  platform: 'Recorded by platform support',
};

export const COHORT_STATUS_COPY: Record<string, string> = {
  planned: 'Planned',
  running: 'Running',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PROGRAMME_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'not_found',
  'duplicate_worker',
  'consent_withheld',
  'no_consent',
  'unavailable',
] as const;
export type ProgrammeFailureCode = (typeof PROGRAMME_FAILURE_CODES)[number];

export const PROGRAMME_FAILURE_COPY: Record<ProgrammeFailureCode, string> = {
  not_authorized: 'Your role on this programme does not allow that, so nothing was changed.',
  bad_request: 'That request was missing something it needed, or carried a value the platform does not accept.',
  not_found: 'That programme, worker, project or credential could not be found. Reload to see the current record.',
  duplicate_worker: 'That account is already enrolled in this programme.',
  consent_withheld:
    'This worker has an account here, so only they can consent — or platform support can record a consent given on paper. A steward cannot grant it for them.',
  no_consent: 'There is no active consent to revoke.',
  unavailable: 'The change could not be completed. Nothing was changed — try again.',
};

export function programmeFailureCode(value: string | undefined | null): ProgrammeFailureCode | null {
  if (!value) return null;
  return (PROGRAMME_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as ProgrammeFailureCode)
    : null;
}

export const PROGRAMME_SUCCESS_CODES = ['enrolled', 'credential', 'allocated', 'consent', 'consent_revoked'] as const;
export type ProgrammeSuccessCode = (typeof PROGRAMME_SUCCESS_CODES)[number];

export const PROGRAMME_SUCCESS_COPY: Record<ProgrammeSuccessCode, string> = {
  enrolled:
    'The worker is enrolled under a pseudonym. Their name is not shown to anybody until they consent, and consent is per programme or per project.',
  credential: 'The credential decision is recorded against the worker.',
  allocated:
    'The worker is allocated to that project. If they have consented for it, the project parties now see their name rather than their pseudonym.',
  consent:
    'The consent is recorded with who recorded it, when, and what it covers. It can be revoked on this page and the revocation is kept.',
  consent_revoked: 'The consent is revoked. Any page that was showing a name under it goes back to the pseudonym.',
};

export function programmeSuccessCode(value: string | undefined | null): ProgrammeSuccessCode | null {
  if (!value) return null;
  return (PROGRAMME_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as ProgrammeSuccessCode)
    : null;
}

export function formatMinor(amountMinor: number, currencyCode: string): string {
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}
