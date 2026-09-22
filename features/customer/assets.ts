import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The customer's asset registry.
 *
 * ⚠️ AN ASSET IS THE CUSTOMER'S OWN RECORD, AND ITS HISTORY IS A LOG OF DATES, NOT OF TYPING. Every timeline
 * entry carries the date the thing happened (`occurred_on`), separate from the date the row was written
 * (`created_at`), because a service that happened in March and was written down in June belongs in March on a
 * maintenance history. The page shows both.
 *
 * ⚠️ THE PLATFORM DOES NOT ENFORCE WARRANTIES, AND NOTHING HERE PRETENDS IT DOES. `warranty_expires_on` is
 * what the customer recorded, and the page words it that way. Filing a claim records the claim against the
 * asset and shows it to the provider the customer named; there is no adjudication, no payout and no status
 * beyond the two a customer can cause.
 */

export type CustomerAsset = {
  assetId: string;
  name: string;
  category: string;
  makeModel: string | null;
  serialNumber: string | null;
  installedOn: string | null;
  locationName: string | null;
  installedByProviderId: string | null;
  installedByName: string | null;
  installedBySlug: string | null;
  sourceAssignmentId: string | null;
  sourceRequestId: string | null;
  sourceRequestLabel: string | null;
  warrantyProviderName: string | null;
  warrantyExpiresOn: string | null;
  nextServiceDueOn: string | null;
  notes: string | null;
  documentUrls: string[];
  createdAt: string;
  updatedAt: string | null;
  serviceEventCount: number;
  lastServiceOn: string | null;
  openClaimCount: number;
};

export type AssetServiceEvent = {
  id: string;
  occurredOn: string;
  kind: string;
  summary: string;
  providerId: string | null;
  providerName: string | null;
  assignmentId: string | null;
  documentUrls: string[];
  recordedAt: string;
};

export type AssetWarrantyClaim = {
  id: string;
  reason: string;
  status: string;
  providerId: string | null;
  providerName: string | null;
  documentUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
};

type AssetRpcRow = {
  asset_id: string;
  name: string;
  category: string;
  make_model: string | null;
  serial_number: string | null;
  installed_on: string | null;
  location_name: string | null;
  installed_by_provider_id: string | null;
  installed_by_name: string | null;
  installed_by_slug: string | null;
  source_assignment_id: string | null;
  source_request_id: string | null;
  warranty_provider_name: string | null;
  warranty_expires_on: string | null;
  next_service_due_on: string | null;
  notes: string | null;
  document_urls: unknown;
  created_at: string;
  service_event_count: number;
  last_service_on: string | null;
  open_claim_count: number;
};

export type AssetDetailRow = CustomerAsset & {
  locationId: string | null;
  events: AssetServiceEvent[];
  claims: AssetWarrantyClaim[];
};

function parseUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * ⚠️ THE JSON IS PARSED, NOT CAST. `events` and `claims` arrive as `jsonb` aggregates, so a shape the database
 * never promised would take the whole page down if it were asserted. Anything malformed is skipped and the
 * timeline shows what it could read.
 */
function parseEvents(value: unknown): AssetServiceEvent[] {
  if (!Array.isArray(value)) return [];
  const events: AssetServiceEvent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.kind !== 'string') continue;
    events.push({
      id: record.id,
      occurredOn: typeof record.occurred_on === 'string' ? record.occurred_on : '',
      kind: record.kind,
      summary: typeof record.summary === 'string' ? record.summary : '',
      providerId: typeof record.provider_id === 'string' ? record.provider_id : null,
      providerName: typeof record.provider_name === 'string' ? record.provider_name : null,
      assignmentId: typeof record.assignment_id === 'string' ? record.assignment_id : null,
      documentUrls: parseUrls(record.document_urls),
      recordedAt: typeof record.recorded_at === 'string' ? record.recorded_at : '',
    });
  }
  return events;
}

function parseClaims(value: unknown): AssetWarrantyClaim[] {
  if (!Array.isArray(value)) return [];
  const claims: AssetWarrantyClaim[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.reason !== 'string') continue;
    claims.push({
      id: record.id,
      reason: record.reason,
      status: typeof record.status === 'string' ? record.status : 'open',
      providerId: typeof record.provider_id === 'string' ? record.provider_id : null,
      providerName: typeof record.provider_name === 'string' ? record.provider_name : null,
      documentUrls: parseUrls(record.document_urls),
      createdAt: typeof record.created_at === 'string' ? record.created_at : '',
      resolvedAt: typeof record.resolved_at === 'string' ? record.resolved_at : null,
    });
  }
  return claims;
}

export async function getCustomerAssets(): Promise<{ assets: CustomerAsset[]; unavailable: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_assets');
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read assets: ${error.message}`);
    }
    return { assets: [], unavailable: true };
  }

  return {
    assets: ((data ?? []) as AssetRpcRow[]).map(row => ({
      assetId: row.asset_id,
      name: row.name,
      category: row.category,
      makeModel: row.make_model,
      serialNumber: row.serial_number,
      installedOn: row.installed_on,
      locationName: row.location_name,
      installedByProviderId: row.installed_by_provider_id,
      installedByName: row.installed_by_name,
      installedBySlug: row.installed_by_slug,
      sourceAssignmentId: row.source_assignment_id,
      sourceRequestId: row.source_request_id,
      sourceRequestLabel: null,
      warrantyProviderName: row.warranty_provider_name,
      warrantyExpiresOn: row.warranty_expires_on,
      nextServiceDueOn: row.next_service_due_on,
      notes: row.notes,
      documentUrls: parseUrls(row.document_urls),
      createdAt: row.created_at,
      updatedAt: null,
      serviceEventCount: Number(row.service_event_count ?? 0),
      lastServiceOn: row.last_service_on,
      openClaimCount: Number(row.open_claim_count ?? 0),
    })),
    unavailable: false,
  };
}

type AssetDetailRpcRow = AssetRpcRow & {
  location_id: string | null;
  source_request_label: string | null;
  updated_at: string | null;
  events: unknown;
  claims: unknown;
};

export async function getCustomerAsset(assetId: string): Promise<{
  detail: AssetDetailRow | null;
  unavailable: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_asset', { p_asset_id: assetId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read the asset: ${error.message}`);
    }
    return { detail: null, unavailable: true };
  }

  const row = ((data ?? []) as AssetDetailRpcRow[])[0];
  // Another account's asset and an asset that does not exist both return no row: the function asserts
  // ownership in its WHERE clause, so the caller cannot tell the two apart and cannot probe an id.
  if (!row) return { detail: null, unavailable: false };

  return {
    detail: {
      assetId: row.asset_id,
      name: row.name,
      category: row.category,
      makeModel: row.make_model,
      serialNumber: row.serial_number,
      installedOn: row.installed_on,
      locationName: row.location_name,
      locationId: row.location_id,
      installedByProviderId: row.installed_by_provider_id,
      installedByName: row.installed_by_name,
      installedBySlug: row.installed_by_slug,
      sourceAssignmentId: row.source_assignment_id,
      sourceRequestId: row.source_request_id,
      sourceRequestLabel: row.source_request_label,
      warrantyProviderName: row.warranty_provider_name,
      warrantyExpiresOn: row.warranty_expires_on,
      nextServiceDueOn: row.next_service_due_on,
      notes: row.notes,
      documentUrls: parseUrls(row.document_urls),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      serviceEventCount: Number(row.service_event_count ?? 0),
      lastServiceOn: row.last_service_on,
      openClaimCount: Number(row.open_claim_count ?? 0),
      events: parseEvents(row.events),
      claims: parseClaims(row.claims),
    },
    unavailable: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Derived states. Each is derived on read, so none can go stale in a column.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type WarrantyState = 'active' | 'ending' | 'expired' | 'not_recorded';

export function warrantyState(asset: Pick<CustomerAsset, 'warrantyExpiresOn'>, now = Date.now()): WarrantyState {
  if (!asset.warrantyExpiresOn) return 'not_recorded';
  const expires = Date.parse(`${asset.warrantyExpiresOn}T23:59:59Z`);
  if (Number.isNaN(expires)) return 'not_recorded';
  if (expires < now) return 'expired';
  // Under sixty days is "ending": the point at which a claim needs to be made rather than considered.
  return expires - now < 60 * 86_400_000 ? 'ending' : 'active';
}

export const WARRANTY_COPY: Record<WarrantyState, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  active: { label: 'Under warranty', tone: 'teal' },
  ending: { label: 'Warranty ending soon', tone: 'amber' },
  expired: { label: 'Warranty expired', tone: 'slate' },
  not_recorded: { label: 'No warranty recorded', tone: 'slate' },
};

export function isMaintenanceDue(asset: Pick<CustomerAsset, 'nextServiceDueOn'>, now = Date.now()): boolean {
  if (!asset.nextServiceDueOn) return false;
  const due = Date.parse(`${asset.nextServiceDueOn}T23:59:59Z`);
  return !Number.isNaN(due) && due < now;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What the customer can call the thing, offered as suggestions rather than enforced: a registry that argues
 *  with its owner about vocabulary is a registry that stops being used. */
export const ASSET_CATEGORY_SUGGESTIONS = [
  'Air conditioning',
  'Generator',
  'Plumbing',
  'Electrical',
  'Boiler or water heater',
  'Roofing',
  'Appliance',
  'Security system',
  'Solar or inverter',
];

export const ASSET_EVENT_KINDS: { key: string; label: string }[] = [
  { key: 'service', label: 'Service' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'repair', label: 'Repair' },
  { key: 'note', label: 'Note' },
];

export const ASSET_EVENT_KIND_LABEL: Record<string, string> = {
  installed: 'Installed / registered',
  service: 'Service',
  maintenance: 'Maintenance',
  repair: 'Repair',
  warranty_claim: 'Warranty claim',
  note: 'Note',
};

export const ASSET_FAILURES = [
  'not_found',
  'not_authorized',
  'name_required',
  'bad_dates',
  'bad_link',
  'not_completed',
  'already_open',
  'too_short',
  'failed',
] as const;
export type AssetFailure = (typeof ASSET_FAILURES)[number];

export const ASSET_FAILURE_COPY: Record<AssetFailure, string> = {
  not_found: 'That asset is no longer on your account.',
  not_authorized: 'That is not yours to change.',
  name_required: 'Give the asset a name and say what kind of thing it is.',
  bad_dates: 'Check the dates — a warranty cannot end before the thing was installed, and history cannot start before it either.',
  bad_link:
    'Document links have to start with https://. The platform stores links, not files — there is no upload here.',
  not_completed: 'Only a job you have approved as complete can be recorded as the source of an asset.',
  already_open: 'You already have an open warranty claim on this asset.',
  too_short: 'Add a sentence or two so the entry means something later.',
  failed: 'That did not work, and nothing was changed. Try again.',
};

export function assetFailureCode(value: string | undefined | null): AssetFailure | null {
  if (!value) return null;
  return (ASSET_FAILURES as readonly string[]).includes(value) ? (value as AssetFailure) : null;
}

export function assetFailureFromMessage(message: string): AssetFailure {
  const text = message.toLowerCase();
  if (text.includes('start with https')) return 'bad_link';
  if (text.includes('cannot end before') || text.includes('cannot be due before') || text.includes('before the thing was installed')) return 'bad_dates';
  if (text.includes('only a completed job')) return 'not_completed';
  if (text.includes('already have an open')) return 'already_open';
  if (text.includes('give the asset a name') || text.includes('kind of thing')) return 'name_required';
  if (text.includes('not authorized')) return 'not_authorized';
  if (text.includes('not found') || text.includes('no longer exists')) return 'not_found';
  if (text.includes('say what') || text.includes('in a sentence')) return 'too_short';
  return 'failed';
}
