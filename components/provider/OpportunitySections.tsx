import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  FileText,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Star,
  TriangleAlert,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import {
  BAND_COPY,
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  FIT_REASON_COPY,
  URGENCY_COPY,
  type OpportunityDetail,
  type ProviderOpportunity,
} from '@/features/provider-workspace/opportunities';
import { respondToOpportunityAction, sendQuoteMessageAction } from '@/features/provider-workspace/actions';

/**
 * Opportunities: the feed, the card, and one request in full.
 *
 * ⚠️ NOTHING ON THESE PAGES IS A MEASUREMENT THE PLATFORM CANNOT MAKE. No distance in kilometres (locations
 * have no coordinates set), no "match percentage" invented from thin air, no "viewed by the customer". What
 * is shown is what a row says: which of the provider's areas it matched, the eligibility score the matching
 * pass computed, the urgency the customer chose, and whatever the provider themselves recorded.
 *
 * ⚠️ THE CUSTOMER'S PRIVATE DETAILS ARE ABSENT UNTIL A QUOTE IS ACCEPTED. No name, no phone number, no
 * landmark, no access notes. The detail page prices the work from what the customer described and says
 * plainly that the way to reach the property arrives with the job.
 */

function urgencyBadge(urgency: string) {
  const copy = URGENCY_COPY[urgency] ?? URGENCY_COPY.normal;
  return copy.tone === 'amber' ? <span className={BADGE_AMBER}>{copy.label}</span> : <span className={BADGE_SLATE}>{copy.label}</span>;
}

function responseBadge(opportunity: ProviderOpportunity) {
  if (opportunity.quoteId) {
    return (
      <span
        className={
          opportunity.quoteStatus === 'accepted'
            ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase'
            : BADGE_SLATE
        }
      >
        {opportunity.quoteStatus === 'withdrawn'
          ? 'Quote withdrawn'
          : opportunity.quoteVersion
            ? `Quoted ${opportunity.quoteVersion}`
            : 'Quoted'}
      </span>
    );
  }
  if (opportunity.hasDraft) return <span className={BADGE_SLATE}>Draft started</span>;
  if (opportunity.response === 'interested') return <span className={BADGE_SLATE}>Marked interested</span>;
  if (opportunity.response === 'declined') return <span className={BADGE_SLATE}>Declined</span>;
  return null;
}

/**
 * The three filters.
 *
 * ⚠️ A GET FORM, AND NO SLIDER. A `<form method="get">` needs no JavaScript, survives a reload and can be
 * bookmarked, which matters on the connection this page is designed for. The travel control is a select
 * rather than the brief's slider because the bands are discrete and the platform cannot measure a distance:
 * a slider would imply that "within 17km" is something it knows.
 */
export function OpportunityFilters({
  categories,
  current,
}: {
  categories: { id: string; name: string; count: number }[];
  current: { service: string; band: string; availability: string };
}) {
  return (
    <form method="get" action={PROVIDER_PATHS.opportunities} className={`${CARD} grid gap-4 p-5`}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="service" className={LABEL}>
            Category
          </label>
          <select id="service" name="service" defaultValue={current.service} className={FIELD}>
            <option value="">Every category you cover</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.count})
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="band" className={LABEL}>
            Where the work is
          </label>
          <select id="band" name="band" defaultValue={current.band} className={FIELD}>
            <option value="">Everywhere you cover</option>
            <option value="primary">Your main area only</option>
            <option value="covered">Other areas you cover</option>
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="availability" className={LABEL}>
            How soon they need it
          </label>
          <select id="availability" name="availability" defaultValue={current.availability} className={FIELD}>
            <option value="">Any timing</option>
            <option value="urgent">Urgent and emergency only</option>
            <option value="soon">Urgent, emergency and soon</option>
          </select>
        </div>

        <PendingButton
          idle="Apply filters"
          pending="Applying…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        There is no distance filter because the platform holds no coordinates for its locations: it can say
        which of your own areas a request matched, not how far away it is. The eligibility score beside each
        card is the matching pass&apos;s own figure.
      </p>
    </form>
  );
}

/** Mark interested, or decline with a reason. Both post to the same command. */
function CardActions({
  opportunity,
  providerId,
  nextPath,
}: {
  opportunity: ProviderOpportunity;
  providerId: string;
  nextPath: string;
}) {
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${PROVIDER_PATHS.opportunities}/${opportunity.requestId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
        >
          View opportunity
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>

        {!opportunity.quoteId ? (
          <form action={respondToOpportunityAction}>
            <input type="hidden" name="provider_id" value={providerId} />
            <input type="hidden" name="request_id" value={opportunity.requestId} />
            <input type="hidden" name="response" value="interested" />
            <input type="hidden" name="next" value={nextPath} />
            <PendingButton
              idle={opportunity.response === 'interested' ? 'Interested ✓' : 'Mark interested'}
              pending="Saving…"
              icon={<Star aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </form>
        ) : null}

        {opportunity.quoteId ? (
          <Link
            href={`${PROVIDER_PATHS.quotes}/${opportunity.quoteId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3.5 py-2 font-sans text-xs font-bold tracking-wide text-white no-underline transition-colors hover:bg-secondary-dark"
          >
            Open your quote
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            href={`${PROVIDER_PATHS.quotesNew}?request=${opportunity.requestId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3.5 py-2 font-sans text-xs font-bold tracking-wide text-white no-underline transition-colors hover:bg-secondary-dark"
          >
            Create quote
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {!opportunity.quoteId ? (
        <details>
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            Decline this invitation
          </summary>
          <form
            action={respondToOpportunityAction}
            className="mt-2 grid gap-2 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5"
          >
            <input type="hidden" name="provider_id" value={providerId} />
            <input type="hidden" name="request_id" value={opportunity.requestId} />
            <input type="hidden" name="response" value="declined" />
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor={`reason_${opportunity.requestId}`} className={LABEL}>
                Why you are declining
              </label>
              <select id={`reason_${opportunity.requestId}`} name="reason_code" required defaultValue="" className={FIELD}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {DECLINE_REASONS.map(reason => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`note_${opportunity.requestId}`} className={LABEL}>
                Anything to add (optional)
              </label>
              <input id={`note_${opportunity.requestId}`} name="note" maxLength={500} className={FIELD} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PendingButton
                idle="Decline"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-xs leading-relaxed text-slate-500">
                The customer never sees this. It is how the platform learns why eligible work goes unanswered.
              </p>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}

export function OpportunityCard({
  opportunity,
  providerId,
  nextPath,
}: {
  opportunity: ProviderOpportunity;
  providerId: string;
  nextPath: string;
}) {
  const band = BAND_COPY[opportunity.band];
  return (
    <article className={`${CARD} flex flex-col p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{opportunity.needText}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {opportunity.locationName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {[opportunity.locationName, opportunity.cityName].filter(Boolean).join(', ')}
              </span>
            ) : null}
            {opportunity.serviceName ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {opportunity.serviceName}
              </span>
            ) : null}
            {opportunity.preferredWindow ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                Wants it {opportunity.preferredWindow}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {urgencyBadge(opportunity.urgency)}
          <span className={BADGE_SLATE}>{band.label}</span>
          <span className={BADGE_SLATE}>Fit {opportunity.fitScore}/100</span>
        </div>
      </div>

      {opportunity.hazardous ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-solid border-secondary bg-secondary-light px-3 py-2 text-xs leading-relaxed text-amber-900">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          The customer flagged this job as hazardous. Price the safety work in, and use the message box on the
          detail page if you need to ask what they meant.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {responseBadge(opportunity)}
        {opportunity.unansweredFromCustomer ? (
          <span className={BADGE_AMBER}>Customer asked a question</span>
        ) : null}
      </div>

      <div className="mt-4 flex-1 border-t border-solid border-slate-200 pt-3">
        <CardActions opportunity={opportunity} providerId={providerId} nextPath={nextPath} />
      </div>
    </article>
  );
}

export function OpportunityFeed({
  opportunities,
  providerId,
  nextPath,
}: {
  opportunities: ProviderOpportunity[];
  providerId: string;
  nextPath: string;
}) {
  if (opportunities.length === 0) {
    return (
      <EmptyState title="Nothing matches these filters">
        A request appears here when it matches a service you offer, an area you cover, and the platform&apos;s
        market rules. Relax a filter, or check your profile if you expected more work.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {opportunities.map(opportunity => (
        <OpportunityCard
          key={opportunity.requestId}
          opportunity={opportunity}
          providerId={providerId}
          nextPath={nextPath}
        />
      ))}
    </div>
  );
}

// ── One opportunity, in full ──────────────────────────────────────────────────────────────────────

/**
 * The credential and evidence tags the platform can honestly derive.
 *
 * ⚠️ THEY COME FROM THE SIGNALS THAT EXIST, NOT FROM A RULE THAT DOES NOT. There is no per-service credential
 * requirement table. What the platform has is the customer's own hazard flag, the provider's
 * `provider_matching_eligibility.reasons`, and whatever the customer answered about risk. So the tags say
 * exactly those things. A licence list generated from a trade name would be the most dangerous invention
 * this page could make: a provider would read it as evidence they only need what it names.
 */
export function RequirementTags({ detail }: { detail: OpportunityDetail }) {
  const tags: string[] = [];
  if (detail.request.hazardous) tags.push('The customer flagged this work as hazardous.');
  if (detail.fit.reasons.includes('verification_incomplete')) {
    tags.push('Your account does not have a verified identity on file yet.');
  }
  if (detail.fit.reasons.includes('search_readiness_low')) {
    tags.push('Your readiness score is below the 60 that matching requires.');
  }
  const risk = detail.scope.answers.risk;
  if (risk) tags.push(`The customer described the risk as: ${risk}`);
  const access = detail.scope.answers.access;
  if (access) tags.push(`Access, in the customer's words: ${access}`);

  return (
    <section className={`${CARD} p-5`} aria-labelledby="requirements-heading">
      <h2 id="requirements-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
        What this work asks of you
      </h2>
      <ul className="mt-3 grid gap-2">
        {tags.length === 0 ? (
          <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
            Nothing in your own matching record is standing between you and this request.
          </li>
        ) : (
          tags.map(tag => (
            <li key={tag} className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
              {tag}
            </li>
          ))
        )}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The platform does not hold a list of licences per trade, so it cannot tell you which to bring. It can
        hold what you record, and your customers see a verified count of it.
      </p>
      <p className="mt-2">
        <Link href={PROVIDER_PATHS.credentials} className={LINK_ARROW}>
          Manage your credentials
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}

export function OpportunityDetailHeader({ detail }: { detail: OpportunityDetail }) {
  const band = BAND_COPY[detail.request.band];
  return (
    <header className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Opportunity</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {detail.request.needText}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {[detail.request.locationName, detail.request.cityName].filter(Boolean).join(', ') || 'Area matched'}
            </span>
            {detail.request.serviceName ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {detail.request.serviceName}
              </span>
            ) : null}
            {detail.request.postedAt ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                Posted{' '}
                {new Date(detail.request.postedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            ) : null}
            {detail.request.currencyCode ? <span className={BADGE_SLATE}>Prices in {detail.request.currencyCode}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {urgencyBadge(detail.request.urgency)}
          <span className={BADGE_SLATE}>{band.label}</span>
          <span className={BADGE_SLATE}>Fit {detail.fit.score}/100</span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">{band.note}</p>
    </header>
  );
}

/**
 * The scope, as the customer wrote it.
 *
 * ⚠️ THE ANSWERS ARE THE CUSTOMER'S OWN WORDS, KEYED BY THEIR OWN QUESTIONS. The key is shown beside the value
 * rather than dressed up with nicer labels, because the platform does not store the question text and a
 * prettifier here would be inventing one.
 */
export function OpportunityScopePanel({ detail }: { detail: OpportunityDetail }) {
  const answers = Object.entries(detail.scope.answers);
  return (
    <section className={`${CARD} p-5`} aria-labelledby="scope-heading">
      <h2 id="scope-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <FileText aria-hidden="true" className="h-4 w-4 text-primary" />
        What the customer said about the work
      </h2>

      {answers.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          The customer did not answer any scoping questions — the description above is everything they gave. Ask
          what you need with the message box below rather than pricing around a guess.
        </p>
      ) : (
        <dl className="mt-3 grid gap-3">
          {answers.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-solid border-slate-200 p-3.5">
              <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {key.replaceAll('_', ' ')}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {detail.scope.notSure.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">The customer was unsure about: </strong>
          {detail.scope.notSure.join(', ')}.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">When they want it</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {[detail.scope.preferredDate, detail.scope.preferredWindow].filter(Boolean).join(' · ') || 'Not stated'}
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Area as described</dt>
          <dd className="mt-0.5 text-sm text-slate-700">{detail.scope.areaText ?? 'Not stated'}</dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Hazardous</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {detail.scope.hazardous ? 'Flagged by the customer' : 'Not flagged'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          The landmark, access notes and contact preference the customer gave are not shown here. They describe
          how to reach a person and a door, and they arrive with the job once a quote is accepted.
        </span>
      </p>
    </section>
  );
}

/**
 * The customer's clock, as far as it exists.
 *
 * ⚠️ THERE IS NO RESPONSE DEADLINE IN THIS SCHEMA, AND THIS SAYS SO RATHER THAN DRAWING A COUNTDOWN. No request
 * carries an expiry or an SLA. The honest substitute is what the platform does know: when it was posted, how
 * long ago that was, and how urgently the customer says they need it.
 */
export function OpportunityDeadlinePanel({ detail, now }: { detail: OpportunityDetail; now: Date }) {
  const posted = detail.request.postedAt ? new Date(detail.request.postedAt) : null;
  const days = posted ? Math.floor((now.getTime() - posted.getTime()) / 86_400_000) : null;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="deadline-heading">
      <h2 id="deadline-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <CalendarClock aria-hidden="true" className="h-4 w-4 text-primary" />
        How long you have
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        There is no reply deadline on this platform, and this page will not invent one. What it can tell you is
        how old the request is and how urgent the customer says it is.
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Posted</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {posted ? posted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Date not recorded'}
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Age</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {days === null ? 'Unknown' : days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Urgency</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {(URGENCY_COPY[detail.request.urgency] ?? URGENCY_COPY.normal).label}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Express interest, quote, ask a question, or decline — the four things a provider can do here. */
export function OpportunityDetailActions({
  detail,
  providerId,
  nextPath,
}: {
  detail: OpportunityDetail;
  providerId: string;
  nextPath: string;
}) {
  const openQuote = detail.quotes.find(quote => quote.status === 'submitted') ?? null;
  const declined = detail.response.response === 'declined';

  return (
    <section className={`${CARD} grid gap-4 p-5`} aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="text-sm font-bold tracking-tight text-slate-900">
        What you can do
      </h2>

      {openQuote ? (
        <div className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-4">
          <p className="text-sm font-semibold text-slate-800">
            You have quoted this request ({openQuote.version}, {openQuote.status.replaceAll('_', ' ')}).
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            The customer can accept, decline or ask a question. A revised quote is a new version beside this one,
            not an edit to it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link href={`${PROVIDER_PATHS.quotes}/${openQuote.id}`} className={LINK_ARROW}>
              Open your quote
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <Link href={`${PROVIDER_PATHS.quotesNew}?request=${detail.request.id}&from=${openQuote.id}`} className={LINK_ARROW}>
              Submit a revised quote
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={respondToOpportunityAction}>
            <input type="hidden" name="provider_id" value={providerId} />
            <input type="hidden" name="request_id" value={detail.request.id} />
            <input type="hidden" name="response" value="interested" />
            <input type="hidden" name="next" value={nextPath} />
            <PendingButton
              idle={detail.response.response === 'interested' ? 'Marked interested ✓' : 'Express interest'}
              pending="Saving…"
              icon={<Star aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </form>

          <Link
            href={`${PROVIDER_PATHS.quotesNew}?request=${detail.request.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white no-underline shadow-sm transition-colors hover:bg-secondary-dark"
          >
            Create quote
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {detail.draft ? (
        <p className="text-xs leading-relaxed text-amber-800">
          You have a saved draft for this request. Opening the quote builder resumes it.
        </p>
      ) : null}

      <div className="border-t border-solid border-slate-200 pt-4">
        <form action={sendQuoteMessageAction} className="grid gap-2">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="request_id" value={detail.request.id} />
          <input type="hidden" name="quote_id" value={openQuote?.id ?? ''} />
          <input type="hidden" name="next" value={nextPath} />
          <label htmlFor="clarification" className={LABEL}>
            Ask the customer something
          </label>
          <textarea
            id="clarification"
            name="message"
            rows={3}
            required
            minLength={2}
            maxLength={2000}
            placeholder="e.g. Is the leak under the sink or behind the wall? That changes what I need to bring."
            className={FIELD}
          />
          <p className="text-xs leading-relaxed text-slate-500">
            The customer sees this on their request page. Use it before quoting rather than pricing around a
            guess.
          </p>
          <div>
            <PendingButton
              idle="Send message"
              pending="Sending…"
              icon={<MessageSquare aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      </div>

      <div className="border-t border-solid border-slate-200 pt-4">
        {declined ? (
          <p className="text-xs leading-relaxed text-slate-600">
            You declined this invitation
            {detail.response.reasonCode
              ? ` (${DECLINE_REASON_LABELS[detail.response.reasonCode] ?? detail.response.reasonCode})`
              : ''}
            . It stays out of your way, and you can still quote it if you change your mind.
          </p>
        ) : (
          <form
            action={respondToOpportunityAction}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          >
            <input type="hidden" name="provider_id" value={providerId} />
            <input type="hidden" name="request_id" value={detail.request.id} />
            <input type="hidden" name="response" value="declined" />
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="detail_reason" className={LABEL}>
                Decline it — why
              </label>
              <select id="detail_reason" name="reason_code" required defaultValue="" className={FIELD}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {DECLINE_REASONS.map(reason => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="detail_note" className={LABEL}>
                Note (optional)
              </label>
              <input id="detail_note" name="note" maxLength={500} className={FIELD} />
            </div>
            <PendingButton
              idle="Decline"
              pending="Saving…"
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </form>
        )}
      </div>

      {detail.fit.reasons.length > 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Your matching record for this service and area notes:{' '}
          {detail.fit.reasons.map(reason => FIT_REASON_COPY[reason] ?? reason).join(' ')}
        </p>
      ) : null}
    </section>
  );
}
