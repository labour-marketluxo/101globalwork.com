import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { PortfolioTable } from '@/components/organisations/OrgSections';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { ORG_STATE_COPY, getOrganisation } from '@/features/organisations/org';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';

/**
 * /org/[orgId]/projects — the portfolio.
 *
 * ⚠️ THE FILTERS ARE QUERY PARAMETERS, SO A PORTFOLIO VIEW IS A LINK. Search, site, state, owner and SLA all narrow
 * the same read the dashboard uses, and the CSV export takes the same parameters — an export that ignored the filters
 * would hand somebody a different number from the one on their screen.
 */
export const metadata: Metadata = {
  title: 'Portfolio projects',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ q?: string; site?: string; state?: string; owner?: string; sla?: string; saved?: string; failed?: string }>;

export default async function OrganisationProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const { organisation, denied } = await getOrganisation(orgId);
  if (denied || !organisation) notFound();

  const needle = (query.q ?? '').trim().toLowerCase();
  const filtered = organisation.projects.filter(project => {
    if (needle && ![project.title, project.locationName, project.serviceName, project.ownerName, project.providerName]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle))) return false;
    if (query.site && project.locationName !== query.site) return false;
    if (query.state && project.state !== query.state) return false;
    if (query.owner === 'unassigned' && project.ownerAccountId) return false;
    if (query.owner && query.owner !== 'unassigned' && project.ownerAccountId !== query.owner) return false;
    if (query.sla && project.sla !== query.sla) return false;
    return true;
  });

  const failure = organisationFailureCopy(query.failed);
  const exportQuery = new URLSearchParams(
    Object.entries({ q: query.q, site: query.site, state: query.state, owner: query.owner, sla: query.sla }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  ).toString();

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Portfolio</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
            Every request this organisation commissioned, across its sites, with the money committed to it and the
            action it is waiting on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/customer/requests/new?organisation=${orgId}`}
            className="inline-flex items-center rounded-lg bg-secondary px-4 py-2 font-mono text-xs font-bold tracking-wide text-white no-underline uppercase shadow-sm transition-colors hover:bg-secondary-dark"
          >
            Create new project
          </Link>
          <a
            href={`/org/${orgId}/projects/export${exportQuery ? '?' + exportQuery : ''}`}
            className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
            download
          >
            Export portfolio CSV
          </a>
        </div>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'owner' ? (
        <WorkspaceNotice tone="teal" role="status" title="Owner assigned.">
          <p>The owner is an internal name — the provider on the job never sees it.</p>
        </WorkspaceNotice>
      ) : null}

      <form method="get" action={`/org/${orgId}/projects`} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className={LABEL}>Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="title, site, owner or provider" className={FIELD} />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="site" className={LABEL}>Site</label>
          <select id="site" name="site" defaultValue={query.site ?? ''} className={FIELD}>
            <option value="">Every site</option>
            {organisation.locations.map(location => (
              <option key={location.id} value={location.name}>{location.label ?? location.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="state" className={LABEL}>Status</label>
          <select id="state" name="state" defaultValue={query.state ?? ''} className={FIELD}>
            <option value="">Every status</option>
            {Object.entries(ORG_STATE_COPY).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="owner" className={LABEL}>Owner</label>
          <select id="owner" name="owner" defaultValue={query.owner ?? ''} className={FIELD}>
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {organisation.members.map(member => (
              <option key={member.accountId} value={member.accountId}>{member.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sla" className={LABEL}>SLA health</label>
          <select id="sla" name="sla" defaultValue={query.sla ?? ''} className={FIELD}>
            <option value="">Any</option>
            <option value="on_track">On track</option>
            <option value="late">Past its date</option>
            <option value="blocked">Blocked</option>
            <option value="no_window">No date agreed</option>
            <option value="complete">Complete</option>
          </select>
        </div>
        <PendingButton
          idle="Apply"
          pending="Applying…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        {query.q || query.site || query.state || query.owner || query.sla ? (
          <Link href={`/org/${orgId}/projects`} className={LINK_ARROW}>Clear</Link>
        ) : null}
      </form>

      <p className="text-xs leading-relaxed text-slate-500">
        {filtered.length} of {organisation.projects.length} project{organisation.projects.length === 1 ? '' : 's'} shown.
      </p>

      <PortfolioTable organisation={organisation} projects={filtered} canAssign={organisation.role === 'admin'} />
    </div>
  );
}
