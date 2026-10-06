import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock,
  List,
  MapPin,
  Pencil,
  RefreshCw,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  cancelBookingAction,
  confirmAppointmentAction,
  proposeAppointmentTimeAction,
  withdrawAppointmentProposalAction,
} from '@/features/customer/booking-actions';
import {
  BOOKING_FAILURE_COPY,
  BOOKING_STATUS_COPY,
  bookingFailureCode,
  formatInstant,
  formatTimeOnly,
  type Booking,
  type BookingStatus,
  type CalendarCell,
} from '@/features/customer/bookings';
import { formatMoney } from '@/features/customer/payments';

/**
 * The bookings surface: a month, a list, and the four things a customer can do about an appointment.
 *
 * ⚠️ EVERY TIME ON THIS PAGE IS RENDERED IN ONE ZONE, AND THE PAGE NAMES IT. A provider schedules in the
 * zone they typed; the customer reads in theirs. `timeZone` is resolved once by the page and passed down, and
 * anywhere the two disagree the card says so — an appointment shown in the wrong zone is a missed
 * appointment, and no amount of styling makes that better.
 */

const TONE_BADGE: Record<string, string> = {
  amber: BADGE_AMBER,
  slate: BADGE_SLATE,
  teal: 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase',
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const copy = BOOKING_STATUS_COPY[status];
  return <span className={TONE_BADGE[copy.tone] ?? BADGE_SLATE}>{copy.label}</span>;
}

export function BookingNotice({
  failed,
  confirmed,
  proposed,
  cancelled,
}: {
  failed?: string;
  confirmed?: string;
  proposed?: string;
  cancelled?: string;
}) {
  const code = bookingFailureCode(failed);

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p role="alert" className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          {BOOKING_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && confirmed ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Appointment confirmed. The provider sees your confirmation against this booking.
        </p>
      ) : null}
      {!code && proposed === '1' ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Time proposed. The provider sees the time you asked for on their copy of this job, and only they can
          move the booking — nothing has changed yet.
        </p>
      ) : null}
      {!code && proposed === 'withdrawn' ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Your proposed time was withdrawn.
        </p>
      ) : null}
      {!code && cancelled ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Booking cancelled. The request is closed and the assignment has ended.
        </p>
      ) : null}
    </div>
  );
}

/** Initials, not a photograph: the platform holds no provider images, and an empty avatar frame is worse. */
function ProviderAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-xs font-bold text-primary"
    >
      {initials}
    </span>
  );
}

function AppointmentTime({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  if (!booking.scheduledStart) {
    return (
      <p className="text-sm text-slate-500">
        No time agreed yet. The provider sets the appointment; you can ask for a time below.
      </p>
    );
  }

  const start = booking.scheduledStart;
  const end = booking.scheduledEnd;
  const providerZone = booking.scheduleTimezone;
  const differs = Boolean(providerZone && providerZone !== timeZone);

  return (
    <>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarClock aria-hidden="true" className="h-4 w-4 text-primary" />
        {formatInstant(start, timeZone)}
        {end ? ` – ${formatTimeOnly(end, timeZone)}` : ''}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        Shown in {timeZone}
        {differs ? ` — the provider scheduled this in ${providerZone}.` : '.'}
      </p>
    </>
  );
}

/**
 * One booking, with everything the brief asks a card to carry.
 *
 * The four actions are only offered where the database would accept them, and where it would not the card
 * says why instead of hiding the button — a missing control with no explanation reads as a bug.
 */
export function BookingCard({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  // Only the two states that are actually waiting on the customer offer a confirmation. A completed or
  // cancelled booking has nothing to confirm, and `bookingStatusOf` is what decides that, not this list.
  const canConfirm = ['pending', 'rescheduled'].includes(booking.status);
  const canPropose = ['pending', 'confirmed', 'rescheduled', 'unscheduled'].includes(booking.status);
  const cancellable = !['completed', 'cancelled'].includes(booking.status);
  const paymentHolds = booking.obligation
    ? ['funded', 'partially_refunded', 'refunded', 'disputed'].includes(booking.obligation.status)
    : false;

  return (
    <article id={`booking-${booking.assignmentId}`} className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderAvatar name={booking.providerName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{booking.providerName}</p>
            <Link
              href={`/customer/requests/${booking.requestId}`}
              className="mt-0.5 block truncate text-xs text-slate-500 no-underline hover:text-primary"
            >
              {booking.requestLabel}
            </Link>
          </div>
        </div>
        <BookingStatusPill status={booking.status} />
      </div>

      <div className="mt-4">
        <AppointmentTime booking={booking} timeZone={timeZone} />
      </div>

      <dl className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-2">
        <div>
          <dt className={LABEL}>Where</dt>
          <dd className="flex items-start gap-1.5 text-sm text-slate-800">
            <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              {booking.locationName ?? 'No area recorded'}
              {booking.landmark ? <span className="block text-xs text-slate-500">Near {booking.landmark}</span> : null}
            </span>
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Agreed price</dt>
          <dd className="text-sm text-slate-800">
            {booking.obligation
              ? formatMoney(booking.obligation.amountMinor, booking.obligation.currencyCode)
              : 'No payment recorded'}
            {booking.obligation ? (
              <span className="mt-0.5 block text-xs text-slate-500">
                payment {booking.obligation.status.replace(/_/g, ' ')}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {booking.accessNotes ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold">Getting in:</span> {booking.accessNotes}
        </p>
      ) : null}

      {booking.scheduleNote ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Provider&apos;s note: {booking.scheduleNote}</p>
      ) : null}

      {booking.proposal ? (
        <div className="mt-3 rounded-xl border border-solid border-amber-300 bg-secondary-light px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-900">
            You have asked for {formatInstant(booking.proposal.start, timeZone)}
            {booking.proposal.end ? ` – ${formatTimeOnly(booking.proposal.end, timeZone)}` : ''}
          </p>
          {booking.proposal.message ? (
            <p className="mt-1 text-xs leading-relaxed text-amber-900/90">{booking.proposal.message}</p>
          ) : null}
          <p className="mt-1 text-xs text-amber-900/80">
            Waiting on the provider. Only they can move the booking, so nothing has changed yet.
          </p>
          <form action={withdrawAppointmentProposalAction} className="mt-2">
            <input type="hidden" name="proposal_id" value={booking.proposal.id} />
            <button type="submit" className="text-xs font-semibold text-amber-900 underline hover:text-amber-950">
              Withdraw this time
            </button>
          </form>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-4">
        {canConfirm ? (
          <form action={confirmAppointmentAction}>
            <input type="hidden" name="assignment_id" value={booking.assignmentId} />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
            >
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
              Confirm appointment
            </button>
          </form>
        ) : null}

        <Link href={`/requests/${booking.requestId}`} className={LINK_ARROW}>
          Open project
        </Link>
        {booking.providerSlug ? (
          <Link href={`/providers/${booking.providerSlug}`} className={LINK_ARROW}>
            Provider profile
          </Link>
        ) : null}
      </div>

      {canPropose ? (
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Propose a different time
          </summary>
          <form action={proposeAppointmentTimeAction} className="mt-3 space-y-3">
            <input type="hidden" name="assignment_id" value={booking.assignmentId} />
            <input type="hidden" name="timezone" value={timeZone} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor={`start-${booking.assignmentId}`}>
                  Start
                </label>
                <input
                  id={`start-${booking.assignmentId}`}
                  name="proposed_start"
                  type="datetime-local"
                  required
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor={`end-${booking.assignmentId}`}>
                  Expected finish <span className="font-normal normal-case">(optional)</span>
                </label>
                <input
                  id={`end-${booking.assignmentId}`}
                  name="proposed_end"
                  type="datetime-local"
                  className={FIELD}
                />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor={`note-${booking.assignmentId}`}>
                Anything the provider should know
              </label>
              <textarea
                id={`note-${booking.assignmentId}`}
                name="message"
                rows={2}
                maxLength={1000}
                className={FIELD}
                placeholder="e.g. Mornings are easier — the shop is closed after 4pm."
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Times are read as {timeZone}. This asks for a time; it does not book one. Only the provider can
              move the appointment, and the booking stays as it is until they do.
            </p>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              Send this time to the provider
            </button>
          </form>
        </details>
      ) : null}

      {cancellable ? (
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
            Cancel this booking
          </summary>
          <form action={cancelBookingAction} className="mt-3 space-y-3">
            <input type="hidden" name="request_id" value={booking.requestId} />
            <div>
              <label className={LABEL} htmlFor={`cancel-${booking.assignmentId}`}>
                Why are you cancelling?
              </label>
              <textarea
                id={`cancel-${booking.assignmentId}`}
                name="reason"
                rows={3}
                required
                minLength={10}
                maxLength={2000}
                className={FIELD}
                placeholder="e.g. The work is no longer needed."
              />
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                {paymentHolds
                  ? 'Money has already been paid against this job, so this will be refused: a refund has to be raised by the platform team. Ask from the payment page instead.'
                  : 'This cancels the whole job, not just the time — there is no way here to drop one appointment and keep the work. The provider is told, and any quote still open is closed with it.'}
              </span>
            </p>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
              Cancel the booking
            </button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

/**
 * The month.
 *
 * ⚠️ THE GRID IS LINKS, NOT A CLIENT COMPONENT. Moving between months is a `?month=` parameter and each day
 * anchors to the booking below it, so the calendar survives a reload, a share and the back button, and it
 * works with no JavaScript at all. Nothing here needs a date picker: there are two weeks either side of the
 * current month and the arrows reach them.
 */
export function BookingCalendar({
  cells,
  bookingsByDate,
  timeZone,
  todayKey,
  view,
}: {
  cells: CalendarCell[];
  bookingsByDate: Map<string, Booking[]>;
  timeZone: string;
  todayKey: string;
  view: 'calendar' | 'list';
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="grid grid-cols-7 border-b border-solid border-slate-200">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div
            key={day}
            className="px-2 py-2 text-center font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(cell => {
          const bookings = bookingsByDate.get(cell.dateKey) ?? [];
          const isToday = cell.dateKey === todayKey;
          return (
            <div
              key={cell.dateKey}
              className={`min-h-[5.5rem] border-r border-b border-solid border-slate-100 p-1.5 last:border-r-0 ${
                cell.inMonth ? 'bg-white' : 'bg-slate-50'
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  isToday
                    ? 'bg-primary text-white'
                    : cell.inMonth
                      ? 'text-slate-700'
                      : 'text-slate-400'
                }`}
              >
                {cell.day}
              </span>
              <ul className="mt-1 space-y-1">
                {bookings.map(booking => (
                  <li key={booking.assignmentId}>
                    <Link
                      href={`/customer/bookings?view=${view}&month=${cell.dateKey.slice(0, 7)}#booking-${booking.assignmentId}`}
                      className="block truncate rounded bg-primary-subtle px-1.5 py-1 text-[11px] font-semibold text-primary no-underline hover:bg-primary hover:text-white"
                      title={`${booking.providerName} — ${booking.scheduledStart ? formatTimeOnly(booking.scheduledStart, timeZone) : ''}`}
                    >
                      {booking.scheduledStart
                        ? `${formatTimeOnly(booking.scheduledStart, timeZone)} ${booking.providerName}`
                        : booking.providerName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The month controls, and the switch between the two views the brief asks for. */
export function BookingControls({
  label,
  previousMonth,
  nextMonth,
  view,
}: {
  label: string;
  previousMonth: string;
  nextMonth: string;
  view: 'calendar' | 'list';
}) {
  const link = (month: string, nextView: 'calendar' | 'list') =>
    `/customer/bookings?view=${nextView}&month=${month}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Link href={link(previousMonth, view)} className={LINK_ARROW} aria-label="Previous month">
          ←
        </Link>
        <span className="font-mono text-xs font-bold tracking-wider text-slate-700 uppercase">{label}</span>
        <Link href={link(nextMonth, view)} className={LINK_ARROW} aria-label="Next month">
          →
        </Link>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        <Link
          href={link(previousMonth, 'calendar')}
          aria-current={view === 'calendar' ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold no-underline transition-colors ${
            view === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
          Calendar
        </Link>
        <Link
          href={link(previousMonth, 'list')}
          aria-current={view === 'list' ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold no-underline transition-colors ${
            view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <List aria-hidden="true" className="h-3.5 w-3.5" />
          List
        </Link>
      </div>
    </div>
  );
}

export function BookingGroup({
  title,
  blurb,
  bookings,
  timeZone,
}: {
  title: string;
  blurb: string;
  bookings: Booking[];
  timeZone: string;
}) {
  if (bookings.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{blurb}</p>
      </div>
      {bookings.map(booking => (
        <BookingCard key={booking.assignmentId} booking={booking} timeZone={timeZone} />
      ))}
    </section>
  );
}

export function BookingEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-solid border-slate-300 bg-white px-6 py-12 text-center">
      <Clock aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
      <h2 className="mt-3 text-base font-bold text-slate-900">No bookings yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
        A booking appears here once a provider you chose sets a time for the work. Accepting a quote creates the
        job; setting the appointment is the next step, and it is theirs to propose and yours to confirm.
      </p>
      <Link href="/customer/requests" className={`${LINK_ARROW} mt-4`}>
        Open your requests
      </Link>
    </div>
  );
}
