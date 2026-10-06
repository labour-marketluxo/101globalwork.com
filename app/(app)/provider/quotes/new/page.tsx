import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from '@/components/ui/icons';
import { CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { OpportunityScopePanel } from '@/components/provider/OpportunitySections';
import { QuoteBuilderForm } from '@/components/provider/ProviderQuoteSections';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getOpportunityDetail } from '@/features/provider-workspace/opportunities';
import {
  getProviderRequestQuotes,
  getQuoteDraft,
  getRequestHeader,
} from '@/features/provider-workspace/quotes';
import { PROVIDER_PATHS, QUOTE_FAILURE_COPY, quoteFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/quotes/new?request=[requestId] — the quote builder.
 *
 * ⚠️ THIS REPLACES /provider/requests/[id]/quote, WHICH NOW REDIRECTS HERE. The old route carried the provider
 * id in the query string (`?provider=<uuid>`), which put a canonical identifier in the URL bar, the browser
 * history and any screenshot somebody shared. The provider is resolved from the session here instead, and the
 * ownership check happens inside the command either way.
 *
 * ⚠️ THREE WAYS IN, ONE FORM. A fresh quote opens with the suggested line labels; `?from=<quoteId>` pre-fills a
 * revision from a version the provider already sent; a saved draft wins over both, because a draft is the most
 * recent thing the provider actually typed. The banner on the form says which one it opened from, so nobody has
 * to wonder whether they are looking at their own work or a default.
 */
export const metadata: Metadata = {
  title: 'New quote',
  description: 'Price the work, itemised.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  request?: string;
  from?: string;
  failed?: string;
  draft?: string;
  inspection?: string;
  messaged?: string;
}>;

export default async function ProviderQuoteBuilderPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const requestId = params.request && /^[0-9a-f-]{36}$/i.test(params.request) ? params.request : null;
  if (!requestId) redirect(PROVIDER_PATHS.opportunities);

  const [header, quotes, draft] = await Promise.all([
    getRequestHeader(provider.id, requestId),
    getProviderRequestQuotes(provider.id, requestId),
    getQuoteDraft(provider.id, requestId),
  ]);
  if (!header) notFound();

  const previous = params.from ? quotes.find(quote => quote.id === params.from) ?? null : null;
  // The scope answers, for the summary above the form. Null when the request is no longer an open opportunity
  // — a request that already has an accepted quote, for instance — in which case the panel is simply absent.
  const { detail } = await getOpportunityDetail(provider.id, requestId);
  const failure = quoteFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      <nav aria-label="Quote" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`${PROVIDER_PATHS.opportunities}/${requestId}`} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to the opportunity
        </Link>
      </nav>

      <header>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Quote builder</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Price this work
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Price only what you can deliver. The itemisation you write here is what the customer compares against
          every other provider, and the accepted version becomes the baseline the job and its payment point at.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That quote was not submitted.">
          <p>{QUOTE_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.draft === 'saved' ? (
        <WorkspaceNotice tone="teal" role="status" title="Draft saved.">
          <p>
            Only you can see it. It is deleted when you submit a quote from this page, and it never consumes a
            version number.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.draft === 'discarded' ? (
        <WorkspaceNotice tone="teal" role="status" title="Draft discarded.">
          <p>Nothing on this page is stored now. Submitting still works as an ordinary first quote.</p>
        </WorkspaceNotice>
      ) : null}
      {params.inspection === 'requested' ? (
        <WorkspaceNotice tone="teal" role="status" title="Inspection requested.">
          <p>
            The customer has been asked for a visit and your figures are saved as a draft. No price was sent —
            send one when you have seen the work.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.messaged === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Message sent.">
          <p>It appears on the customer&apos;s request page.</p>
        </WorkspaceNotice>
      ) : null}

      <section className={`${CARD} p-5`} aria-labelledby="request-summary-heading">
        <h2 id="request-summary-heading" className="text-sm font-bold tracking-tight text-slate-900">
          The request
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{header.needText}</p>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Service</dt>
            <dd className="mt-0.5 text-slate-700">{header.serviceName ?? 'Matched service'}</dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Where</dt>
            <dd className="mt-0.5 text-slate-700">
              {[header.locationName, header.cityName].filter(Boolean).join(', ') || 'Matched area'}
            </dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Currency</dt>
            <dd className="mt-0.5 text-slate-700">
              {previous?.currencyCode ?? header.currencyCode ?? 'NGN'} — from the request&apos;s market, not chosen
              here
            </dd>
          </div>
        </dl>
      </section>

      {detail ? <OpportunityScopePanel detail={detail} /> : null}

      <QuoteBuilderForm
        request={header}
        providerId={provider.id}
        draft={draft}
        previous={previous}
        resumedFrom={draft ? 'draft' : previous ? 'revision' : 'suggestions'}
      />

      {quotes.length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="existing-versions-heading">
          <h2 id="existing-versions-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Versions you have already sent
          </h2>
          <ul className="mt-3 grid gap-2 text-xs">
            {quotes.map(quote => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="text-slate-700">
                  {quote.version} · {quote.status.replaceAll('_', ' ')}
                </span>
                <Link href={`${PROVIDER_PATHS.quotes}/${quote.id}`} className={LINK_ARROW}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Submitting from this page creates the next version. Nothing above is changed by it: a version the
            customer may already have read stays exactly as it was.
          </p>
        </section>
      ) : null}
    </div>
  );
}
