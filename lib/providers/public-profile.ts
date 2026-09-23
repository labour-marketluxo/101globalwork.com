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
  /**
   * Added by 20260923160000_provider_credentials_profile_detail_and_field_progress.sql.
   *
   * EVERY FIELD HERE IS PART OF THE PUBLIC ALLOWLIST, and the provider workspace's Preview renders
   * exactly this object — so adding a column to the projection is adding it to what a customer sees,
   * in both places at once. Credentials are the deliberate exception and appear only as a count.
   */
  operating_hours: Record<string, { open?: string; close?: string }> | null;
  languages: string[] | null;
  coverage_radius_km: number | null;
  verified_credential_count: number | null;
  portfolio:
    | {
        id: string;
        title: string;
        description: string | null;
        link_url: string | null;
        service_name: string | null;
      }[]
    | null;
};

export async function getPublicProviderProfile(slug: string): Promise<PublicProviderProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_public_provider_profile_command', { p_slug: slug });

  if (error) throw new Error(`Unable to load provider profile: ${error.message}`);
  return (data?.[0] ?? null) as PublicProviderProfile | null;
}
