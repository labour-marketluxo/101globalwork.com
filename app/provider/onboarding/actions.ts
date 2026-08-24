'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function authedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return supabase;
}

export async function createProviderAction(formData: FormData) {
  const supabase = await authedClient();
  const { data, error } = await supabase.rpc('create_provider_command', {
    p_display_name: String(formData.get('display_name') ?? '').trim(),
    p_market_id: String(formData.get('market_id') ?? ''),
    p_slug: String(formData.get('slug') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
  });
  if (error) redirect(`/provider/onboarding?error=${encodeURIComponent(error.message)}`);
  redirect(`/provider/onboarding?provider=${encodeURIComponent(String(data))}`);
}

export async function addProviderServiceAction(formData: FormData) {
  const supabase = await authedClient();
  const provider = String(formData.get('provider_id') ?? '');
  const { error } = await supabase.rpc('set_provider_service_command', {
    p_provider_id: provider,
    p_service_entity_id: String(formData.get('service_entity_id') ?? ''),
    p_is_primary: true,
  });
  if (error) redirect(`/provider/onboarding?provider=${provider}&error=${encodeURIComponent(error.message)}`);
  redirect(`/provider/onboarding?provider=${provider}`);
}

export async function addProviderAreaAction(formData: FormData) {
  const supabase = await authedClient();
  const provider = String(formData.get('provider_id') ?? '');
  const { error } = await supabase.rpc('set_provider_service_area_command', {
    p_provider_id: provider,
    p_location_id: String(formData.get('location_id') ?? ''),
    p_is_primary: true,
  });
  if (error) redirect(`/provider/onboarding?provider=${provider}&error=${encodeURIComponent(error.message)}`);
  redirect(`/provider/onboarding?provider=${provider}`);
}

export async function submitVerificationAction(formData: FormData) {
  const supabase = await authedClient();
  const provider = String(formData.get('provider_id') ?? '');
  const { error } = await supabase.rpc('submit_provider_verification_command', {
    p_provider_id: provider,
    p_kind: String(formData.get('kind') ?? 'identity'),
    p_jurisdiction_code: String(formData.get('jurisdiction_code') ?? '').trim() || null,
    p_reference_label: String(formData.get('reference_label') ?? '').trim() || null,
  });
  if (error) redirect(`/provider/onboarding?provider=${provider}&error=${encodeURIComponent(error.message)}`);
  redirect(`/provider/onboarding?provider=${provider}`);
}
