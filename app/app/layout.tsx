import type { Metadata } from 'next';
import DashboardLayout from '@/layouts/DashboardLayout';
import FallbackNavbar from '@/components/workspace/FallbackNavbar';
import { getWorkspaceIdentity } from '@/features/workspace/identity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Route group: (app)
 *
 * The signed-in workspace surfaces: /account/notifications, /account/messages, /account/settings/*, /work, /requests/*,
 * /customer/*, /projects/*, /provider/* and /org/*. The group name does not appear in the URL.
 *
 * ⚠️ NO PUBLIC CHROME HERE. DashboardLayout (layouts/DashboardLayout.tsx) draws the workspace
 * shell and deliberately does not render the marketing header and footer, so none of these
 * signed-in screens show a bar advertising "Sign in" and "Create an account".
 *
 * ⚠️ NOINDEX IS DECLARED HERE, ONCE, FOR EVERY ROUTE IN THE GROUP. The brief asks for it on all app
 * routes and a per-page export is exactly the kind of requirement that is met everywhere until one new
 * page forgets. Metadata is inherited, so a page added under this group next year is excluded from
 * crawling without its author having to know this rule exists — and pages that already declare their
 * own `robots` (the sessions page, every page built in this change) declare the same values, so the two
 * cannot disagree.
 *
 * ⚠️ NOINDEX IS NOT A SUBSTITUTE FOR AUTHORISATION. It keeps a URL out of search results; it does not
 * stop anybody fetching it. Every page under this group re-derives the session and every read is scoped
 * to the caller in the database.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  // The fallback bar needs a name to print. `getWorkspaceIdentity` is `cache()`d and the layouts below
  // call it with the same two primitives, so a section layout pays nothing for this second read.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const identity = user
    ? await getWorkspaceIdentity(user.id, user.email ?? null)
    : { displayName: null, initials: '?' };

  return (
    <DashboardLayout>
      <FallbackNavbar displayName={identity.displayName} initials={identity.initials} />
      {children}
    </DashboardLayout>
  );
}
