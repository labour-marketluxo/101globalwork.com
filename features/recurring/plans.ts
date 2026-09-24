import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cadenceValue, planStatus, type Cadence, type PlanStatus } from '@/features/recurring/copy';

/**
 * The read layer for /recurring.
 *
 * ⚠️ ONE COMMAND ANSWERS FOR BOTH ROLES. A plan is read by its customer and by its provider, and the shape is
 * the same for each with a `role` field — so the page renders one set of facts and the actions differ by role,
 * rather than two divergent views of the same arrangement.
 *
 * ⚠️ THE PLAN'S PRICE IS DATA, NOT AN INSTRUCTION. Nothing in this module treats `amountMinor` as something to
 * charge; see the disclosure in copy.ts for what the page tells the reader about it.
 */

export type Visit = {
  sequence: number;
  scheduledFor: string;
  state: string;
  note: string | null;
};

export type CadenceRequest = {
  id: string;
  requestedCadence: Cadence;
  requestedStartOn: string | null;
  reason: string;
  requestedByRole: 'customer' | 'provider';
  requestedAt: string | null;
};

export type RecurringPlan = {
  id: string;
  reference: string;
  role: 'customer' | 'provider';
  title: string;
  cadence: Cadence;
  billingBasis: string;
  amountMinor: number;
  currencyCode: string;
  locationLabel: string;
  assetLabel: string | null;
  status: PlanStatus;
  startsOn: string | null;
  nextExecutionOn: string | null;
  daysUntilNext: number | null;
  pausedAt: string | null;
  pauseReason: string | null;
  endedOn: string | null;
  endReason: string | null;
  notes: string | null;
  providerName: string;
  providerId: string;
  projectLabel: string | null;
  projectHref: string | null;
  visits: Visit[];
  completedVisits: number;
  openRequest: CadenceRequest | null;
};

export type RecurringOption = { id: string; label: string; detail: string };

export type RecurringRead = {
  available: boolean;
  plans: RecurringPlan[];
  providers: RecurringOption[];
  assets: RecurringOption[];
  projects: RecurringOption[];
  /** What a new plan should price in, from the market the account operates in. */
  defaultCurrency: string;
  billingNote: string;
};

const UNAVAILABLE: RecurringRead = {
  available: false,
  plans: [],
  providers: [],
  assets: [],
  projects: [],
  defaultCurrency: 'NGN',
  billingNote: '',
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function toOption(row: Raw): RecurringOption | null {
  const id = textFrom(row.id);
  const label = textFrom(row.label);
  if (!id || !label) return null;
  return { id, label, detail: textFrom(row.detail) ?? '' };
}

function toVisit(row: Raw): Visit | null {
  const scheduledFor = textFrom(row.scheduledFor);
  const sequence = numberFrom(row.sequence);
  if (!scheduledFor || sequence <= 0) return null;
  return { sequence, scheduledFor, state: textFrom(row.state) ?? 'scheduled', note: textFrom(row.note) };
}

function toPlan(row: Raw): RecurringPlan | null {
  const id = textFrom(row.id);
  const title = textFrom(row.title);
  const reference = textFrom(row.reference);
  if (!id || !title || !reference) return null;

  const request = row.openRequest && typeof row.openRequest === 'object' ? objectFrom(row.openRequest) : null;

  return {
    id,
    reference,
    role: row.role === 'provider' ? 'provider' : 'customer',
    title,
    cadence: cadenceValue(textFrom(row.cadence)),
    billingBasis: textFrom(row.billingBasis) ?? 'per_visit',
    amountMinor: numberFrom(row.amountMinor),
    currencyCode: textFrom(row.currencyCode) ?? 'NGN',
    locationLabel: textFrom(row.locationLabel) ?? '',
    assetLabel: textFrom(row.assetLabel),
    status: planStatus(textFrom(row.status)),
    startsOn: textFrom(row.startsOn),
    nextExecutionOn: textFrom(row.nextExecutionOn),
    daysUntilNext: row.daysUntilNext === null || row.daysUntilNext === undefined ? null : numberFrom(row.daysUntilNext),
    pausedAt: textFrom(row.pausedAt),
    pauseReason: textFrom(row.pauseReason),
    endedOn: textFrom(row.endedOn),
    endReason: textFrom(row.endReason),
    notes: textFrom(row.notes),
    providerName: textFrom(row.providerName) ?? 'A provider',
    providerId: textFrom(row.providerId) ?? '',
    projectLabel: textFrom(row.projectLabel),
    projectHref: textFrom(row.projectHref),
    visits: rowsFrom(row.visits)
      .map(toVisit)
      .filter((visit): visit is Visit => visit !== null),
    completedVisits: numberFrom(row.completedVisits),
    openRequest: request
      ? {
          id: textFrom(request.id) ?? '',
          requestedCadence: cadenceValue(textFrom(request.requestedCadence)),
          requestedStartOn: textFrom(request.requestedStartOn),
          reason: textFrom(request.reason) ?? '',
          requestedByRole: request.requestedByRole === 'provider' ? 'provider' : 'customer',
          requestedAt: textFrom(request.requestedAt),
        }
      : null,
  };
}

export async function getMyRecurringPlans(): Promise<RecurringRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_recurring_plans_command');

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[recurring] could not read the plans: ${error.message}`);
    }
    return UNAVAILABLE;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return UNAVAILABLE;

  return {
    available: true,
    plans: rowsFrom(raw.plans)
      .map(toPlan)
      .filter((plan): plan is RecurringPlan => plan !== null),
    providers: rowsFrom(raw.providers)
      .map(toOption)
      .filter((option): option is RecurringOption => option !== null),
    assets: rowsFrom(raw.assets)
      .map(toOption)
      .filter((option): option is RecurringOption => option !== null),
    projects: rowsFrom(raw.projects)
      .map(toOption)
      .filter((option): option is RecurringOption => option !== null),
    defaultCurrency: textFrom(raw.defaultCurrency) ?? 'NGN',
    billingNote: textFrom(raw.billingNote) ?? '',
  };
}
