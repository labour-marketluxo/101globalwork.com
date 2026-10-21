import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The provider's side of a quote: what was offered, what the customer said, and what changed between
 * versions.
 *
 * ⚠️ VERSIONS ARE ROWS, AND THE DIFF IS COMPUTED FROM THEM. `quotes` is insert-only from the application
 * and a trigger numbers each row for the same (request, provider) pair, so "what changed in v3" is answered
 * by comparing two rows rather than by trusting a summary somebody typed. The original baseline is never
 * overwritten because nothing writes over it: the lock trigger refuses an update to an accepted version, and
 * a re-price is a new row.
 *
 * ⚠️ "SENT, VIEWED, NEGOTIATING" IS NOT ALL AVAILABLE, AND THE PAGE SAYS WHICH PARTS ARE. The schema has no
 * per-view tracking, so "viewed" cannot be shown — inventing it would be a claim about the customer reading
 * something. What IS derivable: `submitted` (sent), an open `quote_change_requests` row (the customer has
 * asked something, which is the closest true thing to "negotiating"), `accepted`, `declined`, `withdrawn`,
 * and expiry from `valid_until`.
 *
 * ⚠️ THE REQUEST HEADER COMES FROM A COMMAND, NOT FROM `requests`. Providers have no read policy on that
 * table, so a direct select returns nothing and the page would 404 on the provider's own quote.
 */

export type QuoteLineItem = { label: string; amountMinor: number };

export type ProviderQuote = {
  id: string;
  requestId: string;
  providerId: string;
  status: string;
  version: string;
  versionMajor: number;
  versionRevision: number;
  currencyCode: string;
  totalMinor: number;
  taxesMinor: number;
  lineItems: QuoteLineItem[];
  addons: QuoteLineItem[];
  summary: string | null;
  materialsIncluded: boolean | null;
  materialsNote: string | null;
  exclusions: string | null;
  timelineDays: number | null;
  timelineNote: string | null;
  inspectionRequired: boolean | null;
  warrantyTerms: string | null;
  validUntil: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  lockedAt: string | null;
  createdAt: string | null;
};

export type QuoteChangeRequest = {
  id: string;
  kind: string;
  message: string;
  status: string;
  createdAt: string | null;
  withdrawnAt: string | null;
};

export type QuoteMessage = {
  id: string;
  message: string;
  createdAt: string | null;
  quoteId: string | null;
};

export type QuoteAgreementRecord = {
  id: string;
  quoteVersion: string;
  totalMinor: number;
  currencyCode: string;
  authMethod: string;
  acceptedAt: string | null;
  verifiedAt: string | null;
  agreementHash: string;
  consentVersion: string;
};

export type QuoteRequestHeader = {
  id: string;
  needText: string;
  state: string;
  urgency: string;
  postedAt: string | null;
  timezone: string | null;
  serviceName: string | null;
  locationName: string | null;
  cityName: string | null;
  currencyCode: string | null;
  quoteCount: number;
  assignmentId: string | null;
};

export type ProviderQuoteDetail = {
  quote: ProviderQuote;
  /** Every version this provider has offered on this request, newest first, including the one above. */
  versions: ProviderQuote[];
  /** The version this one supersedes, when there is one. */
  previous: ProviderQuote | null;
  /** The accepted version, when the history has one. */
  acceptedQuote: ProviderQuote | null;
  changes: QuoteChangeRequest[];
  messages: QuoteMessage[];
  agreement: QuoteAgreementRecord | null;
  assignmentId: string | null;
  request: QuoteRequestHeader;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const obj = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

/**
 * `line_items` is jsonb written by the quote command and checked by a trigger: an array of
 * {label, amount_minor}. Anything else is dropped rather than rendered as a row with no amount.
 */
export function parseLineItems(value: unknown): QuoteLineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      const row = obj(entry);
      const label = text(row.label);
      const amountMinor = num(row.amount_minor);
      if (!label || amountMinor === null) return null;
      return { label, amountMinor };
    })
    .filter((item): item is QuoteLineItem => item !== null);
}

function toQuote(row: Raw): ProviderQuote | null {
  const id = text(row.id);
  const requestId = text(row.request_id);
  if (!id || !requestId) return null;
  return {
    id,
    requestId,
    providerId: text(row.provider_id) ?? '',
    status: text(row.status) ?? 'submitted',
    version: text(row.version_label) ?? 'v1.0',
    versionMajor: num(row.version_major) ?? 1,
    versionRevision: num(row.version_revision) ?? 0,
    currencyCode: text(row.currency_code) ?? 'NGN',
    totalMinor: num(row.total_minor) ?? 0,
    taxesMinor: num(row.taxes_and_fees_minor) ?? 0,
    lineItems: parseLineItems(row.line_items),
    addons: parseLineItems(row.optional_addons),
    summary: text(row.summary),
    materialsIncluded: typeof row.materials_included === 'boolean' ? row.materials_included : null,
    materialsNote: text(row.materials_note),
    exclusions: text(row.exclusions),
    timelineDays: num(row.timeline_days),
    timelineNote: text(row.timeline_note),
    inspectionRequired: typeof row.inspection_required === 'boolean' ? row.inspection_required : null,
    warrantyTerms: text(row.warranty_terms),
    validUntil: text(row.valid_until),
    submittedAt: text(row.submitted_at),
    acceptedAt: text(row.accepted_at),
    declinedAt: text(row.declined_at),
    lockedAt: text(row.locked_at),
    createdAt: text(row.created_at),
  };
}

const QUOTE_COLUMNS =
  'id,request_id,provider_id,status,version_label,version_major,version_revision,currency_code,total_minor,taxes_and_fees_minor,line_items,optional_addons,summary,materials_included,materials_note,exclusions,timeline_days,timeline_note,inspection_required,warranty_terms,valid_until,submitted_at,accepted_at,declined_at,locked_at,created_at';

export async function getRequestHeader(providerId: string, requestId: string): Promise<QuoteRequestHeader | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_request_header_command', {
    p_provider_id: providerId,
    p_request_id: requestId,
  });
  if (error || !data) return null;
  const raw = obj(data);
  const id = text(raw.id);
  if (!id) return null;
  return {
    id,
    needText: text(raw.need_text) ?? 'This request',
    state: text(raw.state) ?? 'matching',
    urgency: text(raw.urgency) ?? 'normal',
    postedAt: text(raw.posted_at),
    timezone: text(raw.timezone),
    serviceName: text(raw.service_name),
    locationName: text(raw.location_name),
    cityName: text(raw.city_name),
    currencyCode: text(raw.currency_code),
    quoteCount: num(raw.quote_count) ?? 0,
    assignmentId: text(raw.assignment_id),
  };
}

export async function getProviderRequestQuotes(providerId: string, requestId: string): Promise<ProviderQuote[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_COLUMNS)
    .eq('provider_id', providerId)
    .eq('request_id', requestId)
    .order('version_major', { ascending: false })
    .order('version_revision', { ascending: false });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read quotes: ${error.message}`);
    }
    return [];
  }
  return (data ?? [])
    .map(row => toQuote(row as Raw))
    .filter((quote): quote is ProviderQuote => quote !== null);
}

/** The stored draft payload for this request, or null. Drafts are readable by their owner only. */
export async function getQuoteDraft(providerId: string, requestId: string): Promise<Raw | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('provider_quote_drafts')
    .select('payload,updated_at')
    .eq('provider_id', providerId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (error || !data) return null;
  const payload = obj(data.payload);
  return Object.keys(payload).length > 0 ? { ...payload, updated_at: data.updated_at } : null;
}

export async function getProviderQuoteDetail(
  providerId: string,
  quoteId: string,
): Promise<{ detail: ProviderQuoteDetail | null; unavailable: boolean }> {
  const supabase = await createSupabaseServerClient();

  const { data: quoteRow, error } = await supabase.from('quotes').select(QUOTE_COLUMNS).eq('id', quoteId).maybeSingle();

  // No row means "not this provider's quote" as far as RLS is concerned, so the page can 404 without
  // confirming that the quote exists at all.
  if (error || !quoteRow) return { detail: null, unavailable: Boolean(error) };
  const quote = toQuote(quoteRow as Raw);
  if (!quote) return { detail: null, unavailable: false };

  const [versions, header, changes, messages, agreement, assignment] = await Promise.all([
    getProviderRequestQuotes(providerId, quote.requestId),
    getRequestHeader(providerId, quote.requestId),
    supabase
      .from('quote_change_requests')
      .select('id,kind,message,status,created_at,withdrawn_at')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false }),
    supabase
      .from('provider_quote_messages')
      .select('id,message,created_at,quote_id')
      .eq('request_id', quote.requestId)
      .order('created_at', { ascending: false }),
    supabase
      .from('agreement_acceptances')
      .select('id,quote_id,quote_version_label,total_minor,currency_code,auth_method,accepted_at,verified_at,agreement_hash,consent_version')
      .eq('provider_id', providerId)
      .eq('request_id', quote.requestId)
      .maybeSingle(),
    supabase
      .from('assignments')
      .select('id,status')
      .eq('provider_id', providerId)
      .eq('request_id', quote.requestId)
      .maybeSingle(),
  ]);

  if (!header) return { detail: null, unavailable: false };

  const priorVersion =
    versions.find(
      candidate =>
        candidate.versionMajor < quote.versionMajor ||
        (candidate.versionMajor === quote.versionMajor && candidate.versionRevision < quote.versionRevision),
    ) ?? null;

  return {
    detail: {
      quote,
      versions,
      previous: priorVersion,
      acceptedQuote: versions.find(candidate => candidate.status === 'accepted') ?? null,
      changes: (changes.data ?? []).map(row => ({
        id: row.id,
        kind: row.kind,
        message: row.message,
        status: row.status,
        createdAt: text(row.created_at),
        withdrawnAt: text(row.withdrawn_at),
      })),
      messages: (messages.data ?? []).map(row => ({
        id: row.id,
        message: row.message,
        createdAt: text(row.created_at),
        quoteId: text(row.quote_id),
      })),
      agreement: agreement.data
        ? {
            id: agreement.data.id,
            quoteVersion: agreement.data.quote_version_label,
            totalMinor: Number(agreement.data.total_minor ?? 0),
            currencyCode: agreement.data.currency_code,
            authMethod: agreement.data.auth_method,
            acceptedAt: text(agreement.data.accepted_at),
            verifiedAt: text(agreement.data.verified_at),
            agreementHash: agreement.data.agreement_hash,
            consentVersion: agreement.data.consent_version,
          }
        : null,
      assignmentId: assignment.data?.id ?? header.assignmentId,
      request: header,
    },
    unavailable: false,
  };
}

// ── Display status ────────────────────────────────────────────────────────────────────────────────

export type QuoteDisplayStatus = {
  key: 'draft' | 'sent' | 'question' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
  label: string;
  tone: 'teal' | 'amber' | 'slate';
  note: string;
};

/**
 * The status a provider sees, derived from the row and the customer's behaviour.
 *
 * ⚠️ "EXPIRED" IS DERIVED FROM `valid_until`, NOT FROM `status`. The enum value exists and nothing sets it:
 * no scheduled job walks the table. So a quote whose validity date has passed renders as expired while the
 * row still says `submitted`, and the note below says so rather than implying the platform updated it.
 */
export function quoteDisplayStatus(
  quote: ProviderQuote,
  options: { hasOpenQuestion: boolean; now: Date },
): QuoteDisplayStatus {
  if (quote.status === 'accepted' || quote.lockedAt) {
    return {
      key: 'accepted',
      label: 'Accepted and locked',
      tone: 'teal',
      note: 'The customer accepted this version. It is the document the work and its payment point at, and it can no longer be changed.',
    };
  }
  if (quote.status === 'withdrawn') {
    return {
      key: 'withdrawn',
      label: 'Withdrawn',
      tone: 'slate',
      note: 'You withdrew this offer. It stays in the history so the customer can see what was offered, and it cannot be accepted.',
    };
  }
  if (quote.status === 'declined') {
    return { key: 'declined', label: 'Declined', tone: 'slate', note: 'The customer declined this offer.' };
  }
  if (quote.status === 'draft') {
    return { key: 'draft', label: 'Draft', tone: 'slate', note: 'Not sent. The customer cannot see a draft.' };
  }
  if (quote.validUntil && new Date(quote.validUntil) <= options.now) {
    return {
      key: 'expired',
      label: 'Past its validity date',
      tone: 'amber',
      note: 'The date you set has passed. The platform does not change the status by itself, so the row still reads as submitted — send a revised quote to keep the price live.',
    };
  }
  if (options.hasOpenQuestion) {
    return {
      key: 'question',
      label: 'Customer asked a question',
      tone: 'amber',
      note: 'The customer has asked about this quote and is waiting on an answer. Answering is what moves this forward.',
    };
  }
  return {
    key: 'sent',
    label: 'Sent',
    tone: 'teal',
    note: 'Waiting for the customer to accept, decline or ask a question. The platform cannot tell you whether they have opened it.',
  };
}

// ── Version diff ──────────────────────────────────────────────────────────────────────────────────

export type QuoteFieldDiff = { key: string; label: string; previous: string; next: string };
export type QuoteLineDiff = { label: string; previousMinor: number | null; nextMinor: number | null };

export type QuoteDiff = {
  previousVersion: string;
  nextVersion: string;
  previousCurrency: string;
  nextCurrency: string;
  previousTotalMinor: number;
  nextTotalMinor: number;
  deltaMinor: number;
  currenciesMatch: boolean;
  lineDiffs: QuoteLineDiff[];
  fields: QuoteFieldDiff[];
};

const MISSING = 'Not stated';
const yesNo = (value: boolean | null): string => (value === true ? 'Yes' : value === false ? 'No' : MISSING);

/**
 * What changed between two versions.
 *
 * ⚠️ LINES ARE MATCHED BY LABEL, AND THE LABEL IS THE PROVIDER'S OWN. A renamed line reads as one removed and
 * one added, which is what actually happened to the document the customer reads. Matching by position would
 * silently pair "Labour" with "Materials" and report a price movement nobody made.
 */
export function diffQuoteVersions(previous: ProviderQuote, next: ProviderQuote): QuoteDiff {
  const key = (label: string) => label.trim().toLowerCase();
  const previousLines = new Map(previous.lineItems.map(item => [key(item.label), item]));
  const nextLines = new Map(next.lineItems.map(item => [key(item.label), item]));
  const labels = new Set([...previousLines.keys(), ...nextLines.keys()]);

  const lineDiffs: QuoteLineDiff[] = [...labels]
    .map(label => {
      const before = previousLines.get(label);
      const after = nextLines.get(label);
      return {
        label: after?.label ?? before?.label ?? label,
        previousMinor: before?.amountMinor ?? null,
        nextMinor: after?.amountMinor ?? null,
      };
    })
    // Only lines whose amount actually moved — including added and removed ones — are worth showing.
    .filter(diff => diff.previousMinor !== diff.nextMinor)
    .sort((a, b) => (b.nextMinor ?? b.previousMinor ?? 0) - (a.nextMinor ?? a.previousMinor ?? 0));

  const fields: QuoteFieldDiff[] = [
    { key: 'summary', label: 'What is included', previous: previous.summary ?? MISSING, next: next.summary ?? MISSING },
    {
      key: 'materials',
      label: 'Materials',
      previous:
        previous.materialsIncluded === true
          ? 'Included in the price'
          : previous.materialsIncluded === false
            ? 'Charged on top'
            : MISSING,
      next:
        next.materialsIncluded === true
          ? 'Included in the price'
          : next.materialsIncluded === false
            ? 'Charged on top'
            : MISSING,
    },
    { key: 'materials_note', label: 'Materials note', previous: previous.materialsNote ?? MISSING, next: next.materialsNote ?? MISSING },
    { key: 'exclusions', label: 'Not covered', previous: previous.exclusions ?? MISSING, next: next.exclusions ?? MISSING },
    {
      key: 'timeline',
      label: 'Timeline',
      previous: previous.timelineDays ? `${previous.timelineDays} day${previous.timelineDays === 1 ? '' : 's'}` : MISSING,
      next: next.timelineDays ? `${next.timelineDays} day${next.timelineDays === 1 ? '' : 's'}` : MISSING,
    },
    { key: 'inspection', label: 'Inspection required', previous: yesNo(previous.inspectionRequired), next: yesNo(next.inspectionRequired) },
    { key: 'warranty', label: 'Warranty', previous: previous.warrantyTerms ?? MISSING, next: next.warrantyTerms ?? MISSING },
  ].filter(field => field.previous !== field.next);

  if (previous.taxesMinor !== next.taxesMinor) {
    fields.unshift({
      key: 'taxes',
      label: 'Taxes and fees',
      previous: `${(previous.taxesMinor / 100).toFixed(2)} ${previous.currencyCode}`,
      next: `${(next.taxesMinor / 100).toFixed(2)} ${next.currencyCode}`,
    });
  }

  return {
    previousVersion: previous.version,
    nextVersion: next.version,
    previousCurrency: previous.currencyCode,
    nextCurrency: next.currencyCode,
    previousTotalMinor: previous.totalMinor,
    nextTotalMinor: next.totalMinor,
    deltaMinor: next.totalMinor - previous.totalMinor,
    currenciesMatch: previous.currencyCode === next.currencyCode,
    lineDiffs,
    fields,
  };
}
