import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  RequirementsList,
  VerificationHeader,
  VerificationHistory,
} from '@/components/provider/VerificationSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getVerificationCentre } from '@/features/provider-workspace/verification';
import { PROVIDER_PATHS, PROVIDER_FAILURE_COPY, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/verification — the verification centre.
 *
 * ⚠️ IT IS SEPARATE FROM /provider/credentials ON PURPOSE. This page holds the three per-business
 * claims (identity, business, address) where one row per kind is the whole story. Credentials are a set
 * — several licences, different issuers, different expiry dates — and squashing them in here would make
 * "verified" a word that describes a provider rather than a document.
 *
 * ⚠️ THE FEATURE MODULE IS THE ONLY PLACE THAT DECIDES WHICH REQUIREMENT IS A GATE. The page does not
 * re-derive "identity blocks publication" from the status enum; it renders what the module says.
 */
export const metadata: Metadata = {
  title: 'Verification',
  description: 'Identity, business and address verification.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ submitted?: string; failed?: string }>;

export default async function ProviderVerificationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That submission did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.submitted === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Submitted for review.">
          <p>
            A reviewer reads it by hand. You can keep working and editing your profile while it is
            pending — nothing else in the workspace waits on this.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.submitted === 'resubmitted' ? (
        <WorkspaceNotice tone="teal" role="status" title="Re-submitted.">
          <p>
            The claim is back in review with your new reference. The previous decision was cleared, so
            nothing on your record still describes the document you replaced.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <VerificationBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function VerificationBody({ providerId }: { providerId: string }) {
  const { centre, unavailable } = await getVerificationCentre(providerId);
  if (unavailable || !centre) return <WorkspaceUnavailable what="Your verification record" />;

  return (
    <>
      <VerificationHeader centre={centre} />
      <RequirementsList centre={centre} providerId={providerId} nextPath={PROVIDER_PATHS.verification} />
      <VerificationHistory centre={centre} />
      <WorkspaceNotice tone="slate">
        <p>
          What is stored: the kind of check, the jurisdiction and reference you give, the reviewer&apos;s
          decision and their note. Nothing on this page is published — your public profile shows only
          that an identity check passed, never its details.
        </p>
      </WorkspaceNotice>
    </>
  );
}
