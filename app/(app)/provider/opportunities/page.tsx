import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { OpportunityFeed, OpportunityFilters } from '@/components/provider/OpportunitySections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import {
  applyOpportunityFilters,
  getProviderOpportunities,
  opportunityCategories,
  type OpportunityBand,
} from '@/features/provider-workspace/opportunities';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/opportunities — the feed of work this provider can quote.
 *
 * ⚠️ THE FILTERS ARE QUERY PARAMETERS, NOT CLIENT STATE. Three selects in a GET form mean the filtered list is
 * a URL a provider can bookmark, reload on a flaky connection, or send to themselves — and no JavaScript is
 * needed to filter. The values are validated against known sets below, so nothing the URL says can reach a
 * query.
 *
 * ⚠️ IT NARROWS, IT NEVER WIDENS. `get_my_opportunities_command` decides what this provider may see; the three
 * controls only remove rows from that list. A page that could widen it would be a page that offers work the
 * quote form refuses.
 */
export const metadata: Metadata = {
  title: 'Opportunities',
  description: 'Requests you are eligible to quote.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  service?: string;
  band?: string;
  availability?: string;
  responded?: string;
  failed?: string;
}>;

export default async function ProviderOpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);
  const band: OpportunityBand | null = params.band === 'primary' || params.band === 'covered' ? params.band : null;
  const availability =
    params.availability === 'urgent' || params.availability === 'soon' ? params.availability : null;
  const service = params.service && /^[0-9a-f-]{36}$/i.test(params.service) ? params.service : '';

  return (
    <div className="grid gap-6">
      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Opportunities</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Work you can quote
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Requests that passed the platform&apos;s matching rules for your services, your areas and this market.
          Nothing here is a search result — every card is work the quote form would accept from you.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.responded === 'interested' ? (
        <WorkspaceNotice tone="teal" role="status" title="Marked as interested.">
          <p>
            It is a note to yourself — the customer is not told, and nothing about matching changes. It stays on
            the card so a full page of work can be triaged across sessions.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.responded === 'declined' ? (
        <WorkspaceNotice tone="teal" role="status" title="Declined.">
          <p>
            The customer never sees this and the request stays out of your way. You can still quote it from the
            detail page if you change your mind.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <OpportunityFeedBody
          providerId={provider.id}
          filters={{ service, band, availability }}
        />
      </Suspense>
    </div>
  );
}

async function OpportunityFeedBody({
  providerId,
  filters,
}: {
  providerId: string;
  filters: { service: string; band: OpportunityBand | null; availability: 'urgent' | 'soon' | null };
}) {
  const { opportunities, unavailable } = await getProviderOpportunities(providerId);
  if (unavailable) return <WorkspaceUnavailable what="Your opportunities" />;

  const categories = opportunityCategories(opportunities);
  const filtered = applyOpportunityFilters(opportunities, {
    serviceId: filters.service || null,
    band: filters.band,
    availability: filters.availability,
  });
  const unanswered = filtered.filter(opportunity => !opportunity.quoteId).length;

  return (
    <>
      <OpportunityFilters
        categories={categories}
        current={{
          service: filters.service,
          band: filters.band ?? '',
          availability: filters.availability ?? '',
        }}
      />

      <p className="text-xs leading-relaxed text-slate-500">
        Showing {filtered.length} of {opportunities.length} eligible request{opportunities.length === 1 ? '' : 's'}.
        {unanswered > 0 ? ` ${unanswered} ${unanswered === 1 ? 'has' : 'have'} no quote from you yet.` : ' You have answered every one.'}
      </p>

      <OpportunityFeed
        opportunities={filtered}
        providerId={providerId}
        nextPath={PROVIDER_PATHS.opportunities}
      />
    </>
  );
}
