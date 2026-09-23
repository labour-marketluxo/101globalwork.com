import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AddCredentialForm, CredentialHeader, CredentialList } from '@/components/provider/CredentialSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getProviderCredentials } from '@/features/provider-workspace/credentials';
import { PROVIDER_PATHS, PROVIDER_FAILURE_COPY, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/credentials — the credentials manager.
 *
 * Records what the provider holds: type, issuing body, jurisdiction, expiry, the service categories each
 * one covers, and the reference to the document. Everything here is private; the public profile shows
 * the count of verified ones.
 */
export const metadata: Metadata = {
  title: 'Credentials',
  description: 'Licences, certifications and insurance.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ saved?: string; failed?: string }>;

export default async function ProviderCredentialsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That credential was not saved.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.saved === 'credential_added' ? (
        <WorkspaceNotice tone="teal" role="status" title="Credential added.">
          <p>
            It is pending review. A reviewer checks the document reference and the expiry date before it
            counts anywhere.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.saved === 'credential_renewed' ? (
        <WorkspaceNotice tone="teal" role="status" title="Renewal recorded.">
          <p>
            The credential is back in review with the new document and expiry date. If it was verified
            before, that decision has been cleared — the document that was verified is no longer the one
            on file.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <CredentialsBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function CredentialsBody({ providerId }: { providerId: string }) {
  const now = new Date();
  const { data, unavailable } = await getProviderCredentials(providerId, now);
  if (unavailable || !data) return <WorkspaceUnavailable what="Your credentials" />;

  return (
    <>
      <CredentialHeader data={data} />
      <CredentialList data={data} nextPath={PROVIDER_PATHS.credentials} now={now} />
      <AddCredentialForm data={data} nextPath={PROVIDER_PATHS.credentials} />
    </>
  );
}
