import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import OrgTabs from '@/components/organisations/OrgShell';
import { getOrganisation, getMyOrganisations } from '@/features/organisations/org';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The organisation layout — switcher, quick actions and tabs.
 *
 * ⚠️ AUTHORISATION HAPPENS HERE AND AGAIN IN EVERY READ. A layout is not a security boundary: each page asks for the
 * organisation itself and the command re-derives membership, so a page rendered on its own is still protected.
 *
 * ⚠️ NOINDEX IS SET HERE AND INHERITED by every page under it, so a future tab cannot be indexed by forgetting to say
 * so. The switcher lists the entities this account actually belongs to — that list comes from `organisation_members`,
 * not from a query parameter.
 */
export const metadata: Metadata = {
  title: 'Organisation',
  description: 'Business entities, their projects and their budgets.',
  robots: { index: false, follow: false },
};

export default async function OrganisationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [{ organisation, denied, unavailable }, entities] = await Promise.all([getOrganisation(orgId), getMyOrganisations()]);
  if (unavailable) {
    return (
      <div className={PAGE_SHELL}>
        <p className="text-sm text-slate-600">This organisation could not be loaded. Nothing has changed — reload to try again.</p>
      </div>
    );
  }
  if (denied || !organisation) notFound();

  return (
    <div className={PAGE_SHELL}>
      <header className="overflow-hidden rounded-[20px] border border-emerald-500/20 bg-[#0D282E] px-6 py-7 text-white sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="font-sans text-[11px] font-bold tracking-[0.16em] text-emerald-300 uppercase">Organisation</p>
            <h1 className="mt-2 max-w-3xl truncate text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-3xl">
              {organisation.entity.displayName}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {organisation.entity.marketName ? (
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-semibold text-emerald-200">
                  {organisation.entity.marketName}
                </span>
              ) : null}
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-200">
                {organisation.entity.subscriptionPlan} plan
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
                {organisation.role === 'platform' ? 'Platform view' : 'Member'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {entities.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-1">
                {entities.map(entity => (
                  <Link
                    key={entity.id}
                    href={`/app/org/${entity.id}`}
                    aria-current={entity.id === orgId ? 'page' : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold no-underline transition-colors ${
                      entity.id === orgId
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {entity.displayName}
                  </Link>
                ))}
              </div>
            ) : null}
            <Link
              href={`/app/customer/requests/new?organisation=${orgId}`}
              className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 font-sans text-xs font-bold tracking-wide text-slate-950 no-underline uppercase transition-colors hover:bg-amber-400"
            >
              New request
            </Link>
            <Link
              href={`/app/org/${orgId}?invite=1`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 no-underline transition-colors hover:border-emerald-300/50 hover:bg-emerald-400/20 hover:text-white"
            >
              Invite member
            </Link>
            <Link
              href="/app/customer"
              className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 no-underline transition-colors hover:bg-white/10 hover:text-white"
            >
              Personal workspace
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-4">
        <OrgTabs organisationId={orgId} />
      </div>

      <div className="mt-6">{children}</div>
      <p className="mt-6 text-xs leading-relaxed text-slate-400">
        Provider tools are at <Link href={PROVIDER_PATHS.today} className="underline underline-offset-2">the provider workspace</Link>.
      </p>
    </div>
  );
}
