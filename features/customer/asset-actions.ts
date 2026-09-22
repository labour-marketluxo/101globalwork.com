'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assetFailureFromMessage } from '@/features/customer/assets';

/**
 * Writes against the customer's own asset registry.
 *
 * ⚠️ THE ASSET TABLES ARE `select`-ONLY TO THE CLIENT. Insert, update and delete are revoked, so every write
 * goes through one of the commands below, where ownership, the date rules and the audit row all happen
 * together. A table that let an authenticated client insert directly would be a registry with no checks and no
 * history of who changed what.
 *
 * ⚠️ REFUSALS ARE CODES. None of these ever puts the database's own message in a URL.
 */

const assetsPath = '/customer/assets';
const assetPath = (assetId: string) => `/customer/assets/${assetId}`;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function optional(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function links(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(value => String(value).trim()).filter(Boolean);
}

export async function createAssetAction(formData: FormData) {
  const sourceAssignmentId = optional(formData, 'source_assignment_id');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(assetsPath)}`);

  const { data, error } = await supabase.rpc('create_customer_asset_command', {
    p_name: text(formData, 'name'),
    p_category: text(formData, 'category'),
    p_make_model: optional(formData, 'make_model'),
    p_serial_number: optional(formData, 'serial_number'),
    p_installed_on: optional(formData, 'installed_on'),
    p_location_id: optional(formData, 'location_id'),
    p_warranty_provider_name: optional(formData, 'warranty_provider_name'),
    p_warranty_expires_on: optional(formData, 'warranty_expires_on'),
    p_next_service_due_on: optional(formData, 'next_service_due_on'),
    p_notes: optional(formData, 'notes'),
    p_document_urls: links(formData, 'document_url'),
    p_source_assignment_id: sourceAssignmentId,
  });

  if (error) redirect(`${assetsPath}?failed=${assetFailureFromMessage(error.message)}`);
  // Straight to the new asset: the thing somebody just registered is the thing they want to look at.
  redirect(assetPath(String(data)));
}

export async function updateAssetAction(formData: FormData) {
  const assetId = text(formData, 'asset_id');
  const back = assetPath(assetId);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const documentLinks = links(formData, 'document_url');

  const { error } = await supabase.rpc('update_customer_asset_command', {
    p_asset_id: assetId,
    p_make_model: text(formData, 'make_model'),
    p_serial_number: text(formData, 'serial_number'),
    p_warranty_provider_name: text(formData, 'warranty_provider_name'),
    p_warranty_expires_on: optional(formData, 'warranty_expires_on'),
    p_next_service_due_on: optional(formData, 'next_service_due_on'),
    p_notes: text(formData, 'notes'),
    // ⚠️ SENT ONLY WHEN THE FORM ACTUALLY CARRIED LINKS. `null` means "leave the documents alone"; an empty
    // array would mean "delete them all", and a form that renders three blank rows would otherwise wipe the
    // documents every time somebody corrected a serial number.
    p_document_urls: documentLinks.length > 0 ? documentLinks : null,
  });

  if (error) redirect(`${back}?failed=${assetFailureFromMessage(error.message)}`);
  redirect(`${back}?saved=1`);
}

export async function recordServiceEventAction(formData: FormData) {
  const assetId = text(formData, 'asset_id');
  const back = assetPath(assetId);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('record_asset_service_event_command', {
    p_asset_id: assetId,
    p_occurred_on: text(formData, 'occurred_on') || null,
    p_kind: text(formData, 'kind'),
    p_summary: text(formData, 'summary'),
    p_provider_id: optional(formData, 'provider_id'),
    p_assignment_id: optional(formData, 'assignment_id'),
    p_document_urls: links(formData, 'document_url'),
  });

  if (error) redirect(`${back}?failed=${assetFailureFromMessage(error.message)}`);
  redirect(`${back}?logged=1`);
}

export async function fileWarrantyClaimAction(formData: FormData) {
  const assetId = text(formData, 'asset_id');
  const back = assetPath(assetId);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('file_asset_warranty_claim_command', {
    p_asset_id: assetId,
    p_reason: text(formData, 'reason'),
    p_document_urls: links(formData, 'document_url'),
  });

  if (error) redirect(`${back}?failed=${assetFailureFromMessage(error.message)}`);
  redirect(`${back}?claimed=1`);
}

export async function withdrawWarrantyClaimAction(formData: FormData) {
  const assetId = text(formData, 'asset_id');
  const claimId = text(formData, 'claim_id');
  const back = assetPath(assetId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('withdraw_asset_warranty_claim_command', { p_claim_id: claimId });

  if (error) redirect(`${back}?failed=${assetFailureFromMessage(error.message)}`);
  redirect(`${back}?claimed=withdrawn`);
}
