import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  ActionsWidget,
  EarningsWidget,
  OpportunitiesWidget,
  ScheduleWidget,
  TodayHero,
} from '@/components/provider/TodaySections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { PROVIDER_PATHS, PROVIDER_FAILURE_COPY, providerFailureCode } from '@/features/provider-workspace/paths';
import { getProviderContext } from '@/features/provider-workspace/context';
import { FIELD_PROGRESS_COPY, getProviderDay } from '@/features/provider-workspace/day';

/**
 * /provider — the provider's operational home.
 *
 * ⚠️ THE ORDER OF THE THREE THINGS BELOW IS THE DESIGN, and it is the opposite of a typical dashboard:
 *
 *   1. the guard (who is this, and do they have a provider profile),
 *   2. the outcome of whatever they just did,
 *   3. the data, inside a Suspense boundary placed AFTER the guard.
 *
 * A route-level `loading.tsx` would flush a 200 shell before the redirect in step 1 could run, turning
 * a signed-out visit into a soft 404 — the same trap the settings page documents. The skeleton is
 * therefore an in-page boundary, and it is the shape of what it replaces.
 */
export const metadata: Metadata = {
  title: "Today's overview",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  available?: string;
  field?: string;
  started?: string;
  published?: string;
  saved?: string;
  failed?: string;
}>;

export default async function ProviderTodayPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;

  // No provider profile is not an error state — it is the state onboarding exists for.
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That change did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}

      {params.available === 'online' ? (
        <WorkspaceNotice tone="teal" role="status" title="You are online.">
          <p>New requests that match your services and areas can reach you from now on.</p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'offline' ? (
        <WorkspaceNotice tone="teal" role="status" title="You are offline.">
          <p>
            Matching stops for new requests. Work you have already accepted, and quotes already sent,
            are unaffected — a quote can still be accepted while you are offline.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.field ? (
        <WorkspaceNotice tone="teal" role="status" title="Recorded.">
          <p>
            {params.field in FIELD_PROGRESS_COPY
              ? `${FIELD_PROGRESS_COPY[params.field as keyof typeof FIELD_PROGRESS_COPY]} is now on this job's record.`
              : 'The job record has been updated.'}
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.started === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Job started.">
          <p>
            The customer can see that work is under way. Submit completion evidence when the work is
            finished — that is what asks them to approve it.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.published === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Profile published.">
          <p>You are in the marketplace, and matching can now reach you.</p>
        </WorkspaceNotice>
      ) : null}
      {params.saved ? (
        <WorkspaceNotice tone="teal" role="status" title="Saved.">
          <p>The change is on your profile and readiness has been recalculated.</p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <TodayBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function TodayBody({ providerId }: { providerId: string }) {
  // One instant for the whole page: two widgets rendered a moment apart must not disagree about
  // whether a job is today.
  const now = new Date();
  const { day, unavailable } = await getProviderDay(providerId);

  if (unavailable || !day) return <WorkspaceUnavailable what="Today" />;

  return (
    <>
      <TodayHero day={day} nextPath={PROVIDER_PATHS.today} />

      <ScheduleWidget day={day} now={now} nextPath={PROVIDER_PATHS.today} />

      <div className="grid gap-4 sm:grid-cols-2">
        <OpportunitiesWidget day={day} />
        <ActionsWidget day={day} now={now} />
      </div>

      <EarningsWidget day={day} />
    </>
  );
}
