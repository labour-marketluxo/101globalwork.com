import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Opportunities: the work this provider is eligible to quote, and its own answer to each one.
 *
 * ⚠️ THE FEED IS NOT A SEARCH. Every row comes from `get_my_opportunities_command`, which is built on
 * `list_my_provider_opportunities_command` — the same eligibility rule matching publishes elsewhere — so
 * the page can filter and sort its own list but can never widen it. The three controls on the page
 * therefore narrow a set that is already exactly what this provider may quote.
 *
 * ⚠️ THE "TRAVEL BAND" IS A COVERAGE BAND, AND THE LANGUAGE SAYS SO. `locations` has latitude and
 * longitude columns and no row in this database has them set, so the platform cannot compute a distance.
 * What it can compute is which of the provider's own records the request matched: the primary area, or
 * another area they have chosen to cover. The page calls them "your main area" and "an area you cover",
 * never "12km away" — a number it would have had to invent.
 *
 * ⚠️ THE SCOPE IS AN ALLOWLIST. `get_my_opportunity_detail_command` withholds `landmark`, `access_notes`
 * and `contact_preference` until a quote is accepted. The provider prices the work from what the customer
 * described, not from how to reach their door.
 */

export type OpportunityBand = 'primary' | 'covered';

export const BAND_COPY: Record<OpportunityBand, { label: string; note: string }> = {
  primary: {
    label: 'Your main area',
    note: 'This is the area you marked as primary when you set your coverage up.',
  },
  covered: {
    label: 'An area you cover',
    note: 'You work here, but it is not the area you marked as primary.',
  },
};

export const URGENCY_COPY: Record<string, { label: string; tone: 'amber' | 'slate' }> = {
  emergency_redirect: { label: 'Emergency — redirected', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'amber' },
  soon: { label: 'Soon', tone: 'slate' },
  normal: { label: 'Normal', tone: 'slate' },
};

/**
 * Why a provider declined.
 *
 * A closed vocabulary rather than a text box, because this is the platform's only feedback loop about work
 * that reaches eligible providers and is not answered — and free text nobody reads cannot be counted. The
 * optional note carries whatever the codes do not.
 */
export const DECLINE_REASONS = [
  { value: 'outside_travel', label: 'Too far to travel' },
  { value: 'schedule_conflict', label: 'The timing does not work' },
  { value: 'scope_not_suitable', label: 'Not the kind of work I do' },
  { value: 'no_capacity', label: 'I have no capacity right now' },
  { value: 'not_my_trade', label: 'Outside my trade' },
  { value: 'other', label: 'Something else' },
] as const;

export const DECLINE_REASON_LABELS: Record<string, string> = Object.fromEntries(
  DECLINE_REASONS.map(reason => [reason.value, reason.label]),
);

/** What `provider_matching_eligibility.reasons` can say, in words. */
export const FIT_REASON_COPY: Record<string, string> = {
  provider_not_active: 'Your provider profile is not published.',
  service_not_offered: 'This trade is not on your active service list.',
  outside_service_area: 'The work is outside every area you cover.',
  verification_incomplete: 'A verified identity strengthens matching eligibility.',
  search_readiness_low: 'Your readiness score is below the 60 matching requires.',
};

export type ProviderOpportunity = {
  requestId: string;
  needText: string;
  requestState: string;
  urgency: string;
  serviceId: string | null;
  serviceName: string | null;
  locationId: string | null;
  locationName: string | null;
  cityName: string | null;
  regionName: string | null;
  band: OpportunityBand;
  isPrimaryArea: boolean;
  fitScore: number;
  fitReasons: string[];
  postedAt: string | null;
  preferredWindow: string | null;
  hazardous: boolean;
  response: 'interested' | 'declined' | null;
  responseReason: string | null;
  quoteId: string | null;
  quoteStatus: string | null;
  quoteVersion: string | null;
  hasDraft: boolean;
  /** An open question from the customer about a quote on this request. */
  unansweredFromCustomer: boolean;
};

export type OpportunityScope = {
  answers: Record<string, string>;
  notSure: string[];
  preferredWindow: string | null;
  preferredDate: string | null;
  areaText: string | null;
  hazardous: boolean;
};

export type OpportunityQuoteRow = {
  id: string;
  status: string;
  version: string;
  versionMajor: number;
  versionRevision: number;
  totalMinor: number;
  currencyCode: string;
  summary: string | null;
  submittedAt: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
  lockedAt: string | null;
};

export type OpportunityDetail = {
  request: {
    id: string;
    needText: string;
    state: string;
    urgency: string;
    currencyCode: string | null;
    postedAt: string | null;
    serviceName: string | null;
    locationName: string | null;
    cityName: string | null;
    regionName: string | null;
    band: OpportunityBand;
    isPrimaryArea: boolean;
    preferredWindow: string | null;
    hazardous: boolean;
  };
  fit: { score: number; reasons: string[] };
  scope: OpportunityScope;
  response: { response: 'interested' | 'declined' | null; reasonCode: string | null };
  quotes: OpportunityQuoteRow[];
  /** The stored draft payload, exactly as it was saved. Only this provider can see it. */
  draft: Record<string, unknown> | null;
  messageCount: number;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const bool = (value: unknown): boolean => value === true;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

function toBand(value: unknown): OpportunityBand {
  return value === 'primary' ? 'primary' : 'covered';
}

function toOpportunity(raw: Raw): ProviderOpportunity | null {
  const requestId = text(raw.request_id);
  if (!requestId) return null;
  const response = raw.response === 'interested' || raw.response === 'declined' ? raw.response : null;
  return {
    requestId,
    needText: text(raw.need_text) ?? 'A request you can quote',
    requestState: text(raw.request_state) ?? 'matching',
    urgency: text(raw.urgency) ?? 'normal',
    serviceId: text(raw.service_entity_id),
    serviceName: text(raw.service_name),
    locationId: text(raw.location_id),
    locationName: text(raw.location_name),
    cityName: text(raw.city_name),
    regionName: text(raw.region_name),
    band: toBand(raw.band),
    isPrimaryArea: bool(raw.is_primary_area),
    fitScore: num(raw.fit_score) ?? 0,
    fitReasons: Array.isArray(raw.fit_reasons)
      ? (raw.fit_reasons as unknown[]).filter((reason): reason is string => typeof reason === 'string')
      : [],
    postedAt: text(raw.posted_at),
    preferredWindow: text(raw.preferred_window),
    hazardous: bool(raw.hazardous),
    response,
    responseReason: text(raw.response_reason),
    quoteId: text(raw.quote_id),
    quoteStatus: text(raw.quote_status),
    quoteVersion: text(raw.quote_version),
    hasDraft: bool(raw.has_draft),
    unansweredFromCustomer: bool(raw.unread_from_customer),
  };
}

export type OpportunitiesRead = { opportunities: ProviderOpportunity[]; unavailable: boolean };

export async function getProviderOpportunities(providerId: string): Promise<OpportunitiesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_opportunities_command', { p_provider_id: providerId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read opportunities: ${error.message}`);
    }
    return { opportunities: [], unavailable: true };
  }
  return {
    opportunities: rows(data)
      .map(toOpportunity)
      .filter((item): item is ProviderOpportunity => item !== null),
    unavailable: false,
  };
}

export type OpportunityFilters = {
  /** A service entity id, or null for every category. */
  serviceId: string | null;
  /** 'primary' keeps only work in the provider's main area; null keeps everything. */
  band: OpportunityBand | null;
  /** 'urgent' keeps urgent and emergency work; 'soon' adds soon; null keeps everything. */
  availability: 'urgent' | 'soon' | null;
};

export const OPPORTUNITY_FILTER_COPY = {
  availability: {
    urgent: 'Urgent and emergency only',
    soon: 'Urgent, emergency and soon',
  },
} as const;

/**
 * The three controls, as a pure function.
 *
 * ⚠️ IT FILTERS, IT NEVER WIDENS. Every input is a subset of the rows the command returned, so no
 * combination of query parameters can show a provider work they are not eligible for. Keeping this pure
 * also means the page's counts and its list are computed from one array.
 */
export function applyOpportunityFilters(
  opportunities: ProviderOpportunity[],
  filters: OpportunityFilters,
): ProviderOpportunity[] {
  return opportunities.filter(opportunity => {
    if (filters.serviceId && opportunity.serviceId !== filters.serviceId) return false;
    if (filters.band && opportunity.band !== filters.band) return false;
    if (filters.availability === 'urgent' && !['urgent', 'emergency_redirect'].includes(opportunity.urgency)) {
      return false;
    }
    if (
      filters.availability === 'soon' &&
      !['urgent', 'emergency_redirect', 'soon'].includes(opportunity.urgency)
    ) {
      return false;
    }
    return true;
  });
}

/** The categories present in this provider's own feed, for the filter control. */
export function opportunityCategories(opportunities: ProviderOpportunity[]): { id: string; name: string; count: number }[] {
  const byId = new Map<string, { id: string; name: string; count: number }>();
  for (const opportunity of opportunities) {
    if (!opportunity.serviceId) continue;
    const existing = byId.get(opportunity.serviceId);
    if (existing) existing.count += 1;
    else byId.set(opportunity.serviceId, { id: opportunity.serviceId, name: opportunity.serviceName ?? 'Service', count: 1 });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type OpportunityDetailRead = { detail: OpportunityDetail | null; unavailable: boolean };

export async function getOpportunityDetail(providerId: string, requestId: string): Promise<OpportunityDetailRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_opportunity_detail_command', {
    p_provider_id: providerId,
    p_request_id: requestId,
  });
  if (error) {
    // A refusal here means "not an opportunity for this provider", which is a 404 rather than an error
    // state: the page must not tell somebody that a request they cannot see exists.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] opportunity detail refused: ${error.message}`);
    }
    return { detail: null, unavailable: false };
  }

  const raw = obj(data);
  const request = obj(raw.request);
  const id = text(request.id);
  if (!id) return { detail: null, unavailable: false };

  const answersRaw = obj(obj(raw.scope).answers);
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(answersRaw)) {
    const answer = text(value);
    if (answer) answers[key] = answer;
  }

  const fit = obj(raw.fit);
  const response = obj(raw.response);

  return {
    detail: {
      request: {
        id,
        needText: text(request.need_text) ?? 'A request you can quote',
        state: text(request.state) ?? 'matching',
        urgency: text(request.urgency) ?? 'normal',
        currencyCode: text(request.currency_code),
        postedAt: text(request.posted_at),
        serviceName: text(request.service_name),
        locationName: text(request.location_name),
        cityName: text(request.city_name),
        regionName: text(request.region_name),
        band: toBand(request.band),
        isPrimaryArea: bool(request.is_primary_area),
        preferredWindow: text(request.preferred_window),
        hazardous: bool(request.hazardous),
      },
      fit: {
        score: num(fit.score) ?? 0,
        reasons: Array.isArray(fit.reasons)
          ? (fit.reasons as unknown[]).filter((reason): reason is string => typeof reason === 'string')
          : [],
      },
      scope: {
        answers,
        notSure: Array.isArray(obj(raw.scope).not_sure)
          ? (obj(raw.scope).not_sure as unknown[]).filter((item): item is string => typeof item === 'string')
          : [],
        preferredWindow: text(obj(raw.scope).preferred_window),
        preferredDate: text(obj(raw.scope).preferred_date),
        areaText: text(obj(raw.scope).area_text),
        hazardous: bool(obj(raw.scope).hazardous),
      },
      response: {
        response: response.response === 'interested' || response.response === 'declined' ? response.response : null,
        reasonCode: text(response.reason_code),
      },
      quotes: rows(raw.quotes)
        .map(row => {
          const quoteId = text(row.id);
          if (!quoteId) return null;
          return {
            id: quoteId,
            status: text(row.status) ?? 'submitted',
            version: text(row.version) ?? 'v1.0',
            versionMajor: num(row.version_major) ?? 1,
            versionRevision: num(row.version_revision) ?? 0,
            totalMinor: num(row.total_minor) ?? 0,
            currencyCode: text(row.currency_code) ?? 'NGN',
            summary: text(row.summary),
            submittedAt: text(row.submitted_at),
            validUntil: text(row.valid_until),
            acceptedAt: text(row.accepted_at),
            lockedAt: text(row.locked_at),
          };
        })
        .filter((quote): quote is OpportunityQuoteRow => quote !== null),
      draft: raw.draft && typeof raw.draft === 'object' && !Array.isArray(raw.draft) ? (raw.draft as Raw) : null,
      messageCount: num(raw.message_count) ?? 0,
    },
    unavailable: false,
  };
}
