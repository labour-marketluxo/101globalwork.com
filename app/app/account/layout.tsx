import { redirect } from 'next/navigation';
import AccountBreadcrumbs from '@/components/account/AccountBreadcrumbs';
import WorkspaceNavbar from '@/components/workspace/WorkspaceNavbar';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { PROFILE_PATH } from '@/features/settings/paths';
import { getWorkspaceIdentity } from '@/features/workspace/identity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The account shell — the routes that belong to the person rather than to a workspace.
 *
 * ⚠️ THE `/app/account` PREFIX IS THE POINT OF THE FOLDER, NOT DECORATION. Settings, notifications,
 * messages and support are neither customer nor provider surfaces: the same four are the signed-in
 * person's whichever side of the business they are on. They sat at the root of the URL space, which
 * read as "top level, alongside the workspaces" — and, after the marketing chrome came off the (app)
 * group, also meant they had no header at all: reachable only by typing the URL, and with no way back
 * once you were there. `app/(app)/account/*` fixes both at once, because the folder name is now the
 * URL.
 *
 * The bar is the same `WorkspaceNavbar` the two workspaces render, with `view="account"`: brand mark,
 * the section links and the search field, and the account menu. The trail sits directly under it,
 * matching the customer strip, and each page keeps its own container below.
 *
 * The guard is here because the bar needs to know whose initials to print. The pages still guard
 * themselves — this only decides whether there is a name to draw.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: PROFILE_PATH }));

  const identity = await getWorkspaceIdentity(user.id, user.email ?? null);

  return (
    <>
      <WorkspaceNavbar view="account" displayName={identity.displayName} initials={identity.initials} />
      <AccountBreadcrumbs />
      {children}
    </>
  );
}
