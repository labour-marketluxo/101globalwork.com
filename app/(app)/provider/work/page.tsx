import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { WorkFilters, WorkList, WorkTabs } from '@/components/provider/WorkSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';
import { getProviderWork, workTabOf, type WorkRow, type WorkTab } from '@/features/provider-workspace/work';

/**
 * /provider/work — the job list.
 *
 * ⚠️ THE FOUR TABS COME FROM ONE READ. `get_my_work_command` returns every assignment for this provider and the
 * page splits them, so a job cannot be counted in two tabs or fall out of all four, and the counts are computed
 * from the same array the list is.
 *
 * ⚠️ SEARCH AND SORT ARE QUERY PARAMETERS. They survive a reload on a bad connection, they can be bookmarked, and
 * they narrow a list that is already this provider's own work — the command takes no filter, so nothing in the
 * URL can widen what is returned.
 */
export const metadata: Metadata = {
  title: 'Your work',
  description: 'Jobs you have been assigned, and the ones you have finished.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  tab?: string;
  q?: string;
  sort?: string;
  failed?: string;
  started?: string;
  blocked?: string;
}>;

const TAB_KEYS: WorkTab[] = ['active', 'scheduled', 'review', 'completed'];

export default async function ProviderWorkPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const tab: WorkTab = TAB_KEYS.includes(params.tab as WorkTab) ? (params.tab as WorkTab) : 'active';
  const query = (params.q ?? '').trim().slice(0, 120);
  const sort = ['soonest', 'latest', 'assigned'].includes(params.sort ?? '') ? (params.sort as string) : 'soonest';
  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      <header>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Work</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Your jobs
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Everything a customer has accepted from you, from the job you are driving to this morning to the ones
          already signed off.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.started === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Work started.">
          <p>
            The customer can see that work is under way. Submit evidence when it is finished — that is what asks them
            to approve it.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.blocked === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Job paused.">
          <p>The customer can see that the job has stopped and the reason you gave. Resume it when you can.</p>
        </WorkspaceNotice>
      ) : null}
      {params.blocked === 'resolved' ? (
        <WorkspaceNotice tone="teal" role="status" title="Job resumed.">
          <p>The blocker is closed and the job is moving again.</p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <WorkBody providerId={provider.id} tab={tab} query={query} sort={sort} />
      </Suspense>
    </div>
  );
}

async function WorkBody({
  providerId,
  tab,
  query,
  sort,
}: {
  providerId: string;
  tab: WorkTab;
  query: string;
  sort: string;
}) {
  const now = new Date();
  const { rows, unavailable } = await getProviderWork(providerId);
  if (unavailable) return <WorkspaceUnavailable what="Your jobs" />;

  const counts: Record<WorkTab, number> = { active: 0, scheduled: 0, review: 0, completed: 0 };
  for (const row of rows) counts[workTabOf(row)] += 1;

  const inTab = rows.filter(row => workTabOf(row) === tab);
  const needle = query.toLowerCase();
  const searched = needle
    ? inTab.filter(row =>
        [row.needText, row.locationName, row.cityName, row.serviceName, row.customerDisplayName, row.openBlockerReason]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(needle)),
      )
    : inTab;

  const sorted = sortWork(searched, sort);

  return (
    <>
      <WorkTabs counts={counts} current={tab} query={query} sort={sort} />
      <WorkFilters tab={tab} query={query} sort={sort} />
      <p className="text-xs leading-relaxed text-slate-500">
        {searched.length} job{searched.length === 1 ? '' : 's'} in this tab
        {query ? ` matching “${query}”` : ''}. {rows.length} in total.
      </p>
      <WorkList rows={sorted} now={now} />
    </>
  );
}

/**
 * Sorting, with a rule for the jobs that have no date.
 *
 * ⚠️ AN UNSCHEDULED JOB IS NOT "LATEST" IN EITHER DIRECTION. Under "soonest" it sorts to the top — it is the one
 * that needs a time agreed before it can happen at all — and under "latest", where the question is when the
 * provider is busy, it sorts to the bottom. Leaving it wherever the database happened to return it would make the
 * sort mean nothing for the jobs that need attention most.
 */
function sortWork(rows: WorkRow[], sort: string): WorkRow[] {
  const time = (value: string | null) => (value ? new Date(value).getTime() : null);
  const copy = [...rows];

  if (sort === 'assigned') {
    return copy.sort((a, b) => (time(b.assignedAt) ?? 0) - (time(a.assignedAt) ?? 0));
  }

  const direction = sort === 'latest' ? -1 : 1;
  return copy.sort((a, b) => {
    const at = time(a.scheduledStart);
    const bt = time(b.scheduledStart);
    if (at === null && bt === null) return (time(b.assignedAt) ?? 0) - (time(a.assignedAt) ?? 0);
    if (at === null) return direction === 1 ? -1 : 1;
    if (bt === null) return direction === 1 ? 1 : -1;
    return (at - bt) * direction;
  });
}
