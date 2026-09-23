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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Organisation</p>
          <p className="mt-0.5 truncate text-sm font-bold tracking-tight text-slate-900">
            {organisation.entity.displayName}
            {organisation.entity.marketName ? ' · ' + organisation.entity.marketName : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {entities.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Entity</span>
              {entities.map(entity => (
                <Link
                  key={entity.id}
                  href={`/org/${entity.id}`}
                  aria-current={entity.id === orgId ? 'page' : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold no-underline ${
                    entity.id === orgId ? 'bg-primary-subtle text-primary' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {entity.displayName}
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">{organisation.role === 'platform' ? 'Platform view' : 'Member'}</span>
          )}
          <Link
            href={`/customer/requests/new?organisation=${orgId}`}
            className="inline-flex items-center rounded-lg bg-secondary px-4 py-2 font-mono text-xs font-bold tracking-wide text-white no-underline uppercase shadow-sm transition-colors hover:bg-secondary-dark"
          >
            New request
          </Link>
          <Link
            href={`/org/${orgId}?invite=1`}
            className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
          >
            Invite member
          </Link>
          <Link href="/customer" className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 no-underline hover:bg-slate-100 hover:text-slate-800">
            Personal workspace
          </Link>
        </div>
      </div>

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
