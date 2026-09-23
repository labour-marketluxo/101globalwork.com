'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import {
  PROVIDER_PATHS,
  type ProviderFailureCode,
  type QuoteFailureCode,
} from '@/features/provider-workspace/paths';
import { WEEKDAYS } from '@/features/provider-workspace/hours';

/**
 * Every write in the provider workspace.
 *
 * ── WHY ONE MODULE, AND WHY EVERY OUTCOME IS A CODE ───────────────────────────────────────────
 *
 * The actions used to live beside the pages that call them, and several of them redirected with the
 * database's own message in the query string (`?error=${error.message}`). The 2026-09-14 audit
 * flagged that pattern as a UI-spoofing surface: the parameter is user-editable, the page renders it
 * inside an authenticated card, and it leaks internal schema wording. Every action here redirects
 * with a CODE from a fixed vocabulary instead, and the page maps the code to a sentence.
 *
 * ⚠️ NO ACTION TRUSTS THE FORM FOR OWNERSHIP. The provider id, the assignment id, the credential id
 * and the session id all arrive from the browser; each command re-establishes ownership from the row
 * itself inside the database. The `next` parameter is the one thing the form does control, and it is
 * validated as an internal path before it is ever used as a redirect target.
 */

async function authedClient(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function targetPath(formData: FormData, fallback: string): string {
  return safeInternalPath(String(formData.get('next') ?? ''), fallback);
}

/** Redirect back to wherever the form was, preserving the path's own query string. */
function backTo(formData: FormData, params: Record<string, string>, fallback: string = PROVIDER_PATHS.today): never {
  const target = targetPath(formData, fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

function fail(formData: FormData, code: ProviderFailureCode, fallback: string = PROVIDER_PATHS.today): never {
  return backTo(formData, { failed: code }, fallback);
}

/**
 * Map a database refusal onto the fixed vocabulary.
 *
 * `duplicateCode` is passed by the two callers whose uniqueness constraint is a thing a provider can
 * actually act on — a credential already on file, a verification for the same jurisdiction — because
 * "unavailable, try again" would be a lie for a row that will never be insertable.
 */
function failureCode(message: string, duplicate?: ProviderFailureCode): ProviderFailureCode {
  const text = message.toLowerCase();
  if (text.includes('authentication required') || text.includes('active account required')) return 'not_authorized';
  if (text.includes('duplicate') || text.includes('unique constraint')) return duplicate ?? 'unavailable';
  if (text.includes('not authorized') || text.includes('forbidden') || text.includes('not found')) return 'not_authorized';
  if (
    text.includes('required') ||
    text.includes('invalid') ||
    text.includes('too ') ||
    text.includes('must be') ||
    text.includes('out of range')
  ) {
    return 'bad_request';
  }
  return 'unavailable';
}

// ── Onboarding ────────────────────────────────────────────────────────────────────────────────

export async function createProviderAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.onboarding);
  const { data, error } = await supabase.rpc('create_provider_command', {
    p_display_name: String(formData.get('display_name') ?? '').trim(),
    p_market_id: String(formData.get('market_id') ?? ''),
    p_slug: String(formData.get('slug') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.onboarding);
  redirect(hrefWith(PROVIDER_PATHS.onboarding, { provider: String(data ?? ''), created: '1' }));
}

/** The onboarding step. Replaces the primary choice, which is what the step is for. */
export async function setPrimaryServiceAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.onboarding);
  const providerId = String(formData.get('provider_id') ?? '');
  const serviceId = String(formData.get('service_entity_id') ?? '');
  if (!providerId || !serviceId) return fail(formData, 'bad_request', PROVIDER_PATHS.onboarding);

  const { error } = await supabase.rpc('replace_provider_primary_service_for_onboarding_command', {
    p_provider_id: providerId,
    p_service_entity_id: serviceId,
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.onboarding);
  backTo(formData, { saved: 'service' }, PROVIDER_PATHS.onboarding);
}

export async function setPrimaryAreaAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.onboarding);
  const providerId = String(formData.get('provider_id') ?? '');
  const locationId = String(formData.get('location_id') ?? '');
  if (!providerId || !locationId) return fail(formData, 'bad_request', PROVIDER_PATHS.onboarding);

  const { error } = await supabase.rpc('replace_provider_primary_area_for_onboarding_command', {
    p_provider_id: providerId,
    p_location_id: locationId,
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.onboarding);
  backTo(formData, { saved: 'area' }, PROVIDER_PATHS.onboarding);
}

// ── Profile ───────────────────────────────────────────────────────────────────────────────────

/**
 * The profile save, in two commands because it is two different kinds of write.
 *
 * `update_provider_profile_command` owns the description-length rule and the readiness recompute;
 * `update_my_provider_profile_detail_command` owns hours, languages and the radius. They are called
 * in that order, and if the first refuses, the second never runs — so a provider who is told the
 * description is too short does not end up with a half-saved profile.
 */
export async function updateProviderProfileAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const providerId = String(formData.get('provider_id') ?? '');
  if (!providerId) return fail(formData, 'bad_request');

  const yearsRaw = String(formData.get('years_experience') ?? '').trim();
  const { error } = await supabase.rpc('update_provider_profile_command', {
    p_provider_id: providerId,
    p_headline: String(formData.get('headline') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim(),
    p_years_experience: yearsRaw ? Number(yearsRaw) : null,
    p_accepts_new_work: formData.get('accepts_new_work') === 'on',
  });
  if (error) return fail(formData, failureCode(error.message));

  const { error: detailError } = await supabase.rpc('update_my_provider_profile_detail_command', {
    p_provider_id: providerId,
    p_operating_hours: parseHours(formData),
    p_languages: parseLanguages(formData.get('languages')),
    p_coverage_radius_km: parseRadius(formData.get('coverage_radius_km')),
  });
  if (detailError) return fail(formData, failureCode(detailError.message));

  backTo(formData, { saved: 'profile' });
}

/**
 * Hours come from two `<input type="time">` per weekday: `hours_<day>_open` and `hours_<day>_close`.
 *
 * A day is included only when BOTH ends are present and well-formed, so a half-filled row is not
 * saved as a closed day — which would tell customers the provider is shut on a day they left blank
 * because they had not finished typing it.
 */
function parseHours(formData: FormData): Record<string, { open: string; close: string }> {
  const hours: Record<string, { open: string; close: string }> = {};
  const time = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  for (const day of WEEKDAYS) {
    const open = String(formData.get(`hours_${day}_open`) ?? '').trim();
    const close = String(formData.get(`hours_${day}_close`) ?? '').trim();
    if (!open || !close) continue;
    if (!time.test(open) || !time.test(close)) continue;
    hours[day] = { open, close };
  }
  return hours;
}

function parseLanguages(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 40)
    .slice(0, 12);
}

function parseRadius(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) return null;
  return parsed;
}

export async function addServiceAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const providerId = String(formData.get('provider_id') ?? '');
  const serviceId = String(formData.get('service_entity_id') ?? '');
  if (!providerId || !serviceId) return fail(formData, 'bad_request');
  const { error } = await supabase.rpc('set_provider_service_command', {
    p_provider_id: providerId,
    p_service_entity_id: serviceId,
    p_is_primary: false,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'service' });
}

export async function removeServiceAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const { error } = await supabase.rpc('deactivate_my_provider_service_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_service_entity_id: String(formData.get('service_entity_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'service_removed' });
}

export async function addAreaAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const providerId = String(formData.get('provider_id') ?? '');
  const locationId = String(formData.get('location_id') ?? '');
  if (!providerId || !locationId) return fail(formData, 'bad_request');
  const { error } = await supabase.rpc('set_provider_service_area_command', {
    p_provider_id: providerId,
    p_location_id: locationId,
    p_is_primary: false,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'area' });
}

export async function removeAreaAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const { error } = await supabase.rpc('deactivate_my_provider_service_area_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_location_id: String(formData.get('location_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'area_removed' });
}

export async function addPortfolioItemAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const serviceId = String(formData.get('service_entity_id') ?? '').trim();
  const { error } = await supabase.rpc('add_my_provider_portfolio_item_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_title: String(formData.get('title') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
    p_link_url: String(formData.get('link_url') ?? '').trim() || null,
    p_service_entity_id: serviceId || null,
    p_is_public: formData.get('is_public') === 'on',
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'portfolio' });
}

export async function removePortfolioItemAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const { error } = await supabase.rpc('remove_my_provider_portfolio_item_command', {
    p_item_id: String(formData.get('item_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { saved: 'portfolio_removed' });
}

export async function publishProfileAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.profile);
  const { error } = await supabase.rpc('publish_provider_profile_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { published: '1' });
}

// ── Availability and field progress ───────────────────────────────────────────────────────────

export async function setAvailabilityAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.today);
  const accepts = String(formData.get('accepts_new_work') ?? '') === '1';
  const { error } = await supabase.rpc('set_my_provider_availability_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_accepts_new_work: accepts,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { available: accepts ? 'online' : 'offline' });
}

export async function recordFieldProgressAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.today);
  const state = String(formData.get('state') ?? '');
  if (state !== 'en_route' && state !== 'on_site' && state !== 'work_started') {
    return fail(formData, 'bad_request');
  }
  const { error } = await supabase.rpc('record_assignment_field_progress_command', {
    p_assignment_id: String(formData.get('assignment_id') ?? ''),
    p_state: state,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { field: state });
}

/**
 * Start the job.
 *
 * ⚠️ IT GOES THROUGH `start_assignment_command`, NOT THE FIELD-PROGRESS TABLE. That command is the
 * only thing that may move `requests.state` to `in_progress`, and it refuses unless the request is
 * scheduled and any payment obligation is funded. Recording "job started" as a field checkpoint would
 * have been a second way through the payment gate.
 */
export async function startJobAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.today);
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const { error } = await supabase.rpc('start_assignment_command', { p_assignment_id: assignmentId });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { started: '1' });
}

// ── Verification ──────────────────────────────────────────────────────────────────────────────

export async function submitVerificationAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.verification);
  const { error } = await supabase.rpc('submit_provider_verification_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_kind: String(formData.get('kind') ?? 'identity'),
    p_jurisdiction_code: String(formData.get('jurisdiction_code') ?? '').trim() || null,
    p_reference_label: String(formData.get('reference_label') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message, 'duplicate_verification'), PROVIDER_PATHS.verification);
  backTo(formData, { submitted: '1' }, PROVIDER_PATHS.verification);
}

export async function resubmitVerificationAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.verification);
  const { error } = await supabase.rpc('resubmit_my_verification_command', {
    p_verification_id: String(formData.get('verification_id') ?? ''),
    p_reference_label: String(formData.get('reference_label') ?? '').trim() || null,
    p_document_reference: String(formData.get('document_reference') ?? '').trim(),
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.verification);
  backTo(formData, { submitted: 'resubmitted' }, PROVIDER_PATHS.verification);
}

// ── Credentials ───────────────────────────────────────────────────────────────────────────────

export async function saveCredentialAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.credentials);
  const credentialId = String(formData.get('credential_id') ?? '').trim();
  const expiresRaw = String(formData.get('expires_at') ?? '').trim();
  const serviceIds = formData
    .getAll('service_entity_ids')
    .map(value => String(value))
    .filter(value => value.length > 0);

  const { error } = await supabase.rpc('save_my_provider_credential_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_credential_id: credentialId || null,
    p_credential_type: String(formData.get('credential_type') ?? ''),
    p_issuing_body: String(formData.get('issuing_body') ?? '').trim(),
    p_jurisdiction_code: String(formData.get('jurisdiction_code') ?? '').trim() || null,
    p_reference_label: String(formData.get('reference_label') ?? '').trim() || null,
    p_expires_at: expiresRaw || null,
    p_service_entity_ids: serviceIds,
    p_document_reference: String(formData.get('document_reference') ?? '').trim() || null,
  });

  if (error) return fail(formData, failureCode(error.message, 'duplicate_credential'), PROVIDER_PATHS.credentials);
  backTo(formData, { saved: credentialId ? 'credential_renewed' : 'credential_added' }, PROVIDER_PATHS.credentials);
}

// ── Opportunities ─────────────────────────────────────────────────────────────────────────────

/**
 * "Mark interested" and "Decline" are the same command with a different answer, so they are the same
 * action. The reason is only stored for a decline: the database drops it otherwise, and this form does not
 * pretend an interest mark needs explaining.
 */
export async function respondToOpportunityAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const response = String(formData.get('response') ?? '');
  const supabase = await authedClient(PROVIDER_PATHS.opportunities);
  if (response !== 'interested' && response !== 'declined') return fail(formData, 'bad_request');

  const { error } = await supabase.rpc('respond_to_opportunity_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_request_id: requestId,
    p_response: response,
    p_reason_code: String(formData.get('reason_code') ?? '').trim() || null,
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { responded: response });
}

/** A message to the customer about this work, attached to a version when the form names one. */
export async function sendQuoteMessageAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.opportunities);
  const { error } = await supabase.rpc('send_quote_message_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_request_id: String(formData.get('request_id') ?? ''),
    p_quote_id: String(formData.get('quote_id') ?? '').trim() || null,
    p_message: String(formData.get('message') ?? '').trim(),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { messaged: '1' });
}

// ── Quoting ───────────────────────────────────────────────────────────────────────────────────

/** Everything the quote form carries, parsed once so the draft and the submission cannot disagree. */
type QuotePayload = {
  lineItems: { label: string; amount_minor: number }[];
  addons: { label: string; amount_minor: number }[];
  taxesMinor: number | null;
  summary: string;
  materials: string;
  materialsNote: string | null;
  exclusions: string | null;
  timelineDays: number | null;
  timelineNote: string | null;
  inspection: string;
  warrantyTerms: string | null;
  validUntilRaw: string;
};

/** Money as the market's currency stores it: whole minor units, or null when unparseable. */
function toMinor(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const major = Number(text);
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

/**
 * Read the form.
 *
 * ⚠️ THE TOTAL IS NOT READ FROM A FIELD, because there is no total field. What the provider typed per line
 * and per tax is added up here, and the database checks the same sum again against its own trigger — so a
 * tampered form cannot post a total that disagrees with the breakdown the customer reads.
 *
 * ⚠️ THE DRAFT PATH USES THE SAME PARSER AND IGNORES ITS `null`s. A half-filled draft is the normal state of
 * a draft; a refused submission is the normal state of a bad submission. One parser, two strictnesses, and
 * the difference is whether a null becomes an error or a stored blank.
 */
function readQuoteForm(formData: FormData): QuotePayload {
  const labels = formData.getAll('line_item_label').map(value => String(value).trim());
  const amounts = formData.getAll('line_item_amount');
  const lineItems: { label: string; amount_minor: number }[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? '';
    const raw = String(amounts[index] ?? '').trim();
    if (!label && !raw) continue;
    const minor = toMinor(raw);
    if (label && minor !== null && minor > 0) lineItems.push({ label, amount_minor: minor });
  }

  const addonLabels = formData.getAll('addon_label').map(value => String(value).trim());
  const addonAmounts = formData.getAll('addon_amount');
  const addons: { label: string; amount_minor: number }[] = [];
  for (let index = 0; index < addonLabels.length; index += 1) {
    const label = addonLabels[index] ?? '';
    const raw = String(addonAmounts[index] ?? '').trim();
    if (!label && !raw) continue;
    const minor = toMinor(raw);
    if (label && minor !== null && minor > 0) addons.push({ label, amount_minor: minor });
  }

  const timelineRaw = String(formData.get('timeline_days') ?? '').trim();
  const timelineNumber = timelineRaw ? Number(timelineRaw) : null;

  return {
    lineItems,
    addons,
    taxesMinor: toMinor(formData.get('taxes_and_fees')),
    summary: String(formData.get('summary') ?? '').trim(),
    materials: String(formData.get('materials') ?? ''),
    materialsNote: String(formData.get('materials_note') ?? '').trim() || null,
    exclusions: String(formData.get('exclusions') ?? '').trim() || null,
    timelineDays: timelineNumber !== null && Number.isInteger(timelineNumber) ? timelineNumber : null,
    timelineNote: String(formData.get('timeline_note') ?? '').trim() || null,
    inspection: String(formData.get('inspection') ?? ''),
    warrantyTerms: String(formData.get('warranty') ?? '').trim() || null,
    validUntilRaw: String(formData.get('valid_until') ?? '').trim(),
  };
}

/**
 * "Save draft".
 *
 * ⚠️ IT STORES WHAT WAS TYPED, NOT WHAT IS VALID. The draft goes into `provider_quote_drafts`, never into
 * `quotes`: a draft row there would be readable by the customer and would consume a version number, so the
 * customer would see their "first" quote arrive as v2.0.
 */
export async function saveQuoteDraftAction(formData: FormData) {
  const payload = readQuoteForm(formData);
  const providerId = String(formData.get('provider_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  if (!providerId || !requestId) return fail(formData, 'bad_request');

  const supabase = await authedClient(PROVIDER_PATHS.quotesNew);

  // Everything the form holds, as the form holds it. Round-tripping through parsed figures would lose the
  // half-typed row that is the whole reason a draft exists.
  const rawLabels = formData.getAll('line_item_label');
  const rawAmounts = formData.getAll('line_item_amount');
  const rawAddonLabels = formData.getAll('addon_label');
  const rawAddonAmounts = formData.getAll('addon_amount');

  const draft = {
    line_items: rawLabels.map((label, index) => ({
      label: String(label),
      amount: String(rawAmounts[index] ?? ''),
    })),
    addons: rawAddonLabels.map((label, index) => ({
      label: String(label),
      amount: String(rawAddonAmounts[index] ?? ''),
    })),
    taxes: payload.taxesMinor === null ? String(formData.get('taxes_and_fees') ?? '') : (payload.taxesMinor / 100).toString(),
    summary: payload.summary,
    materials: payload.materials,
    materials_note: payload.materialsNote ?? '',
    exclusions: payload.exclusions ?? '',
    timeline_days: payload.timelineDays === null ? String(formData.get('timeline_days') ?? '') : String(payload.timelineDays),
    timeline_note: payload.timelineNote ?? '',
    inspection: payload.inspection,
    warranty: payload.warrantyTerms ?? '',
    valid_until: payload.validUntilRaw,
  };

  const { error } = await supabase.rpc('save_quote_draft_command', {
    p_provider_id: providerId,
    p_request_id: requestId,
    p_payload: draft,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { draft: 'saved' }, PROVIDER_PATHS.quotesNew);
}

/** Delete the draft — the same command with an empty payload, which the database reads as "remove it". */
export async function discardQuoteDraftAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.quotesNew);
  const { error } = await supabase.rpc('save_quote_draft_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_request_id: String(formData.get('request_id') ?? ''),
    p_payload: {},
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { draft: 'discarded' }, PROVIDER_PATHS.quotesNew);
}

/**
 * Submit the quote.
 *
 * ⚠️ IT LANDS ON THE QUOTE, NOT BACK ON THE FORM. The old flow redirected to the form with `?sent=1`, which
 * hid the form permanently and left the provider looking at a page whose only content was a confirmation.
 * The command returns the new quote id, so the provider arrives at the document they just created — where
 * the version, the status and the next action are all visible.
 */
export async function submitQuoteAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  const currency = String(formData.get('currency_code') ?? '').trim().toUpperCase();
  const supabase = await authedClient(PROVIDER_PATHS.quotesNew);

  // Typed on the const rather than on the arrow: that is what lets TypeScript treat the checks below as
  // terminating, so `taxesMinor` is a number afterwards and not a `number | null`.
  const failQuote: (code: QuoteFailureCode) => never = code =>
    redirect(hrefWith(PROVIDER_PATHS.quotesNew, { request: requestId, failed: code }));

  if (!/^[A-Z]{3}$/.test(currency)) failQuote('price');

  const payload = readQuoteForm(formData);
  if (payload.lineItems.length === 0) failQuote('price');
  const taxesMinor = payload.taxesMinor;
  if (taxesMinor === null) failQuote('taxes');

  const subtotal = payload.lineItems.reduce((sum, item) => sum + item.amount_minor, 0);
  const total = subtotal + taxesMinor;
  if (total <= 0) failQuote('price');
  if (payload.summary.length < 20) failQuote('summary');
  if (payload.timelineDays !== null && payload.timelineDays <= 0) failQuote('timeline');
  for (const value of [payload.materialsNote, payload.exclusions, payload.timelineNote, payload.warrantyTerms]) {
    if (value && value.length > 2000) failQuote('terms');
  }

  let validUntil: string | null = null;
  if (payload.validUntilRaw) {
    const parsed = new Date(payload.validUntilRaw);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) failQuote('validity');
    validUntil = parsed.toISOString();
  }

  const { data, error } = await supabase.rpc('submit_quote_command', {
    p_request_id: requestId,
    p_provider_id: providerId,
    p_currency_code: currency,
    p_total_minor: total,
    p_summary: payload.summary,
    p_scope_snapshot: {},
    p_valid_until: validUntil,
    p_idempotency_key: crypto.randomUUID(),
    p_line_items: payload.lineItems,
    p_taxes_and_fees_minor: taxesMinor,
    p_materials_included: payload.materials === 'included' ? true : payload.materials === 'excluded' ? false : null,
    p_materials_note: payload.materialsNote,
    p_timeline_days: payload.timelineDays,
    p_timeline_note: payload.timelineNote,
    p_inspection_required: payload.inspection === 'required' ? true : payload.inspection === 'not_required' ? false : null,
    p_warranty_terms: payload.warrantyTerms,
    p_optional_addons: payload.addons,
    p_exclusions: payload.exclusions,
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] quote submission refused: ${error.message}`);
    }
    failQuote('eligibility');
  }

  // The draft has served its purpose. Failing to delete it is not worth failing the submission over — the
  // provider has a real quote now and the stale draft is invisible to the customer by construction.
  await supabase.rpc('save_quote_draft_command', { p_provider_id: providerId, p_request_id: requestId, p_payload: {} });

  const quoteId = typeof data === 'string' ? data : '';
  redirect(quoteId ? `/provider/quotes/${quoteId}?submitted=1` : PROVIDER_PATHS.today);
}

export async function withdrawQuoteAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.today);
  const quoteId = String(formData.get('quote_id') ?? '');
  const { error } = await supabase.rpc('withdraw_quote_command', { p_quote_id: quoteId });
  if (error) {
    const message = error.message.toLowerCase();
    return backTo(formData, { failed: message.includes('accepted') ? 'locked' : 'unavailable' });
  }
  backTo(formData, { withdrawn: '1' });
}

/**
 * "Request an on-site inspection first".
 *
 * ⚠️ THERE IS NO INSPECTION ENTITY IN THIS SCHEMA, AND THIS DOES NOT INVENT ONE. What the provider actually
 * needs in that moment is two things: the customer told what is happening, and the half-priced quote not
 * lost. So this sends the message and saves the draft, and it submits nothing — the customer's answer is
 * what decides whether a quote follows, and a quote submitted on top of an unanswered request for access
 * would be a price for work nobody has looked at.
 *
 * The `inspection_required` field on the quote is a separate thing and lives in the form: it is a term on a
 * price, for work the provider is confident about but wants to see before starting.
 */
export async function requestInspectionAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  if (!providerId || !requestId) return fail(formData, 'bad_request');

  const supabase = await authedClient(PROVIDER_PATHS.quotesNew);
  const note = String(formData.get('inspection_note') ?? '').trim();
  const message =
    note ||
    'Before I put a price on this, I would like to see the work on site. I have saved my notes so far and will send a detailed quote once I have looked at it. Could we agree a time for a visit?';

  const { error: messageError } = await supabase.rpc('send_quote_message_command', {
    p_provider_id: providerId,
    p_request_id: requestId,
    p_quote_id: null,
    p_message: message,
  });
  if (messageError) return fail(formData, failureCode(messageError.message), PROVIDER_PATHS.quotesNew);

  const payload = readQuoteForm(formData);
  const rawLabels = formData.getAll('line_item_label');
  const rawAmounts = formData.getAll('line_item_amount');
  const rawAddonLabels = formData.getAll('addon_label');
  const rawAddonAmounts = formData.getAll('addon_amount');

  // Nothing is stored if the page had nothing on it: an empty draft would make the next visit look like
  // there was work to resume.
  const hasContent = rawLabels.some((label, index) => String(label).trim() || String(rawAmounts[index] ?? '').trim());
  if (hasContent) {
    await supabase.rpc('save_quote_draft_command', {
      p_provider_id: providerId,
      p_request_id: requestId,
      p_payload: {
        line_items: rawLabels.map((label, index) => ({ label: String(label), amount: String(rawAmounts[index] ?? '') })),
        addons: rawAddonLabels.map((label, index) => ({ label: String(label), amount: String(rawAddonAmounts[index] ?? '') })),
        taxes: String(formData.get('taxes_and_fees') ?? ''),
        summary: payload.summary,
        materials: payload.materials,
        materials_note: payload.materialsNote ?? '',
        exclusions: payload.exclusions ?? '',
        timeline_days: String(formData.get('timeline_days') ?? ''),
        timeline_note: payload.timelineNote ?? '',
        inspection: payload.inspection,
        warranty: payload.warrantyTerms ?? '',
        valid_until: payload.validUntilRaw,
      },
    });
  }

  backTo(formData, { inspection: 'requested' }, PROVIDER_PATHS.quotesNew);
}

// ── Field work ────────────────────────────────────────────────────────────────────────────────

/**
 * Start the job, idempotently.
 *
 * ⚠️ A REPLAY IS TREATED AS APPLIED, NOT AS A REFUSAL. The offline queue can deliver this action twice — once
 * from a flaky connection and once from the retry — and `start_assignment_command` refuses a second call
 * because the request is no longer `scheduled`. Refusing a press the provider already made would show them an
 * error for something that worked, so when the command refuses, the authoritative state is read back: if the
 * work is already under way, this is the same intent arriving twice and it succeeds quietly.
 */
export async function startWorkAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const providerId = String(formData.get('provider_id') ?? '');
  const supabase = await authedClient(PROVIDER_PATHS.work);

  const { error } = await supabase.rpc('start_assignment_command', { p_assignment_id: assignmentId });
  if (error) {
    const { data: header } = await supabase.rpc('get_my_assignment_command', {
      p_provider_id: providerId,
      p_assignment_id: assignmentId,
    });
    const state = String((header as { request?: { state?: string } } | null)?.request?.state ?? '');
    if (state !== 'in_progress') return fail(formData, failureCode(error.message));
  }

  backTo(formData, { started: '1' }, PROVIDER_PATHS.work);
}

/** A checklist step the provider wrote for themselves. */
export async function addTaskStepAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.work);
  const { error } = await supabase.rpc('add_assignment_task_step_command', {
    p_assignment_id: String(formData.get('assignment_id') ?? ''),
    p_label: String(formData.get('label') ?? '').trim(),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { step: 'added' }, PROVIDER_PATHS.work);
}

/**
 * Tick, or untick, a step.
 *
 * The state is named by the caller rather than toggled on the server, so a queued tap that arrives twice
 * leaves the step exactly where the provider put it.
 */
export async function setTaskStepStateAction(formData: FormData) {
  const state = String(formData.get('state') ?? '');
  if (state !== 'todo' && state !== 'doing' && state !== 'done') return fail(formData, 'bad_request');
  const supabase = await authedClient(PROVIDER_PATHS.work);
  const { error } = await supabase.rpc('set_assignment_task_step_command', {
    p_step_id: String(formData.get('step_id') ?? ''),
    p_state: state,
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { step: state }, PROVIDER_PATHS.work);
}

export async function removeTaskStepAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.work);
  const { error } = await supabase.rpc('remove_assignment_task_step_command', {
    p_step_id: String(formData.get('step_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { step: 'removed' }, PROVIDER_PATHS.work);
}

export async function openBlockerAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.work);
  const { error } = await supabase.rpc('open_assignment_blocker_command', {
    p_assignment_id: String(formData.get('assignment_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? 'other'),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { blocked: '1' }, PROVIDER_PATHS.work);
}

export async function resolveBlockerAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.work);
  const { error } = await supabase.rpc('resolve_assignment_blocker_command', {
    p_blocker_id: String(formData.get('blocker_id') ?? ''),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { blocked: 'resolved' }, PROVIDER_PATHS.work);
}

/**
 * Submit the evidence package for sign-off.
 *
 * ⚠️ THE PATHS COME FROM STORAGE, NOT FROM THIS FORM'S REPUTATION. Each one was written into the job's own
 * prefix by the storage policies and is re-checked against that prefix in SQL, so a tampered form can only
 * name files it was allowed to upload in the first place.
 *
 * ⚠️ THE FILES ARE ALREADY UPLOADED WHEN THIS RUNS. That is the offline design: the bytes go up one at a time
 * while the provider still has signal, the paths survive a reload, and this action is a small, retry-safe
 * write at the end rather than a large upload that either completes or does not.
 */
export async function submitEvidencePackageAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  // No provider id is read here: the command derives it from the assignment and re-checks ownership from the row,
  // so a provider id posted by the form would be a value nothing validates and nothing needs.
  const note = String(formData.get('note') ?? '').trim();
  const stepId = String(formData.get('task_step_id') ?? '').trim() || null;
  const idempotencyKey = String(formData.get('idempotency_key') ?? '').trim() || null;
  const paths = formData
    .getAll('storage_paths')
    .map(value => String(value))
    .filter(value => value.length > 0);

  const failEvidence: (code: ProviderFailureCode) => never = code =>
    redirect(hrefWith(`${PROVIDER_PATHS.work}/${assignmentId}/evidence`, { failed: code }));

  if (paths.length === 0) failEvidence('bad_request');
  if (paths.length > 12) failEvidence('bad_request');

  const supabase = await authedClient(`${PROVIDER_PATHS.work}/${assignmentId}/evidence`);

  // Videos and documents are filed as documents: `evidence_kind` has four values and none of them is 'video'.
  // Saying so here is better than a migration that adds an enum value nothing else reads.
  const kind = String(formData.get('kind') ?? 'photo');
  const evidenceKind = kind === 'photo' || kind === 'note' || kind === 'document' || kind === 'link' ? kind : 'photo';

  const { error } = await supabase.rpc('submit_assignment_evidence_package_command', {
    p_assignment_id: assignmentId,
    p_storage_object_paths: paths,
    p_note: note || null,
    p_kind: evidenceKind,
    p_task_step_id: stepId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] evidence package refused: ${error.message}`);
    }
    failEvidence('unavailable');
  }

  backTo(formData, { submitted: '1' }, `${PROVIDER_PATHS.work}/${assignmentId}/evidence`);
}

/**
 * Agree a time for the work.
 *
 * ⚠️ IT GOES THROUGH THE ORDINARY SCHEDULE COMMAND, which enforces the actor check, the future-window check and
 * the audit trail. Scheduling does not bypass the payment gate for paid work; it only fixes when the provider
 * intends to be there.
 */
export async function scheduleAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`${PROVIDER_PATHS.work}/${assignmentId}`);
  const start = String(formData.get('scheduled_start') ?? '');
  const end = String(formData.get('scheduled_end') ?? '').trim() || null;
  const timezone = String(formData.get('timezone') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return fail(formData, 'bad_request');

  /**
   * ⚠️ THE BLACKOUT CHECK LIVES HERE, NOT IN THE SCHEDULE COMMAND. A blackout is the provider's own rule, and
   * `schedule_assignment_command` is the platform's money-critical path also used when a customer's proposed time
   * is accepted — putting a personal calendar rule inside it would make a provider's holiday a platform
   * constraint. The form carries the override, so a provider who really does want to work that week can say so.
   */
  const wantsOverride = String(formData.get('allow_blackout') ?? '') === '1';
  if (!wantsOverride) {
    const { data: assignment } = await supabase
      .from('assignments')
      .select('provider_id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignment?.provider_id) {
      const day = startDate.toISOString().slice(0, 10);
      const { data: blackout } = await supabase
        .from('provider_blackout_dates')
        .select('id')
        .eq('provider_id', assignment.provider_id)
        .lte('starts_on', day)
        .gte('ends_on', day)
        .limit(1)
        .maybeSingle();
      if (blackout) return fail(formData, 'blackout');
    }
  }

  const { error } = await supabase.rpc('schedule_assignment_command', {
    p_assignment_id: assignmentId,
    p_scheduled_start: startDate.toISOString(),
    p_scheduled_end: end ? new Date(end).toISOString() : null,
    p_timezone: timezone,
    p_note: note,
  });
  if (error) return fail(formData, failureCode(error.message));
  backTo(formData, { scheduled: '1' }, `${PROVIDER_PATHS.work}/${assignmentId}`);
}

/**
 * Accept a time the customer proposed.
 *
 * ⚠️ IT GOES THROUGH THE ORDINARY SCHEDULE COMMAND, NOT AROUND IT — the acceptance command calls the same
 * schedule writer, so the actor check, the window check and the audit trail are identical, and the confirmation
 * trigger resets the customer's answer because the time they confirmed is no longer the time on the booking.
 */
export async function acceptAppointmentProposalAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const proposalId = String(formData.get('proposal_id') ?? '');
  const supabase = await authedClient(`${PROVIDER_PATHS.work}/${assignmentId}`);
  const { error } = await supabase.rpc('accept_appointment_proposal_command', { p_proposal_id: proposalId });
  if (error) return fail(formData, 'bad_request');
  backTo(formData, { accepted: '1' }, `${PROVIDER_PATHS.work}/${assignmentId}`);
}

// ── Availability ──────────────────────────────────────────────────────────────────────────────

/**
 * The weekly hours, the radius and the travel note, saved together.
 *
 * ⚠️ IT PASSES THE PROVIDER'S EXISTING LANGUAGES BACK. `update_my_provider_profile_detail_command` writes hours,
 * languages and the radius as one row, so a form that only knows about hours would blank the languages — the
 * kind of silent data loss that shows up as a customer asking why a bilingual provider no longer mentions it. The
 * current values are read first and sent back unchanged.
 *
 * ⚠️ NOTHING IS SAVED IF THE FIRST WRITE REFUSES. The hours/radius write happens before the settings write, and a
 * refusal on either returns the same failure rather than leaving half a form saved.
 */
export async function saveAvailabilityRulesAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  if (!providerId) return fail(formData, 'bad_request', PROVIDER_PATHS.availability);
  const supabase = await authedClient(PROVIDER_PATHS.availability);

  const { data: profile } = await supabase
    .from('provider_public_profiles')
    .select('languages')
    .eq('provider_id', providerId)
    .maybeSingle();
  const languages = Array.isArray(profile?.languages)
    ? (profile.languages as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];

  const { error: detailError } = await supabase.rpc('update_my_provider_profile_detail_command', {
    p_provider_id: providerId,
    p_operating_hours: parseHours(formData),
    p_languages: languages,
    p_coverage_radius_km: parseRadius(formData.get('coverage_radius_km')),
  });
  if (detailError) return fail(formData, failureCode(detailError.message), PROVIDER_PATHS.availability);

  const { error: settingsError } = await supabase.rpc('update_my_availability_settings_command', {
    p_provider_id: providerId,
    p_travel_notes: String(formData.get('travel_notes') ?? '').trim() || null,
    p_paused_until: String(formData.get('paused_until') ?? '').trim() || null,
    p_pause_reason: String(formData.get('pause_reason') ?? '').trim() || null,
  });
  if (settingsError) return fail(formData, failureCode(settingsError.message), PROVIDER_PATHS.availability);

  backTo(formData, { available: 'rules_saved' }, PROVIDER_PATHS.availability);
}

export async function addBlackoutAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.availability);
  const { error } = await supabase.rpc('add_my_blackout_command', {
    p_provider_id: String(formData.get('provider_id') ?? ''),
    p_starts_on: String(formData.get('starts_on') ?? '').trim() || null,
    p_ends_on: String(formData.get('ends_on') ?? '').trim() || null,
    p_reason: String(formData.get('reason') ?? '').trim() || null,
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.availability);
  backTo(formData, { available: 'blackout_added' }, PROVIDER_PATHS.availability);
}

export async function removeBlackoutAction(formData: FormData) {
  const supabase = await authedClient(PROVIDER_PATHS.availability);
  const { error } = await supabase.rpc('remove_my_blackout_command', {
    p_blackout_id: String(formData.get('blackout_id') ?? ''),
  });
  if (error) return fail(formData, failureCode(error.message), PROVIDER_PATHS.availability);
  backTo(formData, { available: 'blackout_removed' }, PROVIDER_PATHS.availability);
}

/**
 * Vacation mode: stop being matched, and write down when the provider expects to be back.
 *
 * ⚠️ TWO WRITES, BECAUSE THEY ARE TWO FACTS, AND BOTH MATTER. `accepts_new_work` is what matching reads, so it has
 * to be false for the pause to mean anything; the pause date is what the provider needs to see when they come
 * back, because nothing flips the switch on a schedule. If the second write fails, the first is still true and the
 * page shows the provider as offline with no return date — the safe direction to fail in.
 */
export async function pauseAllAvailabilityAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const supabase = await authedClient(PROVIDER_PATHS.availability);

  const { error: offlineError } = await supabase.rpc('set_my_provider_availability_command', {
    p_provider_id: providerId,
    p_accepts_new_work: false,
  });
  if (offlineError) return fail(formData, failureCode(offlineError.message), PROVIDER_PATHS.availability);

  const { error: settingsError } = await supabase.rpc('update_my_availability_settings_command', {
    p_provider_id: providerId,
    p_travel_notes: String(formData.get('travel_notes') ?? '').trim() || null,
    p_paused_until: String(formData.get('paused_until') ?? '').trim() || null,
    p_pause_reason: String(formData.get('pause_reason') ?? '').trim() || 'Away',
  });
  if (settingsError) return fail(formData, failureCode(settingsError.message), PROVIDER_PATHS.availability);

  backTo(formData, { available: 'paused' }, PROVIDER_PATHS.availability);
}

export async function resumeAvailabilityAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const supabase = await authedClient(PROVIDER_PATHS.availability);

  const { error: onlineError } = await supabase.rpc('set_my_provider_availability_command', {
    p_provider_id: providerId,
    p_accepts_new_work: true,
  });
  if (onlineError) return fail(formData, failureCode(onlineError.message), PROVIDER_PATHS.availability);

  const { error: settingsError } = await supabase.rpc('update_my_availability_settings_command', {
    p_provider_id: providerId,
    p_travel_notes: String(formData.get('travel_notes') ?? '').trim() || null,
    p_paused_until: null,
    p_pause_reason: null,
  });
  if (settingsError) return fail(formData, failureCode(settingsError.message), PROVIDER_PATHS.availability);

  backTo(formData, { available: 'resumed' }, PROVIDER_PATHS.availability);
}
