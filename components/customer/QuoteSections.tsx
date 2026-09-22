import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  FileText,
  Lock,
  MessageSquare,
  Minus,
} from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  acceptQuoteAction,
  declineQuoteAction,
  requestQuoteChangeAction,
  withdrawQuoteChangeAction,
} from '@/features/customer/actions';
import {
  DECISION_FAILURE_COPY,
  type ChangeRequest,
  type ProviderQuoteGroup,
  decisionFailureCode,
  formatMoney,
  quoteAttributes,
  quoteActionability,
} from '@/features/customer/quotes';
import type { QuoteRow } from '@/features/customer/requests';

/**
 * The quote surfaces: the comparison, one quote's history, and the actions on either.
 *
 * ⚠️ THE ATTRIBUTES THE BRIEF ASKS TO COMPARE MOSTLY DO NOT EXIST IN THIS PLATFORM, AND THE COMPARISON SAYS
 * SO INSTEAD OF LEAVING GAPS. `quotes` holds a total, a currency, a free-text summary, a validity date and a
 * version. There is no line-item breakdown, no materials included/excluded flag, no timeline attached to a
 * quote, no inspection requirement and no warranty field — the provider's form collects amount, summary and
 * validity date, and nothing else. A comparison table with five empty rows would read as "the provider
 * didn't say", which is a different and false statement, so the absent attributes are named once, together,
 * with the reason. What IS real — price, version, validity, identity verification, readiness, and what the
 * provider wrote — is compared properly.
 */

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Awaiting your decision',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  draft: 'Draft',
};

export function DecisionNotice({
  failed,
  decided,
  signed,
  verify,
}: {
  failed?: string;
  decided?: string;
  signed?: boolean;
  verify?: boolean;
}) {
  const code = decisionFailureCode(failed);
  const decidedCopy: Record<string, string> = {
    declined: 'Quote declined. The provider sees your reason.',
    asked: 'Sent to the provider. It appears on their view of this quote; nothing else changed.',
    withdrawn: 'Your request was withdrawn. The provider sees that you no longer need an answer.',
    cancelled: 'Request cancelled. Everyone who had quoted is told it is closed.',
    edited: 'Request updated. Providers reading it see the new wording; the answers you did not change are untouched.',
  };

  const signedCopy = 'Agreement recorded. The version, the price, the time and how you verified are all stored against it.';

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p role="alert" className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          {DECISION_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && decided && decidedCopy[decided] ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          {decidedCopy[decided]}
        </p>
      ) : null}
      {!code && signed ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          {signedCopy}
        </p>
      ) : null}
      {!code && verify ? (
        <p role="status" className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary-deep">
          A code is on its way to your email address. It expires shortly, and entering it is what proves it is
          you — not the click.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One quote's terms, in the fixed order every comparison surface uses.
 *
 * ⚠️ "NOT STATED" IS RENDERED AS AN ABSENCE, NOT AS A NO. The provider's form asks each of these questions
 * and offers no default, so a blank answer means the provider skipped it. Styling it like a negative answer
 * would put words in their mouth — the exact failure this page used to avoid by refusing to show the rows at
 * all, and which is now avoided by showing the row and saying who did not fill it in.
 */
export function QuoteTermsList({
  quote,
  dense = false,
  omit = [],
}: {
  quote: QuoteRow;
  dense?: boolean;
  /** Attribute keys already rendered by the surrounding layout, so they are not said twice. */
  omit?: readonly string[];
}) {
  const attributes = quoteAttributes(quote).filter(attribute => !omit.includes(attribute.key));

  return (
    <dl className={dense ? 'divide-y divide-slate-100' : 'space-y-3'}>
      {attributes.map(attribute => (
        <div
          key={attribute.key}
          className={dense ? 'py-1.5' : 'border-t border-solid border-slate-100 pt-3 first:border-0 first:pt-0'}
        >
          <dt className={`font-mono text-[11px] font-bold tracking-wider uppercase ${dense ? 'text-slate-500' : 'text-slate-500'}`}>
            {attribute.label}
          </dt>
          <dd className={`mt-0.5 text-sm ${attribute.stated ? 'text-slate-800' : 'text-slate-400'}`}>
            {attribute.value}
            {attribute.detail ? (
              <span className="mt-1 block text-xs leading-relaxed whitespace-pre-line text-slate-500">
                {attribute.detail}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AskPanel({ group, requestId }: { group: ProviderQuoteGroup; requestId: string }) {
  const open = group.latest.openChangeRequests;
  return (
    <details className="mt-3">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
        <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
        Ask for a revision or a clarification
        {open > 0 ? <span className={BADGE_AMBER}>{open} open</span> : null}
      </summary>
      <form action={requestQuoteChangeAction} className="mt-3 space-y-3">
        <input type="hidden" name="quote_id" value={group.latest.quoteId} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="kind" value="revision" />
        <div>
          <label className={LABEL} htmlFor={`message-${group.latest.quoteId}`}>
            What would you like changed?
          </label>
          <textarea
            id={`message-${group.latest.quoteId}`}
            name="message"
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            className={FIELD}
            placeholder="e.g. Please break out the materials, and confirm whether the call-out fee is included."
          />
        </div>
        <p className="text-xs text-slate-500">
          This records the ask against version {group.latest.versionLabel} and the provider sees it on their
          copy. It does not change the price, and the quote stays valid while they answer.
        </p>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Send to the provider
        </button>
      </form>
    </details>
  );
}

/**
 * "Message Provider", as this platform can honestly offer it.
 *
 * ⚠️ THIS IS NOT A CHAT AND DOES NOT PRETEND TO BE ONE. There is no messaging table, no thread and no delivery:
 * what exists is `quote_change_requests`, a written ask attached to a specific quote version that the provider
 * reads on their own copy of it. A button labelled "Message" with nothing said about what happens to the words
 * would promise a conversation the platform cannot deliver, so the panel says where the provider sees them.
 *
 * ⚠️ IT WORKS ON AN ACCEPTED QUOTE TOO. A customer with a question about the version they are about to sign —
 * or have signed — needs to be able to ask it, and `request_quote_change_command` allows a clarification
 * against a locked version precisely because a question cannot change a price.
 */
export function MessageProviderPanel({
  group,
  requestId,
}: {
  group: ProviderQuoteGroup;
  requestId: string;
}) {
  const quote = group.latest;
  return (
    <details className="mt-2">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
        <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
        Message {group.providerName}
        {quote.openChangeRequests > 0 ? <span className={BADGE_AMBER}>{quote.openChangeRequests} open</span> : null}
      </summary>
      <form action={requestQuoteChangeAction} className="mt-3 space-y-3">
        <input type="hidden" name="quote_id" value={quote.quoteId} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="kind" value="clarification" />
        <div>
          <label className={LABEL} htmlFor={`clarify-${quote.quoteId}`}>
            Your question for this provider
          </label>
          <textarea
            id={`clarify-${quote.quoteId}`}
            name="message"
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            className={FIELD}
            placeholder="e.g. Can you do the work on a Saturday, and is the call-out fee inside the total?"
          />
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          There is no chat on this platform, so this is the one channel: the question is recorded against quote
          version {quote.versionLabel} and the provider reads it on their copy of that quote. It cannot change the
          price, and nothing notifies you when they answer.
        </p>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Send to the provider
        </button>
      </form>
    </details>
  );
}

function DeclinePanel({ group, requestId }: { group: ProviderQuoteGroup; requestId: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-500">Decline this quote</summary>
      <form action={declineQuoteAction} className="mt-3 space-y-3">
        <input type="hidden" name="quote_id" value={group.latest.quoteId} />
        <input type="hidden" name="request_id" value={requestId} />
        <div>
          <label className={LABEL} htmlFor={`decline-${group.latest.quoteId}`}>
            Why are you declining?
          </label>
          <textarea
            id={`decline-${group.latest.quoteId}`}
            name="reason"
            rows={2}
            required
            minLength={10}
            maxLength={2000}
            className={FIELD}
            placeholder="e.g. Higher than the other quotes for the same scope."
          />
        </div>
        <p className="text-xs text-slate-500">
          The reason goes to the provider. Declining one quote leaves the others alone.
        </p>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Decline
        </button>
      </form>
    </details>
  );
}

/**
 * The decision controls for one quote.
 *
 * ⚠️ EXTRACTED SO THE TABLE AND THE CARD CANNOT OFFER DIFFERENT ACTIONS. The page renders a side-by-side table
 * on wide screens and columns of cards below that; both call this, so "can I accept this one?" has one answer
 * and one set of forms rather than two that drift.
 */
function QuoteDecisionActions({
  group,
  requestId,
  requestState,
  hasActiveAssignment,
}: {
  group: ProviderQuoteGroup;
  requestId: string;
  requestState: string;
  hasActiveAssignment: boolean;
}) {
  const quote = group.latest;
  const actions = quoteActionability(quote, { requestState, hasActiveAssignment });

  return (
    <div className="space-y-2">
      <Link
        href={`/customer/requests/${requestId}/quotes/${quote.quoteId}`}
        className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5" />
        View full quote {quote.versionLabel}
      </Link>

      {actions.blockedReason ? (
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          {actions.blockedReason}
        </p>
      ) : null}

      {actions.canAccept ? (
        <form action={acceptQuoteAction}>
          <input type="hidden" name="quote_id" value={quote.quoteId} />
          <input type="hidden" name="request_id" value={requestId} />
          <button
            type="submit"
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
          >
            Accept {formatMoney(quote.totalMinor, quote.currencyCode)} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Accepting locks version {quote.versionLabel}, creates the payment obligation, and declines every
            other quote on this request. You read and sign the agreement next.
          </p>
        </form>
      ) : null}

      {actions.canQuestion ? <AskPanel group={group} requestId={requestId} /> : null}
      {actions.canDecline ? <DeclinePanel group={group} requestId={requestId} /> : null}
    </div>
  );
}

function ProviderHeading({ group }: { group: ProviderQuoteGroup }) {
  const quote = group.latest;
  return (
    <>
      <p className="truncate text-sm font-bold text-slate-900">{group.providerName}</p>
      {group.providerHeadline ? <p className="mt-0.5 text-xs text-slate-500">{group.providerHeadline}</p> : null}
      <p className="mt-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        version {quote.versionLabel}
        {group.history.length > 0
          ? ` · ${group.history.length} earlier version${group.history.length === 1 ? '' : 's'}`
          : ''}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {group.identityVerified ? (
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" /> identity verified
          </span>
        ) : (
          <span className="text-slate-500">identity not verified</span>
        )}
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="font-mono text-slate-600">
          readiness {group.readinessScore ?? '—'} / trust {group.trustScore ?? '—'}
        </span>
      </p>
    </>
  );
}

/**
 * The comparison table, on wide screens.
 *
 * ⚠️ THE ATTRIBUTE COLUMN IS STICKY. At three or more providers the table is wider than a laptop, and a
 * comparison whose row labels scroll out of view is a grid of unlabelled cells. The first column stays put so
 * a reader always knows which attribute they are looking at.
 */
export function ComparisonMatrix({
  groups,
  requestId,
  requestState,
  hasActiveAssignment,
}: {
  groups: ProviderQuoteGroup[];
  requestId: string;
  requestState: string;
  hasActiveAssignment: boolean;
}) {
  const rows = quoteAttributes(groups[0].latest).map(attribute => ({
    key: attribute.key,
    label: attribute.label,
  }));
  const byProvider = new Map(
    groups.map(group => [
      group.providerId,
      new Map(quoteAttributes(group.latest).map(attribute => [attribute.key, attribute])),
    ]),
  );

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left align-top">
          <caption className="sr-only">
            Each provider&apos;s current quote version, compared attribute by attribute.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-40 min-w-40 border-b border-solid border-slate-200 bg-white px-4 py-4 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
              >
                Compared
              </th>
              {groups.map(group => (
                <th
                  key={group.providerId}
                  scope="col"
                  className="min-w-64 border-b border-l border-solid border-slate-200 bg-white px-4 py-4 align-top"
                >
                  <ProviderHeading group={group} />
                  <p className="mt-3 text-xl font-bold tracking-tight text-primary">
                    {formatMoney(group.latest.totalMinor, group.latest.currencyCode)}
                  </p>
                  <span className={`mt-2 ${group.latest.status === 'submitted' ? BADGE_AMBER : BADGE_SLATE}`}>
                    {STATUS_LABEL[group.latest.status] ?? group.latest.status}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="align-top">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-solid border-slate-100 bg-white px-4 py-3 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
                >
                  {row.label}
                </th>
                {groups.map(group => {
                  const attribute = byProvider.get(group.providerId)?.get(row.key);
                  return (
                    <td
                      key={group.providerId}
                      className={`border-b border-l border-solid border-slate-100 px-4 py-3 text-sm ${
                        attribute?.stated ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {attribute?.value ?? '—'}
                      {attribute?.detail ? (
                        <span className="mt-1 block text-xs leading-relaxed whitespace-pre-line text-slate-500">
                          {attribute.detail}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="align-top">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-4 py-4 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
              >
                Decide
              </th>
              {groups.map(group => (
                <td key={group.providerId} className="border-l border-solid border-slate-100 px-4 py-4">
                  <QuoteDecisionActions
                    group={group}
                    requestId={requestId}
                    requestState={requestState}
                    hasActiveAssignment={hasActiveAssignment}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One card per provider, for narrow screens where the table would be a horizontal scroll.
 *
 * The attributes come from the same `quoteAttributes` call the table uses, so the two views cannot disagree
 * about the same quote — only about how much of it fits on the screen.
 */
export function ComparisonCard({
  group,
  requestId,
  requestState,
  hasActiveAssignment,
}: {
  group: ProviderQuoteGroup;
  requestId: string;
  requestState: string;
  hasActiveAssignment: boolean;
}) {
  const quote = group.latest;

  return (
    <article className={`${CARD} flex flex-col p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <ProviderHeading group={group} />
        </div>
        <span className={quote.status === 'submitted' ? BADGE_AMBER : BADGE_SLATE}>
          {STATUS_LABEL[quote.status] ?? quote.status}
        </span>
      </header>

      <p className="mt-4 text-2xl font-bold tracking-tight text-primary">
        {formatMoney(quote.totalMinor, quote.currencyCode)}
      </p>

      <div className="mt-4 flex-1">
        <QuoteTermsList quote={quote} dense omit={['total']} />
      </div>

      <footer className="mt-4 border-t border-solid border-slate-200 pt-4">
        <QuoteDecisionActions
          group={group}
          requestId={requestId}
          requestState={requestState}
          hasActiveAssignment={hasActiveAssignment}
        />
      </footer>
    </article>
  );
}

export function ComparisonEmpty({ requestId, hasQuotes }: { requestId: string; hasQuotes: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-solid border-slate-300 bg-white px-6 py-12 text-center">
      <CalendarClock aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
      <h2 className="mt-3 text-base font-bold text-slate-900">
        {hasQuotes ? 'No quote is open for a decision' : 'No quotes yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
        {hasQuotes
          ? 'Every quote on this request has been decided or has expired. The request page lists them with their versions.'
          : 'Providers matched to this request can quote it. Quotes appear here as they arrive, and this platform sends no notification when one does — come back to this page.'}
      </p>
      <Link href={`/customer/requests/${requestId}`} className={`${LINK_ARROW} mt-4`}>
        Back to the request <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/**
 * The version history of one provider's offer.
 *
 * Each row is a version that exists as a row in `quotes` — nothing here is reconstructed from a diff, because
 * nothing stores a diff. An earlier version that was replaced says which version replaced it.
 */
export function VersionHistory({
  versions,
  currentQuoteId,
  requestId,
}: {
  versions: QuoteRow[];
  currentQuoteId: string;
  requestId: string;
}) {
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Version change history
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Every version this provider submitted for this request, newest first. A version is a row, not a diff:
        the numbers below are what was submitted at that time.
      </p>

      <ol className="mt-4 space-y-3">
        {versions.map(version => {
          const current = version.quoteId === currentQuoteId;
          const replaced = version.supersededBy;
          return (
            <li
              key={version.quoteId}
              className={`rounded-xl border border-solid px-4 py-3 ${
                current ? 'border-primary-subtle bg-primary-surface' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold tracking-wider text-primary uppercase">
                  {version.versionLabel}
                  {current ? ' · current' : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    {formatMoney(version.totalMinor, version.currencyCode)}
                  </span>
                  {version.lockedAt ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
                      <Lock aria-hidden="true" className="h-3 w-3" /> locked
                    </span>
                  ) : null}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                submitted {new Date(version.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {replaced ? ` · replaced by ${replaced}` : ''}
                {version.status !== 'submitted' && version.status !== 'accepted' ? ` · ${version.status}` : ''}
              </p>
              {version.summary?.trim() ? (
                <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{version.summary}</p>
              ) : null}
              {!current ? (
                <Link href={`/customer/requests/${requestId}/quotes/${version.quoteId}`} className={`${LINK_ARROW} mt-2`}>
                  Open this version <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ChangeRequestList({
  changes,
  requestId,
  quoteId,
}: {
  changes: ChangeRequest[];
  requestId: string;
  quoteId: string;
}) {
  if (changes.length === 0) {
    return (
      <section className={`${CARD} p-5`}>
        <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          What you have asked this provider
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          Nothing yet. A revision request or a clarification appears here, and on the provider&apos;s copy of
          this quote.
        </p>
      </section>
    );
  }

  const KIND_LABEL: Record<ChangeRequest['kind'], string> = {
    revision: 'Revision requested',
    clarification: 'Clarification asked',
    decline: 'Declined',
  };

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        What you have asked this provider
      </h2>
      <ol className="mt-3 space-y-3">
        {changes.map(change => (
          <li key={change.id} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">{KIND_LABEL[change.kind]}</span>
              <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {change.status === 'open' ? 'awaiting the provider' : 'withdrawn'}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{change.message}</p>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {new Date(change.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
            {change.status === 'open' && change.kind !== 'decline' ? (
              <form action={withdrawQuoteChangeAction} className="mt-2">
                <input type="hidden" name="change_id" value={change.id} />
                <input type="hidden" name="quote_id" value={quoteId} />
                <input type="hidden" name="request_id" value={requestId} />
                <button type="submit" className="text-xs font-semibold text-slate-500 underline hover:text-primary">
                  Withdraw this ask
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <Minus aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Nothing on the platform resolves these for you, and no notification is sent — the provider reads them on
        their own view of the quote.
      </p>
    </section>
  );
}

/** The banner on an accepted quote detail page: locked, and what that means. */
export function LockedBanner({ quote }: { quote: QuoteRow }) {
  return (
    <div className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3">
      <p className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
        <Lock aria-hidden="true" className="h-4 w-4" />
        Version {quote.versionLabel} is locked
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-primary-deep">
        This is the version you accepted{quote.lockedAt ? ` on ${new Date(quote.lockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}, and the
        database now refuses to modify it — the assignment and the payment obligation both point at this exact
        row. A later change of price or scope needs a new version, not an edit.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-primary-deep">
        Anything said in a chat, on a call or in person does not replace this document. If a provider promises
        something different here, it is not part of the agreement until it appears in a quote version or in the
        signed agreement.
      </p>
    </div>
  );
}
