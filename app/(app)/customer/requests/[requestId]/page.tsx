import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Pencil } from 'lucide-react';
import {
  CancelRequestPanel,
  EditRequestPanel,
  MatchingTimeline,
  MatchesGrid,
  RequestSummaryCard,
} from '@/components/customer/RequestSections';
import { BADGE_AMBER, CARD, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { DecisionNotice, MessageProviderPanel } from '@/components/customer/QuoteSections';
import { CUSTOMER_PATHS } from '@/features/customer/intake';
import { expiryState } from '@/features/customer/expiry';
import { formatMoney, groupQuotes, quoteActionability } from '@/features/customer/quotes';
import { getCustomerRequestDetail, getLocationOptions } from '@/features/customer/requests';

export const metadata = {
  title: 'Request',
  robots: { index: false, follow: false },
};

const CANCELLABLE_STATES = ['draft', 'submitted', 'matching', 'quoted', 'accepted', 'scheduled', 'in_progress', 'disputed'];

/**
 * The states in which a request is still the customer's to change.
 *
 * ⚠️ THIS MIRRORS `update_customer_request_command`, WHICH IS THE GUARD. It exists so the page offers a reason
 * rather than a form that would be refused — a quote that has been submitted is priced against this wording, and
 * the database will not let the wording move under it.
 */
const EDITABLE_STATES = ['draft', 'submitted', 'matching'];

/**
 * Request detail — the record, the matching status, who is in the running, and what you can do next.
 *
 * ⚠️ "MESSAGE PROVIDER" MEANS THE ONE CHANNEL THAT EXISTS, AND SAYS SO. There is no chat: no messaging table, no
 * thread, no delivery, and the platform's outbox is unpublished. What does reach a provider is a clarification
 * recorded against their quote version, which they read on their own copy — so that is what the action opens,
 * labelled with what it actually does rather than presented as a conversation.
 */
export default async function CustomerRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ failed?: string; decided?: string }>;
}) {
  const { requestId } = await params;
  const query = await searchParams;

  const request = await getCustomerRequestDetail(requestId);
  if (!request) notFound();

  const locations = await getLocationOptions();
  const groups = groupQuotes(request.quotes);
  const hasActiveAssignment = Boolean(request.assignment);
  const openForDecision = groups.filter(group =>
    quoteActionability(group.latest, { requestState: request.state, hasActiveAssignment }).canAccept).length;

  const hasSubmittedQuote = request.quotes.some(quote => quote.status === 'submitted' || quote.status === 'accepted');
  const editable = EDITABLE_STATES.includes(request.state) && !hasSubmittedQuote && !hasActiveAssignment;
  const editBlockedReason = hasSubmittedQuote || hasActiveAssignment
    ? 'A provider has already priced this request, so the wording can no longer change beneath that price. Ask the provider for a revised quote instead.'
    : 'This request is closed, so nothing on it can be edited any more.';

  return (
    <section className={PAGE_SHELL}>
      <DecisionNotice failed={query.failed} decided={query.decided} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Request" className="flex flex-wrap items-center gap-2 text-xs">
          <Link href="/customer/requests" className={`${LINK_ARROW} no-underline`}>
            ← All requests
          </Link>
          <span className="text-slate-300" aria-hidden="true">
            /
          </span>
          <span className="font-mono font-bold tracking-wider text-slate-500 uppercase">
            REQ-{request.id.replace(/-/g, '').slice(0, 8).toUpperCase()}
          </span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {request.state === 'draft' ? (
            <Link href={`${CUSTOMER_PATHS.newRequest}?draft=${request.id}`} className={LINK_ARROW}>
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              Finish this draft <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <RequestSummaryCard request={request} />

          {groups.length > 0 ? (
            <section aria-labelledby="quotes-heading" className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="quotes-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Quotes on this request
                </h2>
                {openForDecision > 0 ? (
                  <span className={BADGE_AMBER}>
                    {openForDecision} awaiting your decision
                  </span>
                ) : null}
              </div>

              <ul className="mt-4 space-y-3">
                {groups.map(group => {
                  const actions = quoteActionability(group.latest, { requestState: request.state, hasActiveAssignment });
                  const expiry = expiryState(group.latest.validUntil);
                  return (
                    <li key={group.providerId} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{group.providerName}</p>
                          <p className="mt-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                            version {group.latest.versionLabel}
                            {group.history.length > 0 ? ` · ${group.history.length} earlier` : ''}
                          </p>
                        </div>
                        <span className="font-bold text-primary">
                          {formatMoney(group.latest.totalMinor, group.latest.currencyCode)}
                        </span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>
                          {group.latest.lineItems.length > 0
                            ? `${group.latest.lineItems.length} itemised line${group.latest.lineItems.length === 1 ? '' : 's'}`
                            : 'Priced in one number'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{expiry ? expiry.label : 'no expiry set'}</span>
                        <span aria-hidden="true">·</span>
                        <Link href={`/customer/requests/${request.id}/quotes/${group.latest.quoteId}`} className={LINK_ARROW}>
                          View full quote <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </p>
                      {actions.blockedReason ? (
                        <p className="mt-2 text-xs text-slate-500">{actions.blockedReason}</p>
                      ) : null}
                      {/* A question is still worth asking about a quote that can no longer be accepted — an
                          accepted version included — so the channel is offered whenever there is a live offer. */}
                      {['submitted', 'accepted'].includes(group.latest.status) ? (
                        <MessageProviderPanel group={group} requestId={request.id} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-4">
                <Link
                  href={`/customer/requests/${request.id}/quotes`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white no-underline uppercase shadow-sm transition-colors hover:bg-primary-dark"
                >
                  Open quotes comparison <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
                <Link href={`/customer/requests/${request.id}/quotes`} className={LINK_ARROW}>
                  {openForDecision > 0 ? 'Decide now' : 'See what happened to each quote'}
                </Link>
              </div>
            </section>
          ) : (
            <section className={`${CARD} p-5`}>
              <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Quotes on this request
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                None yet. Quotes appear here as providers submit them, and{' '}
                <span className="font-semibold text-slate-800">no notification is sent when one arrives</span> —
                the platform has no email, SMS or push delivery, so this page is where you find out.
              </p>
              <Link href={`/customer/requests/${request.id}/quotes`} className={`${LINK_ARROW} mt-3`}>
                Open the comparison <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </section>
          )}

          <MatchesGrid
            matches={request.matches}
            unavailable={request.matchesUnavailable}
            requestId={request.id}
            quotedProviderIds={groups.map(group => group.providerId)}
          />
        </div>

        <aside className="space-y-4">
          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Matching status
            </h2>
            <div className="mt-4">
              <MatchingTimeline request={request} />
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What you can do here
            </h2>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>
                · <span className="font-semibold text-slate-800">Message a provider</span> — under each quote in
                the list above. It records a question against that quote version, which is the only channel to a
                provider this platform has. There is no chat, and nothing notifies you when they answer.
              </li>
              <li>
                · <span className="font-semibold text-slate-800">Edit the request</span> — below, while nobody
                has quoted it yet.
              </li>
              <li>
                · <span className="font-semibold text-slate-800">Compare and accept</span> — on{' '}
                <Link href={`/customer/requests/${request.id}/quotes`} className={LINK_ARROW}>
                  the quotes comparison <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </li>
            </ul>
          </section>

          <EditRequestPanel
            request={request}
            locations={locations}
            editable={editable}
            blockedReason={editBlockedReason}
          />

          <CancelRequestPanel
            request={request}
            cancellable={
              CANCELLABLE_STATES.includes(request.state) &&
              request.state !== 'submitted_for_approval' &&
              !(request.obligation && ['funding', 'funded', 'partially_refunded', 'refunded', 'disputed'].includes(request.obligation.status))
            }
          />

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Where the money is
            </h2>
            {request.obligation ? (
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Amount</dt>
                  <dd className="font-semibold text-slate-800">
                    {formatMoney(request.obligation.amountMinor, request.obligation.currencyCode)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-semibold text-slate-800">{request.obligation.status}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                No payment obligation exists yet. One is created when you accept a quote, and funding it is a
                separate step on the request page.
              </p>
            )}
            {request.obligation ? (
              <Link href={`/requests/${request.id}`} className={`${LINK_ARROW} mt-3`}>
                Funding, evidence and approval <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
