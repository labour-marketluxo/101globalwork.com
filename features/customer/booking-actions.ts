'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bookingFailureFromMessage } from '@/features/customer/bookings';

/**
 * The customer's writes against a booking.
 *
 * EVERY ONE OF THESE POSTS TO A COMMAND THAT RE-DERIVES THE CALLER FROM `auth.uid()` and asserts ownership
 * inside the database. The checks here only decide which sentence the customer reads; they are not the guard.
 * A refusal is carried back as one of a fixed set of codes, never as the database's own text, because the
 * code travels in the query string and a reflected message would let anyone type a sentence into the
 * platform's own notice styling.
 */

const BOOKINGS_PATH = '/customer/bookings';

function back(codes: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(codes)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${BOOKINGS_PATH}?${query}` : BOOKINGS_PATH;
}

/**
 * A wall-clock time typed into a `datetime-local` field, read in the customer's own zone.
 *
 * ⚠️ THE OFFSET IS MEASURED, NOT ASSUMED. A `datetime-local` input carries no zone, so "09:00" means nothing
 * until something decides where. `zoneOffsetMs` asks `Intl` what the clock in that zone reads at a given
 * instant, and the conversion is run twice because the offset used to interpret the first guess can itself
 * change across a daylight-saving boundary. One pass is wrong by an hour for wall times inside that window;
 * two passes are right in every case this platform's markets produce (Nigeria has no DST, and the second pass
 * is what covers the ones that do).
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  // Some runtimes render midnight as hour 24 under hour12:false; Date.UTC would roll that into the next day.
  const hour = value('hour') === '24' ? '00' : value('hour');
  const asUtc = Date.UTC(
    Number(value('year')),
    Number(value('month')) - 1,
    Number(value('day')),
    Number(hour),
    Number(value('minute')),
    Number(value('second')),
  );
  return asUtc - date.getTime();
}

function wallTimeToInstant(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(guess)) return null;

  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  const parsed = new Date(instant);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function usableTimeZone(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: text });
    return text;
  } catch {
    return null;
  }
}

async function runCommand(
  fn: 'confirm_appointment_command' | 'propose_appointment_time_command' |
      'withdraw_appointment_proposal_command' | 'cancel_request_command',
  args: Record<string, unknown>,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message : null;
}

export async function confirmAppointmentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');

  const message = await runCommand('confirm_appointment_command', { p_assignment_id: assignmentId });
  if (message) redirect(back({ failed: bookingFailureFromMessage(message) }));
  redirect(back({ confirmed: '1' }));
}

export async function proposeAppointmentTimeAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const timeZone = usableTimeZone(String(formData.get('timezone') ?? ''));
  const message = String(formData.get('message') ?? '').trim();

  if (!timeZone) redirect(back({ failed: 'failed' }));

  const start = wallTimeToInstant(String(formData.get('proposed_start') ?? ''), timeZone);
  const endRaw = String(formData.get('proposed_end') ?? '').trim();
  const end = endRaw ? wallTimeToInstant(endRaw, timeZone) : null;
  if (!start || (endRaw && !end)) redirect(back({ failed: 'future_required' }));

  const failure = await runCommand('propose_appointment_time_command', {
    p_assignment_id: assignmentId,
    p_proposed_start: start,
    p_proposed_end: end,
    p_timezone: timeZone,
    p_message: message || null,
  });

  if (failure) redirect(back({ failed: bookingFailureFromMessage(failure) }));
  redirect(back({ proposed: '1' }));
}

export async function withdrawAppointmentProposalAction(formData: FormData) {
  const proposalId = String(formData.get('proposal_id') ?? '');

  const failure = await runCommand('withdraw_appointment_proposal_command', { p_proposal_id: proposalId });
  if (failure) redirect(back({ failed: bookingFailureFromMessage(failure) }));
  redirect(back({ proposed: 'withdrawn' }));
}

/**
 * Cancel a booking.
 *
 * ⚠️ THIS IS THE REQUEST'S CANCEL COMMAND, AND THAT IS THE HONEST MAPPING. There is no way to drop one
 * appointment and keep the job: the assignment is the unit of agreed work and `assignment_schedules` is a
 * single row beside it, so a "cancelled appointment" with a live assignment is a state this schema cannot
 * express. Cancelling the booking therefore cancels the job — and that command is the one that refuses when
 * money has already moved, which is the check that matters.
 */
export async function cancelBookingAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');

  const failure = await runCommand('cancel_request_command', {
    p_request_id: requestId,
    p_reason: String(formData.get('reason') ?? ''),
  });

  if (failure) redirect(back({ failed: bookingFailureFromMessage(failure) }));
  redirect(back({ cancelled: '1' }));
}
