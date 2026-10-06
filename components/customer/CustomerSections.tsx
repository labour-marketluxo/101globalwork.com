import Link from 'next/link';
import { ArrowRight, CalendarClock, CircleAlert, FileText, MessageSquareQuote, Wallet } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, CTA_AMBER, LINK_ARROW } from '@/components/discovery/tokens';
import { CUSTOMER_PATHS, requestReference } from '@/features/customer/intake';
import type { ActiveRequest, CustomerDashboard, PaymentDue, QuoteAwaitingReview, ScheduledWork } from '@/features/customer/requests';

/**
 * The customer dashboard's pieces — all server components.
 *
 * THE FOUR CARDS ARE DERIVED, NOT FETCHED SEPARATELY. `getCustomerDashboard` reads four tables once and
 * returns the four groups this file renders, so a card cannot show a number that disagrees with the
 * list under it.
 *
 * ⚠️ "UPCOMING BOOKINGS" IS THE ONE CARD THAT CAN BE HONESTLY EMPTY MOST OF THE TIME. Scheduling is
 * written when a provider accepts a quote (`assignment_schedules`, one current row per assignment), so
 * a customer with requests in matching has nothing here — and the card says that rather than showing a
 * spinner or an invented placeholder.
 */

export function formatMoney(minor: number, currency: string | null): string {
  const code = currency ?? 'NGN';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    // An unknown currency code must not blank a payment: the amount matters more than its symbol.
    return `${code} ${(minor / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }
}

function StatusPill({ pill }: { pill: ActiveRequest['pill'] }) {
  const cls =
    pill.tone === 'amber'
      ? 'bg-secondary-light text-amber-800'
      : pill.tone === 'teal'
        ? 'bg-primary-subtle text-primary'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider uppercase ${cls}`}>
      {pill.label}
    </span>
  );
}

function SectionCard({
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

/** The hero: greeting, and the one input the whole flow starts from. */
export function CustomerHero({ firstName }: { firstName: string | null }) {
  return (
    <section className="rounded-2xl border border-solid border-primary/10 bg-primary-surface p-6 sm:p-8">
      <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </p>
      <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        What do you need done today?
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Describe it in your own words. The next steps ask only what a provider needs to quote it, and
        nothing is sent to anybody until you submit at the end.
      </p>

      {/* A GET form, deliberately: the first step is a page that reads `?q=`, so the intent survives a
          reload, a bookmark and a shared link without any client state. */}
      <form action={CUSTOMER_PATHS.newRequest} method="get" className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="intent-quick" className="sr-only">
          What do you need done today?
        </label>
        <input
          id="intent-quick"
          name="q"
          type="text"
          maxLength={400}
          placeholder="e.g. The kitchen tap has been dripping for a week"
          className="w-full flex-1 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        />
        <button type="submit" className={`${CTA_AMBER} justify-center`}>
          Start New Request
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

/** The guided banner a customer with no requests at all sees instead of four empty cards. */
export function NewCustomerBanner() {
  return (
    <section className="rounded-2xl border border-solid border-secondary bg-secondary-light p-6">
      <h2 className="text-base font-bold tracking-tight text-amber-900">Start with one request</h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-amber-900">
        Nothing is on your account yet, so here is the whole journey: describe the work, answer a few
        scoping questions, say where and when, then submit. Providers who pass verification can then
        quote it, and you compare itemized quotes before anything is agreed.
      </p>
      <Link href={CUSTOMER_PATHS.newRequest} className="mt-4 inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-sm font-bold tracking-wide text-primary-deep uppercase no-underline shadow-sm transition-colors hover:bg-amber-500">
        Create your first request
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function ActionRequiredBanner({
  paymentsDue,
  awaitingApproval,
}: {
  paymentsDue: PaymentDue[];
  awaitingApproval: ActiveRequest[];
}) {
  if (paymentsDue.length === 0 && awaitingApproval.length === 0) return null;

  const outstanding = paymentsDue.reduce(
    (totals, payment) => {
      totals[payment.currencyCode] = (totals[payment.currencyCode] ?? 0) + payment.amountMinor;
      return totals;
    },
    {} as Record<string, number>,
  );

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
        <div className="text-sm leading-relaxed text-amber-900">
          <p className="font-bold">Action needed on {paymentsDue.length + awaitingApproval.length} item{paymentsDue.length + awaitingApproval.length === 1 ? '' : 's'}.</p>
          {paymentsDue.length > 0 ? (
            <p className="mt-1">
              {formatMoney(Object.values(outstanding)[0] ?? 0, Object.keys(outstanding)[0])} is waiting to be paid
              {paymentsDue.length > 1 ? ` across ${paymentsDue.length} requests` : ''}. Payment is completed on the
              request page, which shows exactly what you are paying for.
            </p>
          ) : null}
          {awaitingApproval.length > 0 ? (
            <p className="mt-1">
              {awaitingApproval.length} job{awaitingApproval.length === 1 ? '' : 's'} reported complete and waiting for
              your approval. Money moves only when you agree the work is done.
            </p>
          ) : null}
        </div>
      </div>

      {paymentsDue.length > 0 ? (
        <Link
          href={`/customer/payments/${paymentsDue[0].obligationId}/checkout`}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-secondary px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-primary-deep uppercase no-underline transition-colors hover:bg-amber-500"
        >
          Pay Due Amount
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function ActiveRequestsCard({ requests }: { requests: ActiveRequest[] }) {
  return (
    <SectionCard
      title="Active requests & projects"
      icon={<FileText aria-hidden="true" className="h-4 w-4" />}
      badge={<span className={BADGE_SLATE}>{requests.length}</span>}
      href={requests.length > 0 ? `/customer/requests/${requests[0].id}` : undefined}
      linkLabel={requests.length > 0 ? 'Open the most recent' : undefined}
    >
      {requests.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500">
          Nothing in progress. A request appears here the moment it is submitted.
        </p>
      ) : (
        <ul className="grid gap-3">
          {requests.slice(0, 4).map(request => (
            <li key={request.id} className="rounded-lg border border-solid border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/customer/requests/${request.id}`} className="text-sm font-semibold text-slate-900 no-underline hover:text-primary">
                  {request.needText.length > 60 ? `${request.needText.slice(0, 57)}…` : request.needText}
                </Link>
                <StatusPill pill={request.pill} />
              </div>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                {requestReference(request.id)}
                {request.serviceName ? ` · ${request.serviceName}` : ''}
                {request.locationName ? ` · ${request.locationName}` : ''}
                {request.urgency !== 'normal' ? ` · ${request.urgency.replace('_', ' ')}` : ''}
              </p>
              {request.nextAction ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">{request.nextAction.label}.</span> {request.nextAction.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function QuotesCard({ quotes }: { quotes: QuoteAwaitingReview[] }) {
  return (
    <SectionCard
      title="Quotes awaiting review"
      icon={<MessageSquareQuote aria-hidden="true" className="h-4 w-4" />}
      badge={
        quotes.length > 0 ? (
          <span className={BADGE_AMBER}>{quotes.length} new</span>
        ) : (
          <span className={BADGE_SLATE}>none</span>
        )
      }
    >
      {quotes.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500">
          No quotes waiting. Quotes appear here when a provider submits one against your request, and
          each one is itemized — you are comparing prices for the same scope, not a single number.
        </p>
      ) : (
        <ul className="grid gap-3">
          {quotes.slice(0, 4).map(quote => (
            <li key={quote.quoteId} className="rounded-lg border border-solid border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/customer/requests/${quote.requestId}/quotes`} className="text-sm font-semibold text-slate-900 no-underline hover:text-primary">
                  {quote.requestLabel}
                </Link>
                {quote.totalMinor !== null ? (
                  <span className="font-sans text-sm font-bold text-slate-900">
                    {formatMoney(quote.totalMinor, quote.currencyCode)}
                  </span>
                ) : (
                  <span className={BADGE_SLATE}>itemized only</span>
                )}
              </div>
              {quote.summary ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {quote.summary.length > 120 ? `${quote.summary.slice(0, 117)}…` : quote.summary}
                </p>
              ) : null}
              {quote.validUntil ? (
                <p className="mt-1 font-sans text-[11px] text-slate-500">
                  Valid until {new Date(quote.validUntil).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function ScheduledCard({ scheduled }: { scheduled: ScheduledWork[] }) {
  return (
    <SectionCard
      title="Upcoming bookings & scheduled work"
      icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
      badge={<span className={BADGE_SLATE}>{scheduled.length}</span>}
    >
      {scheduled.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500">
          Nothing scheduled yet. A time appears here once you accept a quote and agree a slot with the
          provider — scheduling happens with the provider, not on this page.
        </p>
      ) : (
        <ul className="grid gap-3">
          {scheduled.map(item => (
            <li key={item.assignmentId} className="rounded-lg border border-solid border-slate-200 p-3">
              <Link
                href={`/customer/bookings#booking-${item.assignmentId}`}
                className="text-sm font-semibold text-slate-900 no-underline hover:text-primary"
              >
                {item.requestLabel}
              </Link>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                {item.scheduledStart
                  ? new Date(item.scheduledStart).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Time not agreed yet'}
                {item.scheduledEnd ? ` – ${new Date(item.scheduledEnd).toLocaleTimeString('en-GB', { timeStyle: 'short' })}` : ''}
              </p>
              {item.note ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function PaymentsCard({ payments }: { payments: PaymentDue[] }) {
  return (
    <SectionCard
      title="Pending payments"
      icon={<Wallet aria-hidden="true" className="h-4 w-4" />}
      badge={payments.length > 0 ? <span className={BADGE_AMBER}>{payments.length} due</span> : <span className={BADGE_SLATE}>clear</span>}
    >
      {payments.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500">
          Nothing owed. Payment is released against approved work, so an unapproved job never shows a
          balance here.
        </p>
      ) : (
        <ul className="grid gap-3">
          {payments.map(payment => (
            <li key={payment.obligationId} className="rounded-lg border border-solid border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Straight to the payment, not the request: the next thing this customer has to do is pay,
                    and the payment page is where that happens now. */}
                <Link
                  href={`/customer/payments/${payment.obligationId}/checkout`}
                  className="text-sm font-semibold text-slate-900 no-underline hover:text-primary"
                >
                  {payment.requestLabel}
                </Link>
                <span className="font-sans text-sm font-bold text-slate-900">
                  {formatMoney(payment.amountMinor, payment.currencyCode)}
                </span>
              </div>
              <p className="mt-1 font-sans text-[11px] text-slate-500">
                {payment.status === 'funding' ? 'Payment started, not confirmed' : 'Awaiting payment'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * The Suspense fallback.
 *
 * Shaped like the grid it replaces — the hero, then four cards — so the page does not jump when the
 * reads land. `motion-reduce:animate-none` because a pulsing placeholder is motion.
 */
export function DashboardSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <div className="h-44 animate-pulse rounded-2xl border border-solid border-slate-200 bg-white motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map(index => (
          <div key={index} className="h-56 animate-pulse rounded-xl border border-solid border-slate-200 bg-white motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

/** Rendered when the reads failed. "We could not check" and "you have nothing" are different answers. */
export function DashboardUnavailable() {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4 text-sm leading-relaxed text-amber-900">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      <p>
        Your requests could not be loaded, so this page cannot tell you what is in progress. That is
        not the same as there being nothing — reload to try again.
      </p>
    </div>
  );
}

export function DashboardGrid({ data }: { data: CustomerDashboard }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ActiveRequestsCard requests={data.active} />
      <QuotesCard quotes={data.quotesAwaitingReview} />
      <ScheduledCard scheduled={data.scheduled} />
      <PaymentsCard payments={data.paymentsDue} />
    </div>
  );
}
