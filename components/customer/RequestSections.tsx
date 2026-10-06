import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleSlash,
  FileText,
  Info,
  Pencil,
  Save,
  Search,
  Sparkles,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { cancelRequestAction, updateRequestAction } from '@/features/customer/actions';
import { formatMoney } from '@/features/customer/quotes';
import {
  REQUEST_TABS,
  type MatchedProvider,
  type RequestDetail,
  type RequestListItem,
  type RequestTab,
  requestTabLabel,
} from '@/features/customer/requests';

/**
 * The request list, its controls, and the request detail's panels.
 *
 * Server components throughout: the list's search, filter and sort are a GET form and a set of links, so
 * nothing here needs JavaScript. That also means the state lives in the URL — a filtered list can be
 * bookmarked, shared and reloaded, and the back button works, none of which is true of a client-side filter.
 */

const TONE_BADGE: Record<string, string> = {
  amber: BADGE_AMBER,
  slate: BADGE_SLATE,
  teal: 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase',
};

export function StatusPill({ pill }: { pill: { label: string; tone: string } }) {
  return <span className={TONE_BADGE[pill.tone] ?? BADGE_SLATE}>{pill.label}</span>;
}

/**
 * Tabs as links. `aria-current="page"` is what tells a screen reader which tab is showing; the underline
 * alone does not.
 */
export function RequestTabs({
  active,
  counts,
  query,
  sort,
}: {
  active: RequestTab;
  counts: Record<RequestTab, number>;
  query?: string;
  sort?: string;
}) {
  const href = (tab: RequestTab) => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (query) params.set('q', query);
    if (sort) params.set('sort', sort);
    return `/customer/requests?${params.toString()}`;
  };

  return (
    <nav aria-label="Request status" className="flex flex-wrap gap-1 border-b border-solid border-slate-200 pb-3">
      {REQUEST_TABS.map(tab => {
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={href(tab)}
            aria-current={current ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold no-underline transition-colors ${
              current ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {requestTabLabel(tab)}
            <span
              className={`font-mono text-[11px] font-bold ${current ? 'text-amber-200' : 'text-slate-400'}`}
            >
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Search and sort. A GET form: no client component, no debounce, and the URL is the state. */
export function RequestListControls({
  tab,
  query,
  sort,
}: {
  tab: RequestTab;
  query: string;
  sort: string;
}) {
  return (
    <form method="get" action="/customer/requests" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value={tab} />

      <div className="min-w-[14rem] flex-1">
        <label className={LABEL} htmlFor="q">
          Search
        </label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Words from the description, a reference, or an area"
            className={`${FIELD} pl-9`}
          />
        </div>
      </div>

      <div className="w-52">
        <label className={LABEL} htmlFor="sort">
          Sort
        </label>
        <select id="sort" name="sort" defaultValue={sort} className={FIELD}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="action">Needs my action first</option>
          <option value="quotes">Most quotes</option>
        </select>
      </div>

      <button
        type="submit"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
      >
        Apply
      </button>
    </form>
  );
}

export function RequestListCard({ item }: { item: RequestListItem }) {
  return (
    <li className={`${CARD} p-4 transition-shadow hover:shadow-md`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/customer/requests/${item.id}`}
            className="text-sm font-bold text-slate-900 no-underline hover:text-primary"
          >
            {item.needText.trim() || 'Untitled draft'}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{item.serviceName ?? 'No service chosen'}</span>
            <span aria-hidden="true">·</span>
            <span>{item.locationName ?? 'No area chosen'}</span>
            <span aria-hidden="true">·</span>
            <span>
              created{' '}
              {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.quoteCount > 0 ? (
            <span className={BADGE_AMBER}>
              {item.quoteCount} quote{item.quoteCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <StatusPill pill={item.pill} />
        </div>
      </div>

      {item.cancellationReason ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Cancelled: {item.cancellationReason}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-solid border-slate-200 pt-3">
        <p className="text-xs text-slate-600">
          {item.nextAction ? (
            <>
              <span className="font-semibold text-slate-800">{item.nextAction.label}:</span> {item.nextAction.detail}
            </>
          ) : (
            <span className="text-slate-500">Nothing waiting on you.</span>
          )}
        </p>
        <Link href={`/customer/requests/${item.id}`} className={LINK_ARROW}>
          Open <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

export function RequestListEmpty({ tab, query }: { tab: RequestTab; query: string }) {
  const filtered = Boolean(query) || tab !== 'all';
  return (
    <div className="rounded-2xl border border-dashed border-solid border-slate-300 bg-white px-6 py-12 text-center">
      <FileText aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
      <h2 className="mt-3 text-base font-bold text-slate-900">
        {filtered ? 'Nothing matches that' : 'No requests yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        {filtered
          ? 'Try a different tab, or clear the search. Requests are matched by the words in the tabs at the top.'
          : 'A request is how work starts: describe it, answer a few questions, and providers who do that trade in your area can quote for it.'}
      </p>
      <Link
        href="/customer/requests/new"
        className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-mono text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
      >
        Post a Request <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function RequestListSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true" aria-live="polite">
      {[0, 1, 2].map(index => (
        <li key={index} className={`${CARD} animate-pulse p-4`}>
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
          <div className="mt-4 h-3 w-1/2 rounded bg-slate-100" />
        </li>
      ))}
      <li className="sr-only">Loading your requests…</li>
    </ul>
  );
}

/**
 * The matching status timeline.
 *
 * ⚠️ IT SHOWS REACHED AND NOT-REACHED ONLY — never a fake ETA or a spinner pretending to be progress. Every
 * date comes from a timestamp this request actually has, and the last two steps say who they are waiting on
 * rather than how long it should take (the platform promises no response time anywhere).
 */
export function MatchingTimeline({ request }: { request: RequestDetail }) {
  const submittedQuoteCount = request.quotes.filter(quote => quote.status !== 'draft').length;
  const chosen = request.quotes.find(quote => quote.status === 'accepted') ?? null;

  const steps = [
    {
      title: 'Submitted',
      done: true,
      detail: request.createdAt
        ? `Created ${new Date(request.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : null,
    },
    {
      title: 'Matching',
      done: ['matching', 'quoted', 'accepted', 'scheduled', 'in_progress', 'submitted_for_approval', 'completed', 'disputed'].includes(request.state),
      detail:
        request.state === 'submitted'
          ? 'Waiting for the first provider to be shown this request.'
          : 'Providers whose trade and area match are being shown it.',
    },
    {
      title: 'Quotes received',
      done: submittedQuoteCount > 0,
      detail:
        submittedQuoteCount > 0
          ? `${submittedQuoteCount} quote version${submittedQuoteCount === 1 ? '' : 's'} on file.`
          : 'No provider has quoted yet.',
    },
    {
      title: 'Provider chosen',
      done: Boolean(chosen),
      detail: chosen ? `Accepted ${chosen.versionLabel} at ${formatMoney(chosen.totalMinor, chosen.currencyCode)}.` : 'Awaiting your decision.',
    },
  ];

  return (
    <ol className="space-y-3">
      {steps.map(step => (
        <li key={step.title} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-solid text-[10px] font-bold ${
              step.done ? 'border-transparent bg-primary text-white' : 'border-slate-300 bg-white text-slate-400'
            }`}
          >
            {step.done ? '✓' : '·'}
          </span>
          <span>
            <span className={`block text-sm font-semibold ${step.done ? 'text-slate-900' : 'text-slate-500'}`}>
              {step.title}
              <span className="sr-only">{step.done ? ' — done' : ' — not yet'}</span>
            </span>
            {step.detail ? <span className="mt-0.5 block text-xs text-slate-500">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The eligible/interest grid.
 *
 * ⚠️ THE BRIEF ASKS TO DISTINGUISH PAID PLACEMENTS FROM ORGANIC MATCHES, AND THERE ARE NO PAID PLACEMENTS.
 * This platform sells no ranking: there is no sponsored, promoted or priority column on any table, no
 * ordering other than the matching function's own (readiness, then trust, then id), and nothing that could
 * be paid for. The panel says that rather than inventing a "Sponsored" badge nothing behind it — which is
 * also the only way a customer can trust the "organic" label on the rest.
 */
export function MatchesGrid({
  matches,
  unavailable,
  requestId,
  quotedProviderIds,
}: {
  matches: MatchedProvider[];
  unavailable: boolean;
  requestId: string;
  quotedProviderIds: string[];
}) {
  const quoted = new Set(quotedProviderIds);

  return (
    <section aria-labelledby="matches-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="matches-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Providers matched to this request
        </h2>
        <span className={BADGE_SLATE}>
          {unavailable ? 'unavailable' : `${matches.length} eligible`}
        </span>
      </div>

      <p className="mt-2 flex items-start gap-2 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-xs leading-relaxed text-primary-deep">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Every provider here is an organic match, and there are no paid
          placements on this platform.</span>{' '}
          Nothing can be bought into this list: eligibility is trade, area, an active account, a verified
          identity and a readiness score, and the order is that same score, then the provider&apos;s trust
          score, then their id. No provider pays to appear, and none is ranked above another for money.
        </span>
      </p>

      {unavailable ? (
        <p className="mt-4 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm text-amber-900">
          The matching check itself could not run, so this list is unknown rather than empty. The providers who
          have already quoted are unaffected and appear in the quotes section.
        </p>
      ) : matches.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-solid border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
          Nobody is eligible for this request yet. A provider becomes eligible by covering both the trade and
          the area with an active, verified account — so an empty list means no provider currently covers this
          combination, not that something failed.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {matches.map(match => (
            <li key={match.providerId} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {match.slug ?? match.headline ?? 'Provider'}
                  </p>
                  {match.headline ? (
                    <p className="mt-0.5 text-xs text-slate-600">{match.headline}</p>
                  ) : null}
                </div>
                {quoted.has(match.providerId) ? <span className={BADGE_AMBER}>quoted</span> : null}
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <dt>Identity</dt>
                  <dd className={match.identityVerified ? 'font-semibold text-primary' : 'font-semibold text-slate-500'}>
                    {match.identityVerified ? 'verified' : 'not verified'}
                  </dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt>Readiness</dt>
                  <dd className="font-mono font-semibold text-slate-700">{match.readinessScore ?? '—'}</dd>
                </div>
                <div className="flex items-center gap-1">
                  <dt>Trust</dt>
                  <dd className="font-mono font-semibold text-slate-700">{match.trustScore ?? '—'}</dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center gap-3">
                {match.slug ? (
                  <Link href={`/providers/${match.slug}`} className={LINK_ARROW}>
                    Public profile <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500">
                    No public profile published yet, so there is no page to show.
                  </span>
                )}
                {match.identityVerified ? (
                  <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Matched providers cannot be messaged from here — this platform has no chat or messaging system, so a
        question goes on the quote itself as a clarification request and is visible to that provider.{' '}
        <Link href={`/customer/requests/${requestId}/quotes`} className={LINK_ARROW}>
          Open the quote comparison <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}

/**
 * "Edit Request" — the window before anybody has priced the work.
 *
 * ⚠️ THE WINDOW IS THE POINT, AND THE PANEL NAMES ITS EDGE. Editing a request a provider has already quoted
 * would leave their price attached to work that is no longer the work, so the command refuses it and this panel
 * offers the reason instead of a form that would fail. Before that point the wording, the urgency, the area and
 * the access notes are all still the customer's to change.
 *
 * ⚠️ THE SERVICE IS NOT EDITABLE HERE, deliberately. Swapping the trade would invalidate every match and every
 * quote made against the old one; that is a new request, not an edit to this one. The form does not offer a
 * control the action would have to ignore.
 */
export function EditRequestPanel({
  request,
  locations,
  editable,
  blockedReason,
}: {
  request: RequestDetail;
  locations: { id: string; name: string }[];
  editable: boolean;
  blockedReason: string | null;
}) {
  const scope = request.scope;
  const text = (key: string) => (typeof scope[key] === 'string' ? (scope[key] as string) : '');

  return (
    <section aria-labelledby="edit-heading" className={`${CARD} p-4`}>
      <h2 id="edit-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Edit this request
      </h2>

      {!editable ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {blockedReason ?? 'This request can no longer be edited.'}
        </p>
      ) : (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            Edit the description, area or access notes
          </summary>

          <form action={updateRequestAction} className="mt-3 space-y-3">
            <input type="hidden" name="request_id" value={request.id} />

            <div>
              <label className={LABEL} htmlFor="need_text">
                What needs doing
              </label>
              <textarea
                id="need_text"
                name="need_text"
                rows={4}
                required
                minLength={5}
                maxLength={4000}
                defaultValue={request.needText}
                className={FIELD}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="urgency">
                  Urgency
                </label>
                <select id="urgency" name="urgency" defaultValue={request.urgency} className={FIELD}>
                  <option value="normal">Flexible — no rush</option>
                  <option value="soon">Soon — within a few days</option>
                  <option value="urgent">Urgent — today or tomorrow</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="location_id">
                  Area
                </label>
                <select
                  id="location_id"
                  name="location_id"
                  defaultValue={request.locationId ?? ''}
                  className={FIELD}
                >
                  <option value="">Choose an area…</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={LABEL} htmlFor="landmark">
                Nearest landmark <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="landmark"
                name="landmark"
                type="text"
                maxLength={200}
                defaultValue={text('landmark')}
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="access_notes">
                Getting in and anything a provider must know
              </label>
              <textarea
                id="access_notes"
                name="access_notes"
                rows={3}
                maxLength={2000}
                defaultValue={text('access_notes')}
                className={FIELD}
                placeholder="e.g. Gate code 4471, the tap is behind the kitchen unit."
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="preferred_window">
                When suits you <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="preferred_window"
                name="preferred_window"
                type="text"
                maxLength={200}
                defaultValue={text('preferred_window')}
                className={FIELD}
                placeholder="e.g. Weekday mornings"
              />
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              Saving writes a new version of what you have told us. Anything you leave alone stays as it is, and
              providers reading the request see the new wording.
            </p>

            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
            >
              <Save aria-hidden="true" className="h-3.5 w-3.5" />
              Save changes
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

/** Cancel, behind a disclosure that requires a reason — the reason is passed to the provider. */
export function CancelRequestPanel({ request, cancellable }: { request: RequestDetail; cancellable: boolean }) {
  return (
    <section aria-labelledby="cancel-heading" className={`${CARD} p-4`}>
      <h2 id="cancel-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Cancel this request
      </h2>

      {!cancellable ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          This request can no longer be cancelled here
          {request.obligation && ['funding', 'funded', 'partially_refunded', 'refunded', 'disputed'].includes(request.obligation.status)
            ? ': money has been paid against it, and a refund has to be raised by the platform team.'
            : request.state === 'completed'
              ? ': the work is complete. If something is wrong with it, that is a dispute rather than a cancellation.'
              : '.'}
        </p>
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Cancel — this tells the provider and closes the request
          </summary>
          <form action={cancelRequestAction} className="mt-3 space-y-3">
            <input type="hidden" name="request_id" value={request.id} />
            <div>
              <label className={LABEL} htmlFor="cancel_reason">
                Why are you cancelling?
              </label>
              <textarea
                id="cancel_reason"
                name="reason"
                rows={3}
                required
                minLength={10}
                maxLength={2000}
                className={FIELD}
                placeholder="e.g. The leak was fixed by someone else before any provider responded."
              />
              <p className="mt-1.5 text-xs text-slate-500">
                At least a sentence. Any quote still under consideration is closed with the request, and a
                provider you had accepted is told the assignment has ended.
              </p>
            </div>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
              Cancel the request
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

export function RequestSummaryCard({ request }: { request: RequestDetail }) {
  return (
    <section className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{request.needText.trim() || 'Untitled request'}</h2>
        <StatusPill pill={{ label: request.state.replace(/_/g, ' '), tone: request.state === 'accepted' || request.state === 'completed' ? 'teal' : 'amber' }} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className={LABEL}>Service</dt>
          <dd className="text-sm text-slate-800">{request.serviceName ?? 'Not chosen'}</dd>
        </div>
        <div>
          <dt className={LABEL}>Area</dt>
          <dd className="text-sm text-slate-800">{request.locationName ?? 'Not chosen'}</dd>
        </div>
        <div>
          <dt className={LABEL}>Urgency</dt>
          <dd className="text-sm text-slate-800">{request.urgency.replace(/_/g, ' ')}</dd>
        </div>
        <div>
          <dt className={LABEL}>Reference</dt>
          <dd className="font-mono text-sm font-semibold text-slate-800">
            REQ-{request.id.replace(/-/g, '').slice(0, 8).toUpperCase()}
          </dd>
        </div>
      </dl>

      {Object.keys(request.scope).length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            What you told us when you submitted
          </summary>
          <dl className="mt-2 space-y-2 text-xs text-slate-600">
            {Object.entries((request.scope.answers as Record<string, string> | undefined) ?? {}).map(([id, answer]) => (
              <div key={id}>
                <dt className="font-semibold text-slate-500">{id.replace(/_/g, ' ')}</dt>
                <dd>{answer === 'not_sure' ? 'you were not sure yet' : answer}</dd>
              </div>
            ))}
            {request.scope.landmark ? (
              <div>
                <dt className="font-semibold text-slate-500">landmark</dt>
                <dd>{String(request.scope.landmark)}</dd>
              </div>
            ) : null}
            {request.scope.access_notes ? (
              <div>
                <dt className="font-semibold text-slate-500">access</dt>
                <dd>{String(request.scope.access_notes)}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}

      {request.cancellationReason ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Cancelled: {request.cancellationReason}
        </p>
      ) : null}

      {(request.assignment || request.obligation || request.agreement) ? (
        <div className="mt-4 space-y-2 border-t border-solid border-slate-200 pt-4">
          {request.agreement ? (
            <p className="flex items-center gap-2 text-xs text-primary">
              <BadgeCheck aria-hidden="true" className="h-4 w-4" />
              Agreement signed on {new Date(request.agreement.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          ) : request.assignment ? (
            <p className="flex items-center gap-2 text-xs text-slate-600">
              <CalendarClock aria-hidden="true" className="h-4 w-4 text-amber-600" />
              A provider is assigned but the agreement has not been signed yet.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {request.assignment ? (
              <Link href={`/customer/projects/${request.assignment.id}/agreement`} className={LINK_ARROW}>
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {request.agreement ? 'Review the agreement' : 'Review and sign the agreement'}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {/* The decision that releases money lives on the completion page, and this is the way to it from the
                job itself. It only appears when the work is actually waiting on the customer. */}
            {request.assignment && request.state === 'submitted_for_approval' ? (
              <Link href={`/customer/projects/${request.assignment.id}/completion`} className={LINK_ARROW}>
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                Review the completed work
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {request.obligation ? (
              <Link href={`/requests/${request.id}`} className={LINK_ARROW}>
                Work, evidence and payment <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
