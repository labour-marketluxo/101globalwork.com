import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Which provider profile this visit is about.
 *
 * ⚠️ AN ACCOUNT CAN OWN MORE THAN ONE PROVIDER PROFILE — the schema models it (`providers.owner_account_id`
 * is a plain reference, and onboarding has a "create another provider identity" path) — so every
 * provider surface has to answer "which one?" rather than picking one silently. The rule, decided
 * once here and used by the shell, the dashboard and the profile pages:
 *
 *   1. a published provider, if there is one, because that is the business the visitor is running;
 *   2. otherwise the oldest non-closed draft, because that is the one being set up;
 *   3. otherwise the first row at all, so a closed account still reaches its own history.
 *
 * The tab bar in the shell names the provider when there is more than one, so a visitor is never
 * silently shown another business's readiness score — which is exactly the bug the 2026-09-14 audit
 * found on /provider/search-readiness (`select id from providers limit 1`).
 *
 * WRAPPED IN React cache() because the shell and the page both need it in the same request: without
 * it every provider page issues the same three reads twice.
 */

export type OwnedProvider = {
  id: string;
  displayName: string;
  status: string;
  isPublic: boolean;
  slug: string | null;
  acceptsNewWork: boolean;
};

export type ProviderContext = {
  accountId: string;
  providers: OwnedProvider[];
  /** Null only when the account owns no provider profile at all — the state onboarding exists for. */
  active: OwnedProvider | null;
};

export const getProviderContext = cache(async (): Promise<ProviderContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!account) return null;

  const { data: providerRows, error } = await supabase
    .from('providers')
    .select('id,display_name,status,created_at')
    .eq('owner_account_id', account.id)
    .order('created_at', { ascending: true });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read providers: ${error.message}`);
    }
    return { accountId: account.id, providers: [], active: null };
  }

  const ids = (providerRows ?? []).map(row => row.id);
  const { data: profiles } = ids.length
    ? await supabase
        .from('provider_public_profiles')
        .select('provider_id,slug,is_public,accepts_new_work')
        .in('provider_id', ids)
    : { data: [] as Array<{ provider_id: string; slug: string; is_public: boolean; accepts_new_work: boolean }> };

  const profileByProvider = new Map((profiles ?? []).map(row => [row.provider_id, row]));

  const providers: OwnedProvider[] = (providerRows ?? []).map(row => {
    const profile = profileByProvider.get(row.id);
    return {
      id: row.id,
      displayName: row.display_name,
      status: row.status,
      isPublic: Boolean(profile?.is_public),
      slug: profile?.slug ?? null,
      acceptsNewWork: profile?.accepts_new_work ?? true,
    };
  });

  const active =
    providers.find(provider => provider.status === 'active' && provider.isPublic) ??
    providers.find(provider => provider.status !== 'closed') ??
    providers[0] ??
    null;

  return { accountId: account.id, providers, active };
});
