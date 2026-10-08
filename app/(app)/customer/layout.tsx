import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WORKSPACE_SHELL } from '@/components/discovery/tokens';
import CustomerWorkspaceNav from '@/components/customer/CustomerWorkspaceNav';
import { CUSTOMER_PATHS } from '@/features/customer/intake';

export const metadata = {
  title: 'Customer workspace',
  robots: { index: false, follow: false },
};

/**
 * The customer workspace shell.
 *
 * FULL-BLEED, VIA `WORKSPACE_SHELL`. The old `PAGE_SHELL` capped this at 1280px and left a wide
 * screen mostly empty; a workspace of tables and project views should use the whole width. The
 * page-level `PAGE_SHELL` wrappers that used to nest inside this shell are gone for the same
 * reason — a second capped column inside a full-width one just reproduced the old look.
 *
 * WHAT IT DRAWS: a breadcrumb trail, a view switcher and the account's identity. There is no public
 * header above it any more (see layouts/DashboardLayout.tsx), so this bar is the workspace's own
 * header rather than a secondary one — the brief asks for "clean secondary sub-navigation/breadcrumbs",
 * and the workspace nav below stays the only menu that says where the visitor is.
 *
 * THE HEADER IS TWO FULL-BLEED ROWS OWNED BY `CustomerWorkspaceNav`: the nav bar, then the breadcrumb
 * strip. Both need the pathname to mark the current link and name the current crumb, so they live in a
 * client component; this layout stays a server component and only supplies identity. The content below
 * them keeps the shared `WORKSPACE_SHELL` gutters, with its TOP padding cut to three-quarters
 * (`py-8` → `pt-6`, `lg:py-10` → `lg:pt-[30px]`) so the first card sits closer under the trail.
 *
 * THE "ROLE SWITCHER" IS A VIEW SWITCHER, AND SAYS SO. One account can both commission work and offer
 * it — provider capability is granted by the platform after verification, not chosen here. So these
 * links move between two workspaces of the SAME account; they do not change what the account may do.
 * Labelling them "switch role" would imply a permission change that does not happen.
 *
 * No guard here: each page reads data belonging to the signed-in account and guards itself, and the
 * identity is needed here only to greet the visitor by name.
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(CUSTOMER_PATHS.dashboard)}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('account_id', (await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle()).data?.id ?? '')
    .maybeSingle();

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
  const initials = (displayName ?? '?').slice(0, 2).toUpperCase();

  return (
    <>
      <CustomerWorkspaceNav displayName={displayName} initials={initials} />
      {/* `pt` overrides its `py` here: Tailwind emits padding-top after padding-block, so no `!` needed. */}
      <div className={`${WORKSPACE_SHELL} pt-6 lg:pt-[30px]`}>{children}</div>
    </>
  );
}
