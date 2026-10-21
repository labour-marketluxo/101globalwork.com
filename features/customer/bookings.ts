import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The customer's bookings — the appointments that exist because a quote was accepted.
 *
 * ⚠️ A BOOKING IS AN ASSIGNMENT, NOT A CALENDAR ROW. There is no `bookings` table and this module does not
 * invent one: the unit of agreed work is the assignment, and its appointment is the single
 * `assignment_schedules` row beside it. That matters for the status pill. "Cancelled" is not a property of a
 * calendar entry — there is no way to cancel one slot and keep the job, because an assignment with no time
 * is a state this schema cannot express. Cancelling a booking therefore means cancelling the request, and
 * the page says so rather than offering a button that would only delete a date.
 *
 * ⚠️ THE STATUS IS DERIVED, NOT STORED. `customer_status` on the schedule records only the customer's own
 * answer (proposed / confirmed / rescheduled). What the pill shows folds in the assignment's lifecycle, so a
 * confirmed appointment on a completed job reads "Completed" rather than "Confirmed" — the derivation lives
 * here so the calendar and the list cannot disagree about the same booking.
 */

export type BookingStatus = 'unscheduled' | 'pending' | 'confirmed' | 'rescheduled' | 'completed' | 'cancelled';

export type OpenProposal = {
  id: string;
  start: string;
  end: string | null;
  timezone: string;
  message: string | null;
  createdAt: string;
};

export type Booking = {
  assignmentId: string;
  requestId: string;
  requestLabel: string;
  requestState: string;
  assignmentStatus: string;
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  /** The area the work is in, from the request. The platform holds no street address. */
  locationName: string | null;
  landmark: string | null;
  accessNotes: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  /** The timezone the provider scheduled in, as it was typed. */
  scheduleTimezone: string | null;
  scheduleNote: string | null;
  confirmedAt: string | null;
  rescheduledAt: string | null;
  status: BookingStatus;
  proposal: OpenProposal | null;
  obligation: { id: string; status: string; amountMinor: number; currencyCode: string } | null;
};

type BookingRpcRow = {
  assignment_id: string;
  request_id: string;
  request_label: string;
  request_state: string;
  assignment_status: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  location_name: string | null;
  landmark: string | null;
  access_notes: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  schedule_timezone: string | null;
  schedule_note: string | null;
  schedule_status: string;
  confirmed_at: string | null;
  rescheduled_at: string | null;
  proposal_id: string | null;
  proposal_start: string | null;
  proposal_end: string | null;
  proposal_timezone: string | null;
  proposal_message: string | null;
  proposal_created_at: string | null;
  obligation_id: string | null;
  obligation_status: string | null;
  amount_minor: number | string | null;
  currency_code: string | null;
};

export function bookingStatusOf(row: {
  assignmentStatus: string;
  status: string;
  scheduledStart: string | null;
}): BookingStatus {
  if (row.assignmentStatus === 'cancelled' || row.status === 'cancelled') return 'cancelled';
  if (row.assignmentStatus === 'completed') return 'completed';
  if (!row.scheduledStart) return 'unscheduled';
  if (row.status === 'confirmed') return 'confirmed';
  if (row.status === 'rescheduled') return 'rescheduled';
  return 'pending';
}

export const BOOKING_STATUS_COPY: Record<BookingStatus, { label: string; tone: 'amber' | 'teal' | 'slate' }> = {
  unscheduled: { label: 'No time agreed yet', tone: 'slate' },
  pending: { label: 'Waiting for you', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'teal' },
  rescheduled: { label: 'Rescheduled', tone: 'amber' },
  completed: { label: 'Completed', tone: 'teal' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export async function getCustomerBookings(): Promise<{ bookings: Booking[]; unavailable: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_bookings');
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read bookings: ${error.message}`);
    }
    return { bookings: [], unavailable: true };
  }

  const bookings = ((data ?? []) as BookingRpcRow[]).map(row => {
    const booking: Booking = {
      assignmentId: row.assignment_id,
      requestId: row.request_id,
      requestLabel: row.request_label,
      requestState: row.request_state,
      assignmentStatus: row.assignment_status,
      providerId: row.provider_id,
      providerName: row.provider_name,
      providerSlug: row.provider_slug,
      locationName: row.location_name,
      landmark: row.landmark,
      accessNotes: row.access_notes,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      scheduleTimezone: row.schedule_timezone,
      scheduleNote: row.schedule_note,
      confirmedAt: row.confirmed_at,
      rescheduledAt: row.rescheduled_at,
      status: 'pending',
      proposal:
        row.proposal_id && row.proposal_start
          ? {
              id: row.proposal_id,
              start: row.proposal_start,
              end: row.proposal_end,
              timezone: row.proposal_timezone ?? 'UTC',
              message: row.proposal_message,
              createdAt: row.proposal_created_at ?? row.proposal_start,
            }
          : null,
      obligation: row.obligation_id
        ? {
            id: row.obligation_id,
            status: row.obligation_status ?? 'pending',
            amountMinor: Number(row.amount_minor ?? 0),
            currencyCode: row.currency_code ?? 'NGN',
          }
        : null,
    };
    booking.status = bookingStatusOf({
      assignmentStatus: booking.assignmentStatus,
      status: row.schedule_status,
      scheduledStart: booking.scheduledStart,
    });
    return booking;
  });

  return { bookings, unavailable: false };
}

/**
 * The timezone the customer reads times in.
 *
 * ⚠️ NEVER A GUESS. `profiles.timezone` is what the account declared; the provider's scheduling timezone is
 * the fallback, because a booking with a time in it is better read in the zone it was made in than in
 * whatever the server's clock is set to. If neither is usable the answer is UTC and the page says so — an
 * unlabelled time in the wrong zone is a missed appointment.
 */
export function resolveDisplayTimeZone(candidates: (string | null | undefined)[]): {
  timeZone: string;
  assumed: boolean;
} {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: candidate });
      return { timeZone: candidate, assumed: false };
    } catch {
      // Not a zone this runtime recognises; try the next one rather than failing the page.
    }
  }
  return { timeZone: 'UTC', assumed: true };
}

export async function getCustomerTimeZone(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account?.id) return null;
  const { data: profile } = await supabase.from('profiles').select('timezone').eq('account_id', account.id).maybeSingle();
  return profile?.timezone ?? null;
}

export function formatInstant(instant: string, timeZone: string): string {
  return new Date(instant).toLocaleString('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeOnly(instant: string, timeZone: string): string {
  return new Date(instant).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
}

/** The calendar date an instant falls on, in the reader's zone — not in the server's. */
export function dateKeyInZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayKeyInZone(timeZone: string): string {
  return dateKeyInZone(new Date().toISOString(), timeZone);
}

export type CalendarCell = { dateKey: string; day: number; inMonth: boolean };

/**
 * A month laid out in weeks, Monday first, padded to whole weeks.
 *
 * The arithmetic is on plain `YYYY-MM-DD` strings and UTC midnights rather than on local `Date`s: a month grid
 * built from local dates shifts by a day for a reader whose zone is behind the server's, which is the classic
 * way a calendar shows a booking on the wrong square.
 */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];

  // Days before the 1st, so the first row starts on a Monday.
  for (let offset = firstWeekday; offset > 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - offset));
    cells.push({ dateKey: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ dateKey: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10), day, inMonth: true });
  }
  // Days after the last, until the final row is full. `Date.UTC(year, month, n)` is the nth day of the NEXT
  // month because the month index is zero-based.
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(Date.UTC(year, month, trailing));
    cells.push({ dateKey: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: false });
    trailing += 1;
  }
  return cells;
}

export function parseMonthParam(value: string | undefined, fallback: { year: number; month: number }): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return fallback;
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  return { year: nextYear, month: nextMonth + 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Failure vocabulary for the booking actions — fixed, because it travels in the query string.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const BOOKING_FAILURES = [
  'not_found',
  'not_authorized',
  'no_appointment',
  'past',
  'closed',
  'already_confirmed',
  'not_waiting',
  'money_moved',
  'future_required',
  'too_short',
  'failed',
] as const;
export type BookingFailure = (typeof BOOKING_FAILURES)[number];

export const BOOKING_FAILURE_COPY: Record<BookingFailure, string> = {
  not_found: 'That booking is no longer on your account.',
  not_authorized: 'That is not yours to change. Sign in again if you were signed in as somebody else.',
  no_appointment: 'There is no appointment to confirm yet — the provider has not set a time.',
  past: 'That time has already passed, so it cannot be confirmed.',
  closed: 'This job is closed, so its booking cannot be changed any more.',
  already_confirmed: 'This appointment is already confirmed.',
  not_waiting:
    'This booking is not waiting for your confirmation — the provider has not set a time yet, or the work has already moved on.',
  money_moved:
    'Money has already been paid against this job. Cancelling it now would need a refund, which the platform team has to raise — open the payment and ask from there.',
  future_required: 'A new time has to be in the future.',
  too_short: 'Add a sentence or two so the provider knows what you need.',
  failed: 'That did not work, and nothing was changed. Try again.',
};

export function bookingFailureCode(value: string | undefined | null): BookingFailure | null {
  if (!value) return null;
  return (BOOKING_FAILURES as readonly string[]).includes(value) ? (value as BookingFailure) : null;
}

export function bookingFailureFromMessage(message: string): BookingFailure {
  const text = message.toLowerCase();
  if (text.includes('no appointment')) return 'no_appointment';
  if (text.includes('already passed')) return 'past';
  if (text.includes('not authorized')) return 'not_authorized';
  if (text.includes('not found') || text.includes('no longer exists')) return 'not_found';
  if (text.includes('already confirmed')) return 'already_confirmed';
  if (text.includes('no longer waiting')) return 'not_waiting';
  if (text.includes('money has already')) return 'money_moved';
  if (text.includes('must be in the future') || text.includes('finish must be after')) return 'future_required';
  if (text.includes('can no longer') || text.includes('is closed')) return 'closed';
  if (text.includes('sentence') || text.includes('say what')) return 'too_short';
  return 'failed';
}
