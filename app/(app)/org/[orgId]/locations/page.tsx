import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationsDirectory } from '@/components/organisations/OrgDirectory';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getOrganisationDirectory } from '@/features/organisations/directory';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';

/**
 * /org/[orgId]/locations — the site directory.
 *
 * ⚠️ MULTI-COUNTRY ADDRESS FIELDS, DELIBERATELY NOT A COUNTRY-SPECIFIC SET. A US-style state-and-ZIP pair would be
 * wrong in most of the markets this platform operates in, so an address is free text plus a two-letter country code,
 * and the region field says "your own wording".
 *
 * ⚠️ NO GEOCODING, AND THE PAGE SAYS SO. The platform has no geocoding service and no coordinates for its own
 * locations; the address is recorded as typed and matched work uses the area, which is why the area cannot be edited
 * here.
 */
export const metadata: Metadata = {
  title: 'Sites and branches',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ saved?: string; failed?: string; section?: string }>;

export default async function OrganisationLocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const directory = await getOrganisationDirectory(orgId);
  if (directory.denied || directory.unavailable) notFound();

  const failure = organisationFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Sites and branches</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Where this organisation works, who runs each site, and how to get in. Adding a site happens on the overview —
          it needs an area from the platform&apos;s catalog, which is the thing matching reads.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'location' ? (
        <WorkspaceNotice tone="teal" role="status" title="Site details saved.">
          <p>The address, contact and notes are stored for both parties who need them.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'location_archived' ? (
        <WorkspaceNotice tone="teal" role="status" title="Site archived.">
          <p>It stays in the directory as history and is no longer offered as a scope for new work.</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'location_restored' ? (
        <WorkspaceNotice tone="teal" role="status" title="Site restored.">
          <p>It is an ordinary site again.</p>
        </WorkspaceNotice>
      ) : null}

      <LocationsDirectory organisationId={orgId} directory={directory} canAdminister={directory.role === 'admin'} />
    </div>
  );
}
