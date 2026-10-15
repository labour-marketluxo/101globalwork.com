import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PreferredProvidersDirectory } from '@/components/organisations/OrgDirectory';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getOrganisationDirectory } from '@/features/organisations/directory';
import { organisationFailureCopy } from '@/features/organisations/failure-copy';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * /org/[orgId]/providers — the vendor network.
 *
 * ⚠️ A PREFERENCE BYPASSES NOTHING, AND THIS IS WHERE THE PLATFORM HAS TO BE CLEAREST. Preferred status does not
 * affect verification, credentials, safety checks or matching eligibility — matching reads the provider's own
 * services, areas, readiness and identity, and never consults this directory. What the page shows is the
 * organisation's own bookkeeping alongside the provider's live records, so the two cannot be confused.
 */
export const metadata: Metadata = {
  title: 'Preferred providers',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ saved?: string; failed?: string; section?: string }>;

export default async function OrganisationProvidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const directory = await getOrganisationDirectory(orgId);
  if (directory.denied || directory.unavailable) notFound();

  // Published providers only: an unpublished profile is not in the marketplace, so a note about one would point at
  // somebody nobody can hire.
  const supabase = await createSupabaseServerClient();
  const { data: published } = await supabase
    .from('provider_public_profiles')
    .select('provider_id, display_name:headline, providers(display_name)')
    .eq('is_public', true)
    .limit(200);

  const availableProviders = (published ?? []).map(row => {
    const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    const name = (provider as { display_name?: string } | null)?.display_name ?? 'Provider';
    return { id: row.provider_id, name };
  });

  const failure = organisationFailureCopy(query.failed);

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Preferred providers</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          The providers this organisation trusts, with the credentials the platform can actually verify beside them.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{failure}</p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'provider' ? (
        <WorkspaceNotice tone="teal" role="status" title="Added to the directory.">
          <p>
            The verification state the platform saw has been recorded alongside it, so the entry cannot later read as
            though they were vetted when you chose them.
          </p>
        </WorkspaceNotice>
      ) : null}
      {query.saved === 'provider_removed' ? (
        <WorkspaceNotice tone="teal" role="status" title="Preference removed.">
          <p>Nothing about the provider changed: the platform never treated the preference as a permission.</p>
        </WorkspaceNotice>
      ) : null}

      <PreferredProvidersDirectory
        organisationId={orgId}
        directory={directory}
        canAdminister={directory.role === 'admin'}
        availableProviders={availableProviders}
      />
    </div>
  );
}
