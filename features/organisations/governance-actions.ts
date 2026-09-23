'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';

/**
 * Approvals, cost centres and their links. The governance rules — who may decide, who may adjust an allocation, and
 * that the requester never approves their own request — are enforced by the commands, not here.
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

function codeFor(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('cannot approve') || text.includes('needs an owner') || text.includes('only an active member') || text.includes('only an owner')) return 'not_authorized';
  if (text.includes('not this organisation') || text.includes('must be') || text.includes('invalid') || text.includes('needs')) return 'bad_request';
  return 'unavailable';
}

export async function decideApprovalAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/approvals`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('decide_organisation_approval_command', {
    p_organisation_id: organisationId,
    p_request_id: String(formData.get('request_id') ?? ''),
    p_kind: String(formData.get('kind') ?? 'quote'),
    p_decision: String(formData.get('decision') ?? 'approved'),
    p_note: String(formData.get('note') ?? '').trim() || null,
    p_delegate_account_id: String(formData.get('delegate_account_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: codeFor(error.message) }, next);
  backTo(formData, { decided: String(formData.get('decision') ?? 'approved') }, next);
}

export async function createCostCentreAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/budgets`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('create_organisation_cost_centre_command', {
    p_organisation_id: organisationId,
    p_name: String(formData.get('name') ?? '').trim(),
    p_code: String(formData.get('code') ?? '').trim(),
    p_currency_code: String(formData.get('currency_code') ?? '').trim().toUpperCase(),
    p_allocated_minor: Math.round(Number(String(formData.get('allocated') ?? '0').trim() || '0') * 100),
    p_location_id: String(formData.get('location_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: codeFor(error.message) }, next);
  backTo(formData, { saved: 'centre' }, next);
}

export async function adjustCostCentreAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/budgets`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('adjust_organisation_cost_centre_command', {
    p_cost_centre_id: String(formData.get('cost_centre_id') ?? ''),
    p_allocated_minor: Math.round(Number(String(formData.get('allocated') ?? '0').trim() || '0') * 100),
    p_reason: String(formData.get('reason') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: codeFor(error.message) }, next);
  backTo(formData, { saved: 'allocation' }, next);
}

export async function assignProjectCostCentreAction(formData: FormData) {
  const organisationId = String(formData.get('organisation_id') ?? '');
  const next = `/org/${organisationId}/budgets`;
  const supabase = await authed(next);
  const { error } = await supabase.rpc('assign_project_cost_centre_command', {
    p_organisation_id: organisationId,
    p_request_id: String(formData.get('request_id') ?? ''),
    p_cost_centre_id: String(formData.get('cost_centre_id') ?? ''),
  });
  if (error) return backTo(formData, { failed: codeFor(error.message) }, next);
  backTo(formData, { saved: 'project_centre' }, next);
}
