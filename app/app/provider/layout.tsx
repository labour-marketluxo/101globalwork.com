import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Wrench } from '@/components/ui/icons';
import { AvailabilityToggle } from '@/components/provider/ProviderControls';
import ProviderBreadcrumbs from '@/components/provider/ProviderBreadcrumbs';
import WorkspaceNav, { WorkspaceSectionLinks } from '@/components/provider/WorkspaceNav';
import WorkspaceNavbar from '@/components/workspace/WorkspaceNavbar';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { getWorkspaceIdentity } from '@/features/workspace/identity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The provider workspace shell — mobile-first, and deliberately not the customer shell.
 *
 * A SHARED TOP BAR OVER A DARK RAIL. The bar is `components/workspace/WorkspaceNavbar.tsx`, the same
 * component the customer workspace renders — with `view="provider"` it drops the horizontal section
 * links (the rail already names every section) and slots in the availability toggle. Below it the
 * provider workspace is a full-height teal rail plus dense tables of jobs, quotes and payouts, so it
 * takes the whole width instead of the 1280px `PAGE_SHELL` column the account and legal pages keep.
 *
 * ⚠️ `robots` IS SET HERE AND INHERITED BY EVERY PAGE UNDER IT. Next merges metadata from a layout
 * into its pages, so a new provider route with no `robots` export of its own is still noindex. The
 * 2026-09-14 audit found `/app/provider/search-readiness` without one — the fix is not to remember harder
 * on each page but to put the directive somewhere no page can forget it.
 *
 * ⚠️ THE GUARD IS AUTH ONLY. It must not redirect on "this account has no provider profile", because
 * the page it would redirect to — /provider/onboarding — lives under this same layout, and a server
 * layout cannot see the pathname. Each page decides what to do with a missing provider; the shell
 * stays out of it. Same reasoning as the customer workspace layout.
 *
 * ⚠️ THERE IS NO PUBLIC SITE HEADER ABOVE THIS BAR. layouts/DashboardLayout.tsx draws no marketing
 * chrome for the (app) group, so this is the workspace's own header: workspace identity, the one
 * control a field provider changes several times a day (availability) and the way back to the
 * customer side of the same account.
 */
export const metadata: Metadata = {
  title: 'Provider workspace',
  description: 'Your jobs today, your profile, verification and payouts.',
  robots: { index: false, follow: false },
};

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const context = await getProviderContext();
  if (!context) redirect(hrefWith(AUTH_PATHS.signIn, { next: PROVIDER_PATHS.today }));

  // The same identity badge as the customer workspace — one account, two views, one set of initials.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const identity = user ? await getWorkspaceIdentity(user.id, user.email ?? null) : { displayName: null, initials: '?' };

  const active = context.active;
  const multiple = context.providers.length > 1;

  return (
    <>
      <WorkspaceNavbar
        view="provider"
        displayName={identity.displayName}
        initials={identity.initials}
        statusSlot={
          active ? (
            <AvailabilityToggle
              providerId={active.id}
              acceptsNewWork={active.acceptsNewWork}
              nextPath={PROVIDER_PATHS.today}
            />
          ) : null
        }
      />

      <div className="lg:flex lg:items-stretch">
        <WorkspaceNav showSetup={!active?.isPublic} providerName={active?.displayName ?? null} />

        {/* pb-24 clears the phone bar, which is fixed and would otherwise sit on the last card. */}
        <div className="min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          {multiple ? (
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              This account runs {context.providers.length} provider profiles. You are looking at{' '}
              <strong className="font-semibold text-slate-700">{active?.displayName}</strong>
              {active?.status === 'active' ? '' : ' (not published)'} — every page below is about that one.
            </p>
          ) : null}

          {active ? null : (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4 text-sm leading-relaxed text-amber-900">
              <Wrench aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
              <div>
                <p className="font-bold">There is no provider profile on this account yet.</p>
                <p className="mt-1">
                  Everything in this workspace hangs off one: matching, verification, credentials and
                  payouts all belong to a provider identity.
                </p>
                <Link
                  href={PROVIDER_PATHS.onboarding}
                  className="mt-2 inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-800"
                >
                  Set one up
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}

          <ProviderBreadcrumbs />

          {children}

          <WorkspaceSectionLinks showSetup={!active?.isPublic} />
        </div>
      </div>
    </>
  );
}
