'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { adminFailureCode } from '@/features/admin/copy';

/**
 * The taxonomy and market console's writes.
 *
 * ⚠️ EVERY ACTION HERE IS A COMMAND CALL. Nothing updates `taxonomy_entities`, `entity_names` or `markets` directly,
 * because the commands own the invariants — the key is set once, a merge moves the rows that point at the loser,
 * and a published template stays live until another is published.
 */

const TAXONOMY = '/admin/taxonomy/services';
const GRAPH = '/admin/taxonomy/discovery';
const MARKETS = '/admin/markets';

async function authed(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function back(formData: FormData, params: Record<string, string>, fallback: string): never {
  const target = safeInternalPath(String(formData.get('next') ?? ''), fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

function refuse(formData: FormData, message: string, fallback: string): never {
  const code = adminFailureCode(message);
  if (code === 'step_up_required') {
    const destination = safeInternalPath(String(formData.get('next') ?? ''), fallback);
    const [path, existing] = destination.split('?');
    const query = new URLSearchParams(existing ?? '');
    query.set('step_up', '1');
    redirect(`${AUTH_PATHS.challenge}?redirect=${encodeURIComponent(`${path}?${query.toString()}`)}`);
  }
  back(formData, { failed: code }, fallback);
}

function optional(formData: FormData, field: string): string | null {
  return String(formData.get(field) ?? '').trim() || null;
}

export async function createServiceAction(formData: FormData) {
  const supabase = await authed(TAXONOMY);
  const { error } = await supabase.rpc('create_service_command', {
    p_canonical_key: String(formData.get('canonical_key') ?? ''),
    p_display_name: String(formData.get('display_name') ?? ''),
    p_language_code: String(formData.get('language_code') ?? 'en'),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, TAXONOMY);
  back(formData, { saved: 'service' }, TAXONOMY);
}

export async function updateServiceDefinitionAction(formData: FormData) {
  const supabase = await authed(TAXONOMY);
  const synonyms = String(formData.get('synonyms') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  const ruleTypes = formData.getAll('credential_type').map(value => String(value)).filter(value => value.length > 0);

  const { error } = await supabase.rpc('update_service_definition_command', {
    p_service_id: String(formData.get('service_id') ?? ''),
    p_display_name: String(formData.get('display_name') ?? ''),
    p_language_code: String(formData.get('language_code') ?? 'en'),
    p_synonyms: synonyms,
    p_rules: ruleTypes.map(credentialType => ({ credential_type: credentialType, is_mandatory: true })),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, TAXONOMY);
  back(formData, { saved: 'definition' }, TAXONOMY);
}

export async function mergeServicesAction(formData: FormData) {
  const supabase = await authed(TAXONOMY);
  const { error } = await supabase.rpc('merge_services_command', {
    p_source_id: String(formData.get('source_id') ?? ''),
    p_target_id: String(formData.get('target_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, TAXONOMY);
  back(formData, { merged: '1' }, TAXONOMY);
}

export async function deprecateServiceAction(formData: FormData) {
  const supabase = await authed(TAXONOMY);
  const { error } = await supabase.rpc('deprecate_service_command', {
    p_service_id: String(formData.get('service_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, TAXONOMY);
  back(formData, { deprecated: '1' }, TAXONOMY);
}

export async function createTemplateVersionAction(formData: FormData) {
  const supabase = await authed(GRAPH);
  const fieldLabels = String(formData.get('fields') ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const fields = fieldLabels.map((label, index) => ({
    key: `field_${index + 1}`,
    label,
    kind: 'text',
    required: true,
  }));

  const { error } = await supabase.rpc('create_template_version_command', {
    p_service_id: String(formData.get('service_id') ?? ''),
    p_problem_id: optional(formData, 'problem_id'),
    p_outcome_id: optional(formData, 'outcome_id'),
    p_fields: fields,
    p_notes: String(formData.get('notes') ?? '').trim(),
    p_reason_code: String(formData.get('reason_code') ?? ''),
  });
  if (error) refuse(formData, error.message, GRAPH);
  back(formData, { saved: 'version' }, GRAPH);
}

export async function publishTemplateVersionAction(formData: FormData) {
  const supabase = await authed(GRAPH);
  const { error } = await supabase.rpc('publish_template_version_command', {
    p_version_id: String(formData.get('version_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, GRAPH);
  back(formData, { published: '1' }, GRAPH);
}

export async function deprecateTemplateAction(formData: FormData) {
  const supabase = await authed(GRAPH);
  const { error } = await supabase.rpc('deprecate_template_command', {
    p_template_id: String(formData.get('template_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, GRAPH);
  back(formData, { deprecated: 'template' }, GRAPH);
}

export async function configureMarketAction(formData: FormData) {
  const supabase = await authed(MARKETS);
  const settings = String(formData.get('setting_key') ?? '').trim();
  const settingValue = String(formData.get('setting_value') ?? '').trim();
  const payload = settings
    ? [{ key: settings, value: settingValue ? JSON.parse(JSON.stringify(settingValue)) : null, note: optional(formData, 'setting_note') }]
    : [];

  const { error } = await supabase.rpc('configure_market_command', {
    p_market_id: String(formData.get('market_id') ?? ''),
    p_default_language_code: String(formData.get('default_language_code') ?? '').trim(),
    p_default_currency_code: String(formData.get('default_currency_code') ?? '').trim(),
    p_display_name: String(formData.get('display_name') ?? '').trim(),
    p_settings: payload,
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, MARKETS);
  back(formData, { saved: 'market' }, MARKETS);
}

export async function setMarketActiveAction(formData: FormData) {
  const supabase = await authed(MARKETS);
  const { error } = await supabase.rpc('set_market_active_command', {
    p_market_id: String(formData.get('market_id') ?? ''),
    p_active: String(formData.get('active') ?? '') === 'true',
    p_reason_code: String(formData.get('reason_code') ?? ''),
    p_note: String(formData.get('note') ?? '').trim(),
  });
  if (error) refuse(formData, error.message, MARKETS);
  back(formData, { changed: 'market' }, MARKETS);
}
