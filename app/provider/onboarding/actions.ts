'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function authedClient(next = '/provider/onboarding') {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return supabase;
}

function back(provider: string, options?: { error?: string; success?: string }) {
  const query = new URLSearchParams({ provider });
  if (options?.error) query.set('error', options.error);
  if (options?.success) query.set('success', options.success);
  redirect(`/provider/onboarding?${query.toString()}`);
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
  back(String(data), { success: 'Provider profile created. Continue the setup steps below.' });
}

export async function addProviderServiceAction(formData: FormData) {
  const provider=String(formData.get('provider_id')??'');
  const supabase = await authedClient(`/provider/onboarding?provider=${encodeURIComponent(provider)}`);
  const service=String(formData.get('service_entity_id')??'');
  if (!service) back(provider,{ error:'Choose the service customers should hire you for.' });
  const { error }=await supabase.rpc('replace_provider_primary_service_for_onboarding_command',{p_provider_id:provider,p_service_entity_id:service});
  if(error) back(provider,{error:error.message});
  back(provider,{success:'Primary service saved. Any old onboarding service choice was removed from active matching eligibility.'});
}

export async function addProviderAreaAction(formData: FormData) {
  const provider=String(formData.get('provider_id')??'');
  const supabase=await authedClient(`/provider/onboarding?provider=${encodeURIComponent(provider)}`);
  const location=String(formData.get('location_id')??'');
  if (!location) back(provider,{ error:'Choose where you can actually perform this work.' });
  const {error}=await supabase.rpc('replace_provider_primary_area_for_onboarding_command',{p_provider_id:provider,p_location_id:location});
  if(error) back(provider,{error:error.message});
  back(provider,{success:'Primary service area saved. Any old onboarding area choice was removed from active matching eligibility.'});
}

export async function submitVerificationAction(formData: FormData) {
  const provider=String(formData.get('provider_id')??'');
  const supabase=await authedClient(`/provider/onboarding?provider=${encodeURIComponent(provider)}`);
  const {error}=await supabase.rpc('submit_provider_verification_command',{p_provider_id:provider,p_kind:String(formData.get('kind')??'identity'),p_jurisdiction_code:String(formData.get('jurisdiction_code')??'').trim()||null,p_reference_label:String(formData.get('reference_label')??'').trim()||null});
  if(error) back(provider,{error:error.message});
  back(provider,{success:'Verification submitted. You can keep completing the profile while review is pending.'});
}

export async function updateProviderProfileAction(formData: FormData) {
  const provider=String(formData.get('provider_id')??'');
  const supabase=await authedClient(`/provider/onboarding?provider=${encodeURIComponent(provider)}`);
  const yearsRaw=String(formData.get('years_experience')??'').trim();
  const {error}=await supabase.rpc('update_provider_profile_command',{p_provider_id:provider,p_headline:String(formData.get('headline')??'').trim(),p_description:String(formData.get('description')??'').trim(),p_years_experience:yearsRaw?Number(yearsRaw):null,p_accepts_new_work:formData.get('accepts_new_work')==='on'});
  if(error) back(provider,{error:error.message});
  back(provider,{success:'Public profile saved. Readiness has been recalculated.'});
}

export async function publishProviderProfileAction(formData: FormData) {
  const provider=String(formData.get('provider_id')??'');
  const supabase=await authedClient(`/provider/onboarding?provider=${encodeURIComponent(provider)}`);
  const {error}=await supabase.rpc('publish_provider_profile_command',{p_provider_id:provider});
  if(error) back(provider,{error:error.message});
  back(provider,{success:'Your provider profile is now published and eligible for matching when all market rules pass.'});
}
