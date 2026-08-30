import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PublicProviderProfile = {
  provider_id: string;
  slug: string;
  headline: string | null;
  public_description: string | null;
  years_experience: number | null;
  accepts_new_work: boolean;
  verification_summary: Record<string, unknown>;
  trust_score: number;
  readiness_score: number;
  service_entity_id: string | null;
  service_name: string | null;
  location_id: string | null;
  location_name: string | null;
};

export async function getPublicProviderProfile(slug: string): Promise<PublicProviderProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_public_provider_profile_command', { p_slug: slug });

  if (error) throw new Error(`Unable to load provider profile: ${error.message}`);
  return (data?.[0] ?? null) as PublicProviderProfile | null;
}
