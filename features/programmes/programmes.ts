import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EMPTY_CELL, type PrivacyCell, type PrivacyRate, type PrivacySummary } from '@/features/programmes/privacy';

/**
 * The read layer for the programme surfaces.
 *
 * ⚠️ ONE PARSER FOR A PRIVACY CELL, USED BY EVERY PAGE. The suppressed flag and the value travel together, and
 * the parser is the only place that decides what a malformed payload means. If a page had its own reading of
 * `{suppressed, value}`, a page could end up rendering a value the server withheld — which is the one mistake
 * that would quietly undo the whole feature.
 *
 * ⚠️ THE PARSER FAILS CLOSED. Anything it cannot read confidently — a missing flag, a value with no cell around
 * it, a number where a cell was expected — becomes a suppressed cell. A malformed payload must never be more
 * revealing than a well-formed one.
 */

export type ProgrammeSummaryFields = {
  id: string;
  reference: string;
  name: string;
  kind: string;
  status: string;
  regionLabel: string;
  fundingSource: string | null;
  startsOn: string | null;
  endsOn: string | null;
  summary: string | null;
  budgetMinor: number | null;
  currencyCode: string | null;
};

export type ProgrammeContextRead = {
  available: boolean;
  allowed: boolean;
  role: string | null;
  rank: number;
  programme: ProgrammeSummaryFields | null;
};

export type ProgrammeCohort = {
  id: string;
  name: string;
  status: string;
  capacity: number | null;
  startsOn: string | null;
  endsOn: string | null;
  size: PrivacyCell;
  completed: PrivacyCell;
  progress: PrivacyRate;
};

export type ProgrammeProject = {
  assignmentId: string;
  label: string;
  status: string;
  allocated: PrivacyCell;
  allocatedAt: string | null;
};

export type BudgetLine = {
  label: string;
  amountMinor: number;
  currencyCode: string;
  allocatedOn: string | null;
  note: string | null;
};

export type ProgrammeDashboardRead = {
  available: boolean;
  allowed: boolean;
  role: string | null;
  rank: number;
  programme: ProgrammeSummaryFields | null;
  participation: {
    enrolled: PrivacyCell;
    active: PrivacyCell;
    completed: PrivacyCell;
    withdrawn: PrivacyCell;
    progress: PrivacyRate;
  };
  cohorts: ProgrammeCohort[];
  projects: ProgrammeProject[];
  budget: { allocatedMinor: number | null; currencyCode: string | null; lines: BudgetLine[] };
  privacy: PrivacySummary;
  advisory: string;
};

export type WorkerCredential = {
  id: string;
  kind: string;
  reference: string | null;
  state: string;
  issuedOn: string | null;
  expiresOn: string | null;
  verifiedAt: string | null;
  decisionNote: string | null;
};

export type WorkerAllocation = {
  assignmentId: string;
  roleLabel: string;
  projectLabel: string;
  allocatedAt: string | null;
  endedAt: string | null;
};

export type WorkerConsent = {
  id: string;
  scope: string;
  assignmentId: string | null;
  purpose: string;
  grantSource: string;
  grantedAt: string | null;
  revokedAt: string | null;
};

export type ProgrammeWorker = {
  id: string;
  pseudonym: string;
  state: string;
  stateNote: string | null;
  regionLabel: string;
  skills: string[];
  hasAccount: boolean;
  cohortId: string | null;
  cohortName: string | null;
  enrolledAt: string | null;
  identity: {
    revealed: boolean;
    basis: string | null;
    name: string | null;
    email: string | null;
    consentedAt: string | null;
    note: string | null;
  };
  credentials: WorkerCredential[];
  allocations: WorkerAllocation[];
  consents: WorkerConsent[];
};

export type ProgrammeWorkersRead = {
  available: boolean;
  allowed: boolean;
  role: string | null;
  rank: number;
  canEnrol: boolean;
  canVerify: boolean;
  canAssign: boolean;
  canManageConsent: boolean;
  workers: ProgrammeWorker[];
  cohorts: { id: string; name: string; status: string; capacity: number | null }[];
  /** Projects this programme has been brought onto. The only places a worker may be allocated. */
  projects: { assignmentId: string; label: string; status: string; linkedAt: string | null }[];
  /** Projects the caller is personally a party to, so a link can be made without typing an id. */
  linkableProjects: { assignmentId: string; label: string; status: string }[];
  consentNote: string;
};

export type ProgrammeInsightsRead = {
  available: boolean;
  allowed: boolean;
  role: string | null;
  rank: number;
  programme: { id: string; name: string; regionLabel: string } | null;
  skills: { skill: string; workers: PrivacyCell }[];
  regions: { region: string; workers: PrivacyCell }[];
  credentials: { kind: string; verified: PrivacyCell; pending: PrivacyCell; rejected: PrivacyCell }[];
  bands: { band: string; engagements: PrivacyCell }[];
  demand: { openRequests: PrivacyCell; scope: string };
  outcomes: { completion: PrivacyRate; placement: PrivacyRate };
  privacy: PrivacySummary;
  benchmarkNote: string;
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberFrom = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const boolFrom = (value: unknown): boolean => value === true;

/**
 * Fails closed. See the file header: anything unreadable becomes a withheld cell, because the alternative is a
 * page that could show a number the database refused to publish.
 */
function parseCell(value: unknown): PrivacyCell {
  const raw = objectFrom(value);
  if (raw.suppressed !== false) return EMPTY_CELL;
  const parsed = numberFrom(raw.value);
  if (parsed === null) return EMPTY_CELL;
  const reason = textFrom(raw.reason);
  return {
    suppressed: false,
    value: parsed,
    reason: (reason as PrivacyCell['reason']) ?? null,
    epsilon: numberFrom(raw.epsilon),
  };
}

function parseRate(value: unknown): PrivacyRate {
  const raw = objectFrom(value);
  const numerator = parseCell(raw.numerator);
  const denominator = parseCell(raw.denominator);
  if (raw.suppressed === true) {
    return { suppressed: true, percent: null, numerator, denominator, reason: textFrom(raw.reason) };
  }
  const percent = numberFrom(raw.percent);
  if (percent === null) {
    return { suppressed: true, percent: null, numerator, denominator, reason: 'component_below_threshold' };
  }
  return { suppressed: false, percent, numerator, denominator, reason: null };
}

function parsePrivacy(value: unknown): PrivacySummary {
  const raw = objectFrom(value);
  return {
    minGroupSize: numberFrom(raw.minGroupSize) ?? 0,
    epsilon: numberFrom(raw.epsilon) ?? 0,
    roundingUnit: numberFrom(raw.roundingUnit) ?? 1,
    cellsPublished: numberFrom(raw.cellsPublished) ?? 0,
    cellsWithheld: numberFrom(raw.cellsWithheld) ?? 0,
    epsilonSpent: numberFrom(raw.epsilonSpent) ?? 0,
    notice: textFrom(raw.notice) ?? undefined,
    limitation: textFrom(raw.limitation) ?? undefined,
  };
}

function parseProgramme(value: unknown): ProgrammeSummaryFields | null {
  const raw = objectFrom(value);
  const id = textFrom(raw.id);
  const name = textFrom(raw.name);
  if (!id || !name) return null;
  return {
    id,
    reference: textFrom(raw.reference) ?? '',
    name,
    kind: textFrom(raw.kind) ?? 'workforce_development',
    status: textFrom(raw.status) ?? 'draft',
    regionLabel: textFrom(raw.regionLabel) ?? '',
    fundingSource: textFrom(raw.fundingSource),
    startsOn: textFrom(raw.startsOn),
    endsOn: textFrom(raw.endsOn),
    summary: textFrom(raw.summary),
    budgetMinor: numberFrom(raw.budgetMinor),
    currencyCode: textFrom(raw.currencyCode),
  };
}

const DENIED_CONTEXT: ProgrammeContextRead = { available: true, allowed: false, role: null, rank: -1, programme: null };

export async function getProgrammeContext(programmeId: string): Promise<ProgrammeContextRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_programme_context_command', { p_programme_id: programmeId });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[programmes] could not read the programme context: ${error.message}`);
    }
    return { available: false, allowed: false, role: null, rank: -1, programme: null };
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return DENIED_CONTEXT;

  return {
    available: true,
    allowed: true,
    role: textFrom(raw.role),
    rank: numberFrom(raw.rank) ?? -1,
    programme: parseProgramme(raw.programme),
  };
}

export async function getProgrammeDashboard(programmeId: string): Promise<ProgrammeDashboardRead> {
  const empty: ProgrammeDashboardRead = {
    available: false,
    allowed: false,
    role: null,
    rank: -1,
    programme: null,
    participation: {
      enrolled: EMPTY_CELL,
      active: EMPTY_CELL,
      completed: EMPTY_CELL,
      withdrawn: EMPTY_CELL,
      progress: { suppressed: true, percent: null, numerator: EMPTY_CELL, denominator: EMPTY_CELL, reason: 'no_data' },
    },
    cohorts: [],
    projects: [],
    budget: { allocatedMinor: null, currencyCode: null, lines: [] },
    privacy: { minGroupSize: 0, epsilon: 0, roundingUnit: 1, cellsPublished: 0, cellsWithheld: 0, epsilonSpent: 0 },
    advisory: '',
  };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_programme_dashboard_command', { p_programme_id: programmeId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[programmes] could not read the dashboard: ${error.message}`);
    }
    return empty;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { ...empty, available: true };

  const participation = objectFrom(raw.participation);
  const budget = objectFrom(raw.budget);

  return {
    available: true,
    allowed: true,
    role: textFrom(raw.role),
    rank: numberFrom(raw.rank) ?? -1,
    programme: parseProgramme(raw.programme),
    participation: {
      enrolled: parseCell(participation.enrolled),
      active: parseCell(participation.active),
      completed: parseCell(participation.completed),
      withdrawn: parseCell(participation.withdrawn),
      progress: parseRate(participation.progress),
    },
    cohorts: rowsFrom(raw.cohorts).map((row) => ({
      id: textFrom(row.id) ?? '',
      name: textFrom(row.name) ?? 'Cohort',
      status: textFrom(row.status) ?? 'planned',
      capacity: numberFrom(row.capacity),
      startsOn: textFrom(row.startsOn),
      endsOn: textFrom(row.endsOn),
      size: parseCell(row.size),
      completed: parseCell(row.completed),
      progress: parseRate(row.progress),
    })),
    projects: rowsFrom(raw.projects).map((row) => ({
      assignmentId: textFrom(row.assignmentId) ?? '',
      label: textFrom(row.label) ?? 'A project',
      status: textFrom(row.status) ?? 'active',
      allocated: parseCell(row.allocated),
      allocatedAt: textFrom(row.allocatedAt),
    })),
    budget: {
      allocatedMinor: numberFrom(budget.allocatedMinor),
      currencyCode: textFrom(budget.currencyCode),
      lines: rowsFrom(budget.lines).map((line) => ({
        label: textFrom(line.label) ?? 'Allocation',
        amountMinor: numberFrom(line.amountMinor) ?? 0,
        currencyCode: textFrom(line.currencyCode) ?? 'NGN',
        allocatedOn: textFrom(line.allocatedOn),
        note: textFrom(line.note),
      })),
    },
    privacy: parsePrivacy(raw.privacy),
    advisory: textFrom(raw.privacyAdvisory) ?? '',
  };
}

export async function getProgrammeWorkers(programmeId: string): Promise<ProgrammeWorkersRead> {
  const empty: ProgrammeWorkersRead = {
    available: false,
    allowed: false,
    role: null,
    rank: -1,
    canEnrol: false,
    canVerify: false,
    canAssign: false,
    canManageConsent: false,
    workers: [],
    cohorts: [],
    projects: [],
    linkableProjects: [],
    consentNote: '',
  };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_programme_workers_command', { p_programme_id: programmeId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[programmes] could not read the worker registry: ${error.message}`);
    }
    return empty;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { ...empty, available: true };

  return {
    available: true,
    allowed: true,
    role: textFrom(raw.role),
    rank: numberFrom(raw.rank) ?? -1,
    canEnrol: boolFrom(raw.canEnrol),
    canVerify: boolFrom(raw.canVerify),
    canAssign: boolFrom(raw.canAssign),
    canManageConsent: boolFrom(raw.canManageConsent),
    workers: rowsFrom(raw.workers).map((row) => {
      const identity = objectFrom(row.identity);
      const revealed = identity.revealed === true;
      return {
        id: textFrom(row.id) ?? '',
        pseudonym: textFrom(row.pseudonym) ?? 'WRK-UNKNOWN',
        state: textFrom(row.state) ?? 'enrolled',
        stateNote: textFrom(row.stateNote),
        regionLabel: textFrom(row.regionLabel) ?? '',
        skills: Array.isArray(row.skills) ? row.skills.filter((s): s is string => typeof s === 'string') : [],
        hasAccount: boolFrom(row.hasAccount),
        cohortId: textFrom(row.cohortId),
        cohortName: textFrom(row.cohortName),
        enrolledAt: textFrom(row.enrolledAt),
        identity: {
          revealed,
          basis: textFrom(identity.basis),
          // ⚠️ FAILS CLOSED HERE TOO: a name is only carried through when the server said it was revealed.
          name: revealed ? textFrom(identity.name) : null,
          email: revealed ? textFrom(identity.email) : null,
          consentedAt: revealed ? textFrom(identity.consentedAt) : null,
          note: textFrom(identity.note),
        },
        credentials: rowsFrom(row.credentials).map((credential) => ({
          id: textFrom(credential.id) ?? '',
          kind: textFrom(credential.kind) ?? 'certificate',
          reference: textFrom(credential.reference),
          state: textFrom(credential.state) ?? 'pending',
          issuedOn: textFrom(credential.issuedOn),
          expiresOn: textFrom(credential.expiresOn),
          verifiedAt: textFrom(credential.verifiedAt),
          decisionNote: textFrom(credential.decisionNote),
        })),
        allocations: rowsFrom(row.allocations).map((allocation) => ({
          assignmentId: textFrom(allocation.assignmentId) ?? '',
          roleLabel: textFrom(allocation.roleLabel) ?? '',
          projectLabel: textFrom(allocation.projectLabel) ?? 'A project',
          allocatedAt: textFrom(allocation.allocatedAt),
          endedAt: textFrom(allocation.endedAt),
        })),
        consents: rowsFrom(row.consents).map((consent) => ({
          id: textFrom(consent.id) ?? '',
          scope: textFrom(consent.scope) ?? 'programme',
          assignmentId: textFrom(consent.assignmentId),
          purpose: textFrom(consent.purpose) ?? '',
          grantSource: textFrom(consent.grantSource) ?? 'recorded_offline',
          grantedAt: textFrom(consent.grantedAt),
          revokedAt: textFrom(consent.revokedAt),
        })),
      } satisfies ProgrammeWorker;
    }),
    cohorts: rowsFrom(raw.cohorts).map((cohort) => ({
      id: textFrom(cohort.id) ?? '',
      name: textFrom(cohort.name) ?? 'Cohort',
      status: textFrom(cohort.status) ?? 'planned',
      capacity: numberFrom(cohort.capacity),
    })),
    projects: rowsFrom(raw.projects).map((project) => ({
      assignmentId: textFrom(project.assignmentId) ?? '',
      label: textFrom(project.label) ?? 'A project',
      status: textFrom(project.status) ?? 'active',
      linkedAt: textFrom(project.linkedAt),
    })),
    linkableProjects: rowsFrom(raw.linkableProjects).map((project) => ({
      assignmentId: textFrom(project.assignmentId) ?? '',
      label: textFrom(project.label) ?? 'A project',
      status: textFrom(project.status) ?? 'active',
    })),
    consentNote: textFrom(raw.consentNote) ?? '',
  };
}

export async function getProgrammeInsights(programmeId: string): Promise<ProgrammeInsightsRead> {
  const empty: ProgrammeInsightsRead = {
    available: false,
    allowed: false,
    role: null,
    rank: -1,
    programme: null,
    skills: [],
    regions: [],
    credentials: [],
    bands: [],
    demand: { openRequests: EMPTY_CELL, scope: '' },
    outcomes: {
      completion: { suppressed: true, percent: null, numerator: EMPTY_CELL, denominator: EMPTY_CELL, reason: 'no_data' },
      placement: { suppressed: true, percent: null, numerator: EMPTY_CELL, denominator: EMPTY_CELL, reason: 'no_data' },
    },
    privacy: { minGroupSize: 0, epsilon: 0, roundingUnit: 1, cellsPublished: 0, cellsWithheld: 0, epsilonSpent: 0 },
    benchmarkNote: '',
  };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_programme_insights_command', { p_programme_id: programmeId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[programmes] could not read the labour insights: ${error.message}`);
    }
    return empty;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { ...empty, available: true };

  const demand = objectFrom(raw.demand);
  const outcomes = objectFrom(raw.outcomes);
  const programme = objectFrom(raw.programme);

  return {
    available: true,
    allowed: true,
    role: textFrom(raw.role),
    rank: numberFrom(raw.rank) ?? -1,
    programme: textFrom(programme.id)
      ? { id: textFrom(programme.id) ?? '', name: textFrom(programme.name) ?? '', regionLabel: textFrom(programme.regionLabel) ?? '' }
      : null,
    skills: rowsFrom(raw.skills).map((row) => ({ skill: textFrom(row.skill) ?? '', workers: parseCell(row.workers) })),
    regions: rowsFrom(raw.regions).map((row) => ({ region: textFrom(row.region) ?? '', workers: parseCell(row.workers) })),
    credentials: rowsFrom(raw.credentials).map((row) => ({
      kind: textFrom(row.kind) ?? 'certificate',
      verified: parseCell(row.verified),
      pending: parseCell(row.pending),
      rejected: parseCell(row.rejected),
    })),
    bands: rowsFrom(raw.bands).map((row) => ({ band: textFrom(row.band) ?? '', engagements: parseCell(row.engagements) })),
    demand: { openRequests: parseCell(demand.openRequests), scope: textFrom(demand.scope) ?? '' },
    outcomes: { completion: parseRate(outcomes.completion), placement: parseRate(outcomes.placement) },
    privacy: parsePrivacy(raw.privacy),
    benchmarkNote: textFrom(raw.benchmarkNote) ?? '',
  };
}
