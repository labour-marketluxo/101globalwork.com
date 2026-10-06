import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Wrench } from '@/components/ui/icons';
import { AvailabilityToggle } from '@/components/provider/ProviderControls';
import WorkspaceNav, { WorkspaceSectionLinks } from '@/components/provider/WorkspaceNav';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The provider workspace shell — mobile-first, and deliberately not the customer shell.
 *
 * ⚠️ `robots` IS SET HERE AND INHERITED BY EVERY PAGE UNDER IT. Next merges metadata from a layout
 * into its pages, so a new provider route with no `robots` export of its own is still noindex. The
 * 2026-09-14 audit found `/provider/search-readiness` without one — the fix is not to remember harder
 * on each page but to put the directive somewhere no page can forget it.
 *
 * ⚠️ THE GUARD IS AUTH ONLY. It must not redirect on "this account has no provider profile", because
 * the page it would redirect to — /provider/onboarding — lives under this same layout, and a server
 * layout cannot see the pathname. Each page decides what to do with a missing provider; the shell
 * stays out of it. Same reasoning as the customer workspace layout.
 *
 * ⚠️ THE GLOBAL SITE HEADER IS STILL ABOVE THIS BAR. It comes from the root layout via
 * SiteChrome, so this is a SECONDARY bar: workspace identity, the one control a field provider
 * changes several times a day (availability) and the way back to the customer side of the same
 * account. A full replacement header would mean duplicating the primary nav here.
 */
export const metadata: Metadata = {
  title: 'Provider workspace',
  description: 'Your jobs today, your profile, verification and payouts.',
  robots: { index: false, follow: false },
};

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const context = await getProviderContext();
  if (!context) redirect(hrefWith(AUTH_PATHS.signIn, { next: PROVIDER_PATHS.today }));

  const active = context.active;
  const multiple = context.providers.length > 1;

  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
            Provider workspace
          </p>
          <p className="mt-0.5 truncate text-sm font-bold tracking-tight text-slate-900">
            {active ? active.displayName : 'No provider profile yet'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Account view" className="hidden items-center gap-2 sm:flex">
            <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">View</span>
            <Link
              href={PROVIDER_PATHS.today}
              aria-current="page"
              className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary no-underline"
            >
              Provider
            </Link>
            <Link
              href="/customer"
              className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 no-underline hover:bg-slate-100 hover:text-slate-800"
            >
              Customer
            </Link>
          </nav>

          {active ? (
            <AvailabilityToggle
              providerId={active.id}
              acceptsNewWork={active.acceptsNewWork}
              nextPath={PROVIDER_PATHS.today}
            />
          ) : null}
        </div>
      </div>

      {multiple ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          This account runs {context.providers.length} provider profiles. You are looking at{' '}
          <strong className="font-semibold text-slate-700">{active?.displayName}</strong>
          {active?.status === 'active' ? '' : ' (not published)'} — every page below is about that one.
        </p>
      ) : null}

      <div className="mt-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <WorkspaceNav showSetup={!active?.isPublic} />

        {/* pb-24 clears the phone bar, which is fixed and would otherwise sit on the last card. */}
        <div className="pb-24 lg:pb-0">
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

          {children}

          <WorkspaceSectionLinks showSetup={!active?.isPublic} />
        </div>
      </div>
    </div>
  );
}
