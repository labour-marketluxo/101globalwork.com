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
};

export async function getPublicProviderProfile(slug: string): Promise<PublicProviderProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('provider_public_profiles')
    .select('provider_id,slug,headline,public_description,years_experience,accepts_new_work,verification_summary,trust_score,readiness_score')
    .eq('slug', slug)
    .eq('is_public', true)
    .not('published_at', 'is', null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load provider profile: ${error.message}`);
  return data as PublicProviderProfile | null;
}
