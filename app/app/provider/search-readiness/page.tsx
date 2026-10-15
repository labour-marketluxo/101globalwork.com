import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  PlatformReasons,
  ReadinessChecklist,
  ReadinessFacts,
  ReadinessHeader,
  ReadinessScore,
} from '@/components/provider/ReadinessSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getProviderReadiness } from '@/features/provider-workspace/readiness';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * /provider/search-readiness — the discoverability dashboard.
 *
 * ⚠️ THIS PAGE REPLACES ONE THE AUDIT MARKED `Incorrect`, AND THE BUG IS WORTH NAMING SO IT IS NOT
 * REINTRODUCED: the previous version read `supabase.from('providers').select(...).limit(1)` with no
 * ownership filter, so an account with more than one provider profile saw another business's score and
 * reasons list. Every read here goes through the workspace context, which resolves the provider from
 * the signed-in account, and the score shown is that row's.
 *
 * ⚠️ IT NO LONGER RENDERS A SIGNED-OUT BRANCH. The layout guards the session, and a page inside an
 * authenticated workspace that answers a signed-out request with a 200 and a sentence looks reachable
 * when it is not. A signed-out visitor is sent to sign-in by the shell; a missing provider is sent to
 * onboarding.
 */
export const metadata: Metadata = {
  title: 'Search readiness',
  description: 'Whether your provider profile is complete enough to be discovered.',
  robots: { index: false, follow: false },
};

export default async function ProviderSearchReadinessPage() {
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  return (
    <div className="grid gap-6">
      <Suspense fallback={<WorkspaceSkeleton />}>
        <ReadinessBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function ReadinessBody({ providerId }: { providerId: string }) {
  const { data, unavailable } = await getProviderReadiness(providerId, new Date());
  if (unavailable || !data) return <WorkspaceUnavailable what="Search readiness" />;

  return (
    <>
      <ReadinessHeader data={data} />
      <ReadinessScore data={data} />
      {data.remaining === 0 ? (
        <WorkspaceNotice tone="teal" role="status" title="Every item on this list is done.">
          <p>
            That means your profile is complete enough to be matched, and eligible to be indexed. It is
            not a promise about where it appears in a search result — that ordering belongs to the search
            engine, and this platform has no control over it.
          </p>
        </WorkspaceNotice>
      ) : null}
      <ReadinessChecklist data={data} />
      <PlatformReasons data={data} />
      <ReadinessFacts data={data} />
    </>
  );
}
