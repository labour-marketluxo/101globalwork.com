import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The account identity the workspace header shows: a display name and its initials.
 *
 * WHY THIS IS ONE FUNCTION RATHER THAN TWO INLINE QUERIES. Both workspace layouts render the same
 * top bar, and the same account is signed into both — so the badge must show the same letters on
 * `/app/provider` as it does on `/app/customer`. Copying the lookup into the second layout is how the two
 * drift into showing a provider's trading name in one workspace and the account's name in the other.
 *
 * ⚠️ IT TAKES PRIMITIVES, NOT THE `User` OBJECT, SO `cache()` CAN DEDUPE IT. The (app) layout and the
 * layout below it both need the identity in the same request — React's `cache()` keys on argument
 * identity, and every `getUser()` returns a fresh object, so passing the user would miss every time
 * and issue the same two reads twice.
 */
export type WorkspaceIdentity = { displayName: string | null; initials: string };

export const getWorkspaceIdentity = cache(
  async (authUserId: string, email: string | null): Promise<WorkspaceIdentity> => {
    const supabase = await createSupabaseServerClient();

    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    let displayName: string | null = null;
    if (account?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('account_id', account.id)
        .maybeSingle();
      displayName = profile?.display_name ?? null;
    }

    const name = displayName ?? email?.split('@')[0] ?? null;
    return { displayName: name, initials: (name ?? '?').slice(0, 2).toUpperCase() };
  },
);
