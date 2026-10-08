import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText } from '@/components/ui/icons';
import WorkspaceHero, { WORKSPACE_HERO_ACTION } from '@/components/customer/WorkspaceHero';
import {
  RequestListCard,
  RequestListControls,
  RequestListEmpty,
  RequestListSkeleton,
  RequestTabs,
} from '@/components/customer/RequestSections';
import {
  REQUEST_TABS,
  getCustomerRequestList,
  requestTabLabel,
  requestTabOf,
  type RequestTab,
} from '@/features/customer/requests';

export const metadata = {
  title: 'My requests',
  robots: { index: false, follow: false },
};

type Params = { tab?: string; q?: string; sort?: string };

const SORTS = ['newest', 'oldest', 'action', 'quotes'] as const;
type Sort = (typeof SORTS)[number];

function parseTab(value: string | undefined): RequestTab {
  return (REQUEST_TABS as readonly string[]).includes(value ?? '') ? (value as RequestTab) : 'all';
}

/**
 * My Requests — the hub behind `/customer/requests`.
 *
 * ⚠️ FILTERING AND SORTING HAPPEN HERE, IN THE PAGE, AND THE STATE LIVES IN THE URL. The read is capped at
 * fifty requests, so this is a few array operations; pushing it into the query would mean building `ilike`
 * patterns out of whatever somebody types. Every control is a link or a GET form, so the filter survives a
 * reload, the back button and a shared link, and none of it needs JavaScript.
 */
export default async function CustomerRequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const query = (params.q ?? '').trim();
  const sort: Sort = (SORTS as readonly string[]).includes(params.sort ?? '') ? (params.sort as Sort) : 'newest';

  return (
    <section>
      <WorkspaceHero
        eyebrow="Customer workspace"
        title="My requests"
        description="Everything you have posted, from the drafts you have not finished to the work that is done. A request stays here after it closes — the record of what was asked for is as useful as the work."
      >
        <Link href="/customer/requests/new" className={WORKSPACE_HERO_ACTION}>
          Post a Request <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </WorkspaceHero>

      {/* In-page Suspense on purpose: a route-level `loading.tsx` would sit ABOVE the layout's sign-in guard
          and turn a signed-out visitor into a soft 404 instead of a redirect. */}
      <Suspense fallback={<RequestListSkeleton />}>
        <RequestsBody tab={tab} query={query} sort={sort} />
      </Suspense>
    </section>
  );
}

async function RequestsBody({ tab, query, sort }: { tab: RequestTab; query: string; sort: Sort }) {
  const { items, unavailable } = await getCustomerRequestList();

  const counts = REQUEST_TABS.reduce((acc, value) => {
    acc[value] = value === 'all'
      ? items.length
      : items.filter(item => requestTabOf(item.state) === value).length;
    return acc;
  }, {} as Record<RequestTab, number>);

  const needle = query.toLowerCase();
  const filtered = items
    .filter(item => tab === 'all' || requestTabOf(item.state) === tab)
    .filter(item => {
      if (!needle) return true;
      const haystack = [
        item.needText,
        item.serviceName ?? '',
        item.locationName ?? '',
        `REQ-${item.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        case 'quotes':
          return b.quoteCount - a.quoteCount || Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case 'action':
          // Everything waiting on the customer first: this is the sort the page exists for.
          return Number(Boolean(b.nextAction)) - Number(Boolean(a.nextAction)) ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt);
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });

  return (
    <>
      <RequestTabs active={tab} counts={counts} query={query} sort={sort} />

      <div className="mt-4">
        <RequestListControls tab={tab} query={query} sort={sort} />
      </div>

      {unavailable ? (
        <p role="alert" className="mt-6 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          Your requests could not be read just now. This is a read failure, not an empty account — reload in a
          moment.
        </p>
      ) : null}

      <p className="mt-5 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        {filtered.length} {filtered.length === 1 ? 'request' : 'requests'}
        {tab !== 'all' ? ` · ${requestTabLabel(tab)}` : ''}
        {query ? ` · matching “${query}”` : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <RequestListEmpty tab={tab} query={query} />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map(item => (
            <RequestListCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        The list is capped at your fifty most recent requests. Older ones are still in your account; this page
        does not page through them yet.
      </p>
    </>
  );
}
