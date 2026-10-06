import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Bell,
  CalendarClock,
  CircleAlert,
  MapPin,
  Navigation,
  Play,
  Wallet,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { AvailabilityToggle, PendingButton } from '@/components/provider/ProviderControls';
import { PROVIDER_ACTION_COPY, PROVIDER_PATHS, type ProviderActionKind } from '@/features/provider-workspace/paths';
import { formatDayLabel, formatExpiry, formatMoney, formatWindow } from '@/features/provider-workspace/format';
import {
  FIELD_PROGRESS_COPY,
  splitDayJobs,
  type ProviderDay,
  type ProviderDayAction,
  type ProviderDayJob,
} from '@/features/provider-workspace/day';
import { recordFieldProgressAction, startJobAction } from '@/features/provider-workspace/actions';

/**
 * The operational home — "Today's overview".
 *
 * DESIGNED FOR ONE HAND AND A BAD CONNECTION. Four decisions follow from that and none of them is
 * decoration:
 *
 *   1. The status the provider came to change (online/offline) is the first interactive thing on the
 *      page, and it is a form, so it works with no JavaScript.
 *   2. The quick field buttons ("On my way", "Arrived", "Start job") are on the job card itself, not
 *      on a detail page three taps away.
 *   3. Every widget states what it is empty of, rather than hiding when it has nothing.
 *   4. NOTHING IS A CACHED TOTAL. Every number comes from the one read behind the page.
 *
 * ⚠️ "INVITATIONS" ARE REQUESTS THIS PROVIDER CAN QUOTE, AND THE WIDGET SAYS SO. This platform has no
 * separate invitation inbox — a request reaches a provider by passing the same eligibility rules that
 * decide matching — so calling them invitations would be inventing a message that never arrived. The
 * counter is the count of eligible requests this provider has not answered.
 */

function Widget({
  title,
  icon,
  badge,
  children,
  href,
  linkLabel,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className={`${CARD} flex flex-col p-5`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <span className="text-primary">{icon}</span>
          {title}
        </h2>
        {badge}
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {href && linkLabel ? (
        <div className="mt-4 border-t border-solid border-slate-200 pt-3">
          <Link href={href} className={LINK_ARROW}>
            {linkLabel}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The hero.
 *
 * ⚠️ THE STATUS BADGE HAS THREE VALUES, NOT TWO. "Published but offline" is a real and common state —
 * a provider who has stopped taking new work without leaving the platform — and collapsing it into
 * "draft" would tell them their profile is not live when it is.
 */
export function TodayHero({
  day,
  nextPath,
  notice,
}: {
  day: ProviderDay;
  nextPath: string;
  notice?: React.ReactNode;
}) {
  const { provider, counts, readiness } = day;
  const status = !provider.isPublic
    ? { label: 'Draft — not published', tone: 'amber' as const }
    : provider.acceptsNewWork
      ? { label: 'Published and taking work', tone: 'teal' as const }
      : { label: 'Published, not taking new work', tone: 'amber' as const };

  return (
    <section className="rounded-2xl border border-solid border-primary/10 bg-primary-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Today</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Today&apos;s overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            {provider.displayName} · {counts.activeJobs} active job{counts.activeJobs === 1 ? '' : 's'} ·{' '}
            {counts.unansweredOpportunities} request{counts.unansweredOpportunities === 1 ? '' : 's'} waiting on your quote.
          </p>
        </div>

        <span
          className={
            status.tone === 'teal'
              ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase'
              : BADGE_AMBER
          }
        >
          {status.label}
        </span>
      </div>

      {notice}

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="max-w-md">
          <AvailabilityToggle
            providerId={provider.id}
            acceptsNewWork={provider.acceptsNewWork}
            nextPath={nextPath}
            variant="hero"
          />
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {provider.acceptsNewWork
              ? 'Requests that match your services and areas can reach you. Going offline stops new matches; it does not end work you have already accepted.'
              : 'You are not being matched to new requests. Existing jobs and quotes are unaffected.'}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Search readiness {readiness.totalScore}/100
          </span>
          <Link href={PROVIDER_PATHS.searchReadiness} className={LINK_ARROW}>
            See what is missing
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
          {provider.isPublic && provider.slug ? (
            <Link href={`/providers/${provider.slug}`} className={LINK_ARROW}>
              View your public profile
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link href={PROVIDER_PATHS.profile} className={LINK_ARROW}>
              Finish your profile
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The quick field buttons.
 *
 * ⚠️ "ON MY WAY" AND "ARRIVED" ARE CHECKPOINTS; "START JOB" IS A STATE CHANGE. The first two write to
 * the provider's own field record and are available from the moment a job is accepted — a provider who
 * is driving to a job whose payment has not landed can still say so, because it is true. "Start job"
 * goes through the assignment command, which refuses unless the work is scheduled and funded, so the
 * button appears only when the same rule says it would succeed.
 */
function JobActions({ job, nextPath }: { job: ProviderDayJob; nextPath: string }) {
  const checkpoints: { state: 'en_route' | 'on_site'; label: string; icon: React.ReactNode }[] = [
    { state: 'en_route', label: 'On my way', icon: <Navigation aria-hidden="true" className="h-4 w-4" /> },
    { state: 'on_site', label: 'Arrived at site', icon: <MapPin aria-hidden="true" className="h-4 w-4" /> },
  ];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {checkpoints.map(checkpoint => (
        <form key={checkpoint.state} action={recordFieldProgressAction}>
          <input type="hidden" name="assignment_id" value={job.assignmentId} />
          <input type="hidden" name="state" value={checkpoint.state} />
          <input type="hidden" name="next" value={nextPath} />
          <PendingButton
            idle={checkpoint.label}
            pending="Saving…"
            icon={checkpoint.icon}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      ))}

      {job.startAllowed ? (
        <form action={startJobAction}>
          <input type="hidden" name="assignment_id" value={job.assignmentId} />
          <input type="hidden" name="next" value={nextPath} />
          <PendingButton
            idle="Start job"
            pending="Starting…"
            icon={<Play aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      ) : null}

      <Link href={`${PROVIDER_PATHS.work}/${job.assignmentId}`} className={LINK_ARROW}>
        Open the job
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function JobCard({ job, now, nextPath }: { job: ProviderDayJob; now: Date; nextPath: string }) {
  const window = formatWindow(job.scheduledStart, job.scheduledEnd, job.scheduleTimezone);
  const dayLabel = formatDayLabel(job.scheduledStart, now);
  const urgent = job.urgency === 'urgent' || job.urgency === 'emergency_redirect';

  return (
    <article className="rounded-xl border border-solid border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{job.needText}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
              {dayLabel && window ? `${dayLabel}, ${window}` : dayLabel ?? window ?? 'No time agreed yet'}
            </span>
            {job.locationName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {job.locationName}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {urgent ? <span className={BADGE_AMBER}>Urgent</span> : null}
          {job.fieldState ? (
            <span className={BADGE_SLATE}>{FIELD_PROGRESS_COPY[job.fieldState]}</span>
          ) : null}
          <span className={job.obligationStatus === 'funded' || !job.obligationStatus ? BADGE_SLATE : BADGE_AMBER}>
            {job.obligationStatus === 'funded'
              ? 'Paid'
              : job.obligationStatus
                ? `Payment ${job.obligationStatus.replaceAll('_', ' ')}`
                : 'No payment required'}
          </span>
        </div>
      </div>

      {job.landmark || job.accessNotes ? (
        <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">
          {job.landmark ? <>{job.landmark}. </> : null}
          {job.accessNotes ?? null}
        </p>
      ) : null}

      <JobActions job={job} nextPath={nextPath} />
    </article>
  );
}

export function ScheduleWidget({ day, now, nextPath }: { day: ProviderDay; now: Date; nextPath: string }) {
  const { today, later, unscheduled } = splitDayJobs(day.schedule, now);

  return (
    <Widget
      title="Today's schedule and active jobs"
      icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
      badge={<span className={BADGE_SLATE}>{day.schedule.length} active</span>}
    >
      {day.schedule.length === 0 ? (
        <EmptyState title="No active jobs">
          Accepted quotes appear here as work to schedule, start and finish. Nothing is waiting on you
          right now.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {today.length > 0 ? (
            <div>
              <p className="mb-2 font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Today</p>
              <div className="grid gap-3">
                {today.map(job => (
                  <JobCard key={job.assignmentId} job={job} now={now} nextPath={nextPath} />
                ))}
              </div>
            </div>
          ) : null}

          {unscheduled.length > 0 ? (
            <div>
              <p className="mb-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                No time agreed yet
              </p>
              <div className="grid gap-3">
                {unscheduled.map(job => (
                  <JobCard key={job.assignmentId} job={job} now={now} nextPath={nextPath} />
                ))}
              </div>
            </div>
          ) : null}

          {later.length > 0 ? (
            <div>
              <p className="mb-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Coming up</p>
              <div className="grid gap-3">
                {later.map(job => (
                  <JobCard key={job.assignmentId} job={job} now={now} nextPath={nextPath} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Widget>
  );
}

/**
 * Invitations to quote.
 *
 * The badge is the count of requests this provider is eligible to quote and has not answered, which is
 * the number the brief calls "unread invitations". It is not a notification count: nothing has been
 * read or unread, and the copy says "waiting on your quote" rather than implying a message.
 */
export function OpportunitiesWidget({ day }: { day: ProviderDay }) {
  const unanswered = day.counts.unansweredOpportunities;

  return (
    <Widget
      title="Requests you can quote"
      icon={<Bell aria-hidden="true" className="h-4 w-4" />}
      badge={unanswered > 0 ? <span className={BADGE_AMBER}>{unanswered} unanswered</span> : <span className={BADGE_SLATE}>All answered</span>}
    >
      {day.opportunities.length === 0 ? (
        <EmptyState title="Nothing eligible right now">
          A request appears here only when it matches a service you offer, an area you work in, and the
          platform&apos;s market rules. Publication is what turns matching on.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {day.opportunities.map(opportunity => (
            <li key={opportunity.requestId} className="rounded-xl border border-solid border-slate-200 p-3.5">
              <p className="text-sm font-semibold text-slate-900">{opportunity.needText}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[opportunity.serviceName, opportunity.locationName].filter(Boolean).join(' · ') || 'Matched request'}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                {opportunity.quoteId ? (
                  <Link href={`${PROVIDER_PATHS.quotes}/${opportunity.quoteId}`} className={LINK_ARROW}>
                    Open your quote
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <Link href={`${PROVIDER_PATHS.quotesNew}?request=${opportunity.requestId}`} className={LINK_ARROW}>
                    Send a quote
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                )}
                <Link href={`${PROVIDER_PATHS.opportunities}/${opportunity.requestId}`} className={LINK_ARROW}>
                  Open the opportunity
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
                {opportunity.quoteStatus ? (
                  <span className={BADGE_SLATE}>{opportunity.quoteStatus.replaceAll('_', ' ')}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

/**
 * Resolve an action to something to do.
 *
 * ⚠️ THE DATABASE RETURNS FACTS AND THIS RETURNS A DESTINATION. The copy and the href live here, with
 * the ids the fact carried, so a wording change is not a migration. An entry with no resolvable
 * destination renders as a sentence rather than as a button to nowhere.
 */
function actionLink(action: ProviderDayAction): { href: string; cta: string } | null {
  const copy = PROVIDER_ACTION_COPY[action.kind as ProviderActionKind];
  switch (copy.target) {
    case 'assignment':
      return action.assignmentId
        ? { href: `${PROVIDER_PATHS.work}/${action.assignmentId}`, cta: 'Open the job' }
        : null;
    case 'request':
      return action.requestId
        // The opportunity page is where the provider can both read the quote and answer the customer, so a
        // question lands somewhere a reply is possible rather than on a form that would start a new version.
        ? { href: `${PROVIDER_PATHS.opportunities}/${action.requestId}`, cta: 'Open the request' }
        : null;
    case 'credentials':
      return { href: PROVIDER_PATHS.credentials, cta: 'Renew it' };
    case 'verification':
      return { href: PROVIDER_PATHS.verification, cta: 'See what is needed' };
    case 'payouts':
      return { href: PROVIDER_PATHS.payouts, cta: 'Set up payouts' };
    case 'profile':
      return { href: PROVIDER_PATHS.profile, cta: 'Fix missing item' };
    default:
      return null;
  }
}

export function ActionsWidget({ day, now }: { day: ProviderDay; now: Date }) {
  return (
    <Widget
      title="Action required"
      icon={<CircleAlert aria-hidden="true" className="h-4 w-4" />}
      badge={day.actions.length > 0 ? <span className={BADGE_AMBER}>{day.actions.length}</span> : <span className={BADGE_SLATE}>Nothing</span>}
    >
      {day.actions.length === 0 ? (
        <EmptyState title="Nothing needs you right now">
          Signature requests, evidence waiting to be submitted, expiring credentials and a payout
          account that is not verified all appear here.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {day.actions.map((action, index) => {
            const copy = PROVIDER_ACTION_COPY[action.kind as ProviderActionKind];
            const link = actionLink(action);
            const due = action.dueAt ? formatExpiry(action.dueAt, now) : null;
            return (
              <li key={`${action.kind}:${action.assignmentId ?? action.requestId ?? action.credentialId ?? index}`} className="rounded-xl border border-solid border-slate-200 p-3.5">
                <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
                {action.detail ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{action.detail}</p> : null}
                {due ? <p className="mt-1 text-xs font-semibold text-amber-800">{due}</p> : null}
                {link ? (
                  <Link href={link.href} className={`mt-2 ${LINK_ARROW}`}>
                    {link.cta}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

/**
 * Earnings.
 *
 * ⚠️ "CLEARED" MEANS THE PLATFORM HAS SENT IT, NOT THAT THE CUSTOMER PAID. The money a customer has
 * funded but the platform has not yet released sits in `pending`, and money owed on work whose payment
 * has not arrived is reported separately as "awaiting customer funding" — never folded into a total
 * that would look like earnings.
 */
export function EarningsWidget({ day }: { day: ProviderDay }) {
  const hasPayouts = day.earnings.length > 0;

  return (
    <Widget
      title="Earnings"
      icon={<Wallet aria-hidden="true" className="h-4 w-4" />}
      badge={day.provider.payoutVerified ? <span className={BADGE_SLATE}>Payouts verified</span> : <span className={BADGE_AMBER}>No payout account</span>}
      href={PROVIDER_PATHS.payouts}
      linkLabel="Payout account and history"
    >
      {!hasPayouts && day.awaitingFunding.length === 0 ? (
        <EmptyState title="Nothing owed yet">
          A payout is created when a funded job is completed and approved. Until then there is nothing
          to clear or to send.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {day.earnings.map(line => (
            <div key={line.currencyCode} className="rounded-xl border border-solid border-slate-200 p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Cleared ({line.currencyCode})
                </span>
                <span className="text-base font-extrabold tracking-tight text-slate-900">
                  {formatMoney(line.clearedMinor, line.currencyCode)}
                </span>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>On its way</dt>
                  <dd>{formatMoney(line.pendingMinor, line.currencyCode)}</dd>
                </div>
                {line.blockedMinor > 0 ? (
                  <div className="flex justify-between gap-3 font-semibold text-amber-800">
                    <dt>Blocked or failed</dt>
                    <dd>{formatMoney(line.blockedMinor, line.currencyCode)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}

          {day.awaitingFunding.map(line => (
            <div key={`unfunded-${line.currencyCode}`} className="rounded-xl border border-dashed border-solid border-slate-300 p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <Banknote aria-hidden="true" className="h-3.5 w-3.5" />
                  Awaiting customer payment
                </span>
                <span className="text-sm font-bold text-slate-700">
                  {formatMoney(line.amountMinor, line.currencyCode)}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                Work agreed but not yet funded. It is not owed to you until the payment obligation is
                funded, so it is not counted above.
              </p>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
