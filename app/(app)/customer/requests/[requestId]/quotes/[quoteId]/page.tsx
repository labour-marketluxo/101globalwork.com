import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BadgeCheck, Download, FileText, FileWarning, Lock } from '@/components/ui/icons';
import { ExpirationTimer } from '@/components/customer/ExpirationTimer';
import QuoteMessages from '@/components/quotes/QuoteMessages';
import {
  ChangeRequestList,
  DecisionNotice,
  LockedBanner,
  QuoteTermsList,
  VersionHistory,
} from '@/components/customer/QuoteSections';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import { acceptQuoteAction, declineQuoteAction, requestQuoteChangeAction } from '@/features/customer/actions';
import { expiryState } from '@/features/customer/expiry';
import { formatMoney, groupQuotes, lineItemSubtotal, quoteActionability } from '@/features/customer/quotes';
import { getChangeRequests } from '@/features/customer/quotes';
import { getCustomerRequestDetail } from '@/features/customer/requests';
import { getProviderMessages } from '@/features/quotes/messages';

export const metadata = {
  title: 'Quote',
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Awaiting your decision',
  accepted: 'Accepted and locked',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

/**
 * One quote, one version — the authoritative document.
 *
 * ⚠️ VERSIONS, NOT EDITS. Each version is a separate row that was submitted at a time, so the history below is
 * a list of what was actually offered rather than a diff reconstructed afterwards. The current version is the
 * only one that can be acted on: the database refuses to accept a superseded one, and the page does not offer
 * it.
 *
 * ⚠️ THE LOCK IS REAL, NOT DECORATIVE. Once accepted, `locked_at` is set and a trigger refuses any further
 * UPDATE of that row — so the "locked" banner is describing an enforced state. The banner also states the
 * thing a customer most needs to hear: a promise made in conversation is not part of this document.
 *
 * ⚠️ EVERY FIGURE ON THIS PAGE COMES FROM THE ROW. The breakdown is what the provider submitted, the taxes are
 * the column the database checks against the total, and the terms are the fields they typed. Nothing here is
 * re-derived from the prose below it, so the itemisation cannot disagree with the price.
 */
export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string; quoteId: string }>;
  searchParams: Promise<{ failed?: string; decided?: string }>;
}) {
  const { requestId, quoteId } = await params;
  const query = await searchParams;

  const request = await getCustomerRequestDetail(requestId);
  if (!request) notFound();

  const quote = request.quotes.find(row => row.quoteId === quoteId);
  if (!quote) notFound();

  const groups = groupQuotes(request.quotes);
  const group = groups.find(candidate => candidate.providerId === quote.providerId);
  if (!group) notFound();

  const changes = (await getChangeRequests(requestId)).filter(change => change.quoteId === quoteId);
  /** Both halves of the conversation: the provider's messages here, the customer's own questions below. */
  const providerMessages = await getProviderMessages(requestId, quoteId);
  const actions = quoteActionability(quote, {
    requestState: request.state,
    hasActiveAssignment: Boolean(request.assignment),
  });

  const money = (amount: number) => formatMoney(amount, quote.currencyCode);
  const subtotal = lineItemSubtotal(quote.lineItems);
  const expiry = expiryState(quote.validUntil);

  return (
    <section className={PAGE_SHELL}>
      <DecisionNotice failed={query.failed} decided={query.decided} />

      <nav aria-label="Quote" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/customer/requests/${requestId}/quotes`} className={LINK_ARROW}>
          ← All quotes on this request
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className={`${CARD} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Quote version {quote.versionLabel}
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{group.providerName}</h1>
                {group.providerHeadline ? (
                  <p className="mt-1 text-sm text-slate-600">{group.providerHeadline}</p>
                ) : null}
              </div>
              <span className={quote.status === 'submitted' ? BADGE_AMBER : BADGE_SLATE}>
                {STATUS_LABEL[quote.status] ?? quote.status}
              </span>
            </div>

            <p className="mt-5 text-3xl font-bold tracking-tight text-primary">{money(quote.totalMinor)}</p>
            <p className="text-xs text-slate-500">
              The whole of this offer. The platform adds no fee schedule of its own —{' '}
              <Link href="/pricing" className={LINK_ARROW}>
                the pricing page states the same
              </Link>
              .
            </p>

            <dl className="mt-5 grid gap-4 border-t border-solid border-slate-200 pt-5 sm:grid-cols-2">
              <div>
                <dt className={LABEL}>Validity</dt>
                <dd className="text-sm text-slate-800">
                  {expiry ? (
                    <>
                      <ExpirationTimer validUntil={quote.validUntil} initialLabel={expiry.label} />
                      <span className="mt-0.5 block text-xs text-slate-500">{expiry.detail}</span>
                      {expiry.imminent ? (
                        <span className="mt-1 block text-xs font-semibold text-amber-800">
                          {expiry.expired
                            ? 'The database refuses an acceptance after this instant.'
                            : 'Under two days left. The provider would have to re-quote after that.'}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      No expiry set
                      <span className="mt-0.5 block text-xs text-slate-500">
                        This offer does not lapse on its own.
                      </span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Submitted</dt>
                <dd className="text-sm text-slate-800">
                  {new Date(quote.submittedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Provider credentials</dt>
                <dd className="text-sm text-slate-800">
                  <span className="inline-flex items-center gap-1.5">
                    {group.identityVerified ? (
                      <>
                        <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                        identity verified by the platform
                      </>
                    ) : (
                      <span className="text-slate-500">identity not verified</span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs text-slate-500">
                    readiness {group.readinessScore ?? '—'} · trust {group.trustScore ?? '—'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Lock</dt>
                <dd className="text-sm text-slate-800">
                  {quote.lockedAt ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      <Lock aria-hidden="true" className="h-4 w-4" />
                      accepted and locked
                    </span>
                  ) : (
                    'This version can still be replaced by the provider.'
                  )}
                </dd>
              </div>
            </dl>

            {quote.lockedAt ? (
              <div className="mt-5">
                <LockedBanner quote={quote} />
              </div>
            ) : null}
          </section>

          {/* ── The money ──────────────────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="breakdown-heading" className={`${CARD} p-5`}>
            <h2 id="breakdown-heading" className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Cost breakdown
            </h2>

            {quote.lineItems.length > 0 ? (
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <caption className="sr-only">Each item the provider is charging for, and its amount.</caption>
                <tbody>
                  {quote.lineItems.map((item, index) => (
                    <tr key={`${item.label}-${index}`} className="border-b border-solid border-slate-100">
                      <th scope="row" className="py-2 pr-3 font-normal text-slate-700">
                        {item.label}
                      </th>
                      <td className="py-2 text-right font-medium text-slate-900">{money(item.amountMinor)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-solid border-slate-100">
                    <th scope="row" className="py-2 pr-3 text-slate-500">
                      Subtotal for the work
                    </th>
                    <td className="py-2 text-right text-slate-700">{money(subtotal)}</td>
                  </tr>
                  <tr className="border-b border-solid border-slate-100">
                    <th scope="row" className="py-2 pr-3 text-slate-500">
                      Taxes and fees included
                    </th>
                    <td className="py-2 text-right text-slate-700">{money(quote.taxesAndFeesMinor)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-3 pr-3 font-bold text-slate-900">
                      Total
                    </th>
                    <td className="py-3 text-right text-lg font-bold text-primary">{money(quote.totalMinor)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                The provider priced this in a single number of{' '}
                <span className="font-semibold text-slate-800">{money(quote.totalMinor)}</span> and itemised
                nothing. That is their choice on the quote form, and it is recorded here as what it is.
              </p>
            )}

            {quote.taxesAndFeesMinor > 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                The taxes and fees above are already inside the total — they are separated out so you can see
                what is work and what is not, not added again at the end. The platform checks that the items and
                the taxes add up to the total before accepting the quote.
              </p>
            ) : null}

            {quote.optionalAddons.length > 0 ? (
              <div className="mt-5 border-t border-solid border-slate-200 pt-4">
                <h3 className={LABEL}>Optional add-ons</h3>
                <ul className="space-y-1.5">
                  {quote.optionalAddons.map((addon, index) => (
                    <li key={`${addon.label}-${index}`} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-700">{addon.label}</span>
                      <span className="font-medium text-slate-900">{money(addon.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  These are <span className="font-semibold">not</span> part of the total above. Nothing is
                  charged for one unless you ask the provider for it, and that ask is a change to the scope
                  rather than a checkbox on this page.
                </p>
              </div>
            ) : null}
          </section>

          {/* ── The terms ──────────────────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="terms-heading" className={`${CARD} p-5`}>
            <h2 id="terms-heading" className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Terms this version carries
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              What the provider answered on the quote form. &ldquo;Not stated&rdquo; means they left it blank.
            </p>
            <div className="mt-4">
              <QuoteTermsList quote={quote} omit={['total', 'lineItems', 'taxes', 'validity', 'addons']} />
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What the provider wrote about this price
            </h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
              {quote.summary?.trim() || 'Nothing beyond the total was written for this version.'}
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <FileWarning aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                This is free prose, and it is where a provider explains their assumptions. The structured lines
                above and this paragraph are both part of the version — a claim that appears only in a chat is in
                neither.
              </span>
            </p>
          </section>

          <VersionHistory versions={group.versions} currentQuoteId={quote.quoteId} requestId={requestId} />

          {/* The provider's own messages. The customer's questions are the list below — two directions of one
              conversation, rendered beside each other so neither side is talking into a void. */}
          <QuoteMessages
            messages={providerMessages}
            providerName={group.providerName}
            emptyNote="The provider has not sent a message about this request yet. Their questions and yours appear here if they do."
          />

          <ChangeRequestList changes={changes} requestId={requestId} quoteId={quoteId} />
        </div>

        <aside className="space-y-4">
          <section className={`${CARD} p-5`}>
            <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Decide on this quote
            </h2>

            {actions.blockedReason ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{actions.blockedReason}</p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Version {quote.versionLabel} is the current offer from this provider.
              </p>
            )}

            {actions.canAccept ? (
              <form action={acceptQuoteAction} className="mt-4">
                <input type="hidden" name="quote_id" value={quote.quoteId} />
                <input type="hidden" name="request_id" value={requestId} />
                <button
                  type="submit"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-sans text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
                >
                  Accept Quote &amp; Proceed <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  This locks version {quote.versionLabel}, declines the other quotes on the request, creates the
                  payment obligation of {money(quote.totalMinor)}, and takes you to the agreement to sign.
                </p>
              </form>
            ) : null}

            {actions.canQuestion ? (
              <form action={requestQuoteChangeAction} className="mt-4 space-y-3 border-t border-solid border-slate-200 pt-4">
                <input type="hidden" name="quote_id" value={quote.quoteId} />
                <input type="hidden" name="request_id" value={requestId} />
                <input type="hidden" name="kind" value="revision" />
                <div>
                  <label className={LABEL} htmlFor="change-message">
                    Request a change
                  </label>
                  <textarea
                    id="change-message"
                    name="message"
                    rows={3}
                    required
                    minLength={10}
                    maxLength={2000}
                    className={FIELD}
                    placeholder="e.g. Please confirm whether the call-out fee is included, and break out the materials."
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
                >
                  Ask the provider
                </button>
                <p className="text-xs text-slate-500">
                  Recorded against version {quote.versionLabel}. It does not change the price, and the provider
                  answers by submitting a new version.
                </p>
              </form>
            ) : null}

            {actions.canDecline ? (
              <form action={declineQuoteAction} className="mt-4 space-y-3 border-t border-solid border-slate-200 pt-4">
                <input type="hidden" name="quote_id" value={quote.quoteId} />
                <input type="hidden" name="request_id" value={requestId} />
                <div>
                  <label className={LABEL} htmlFor="decline-reason">
                    Decline this quote
                  </label>
                  <textarea
                    id="decline-reason"
                    name="reason"
                    rows={2}
                    required
                    minLength={10}
                    maxLength={2000}
                    className={FIELD}
                    placeholder="e.g. Higher than the other quotes for the same scope."
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
                >
                  Decline
                </button>
              </form>
            ) : null}
          </section>

          <section className={`${CARD} p-5`}>
            <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <FileText aria-hidden="true" className="h-4 w-4 text-slate-400" />
              Keep a copy
            </h2>
            <a
              href={`/customer/requests/${requestId}/quotes/${quoteId}/download`}
              className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Download PDF — {quote.versionLabel}
            </a>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              A copy of this version, generated from the same row this page reads. The record on the platform is
              the authority; the file is for your own keeping.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
