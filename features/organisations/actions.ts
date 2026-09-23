'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import type { OrganisationFailureCode } from '@/features/organisations/failure-copy';

/**
 * The organisation workspace's writes. Authorisation lives in the commands — membership and the owner/admin role —
 * and this module authenticates, maps refusals onto codes, and sends the caller back.
 */

async function authed(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function backTo(formData: FormData, params: Record<string, string>, fallback: string): never {
  const target = safeInternalPath(String(formData.get('next') ?? ''), fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

function failureCode(message: string): OrganisationFailureCode {
  const text = message.toLowerCase();
  if (text.includes('already exists') || text.includes('duplicate')) return 'duplicate';
  if (text.includes('not authorized') || text.includes('forbidden') || text.includes('authentication')) return 'not_authorized';
  if (text.includes('invalid') || text.includes('required') || text.includes('catalog') || text.includes('currency')) return 'bad_request';
  return 'unavailable';
}

export async function createOrganisationAction(formData: FormData) {
  const supabase = await authed('/org/new');
  const locationIds = formData.getAll('location_ids').map(value => String(value)).filter(Boolean);
  const { data, error } = await supabase.rpc('create_organisation_workspace_command', {
    p_display_name: String(formData.get('display_name') ?? '').trim(),
    p_organisation_type: String(formData.get('organisation_type') ?? 'business_customer'),
    p_legal_name: String(formData.get('legal_name') ?? '').trim() || null,
    p_market_id: String(formData.get('market_id') ?? '').trim() || null,
    p_currency_code: String(formData.get('currency_code') ?? '').trim().toUpperCase() || null,
    p_timezone: String(formData.get('timezone') ?? '').trim() || null,
    p_contact_name: String(formData.get('contact_name') ?? '').trim() || null,
    p_contact_email: String(formData.get('contact_email') ?? '').trim() || null,
    p_contact_phone: String(formData.get('contact_phone') ?? '').trim() || null,
    p_subscription_plan: String(formData.get('subscription_plan') ?? 'standard'),
    p_policies: {
      approvals_above_minor: Number(String(formData.get('approvals_above') ?? '0').trim() || '0') * 100,
      safety_notes: String(formData.get('safety_notes') ?? '').trim(),
    },
    p_location_ids: locationIds,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, '/org/new');
  redirect(`/org/${String(data ?? '')}?created=1`);
}

export async function saveOrganisationDraftAction(formData: FormData) {
  const supabase = await authed('/org/new');
  const payload: Record<string, string> = {};
  for (const field of ['display_name', 'legal_name', 'organisation_type', 'market_id', 'currency_code', 'timezone', 'contact_name', 'contact_email', 'contact_phone', 'subscription_plan', 'safety_notes', 'approvals_above']) {
    const value = String(formData.get(field) ?? '').trim();
    if (value) payload[field] = value;
  }
  const locationIds = formData.getAll('location_ids').map(value => String(value)).filter(Boolean);
  if (locationIds.length > 0) payload.location_ids = locationIds.join(',');
  const { error } = await supabase.rpc('save_organisation_draft_command', { p_payload: payload });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, '/org/new');
  backTo(formData, { draft: 'saved' }, '/org/new');
}

export async function addOrganisationLocationAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const supabase = await authed(`/org/${organisationId}`);
  const { error } = await supabase.rpc('add_organisation_location_command', {
    p_organisation_id: organisationId,
    p_location_id: String(formData.get('location_id') ?? ''),
    p_kind: String(formData.get('kind') ?? 'site'),
    p_label: String(formData.get('label') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/org/${organisationId}`);
  backTo(formData, { saved: 'location' }, `/org/${organisationId}`);
}

export async function setOrganisationBudgetAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const supabase = await authed(`/org/${organisationId}`);
  const { error } = await supabase.rpc('set_organisation_budget_command', {
    p_organisation_id: organisationId,
    p_location_id: String(formData.get('location_id') ?? '').trim() || null,
    p_period_start: String(formData.get('period_start') ?? '').trim() || null,
    p_period_end: String(formData.get('period_end') ?? '').trim() || null,
    p_currency_code: String(formData.get('currency_code') ?? '').trim().toUpperCase(),
    p_committed_minor: Math.round(Number(String(formData.get('committed') ?? '0').trim() || '0') * 100),
    p_actual_minor: Math.round(Number(String(formData.get('actual') ?? '0').trim() || '0') * 100),
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/org/${organisationId}`);
  backTo(formData, { saved: 'budget' }, `/org/${organisationId}`);
}

export async function assignProjectOwnerAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const supabase = await authed(`/org/${organisationId}/projects`);
  const { error } = await supabase.rpc('assign_organisation_project_owner_command', {
    p_organisation_id: organisationId,
    p_request_id: String(formData.get('request_id') ?? ''),
    p_owner_account_id: String(formData.get('owner_account_id') ?? ''),
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/org/${organisationId}/projects`);
  backTo(formData, { saved: 'owner' }, `/org/${organisationId}/projects`);
}
