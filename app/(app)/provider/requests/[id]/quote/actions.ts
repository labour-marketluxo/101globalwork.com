'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Money as the customer's currency stores it: a whole number of minor units, or null when unparseable. */
function toMinor(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const major = Number(text);
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

/**
 * The quoted provider's write.
 *
 * ⚠️ THE TOTAL IS DERIVED HERE, NOT TAKEN FROM A FIELD. The provider types what each part of the job costs
 * and the taxes beside it; this adds them up. A form that posted its own total could post one that disagreed
 * with the breakdown the customer reads, which is why there is no total field to post.
 *
 * ⚠️ NOTHING THE FORM SAID IS ECHOED BACK. A refusal leaves the page as one of the fixed codes the page
 * renders words for, so the query string cannot be used to put arbitrary text inside a platform notice.
 */
export async function submitQuoteAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const providerId = String(formData.get('provider_id') ?? '');
  const currency = String(formData.get('currency_code') ?? '').trim().toUpperCase();
  const summary = String(formData.get('summary') ?? '').trim();
  const validUntilRaw = String(formData.get('valid_until') ?? '').trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/provider/requests/${requestId}/quote?provider=${providerId}`)}`);

  // Typed `=> never` on purpose: `redirect()` throws, and the explicit annotation is what lets TypeScript
  // treat the checks below as terminating, so `minor` is a number and not a `number | null` afterwards.
  const fail: (code: string) => never = code =>
    redirect(`/provider/requests/${requestId}/quote?provider=${providerId}&error=${code}`);

  if (!/^[A-Z]{3}$/.test(currency)) fail('price');

  // ── The itemisation ────────────────────────────────────────────────────────────────────────────────
  const labels = formData.getAll('line_item_label').map(value => String(value).trim());
  const amounts = formData.getAll('line_item_amount');
  const lineItems: { label: string; amount_minor: number }[] = [];

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? '';
    const rawAmount = String(amounts[index] ?? '').trim();
    // A row nobody touched is not an error; a half-filled row is.
    if (!label && !rawAmount) continue;
    if (!label) fail('price');
    const minor = toMinor(rawAmount);
    if (minor === null) fail('price');
    if (minor > 0) lineItems.push({ label, amount_minor: minor });
    else if (label) fail('price');
  }
  if (lineItems.length === 0) fail('price');

  const taxesMinor = toMinor(formData.get('taxes_and_fees'));
  if (taxesMinor === null) fail('taxes');

  const subtotalMinor = lineItems.reduce((sum, item) => sum + item.amount_minor, 0);
  const totalMinor = subtotalMinor + (taxesMinor ?? 0);
  if (totalMinor <= 0) fail('price');

  if (summary.length < 20) {
    fail('summary');
  }

  // ── The optional add-ons, which are NOT part of the total ──────────────────────────────────────────
  const addonLabels = formData.getAll('addon_label').map(value => String(value).trim());
  const addonAmounts = formData.getAll('addon_amount');
  const optionalAddons: { label: string; amount_minor: number }[] = [];

  for (let index = 0; index < addonLabels.length; index += 1) {
    const label = addonLabels[index] ?? '';
    const rawAmount = String(addonAmounts[index] ?? '').trim();
    if (!label && !rawAmount) continue;
    if (!label) fail('price');
    const minor = toMinor(rawAmount);
    if (minor === null || minor <= 0) fail('price');
    optionalAddons.push({ label, amount_minor: minor ?? 0 });
  }

  // ── The terms the comparison puts side by side ─────────────────────────────────────────────────────
  const materials = String(formData.get('materials') ?? '');
  if (!['', 'included', 'excluded'].includes(materials)) fail('failed');
  const materialsIncluded = materials === 'included' ? true : materials === 'excluded' ? false : null;

  const inspection = String(formData.get('inspection') ?? '');
  if (!['', 'required', 'not_required'].includes(inspection)) fail('failed');
  const inspectionRequired = inspection === 'required' ? true : inspection === 'not_required' ? false : null;

  const timelineRaw = String(formData.get('timeline_days') ?? '').trim();
  let timelineDays: number | null = null;
  if (timelineRaw) {
    timelineDays = Number(timelineRaw);
    if (!Number.isInteger(timelineDays) || timelineDays <= 0) fail('timeline');
  }

  const longText = (name: string): string | null => {
    const value = String(formData.get(name) ?? '').trim();
    if (!value) return null;
    if (value.length > 2000) fail('terms');
    return value;
  };

  const materialsNote = longText('materials_note');
  const timelineNote = longText('timeline_note');
  const warrantyTerms = longText('warranty');
  const exclusions = longText('exclusions');

  let validUntil: string | null = null;
  if (validUntilRaw) {
    const parsed = new Date(validUntilRaw);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      fail('validity');
    }
    validUntil = parsed.toISOString();
  }

  const { error } = await supabase.rpc('submit_quote_command', {
    p_request_id: requestId,
    p_provider_id: providerId,
    p_currency_code: currency,
    p_total_minor: totalMinor,
    p_summary: summary,
    p_scope_snapshot: {},
    p_valid_until: validUntil,
    p_idempotency_key: crypto.randomUUID(),
    p_line_items: lineItems,
    p_taxes_and_fees_minor: taxesMinor,
    p_materials_included: materialsIncluded,
    p_materials_note: materialsNote,
    p_timeline_days: timelineDays,
    p_timeline_note: timelineNote,
    p_inspection_required: inspectionRequired,
    p_warranty_terms: warrantyTerms,
    p_optional_addons: optionalAddons,
    p_exclusions: exclusions,
  });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider] quote submission refused: ${error.message}`);
    }
    fail('eligibility');
  }
  redirect(`/provider/requests/${requestId}/quote?provider=${providerId}&sent=1`);
}
