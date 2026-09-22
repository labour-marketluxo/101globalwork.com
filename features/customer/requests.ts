import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ClarifyQuestion } from '@/features/customer/intake';

/**
 * Reads for the customer workspace.
 *
 * The dashboard answers four questions the brief lists as cards — what is in progress, what needs a
 * decision, what is scheduled, and what is owed — and all four are answered from four tables this
 * project already has (`requests`, `quotes`, `assignments` + `assignment_schedules`,
 * `payment_obligations`). No new read model was invented for the page.
 *
 * ⚠️ THE STATUS PILLS ARE DERIVED FROM `requests.state`, NOT STORED. `state` is a documented enum with
 * a transition function behind it (`app_private.validate_request_transition`), so a pill computed from
 * it can never disagree with what the request is actually allowed to do next. A `status_label` column
 * would be one more thing to keep in step — and the two would drift the first time a transition was
 * added.
 */

export type PillTone = 'amber' | 'teal' | 'slate';

export type ActiveRequest = {
  id: string;
  needText: string;
  state: string;
  urgency: string;
  createdAt: string;
  serviceName: string | null;
  locationName: string | null;
  quoteCount: number;
  pill: { label: string; tone: PillTone };
  /** The one thing this request is waiting for, and where to do it. Null when it waits on somebody else. */
  nextAction: { label: string; detail: string } | null;
};

export type QuoteAwaitingReview = {
  quoteId: string;
  requestId: string;
  requestLabel: string;
  summary: string | null;
  totalMinor: number | null;
  currencyCode: string | null;
  validUntil: string | null;
};

export type ScheduledWork = {
  assignmentId: string;
  requestId: string;
  requestLabel: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  note: string | null;
};

export type PaymentDue = {
  obligationId: string;
  requestId: string;
  requestLabel: string;
  amountMinor: number;
  currencyCode: string;
  status: string;
};

export type CustomerDashboard = {
  active: ActiveRequest[];
  quotesAwaitingReview: QuoteAwaitingReview[];
  scheduled: ScheduledWork[];
  paymentsDue: PaymentDue[];
  awaitingApproval: ActiveRequest[];
  drafts: ActiveRequest[];
  /** No request has ever been created — the guided banner replaces the empty grid on the dashboard. */
  isNewCustomer: boolean;
  /** The list could not be read at all. Different from "you have nothing on", and said differently. */
  unavailable: boolean;
};

const ACTIVE_STATES = [
  'draft',
  'submitted',
  'matching',
  'quoted',
  'accepted',
  'scheduled',
  'in_progress',
  'submitted_for_approval',
  'disputed',
] as const;

const PILLS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  submitted: { label: 'Matching', tone: 'amber' },
  matching: { label: 'Matching', tone: 'amber' },
  quoted: { label: 'Quotes ready', tone: 'amber' },
  accepted: { label: 'Provider chosen', tone: 'teal' },
  scheduled: { label: 'Scheduled', tone: 'teal' },
  in_progress: { label: 'In progress', tone: 'teal' },
  submitted_for_approval: { label: 'Waiting for you', tone: 'amber' },
  completed: { label: 'Completed', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  disputed: { label: 'In dispute', tone: 'amber' },
};

function pillFor(state: string): { label: string; tone: PillTone } {
  return PILLS[state] ?? { label: state.replace(/_/g, ' '), tone: 'slate' };
}

function nextActionFor(state: string, quoteCount: number): ActiveRequest['nextAction'] {
  switch (state) {
    case 'draft':
      return { label: 'Finish and submit', detail: 'This is saved but nobody has seen it yet.' };
    case 'quoted':
      return quoteCount > 0
        ? { label: 'Review quotes', detail: `${quoteCount} quote${quoteCount === 1 ? '' : 's'} waiting for a decision.` }
        : { label: 'Awaiting quotes', detail: 'Providers are preparing quotes.' };
    case 'submitted_for_approval':
      return { label: 'Approve the work', detail: 'Your provider says the work is done. Release payment only when you agree.' };
    case 'disputed':
      return { label: 'Open the dispute', detail: 'This request is being looked at.' };
    case 'completed':
      return null;
    default:
      return null;
  }
}

export async function getCustomerDashboard(): Promise<CustomerDashboard> {
  const empty: CustomerDashboard = {
    active: [], quotesAwaitingReview: [], scheduled: [], paymentsDue: [],
    awaitingApproval: [], drafts: [], isNewCustomer: false, unavailable: false,
  };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!account?.id) return empty;

  const { data: requestRows, error } = await supabase
    .from('requests')
    .select('id,need_text,state,urgency,created_at,submitted_at,service_entity_id,location_id')
    .eq('customer_account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read requests: ${error.message}`);
    }
    return { ...empty, unavailable: true };
  }

  const requests = requestRows ?? [];
  if (requests.length === 0) return { ...empty, isNewCustomer: true };

  const requestIds = requests.map(row => row.id);

  const [{ data: quotes }, { data: assignments }, { data: obligations }, { data: services }, { data: locations }] =
    await Promise.all([
      supabase.from('quotes').select('id,request_id,status,summary,total_minor,currency_code,valid_until,submitted_at').in('request_id', requestIds),
      supabase.from('assignments').select('id,request_id,status').in('request_id', requestIds).eq('status', 'active'),
      supabase.from('payment_obligations').select('id,request_id,amount_minor,currency_code,status').in('request_id', requestIds),
      supabase.from('public_service_catalog').select('service_entity_id,display_name'),
      supabase.from('public_location_catalog').select('location_id,display_name'),
    ]);

  const assignmentIds = (assignments ?? []).map(row => row.id);
  const { data: schedules } = assignmentIds.length
    ? await supabase
        .from('assignment_schedules')
        .select('assignment_id,scheduled_start,scheduled_end,note')
        .in('assignment_id', assignmentIds)
        .order('scheduled_start', { ascending: true })
    : { data: [] };

  const serviceName = new Map((services ?? []).map(row => [row.service_entity_id, row.display_name]));
  const locationName = new Map((locations ?? []).map(row => [row.location_id, row.display_name]));

  const quotesByRequest = new Map<string, typeof quotes>();
  for (const quote of quotes ?? []) {
    quotesByRequest.set(quote.request_id, [...(quotesByRequest.get(quote.request_id) ?? []), quote]);
  }

  const labelOf = (id: string, needText: string) => needText.length > 64 ? `${needText.slice(0, 61)}…` : needText;

  const active: ActiveRequest[] = requests
    .filter(row => (ACTIVE_STATES as readonly string[]).includes(row.state))
    .map(row => {
      const submitted = (quotesByRequest.get(row.id) ?? []).filter(quote => quote.status === 'submitted');
      return {
        id: row.id,
        needText: row.need_text,
        state: row.state,
        urgency: row.urgency,
        createdAt: row.created_at,
        serviceName: row.service_entity_id ? serviceName.get(row.service_entity_id) ?? null : null,
        locationName: row.location_id ? locationName.get(row.location_id) ?? null : null,
        quoteCount: submitted.length,
        pill: pillFor(row.state),
        nextAction: nextActionFor(row.state, submitted.length),
      };
    });

  // Only quotes that are still open: a quote past its validity date is not awaiting a decision.
  const now = Date.now();
  const quotesAwaitingReview: QuoteAwaitingReview[] = (quotes ?? [])
    .filter(quote => quote.status === 'submitted' && (!quote.valid_until || new Date(quote.valid_until).getTime() > now))
    .map(quote => ({
      quoteId: quote.id,
      requestId: quote.request_id,
      requestLabel: labelOf(quote.request_id, requests.find(row => row.id === quote.request_id)?.need_text ?? 'Request'),
      summary: quote.summary,
      totalMinor: quote.total_minor,
      currencyCode: quote.currency_code,
      validUntil: quote.valid_until,
    }));

  const requestById = new Map(requests.map(row => [row.id, row]));
  const scheduled: ScheduledWork[] = (schedules ?? []).map(schedule => {
    const assignment = (assignments ?? []).find(row => row.id === schedule.assignment_id);
    const request = assignment ? requestById.get(assignment.request_id) : undefined;
    return {
      assignmentId: schedule.assignment_id,
      requestId: assignment?.request_id ?? '',
      requestLabel: labelOf(assignment?.request_id ?? '', request?.need_text ?? 'Scheduled work'),
      scheduledStart: schedule.scheduled_start,
      scheduledEnd: schedule.scheduled_end,
      note: schedule.note,
    };
  });

  const paymentsDue: PaymentDue[] = (obligations ?? [])
    .filter(row => ['pending', 'funding'].includes(row.status))
    .map(row => ({
      obligationId: row.id,
      requestId: row.request_id,
      requestLabel: labelOf(row.request_id, requestById.get(row.request_id)?.need_text ?? 'Request'),
      amountMinor: row.amount_minor,
      currencyCode: row.currency_code,
      status: row.status,
    }));

  return {
    active,
    quotesAwaitingReview,
    scheduled,
    paymentsDue,
    awaitingApproval: active.filter(row => row.state === 'submitted_for_approval'),
    drafts: active.filter(row => row.state === 'draft'),
    isNewCustomer: false,
    unavailable: false,
  };
}

/**
 * The service and location catalogues, for the wizard's FIRST step and for a visitor who has no draft
 * yet. Every other step reads these from the draft (which pins them to the draft's market); step 1 is
 * the only one that needs them before a draft exists at all.
 *
 * The market is not asked for. The platform publishes exactly one, the same one the draft command
 * resolves when a step saves, so a picker here would be a field with a single option that could only
 * ever disagree with the value written next to it.
 */
export type IntakeCatalogue = {
  marketId: string | null;
  marketName: string | null;
  services: { id: string; name: string }[];
  locations: { id: string; name: string }[];
};

export async function getIntakeCatalogue(): Promise<IntakeCatalogue> {
  const supabase = await createSupabaseServerClient();

  const [{ data: market }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('public_market_catalog').select('market_id,display_name').limit(1).maybeSingle(),
    supabase.from('public_service_catalog').select('service_entity_id,display_name').order('display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name').order('display_name'),
  ]);

  return {
    marketId: market?.market_id ?? null,
    marketName: market?.display_name ?? null,
    services: (services ?? []).map(row => ({ id: row.service_entity_id, name: row.display_name })),
    locations: (locations ?? []).map(row => ({ id: row.location_id, name: row.display_name })),
  };
}

/**
 * The areas a request can be moved to, for the request detail's edit form.
 *
 * Separate from `getIntakeCatalogue` because the edit form does not offer a service change: swapping the trade
 * would invalidate every match and every quote made against the old one, which is a different request rather
 * than an edit. Reusing the full catalogue here would have put a service picker on the form that the action
 * then had to ignore.
 */
export async function getLocationOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('public_location_catalog')
    .select('location_id,display_name')
    .order('display_name');
  return (data ?? []).map(row => ({ id: row.location_id, name: row.display_name }));
}

/**
 * What the customer used last time, for the logistics step's "use the same as last time" prefill.
 *
 * ⚠️ THERE IS NO SAVED-ADDRESS BOOK, and this does not pretend to be one. It reads the location and the
 * access notes off the most recent request this account actually submitted — a fact the database
 * already holds — rather than inventing a table of addresses the brief assumes exists. The step labels
 * it as coming from that request, so nobody believes the platform is remembering an address for them.
 */
export type LastUsedLogistics = {
  locationId: string | null;
  landmark: string | null;
  accessNotes: string | null;
  fromDate: string | null;
};

export async function getLastUsedLogistics(exceptRequestId?: string): Promise<LastUsedLogistics | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;

  let query = supabase
    .from('requests')
    .select('id,location_id,created_at,state')
    .eq('customer_account_id', account.id)
    .neq('state', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);

  if (exceptRequestId) query = query.neq('id', exceptRequestId);

  const { data: previous } = await query.maybeSingle();
  if (!previous) return null;

  const { data: scopeRow } = await supabase
    .from('request_scopes')
    .select('scope_json')
    .eq('request_id', previous.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const scope = (scopeRow?.scope_json as { landmark?: string; access_notes?: string } | null) ?? {};

  return {
    locationId: previous.location_id ?? null,
    landmark: scope.landmark ?? null,
    accessNotes: scope.access_notes ?? null,
    fromDate: previous.created_at ?? null,
  };
}

/** Everything a wizard step needs about the draft it is editing. */
export type DraftView = {
  id: string;
  marketId: string;
  needText: string;
  urgency: string;
  serviceEntityId: string | null;
  locationId: string | null;
  scope: Record<string, unknown>;
  services: { id: string; name: string }[];
  locations: { id: string; name: string }[];
};

export async function getRequestDraft(draftId: string | undefined): Promise<DraftView | null> {
  if (!draftId) return null;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;

  const { data: draft } = await supabase
    .from('requests')
    .select('id,market_id,need_text,urgency,service_entity_id,location_id,state,customer_account_id')
    .eq('id', draftId)
    .maybeSingle();

  // A draft that is not this account's, or is no longer a draft, is treated as absent rather than
  // rendered read-only: the flow's next step is always "start again", and a half-editable form would
  // be a worse answer than that.
  if (!draft || draft.customer_account_id !== account.id || draft.state !== 'draft') return null;

  const [{ data: scopeRow }, { data: services }, { data: locations }] = await Promise.all([
    supabase
      .from('request_scopes')
      .select('scope_json,version,status')
      .eq('request_id', draft.id)
      .eq('status', 'draft')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('public_service_catalog').select('service_entity_id,display_name').eq('market_id', draft.market_id),
    supabase.from('public_location_catalog').select('location_id,display_name').eq('market_id', draft.market_id),
  ]);

  return {
    id: draft.id,
    marketId: draft.market_id,
    needText: draft.need_text ?? '',
    urgency: draft.urgency,
    serviceEntityId: draft.service_entity_id,
    locationId: draft.location_id,
    scope: (scopeRow?.scope_json as Record<string, unknown>) ?? {},
    services: (services ?? []).map(row => ({ id: row.service_entity_id, name: row.display_name })),
    locations: (locations ?? []).map(row => ({ id: row.location_id, name: row.display_name })),
  };
}

export type ConfirmationView = {
  id: string;
  reference: string;
  needText: string;
  state: string;
  urgency: string;
  submittedAt: string | null;
  serviceName: string | null;
  locationName: string | null;
  quoteCount: number;
  answers: Record<string, string>;
  questions: ClarifyQuestion[] | null;
};

export async function getRequestConfirmation(requestId: string): Promise<ConfirmationView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;

  const { data: request } = await supabase
    .from('requests')
    .select('id,need_text,state,urgency,submitted_at,service_entity_id,location_id,customer_account_id')
    .eq('id', requestId)
    .maybeSingle();

  if (!request || request.customer_account_id !== account.id) return null;

  const [{ data: quotes }, { data: scopeRow }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('quotes').select('id').eq('request_id', requestId),
    supabase
      .from('request_scopes')
      .select('scope_json')
      .eq('request_id', requestId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('public_service_catalog').select('service_entity_id,display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name'),
  ]);

  const scope = (scopeRow?.scope_json as Record<string, unknown>) ?? {};
  const answers = (scope.answers as Record<string, string> | undefined) ?? {};

  const serviceName = request.service_entity_id
    ? (services ?? []).find(row => row.service_entity_id === request.service_entity_id)?.display_name ?? null
    : null;
  const locationName = request.location_id
    ? (locations ?? []).find(row => row.location_id === request.location_id)?.display_name ?? null
    : null;

  return {
    id: request.id,
    reference: `REQ-${request.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    needText: request.need_text,
    state: request.state,
    urgency: request.urgency,
    submittedAt: request.submitted_at,
    serviceName,
    locationName,
    quoteCount: (quotes ?? []).length,
    answers,
    questions: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The request list and the request detail behind /customer/requests
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tabs the list groups by. `all` is a view, not a state — no request is ever "all". */
export const REQUEST_TABS = ['all', 'open', 'drafts', 'completed', 'cancelled'] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

export function requestTabOf(state: string): Exclude<RequestTab, 'all'> {
  if (state === 'draft') return 'drafts';
  if (state === 'completed') return 'completed';
  if (state === 'cancelled') return 'cancelled';
  return 'open';
}

export function requestTabLabel(tab: RequestTab): string {
  switch (tab) {
    case 'drafts': return 'Drafts';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'open': return 'Open & matching';
    default: return 'All';
  }
}

export type RequestListItem = {
  id: string;
  needText: string;
  state: string;
  urgency: string;
  createdAt: string;
  serviceName: string | null;
  locationName: string | null;
  quoteCount: number;
  cancellationReason: string | null;
  pill: { label: string; tone: PillTone };
  nextAction: { label: string; detail: string } | null;
};

/**
 * The list behind `/customer/requests`.
 *
 * ⚠️ SEARCH, FILTER AND SORT HAPPEN IN THE PAGE, NOT HERE, AND THAT IS DELIBERATE. The cap is fifty
 * requests — the same cap the dashboard already reads — so filtering fifty rows in memory costs nothing,
 * while pushing the search into PostgREST would mean building `ilike` patterns out of user input and
 * escaping them. Fewer places for the query to be wrong.
 */
export async function getCustomerRequestList(): Promise<{ items: RequestListItem[]; unavailable: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], unavailable: false };

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return { items: [], unavailable: false };

  const { data: requestRows, error } = await supabase
    .from('requests')
    .select('id,need_text,state,urgency,created_at,service_entity_id,location_id,cancellation_reason')
    .eq('customer_account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read the request list: ${error.message}`);
    }
    return { items: [], unavailable: true };
  }

  const requests = requestRows ?? [];
  if (requests.length === 0) return { items: [], unavailable: false };

  const [{ data: quotes }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('quotes').select('id,request_id,status').in('request_id', requests.map(row => row.id)),
    supabase.from('public_service_catalog').select('service_entity_id,display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name'),
  ]);

  const serviceName = new Map((services ?? []).map(row => [row.service_entity_id, row.display_name]));
  const locationName = new Map((locations ?? []).map(row => [row.location_id, row.display_name]));

  const items: RequestListItem[] = requests.map(row => {
    // Submitted only: a declined or expired quote is not a decision waiting to be made.
    const live = (quotes ?? []).filter(quote => quote.request_id === row.id && quote.status === 'submitted').length;
    return {
      id: row.id,
      needText: row.need_text ?? '',
      state: row.state,
      urgency: row.urgency,
      createdAt: row.created_at,
      serviceName: row.service_entity_id ? serviceName.get(row.service_entity_id) ?? null : null,
      locationName: row.location_id ? locationName.get(row.location_id) ?? null : null,
      quoteCount: live,
      cancellationReason: row.cancellation_reason ?? null,
      pill: pillFor(row.state),
      nextAction: nextActionFor(row.state, live),
    };
  });

  return { items, unavailable: false };
}

/** One eligible provider, as the platform's own matching function reports it. */
export type MatchedProvider = {
  providerId: string;
  slug: string | null;
  headline: string | null;
  publicDescription: string | null;
  readinessScore: number | null;
  trustScore: number | null;
  identityVerified: boolean;
};

export type QuoteRow = {
  quoteId: string;
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  providerHeadline: string | null;
  identityVerified: boolean;
  readinessScore: number | null;
  trustScore: number | null;
  versionLabel: string;
  versionMajor: number;
  versionRevision: number;
  status: string;
  totalMinor: number;
  currencyCode: string;
  summary: string | null;
  validUntil: string | null;
  submittedAt: string;
  acceptedAt: string | null;
  lockedAt: string | null;
  isLatest: boolean;
  supersededBy: string | null;
  openChangeRequests: number;
  /** The provider's itemised breakdown. Empty means the provider priced this in one number. */
  lineItems: QuoteLineItem[];
  /** Work offered on top of the total. Never part of `totalMinor`. */
  optionalAddons: QuoteLineItem[];
  taxesAndFeesMinor: number;
  /** null means "not stated", which is not the same answer as "no". */
  materialsIncluded: boolean | null;
  materialsNote: string | null;
  /** What the price does not cover, in the provider's words. null means they stated none. */
  exclusions: string | null;
  timelineDays: number | null;
  timelineNote: string | null;
  inspectionRequired: boolean | null;
  warrantyTerms: string | null;
};

/** One row of a provider's price breakdown, or one optional add-on. */
export type QuoteLineItem = { label: string; amountMinor: number };

/**
 * ⚠️ THE ONLY WAY A CUSTOMER CAN SEE WHO QUOTED THEM. `providers` has no customer-facing read policy, so
 * joining it from the page returns nothing — not an error, an empty answer. This calls the definer
 * function that asserts ownership and returns the identity columns a customer is entitled to.
 *
 * The row shape is declared here rather than taken from generated types, because this project does not
 * generate database types — an untyped client returns `any`, and an `any` that is never written down is how a
 * renamed column becomes a silent `undefined` on a page instead of a compile error.
 */
type ComparisonRpcRow = {
  quote_id: string;
  provider_id: string;
  provider_display_name: string;
  provider_slug: string | null;
  provider_headline: string | null;
  provider_identity_verified: boolean;
  readiness_score: number | null;
  trust_score: number | null;
  version_label: string;
  version_major: number;
  version_revision: number;
  status: string;
  total_minor: number;
  currency_code: string;
  summary: string | null;
  valid_until: string | null;
  submitted_at: string;
  accepted_at: string | null;
  locked_at: string | null;
  is_latest: boolean;
  superseded_by_version: string | null;
  open_change_requests: number;
  line_items: unknown;
  optional_addons: unknown;
  taxes_and_fees_minor: number;
  materials_included: boolean | null;
  materials_note: string | null;
  exclusions: string | null;
  timeline_days: number | null;
  timeline_note: string | null;
  inspection_required: boolean | null;
  warranty_terms: string | null;
};

/**
 * The stored breakdown as the pages need it.
 *
 * ⚠️ THIS IS PARSED RATHER THAN CAST. The column is `jsonb`, so a cast would be a promise about data the
 * database never promised — the trigger enforces the shape on the way in, but a page that reads a malformed
 * row should drop the row it cannot read, not throw and take the whole quote page with it. Anything that is
 * not a `{label, amount_minor}` pair is skipped.
 */
function parseLineItems(value: unknown): QuoteLineItem[] {
  if (!Array.isArray(value)) return [];
  const items: QuoteLineItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { label?: unknown; amount_minor?: unknown };
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const amount = typeof record.amount_minor === 'number' ? record.amount_minor : Number(record.amount_minor);
    if (!label || !Number.isFinite(amount) || amount < 0) continue;
    items.push({ label, amountMinor: Math.round(amount) });
  }
  return items;
}

export async function getRequestQuotes(requestId: string): Promise<QuoteRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_quote_comparison', { p_request_id: requestId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read quotes: ${error.message}`);
    }
    return [];
  }

  return ((data ?? []) as ComparisonRpcRow[]).map(row => ({
    quoteId: row.quote_id,
    providerId: row.provider_id,
    providerName: row.provider_display_name,
    providerSlug: row.provider_slug,
    providerHeadline: row.provider_headline,
    identityVerified: row.provider_identity_verified,
    readinessScore: row.readiness_score,
    trustScore: row.trust_score,
    versionLabel: row.version_label,
    versionMajor: row.version_major,
    versionRevision: row.version_revision,
    status: row.status,
    totalMinor: row.total_minor,
    currencyCode: row.currency_code,
    summary: row.summary,
    validUntil: row.valid_until,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    lockedAt: row.locked_at,
    isLatest: row.is_latest,
    supersededBy: row.superseded_by_version,
    openChangeRequests: row.open_change_requests,
    lineItems: parseLineItems(row.line_items),
    optionalAddons: parseLineItems(row.optional_addons),
    taxesAndFeesMinor: Number(row.taxes_and_fees_minor ?? 0),
    materialsIncluded: row.materials_included,
    materialsNote: row.materials_note,
    exclusions: row.exclusions ?? null,
    timelineDays: row.timeline_days,
    timelineNote: row.timeline_note,
    inspectionRequired: row.inspection_required,
    warrantyTerms: row.warranty_terms,
  }));
}

/** The matching RPC's row, named for the same reason as the comparison row above. */
type EligibleProviderRpcRow = {
  provider_id: string;
  slug: string | null;
  headline: string | null;
  public_description: string | null;
  readiness_score: number | null;
  trust_score: number | null;
  verification_summary: unknown;
};

export type RequestDetail = {
  id: string;
  needText: string;
  state: string;
  urgency: string;
  createdAt: string;
  submittedAt: string | null;
  cancellationReason: string | null;
  serviceName: string | null;
  /** The id behind `locationName`, so an edit form can preselect the area without matching on its label. */
  locationId: string | null;
  locationName: string | null;
  quotes: QuoteRow[];
  matches: MatchedProvider[];
  /** The matching function itself failed — different from "nobody is eligible yet". */
  matchesUnavailable: boolean;
  assignment: { id: string; status: string; acceptedQuoteId: string | null; assignedAt: string } | null;
  obligation: { id: string; amountMinor: number; currencyCode: string; status: string } | null;
  agreement: { id: string; acceptedAt: string } | null;
  scope: Record<string, unknown>;
};

export async function getCustomerRequestDetail(requestId: string): Promise<RequestDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;

  const { data: request } = await supabase
    .from('requests')
    .select('id,need_text,state,urgency,created_at,submitted_at,service_entity_id,location_id,cancellation_reason,customer_account_id')
    .eq('id', requestId)
    .maybeSingle();

  // Somebody else's request is treated as absent, never as forbidden: telling a stranger that an id is
  // real is itself a disclosure.
  if (!request || request.customer_account_id !== account.id) return null;

  const [{ data: services }, { data: locations }, { data: assignment }, { data: scopeRow }] = await Promise.all([
    supabase.from('public_service_catalog').select('service_entity_id,display_name').eq('service_entity_id', request.service_entity_id ?? ''),
    supabase.from('public_location_catalog').select('location_id,display_name').eq('location_id', request.location_id ?? ''),
    supabase.from('assignments').select('id,status,accepted_quote_id,assigned_at').eq('request_id', requestId).eq('status', 'active').maybeSingle(),
    supabase.from('request_scopes').select('scope_json').eq('request_id', requestId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const [quotes, matches, obligation, agreement] = await Promise.all([
    getRequestQuotes(requestId),
    (async () => {
      const { data, error } = await supabase.rpc('find_eligible_providers_for_request', { p_request_id: requestId, p_limit: 24 });
      return { rows: data ?? [], failed: Boolean(error) };
    })(),
    assignment?.id
      ? supabase.from('payment_obligations').select('id,amount_minor,currency_code,status').eq('assignment_id', assignment.id).maybeSingle()
      : Promise.resolve({ data: null }),
    assignment?.id
      ? supabase.from('agreement_acceptances').select('id,accepted_at').eq('assignment_id', assignment.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: request.id,
    needText: request.need_text ?? '',
    state: request.state,
    urgency: request.urgency,
    createdAt: request.created_at,
    submittedAt: request.submitted_at,
    cancellationReason: request.cancellation_reason ?? null,
    serviceName: (services ?? [])[0]?.display_name ?? null,
    locationId: request.location_id ?? null,
    locationName: (locations ?? [])[0]?.display_name ?? null,
    quotes,
    matches: (matches.rows as EligibleProviderRpcRow[]).map(row => ({
      providerId: row.provider_id,
      slug: row.slug,
      headline: row.headline,
      publicDescription: row.public_description,
      readinessScore: row.readiness_score,
      trustScore: row.trust_score,
      identityVerified: Boolean((row.verification_summary as { verified?: boolean } | null)?.verified),
    })),
    matchesUnavailable: matches.failed,
    assignment: assignment
      ? { id: assignment.id, status: assignment.status, acceptedQuoteId: assignment.accepted_quote_id, assignedAt: assignment.assigned_at }
      : null,
    obligation: obligation.data
      ? {
          id: obligation.data.id,
          amountMinor: obligation.data.amount_minor,
          currencyCode: obligation.data.currency_code,
          status: obligation.data.status,
        }
      : null,
    agreement: agreement.data ? { id: agreement.data.id, acceptedAt: agreement.data.accepted_at } : null,
    scope: (scopeRow?.scope_json as Record<string, unknown>) ?? {},
  };
}
