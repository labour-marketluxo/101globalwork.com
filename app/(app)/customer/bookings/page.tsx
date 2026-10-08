import Link from 'next/link';
import { Info } from '@/components/ui/icons';
import { CARD, LINK_ARROW } from '@/components/discovery/tokens';
import WorkspaceHero from '@/components/customer/WorkspaceHero';
import {
  BookingCalendar,
  BookingControls,
  BookingEmpty,
  BookingGroup,
  BookingNotice,
} from '@/components/customer/BookingSections';
import {
  dateKeyInZone,
  getCustomerBookings,
  getCustomerTimeZone,
  monthGrid,
  monthLabel,
  parseMonthParam,
  resolveDisplayTimeZone,
  shiftMonth,
  todayKeyInZone,
  type Booking,
} from '@/features/customer/bookings';

export const metadata = {
  title: 'Bookings',
  robots: { index: false, follow: false },
};

type Params = {
  view?: string;
  month?: string;
  failed?: string;
  confirmed?: string;
  proposed?: string;
  cancelled?: string;
};

/**
 * Bookings and schedule — `/customer/bookings`.
 *
 * ⚠️ BOTH VIEWS ARE SERVER-RENDERED AND THE STATE IS IN THE URL. `?view=calendar|list` and `?month=YYYY-MM`
 * mean the page survives a reload, a shared link and the back button, and works with JavaScript switched off.
 * The calendar is a month of links rather than a date-picker widget, because the only thing it has to answer
 * is "which day is this job on", and a widget that needs a client bundle to answer that is a poor trade.
 *
 * ⚠️ ONE TIMEZONE FOR THE WHOLE PAGE, NAMED ON THE PAGE. The account's own zone comes first, then the zone a
 * provider scheduled in, then UTC — and when it falls through to UTC the page says so. A grid of days cannot
 * be drawn in several zones at once, so the choice is made once, here, and every card says when it differs
 * from the provider's.
 */
export default async function CustomerBookingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const query = await searchParams;
  const { bookings, unavailable } = await getCustomerBookings();
  const profileTimeZone = await getCustomerTimeZone();

  const { timeZone, assumed } = resolveDisplayTimeZone([
    profileTimeZone,
    ...bookings.map(booking => booking.scheduleTimezone),
    ...bookings.map(booking => booking.proposal?.timezone),
  ]);

  const today = todayKeyInZone(timeZone);
  const fallbackMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const month = parseMonthParam(query.month, fallbackMonth);
  const view: 'calendar' | 'list' = query.view === 'list' ? 'list' : 'calendar';
  const previous = shiftMonth(month.year, month.month, -1);
  const next = shiftMonth(month.year, month.month, 1);

  const cells = monthGrid(month.year, month.month);
  const bookingsByDate = new Map<string, Booking[]>();
  for (const booking of bookings) {
    if (!booking.scheduledStart) continue;
    const key = dateKeyInZone(booking.scheduledStart, timeZone);
    bookingsByDate.set(key, [...(bookingsByDate.get(key) ?? []), booking]);
  }

  // ⚠️ MATCHED ON THE DATE IN THE READER'S ZONE, NOT ON THE ISO STRING. A booking at 23:30 UTC on the 31st is
  // the 1st for a reader in Lagos, and slicing the UTC timestamp would file it under the wrong month.
  const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`;
  const monthBookings = bookings.filter(
    booking => booking.scheduledStart && dateKeyInZone(booking.scheduledStart, timeZone).startsWith(monthKey),
  );

  // The list is split by what the customer has to do, which is the only grouping that changes behaviour.
  const needsAnswer = bookings.filter(booking => ['pending', 'rescheduled'].includes(booking.status));
  const confirmed = bookings.filter(booking => booking.status === 'confirmed');
  const unscheduled = bookings.filter(booking => booking.status === 'unscheduled');
  const past = bookings.filter(booking => ['completed', 'cancelled'].includes(booking.status));

  return (
    <section>
      <WorkspaceHero
        eyebrow="Bookings"
        title="Bookings & schedule"
        description="The appointments for work you have agreed. A provider sets the time; you confirm it. If it does not suit you, propose another one — only the provider can move a booking, so yours is a request until they accept it."
      />

      <BookingNotice
        failed={query.failed}
        confirmed={query.confirmed}
        proposed={query.proposed}
        cancelled={query.cancelled}
      />

      <div className="mb-6 space-y-2">
        <p className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Times shown in {timeZone}
        </p>
        {assumed ? (
          <p className="flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-xs leading-relaxed text-amber-900">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your account has not recorded a timezone, and neither has any provider on these bookings, so times
              are shown in UTC. Add a timezone in{' '}
              <Link href="/settings" className={LINK_ARROW}>
                settings
              </Link>{' '}
              and they will be shown in your own.
            </span>
          </p>
        ) : null}
      </div>

      {unavailable ? (
        <p role="alert" className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          Your bookings could not be read just now. This is a read failure, not an empty account — reload in a
          moment.
        </p>
      ) : bookings.length === 0 ? (
        <BookingEmpty />
      ) : (
        <div className="space-y-6">
          <BookingControls
            label={monthLabel(month.year, month.month)}
            previousMonth={`${previous.year}-${String(previous.month).padStart(2, '0')}`}
            nextMonth={`${next.year}-${String(next.month).padStart(2, '0')}`}
            view={view}
          />

          {view === 'calendar' ? (
            <>
              <BookingCalendar
                cells={cells}
                bookingsByDate={bookingsByDate}
                timeZone={timeZone}
                todayKey={today}
                view={view}
              />
              <section className={`${CARD} p-5`}>
                <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  In {monthLabel(month.year, month.month)}
                </h2>
                {monthBookings.length === 0 ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Nothing is booked in this month. Use the arrows to look at another, or switch to the list to
                    see every booking including the ones with no time yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {monthBookings.map(booking => (
                      <li key={booking.assignmentId} className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm text-slate-700">
                          {booking.scheduledStart
                            ? dateKeyInZone(booking.scheduledStart, timeZone) === today
                              ? 'Today · '
                              : `${dateKeyInZone(booking.scheduledStart, timeZone)} · `
                            : ''}
                          {booking.providerName}
                        </span>
                        <a href={`#booking-${booking.assignmentId}`} className={LINK_ARROW}>
                          Open the card
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          <div className="space-y-8">
            <BookingGroup
              title="Waiting for your answer"
              blurb="A provider has set a time, or moved one you had already confirmed. Nothing is agreed until you confirm it."
              bookings={needsAnswer}
              timeZone={timeZone}
            />
            <BookingGroup
              title="Confirmed"
              blurb="You have confirmed these. If the provider moves one, it comes back to the list above."
              bookings={confirmed}
              timeZone={timeZone}
            />
            <BookingGroup
              title="No time agreed yet"
              blurb="The job is agreed but the provider has not set an appointment. You can propose a time."
              bookings={unscheduled}
              timeZone={timeZone}
            />
            <BookingGroup
              title="Past & closed"
              blurb="Completed and cancelled jobs. They stay here because the record of what was booked is useful."
              bookings={past}
              timeZone={timeZone}
            />
          </div>
        </div>
      )}
    </section>
  );
}
