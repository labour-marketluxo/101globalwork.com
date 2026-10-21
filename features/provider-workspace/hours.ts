/**
 * The week, and the shape of an operating-hours window.
 *
 * ⚠️ THIS IS ITS OWN MODULE BECAUSE BOTH SIDES OF THE CLIENT BOUNDARY NEED IT. An hours matrix is drawn by client
 * components (the availability editor, the public profile) and parsed by server ones (the profile read), and the
 * vocabulary is pure data — no database, no cookies. It lived in `profile.ts`, which imports the request-scoped
 * Supabase client, so importing the day names from there dragged `next/headers` into the browser bundle and the build
 * refused it. The fix is the split, not a looser import rule.
 *
 * ⚠️ NO "WEEKDAY" ASSUMPTION BEYOND THE NAMES: the week starts on Monday because the platform's own calendars do, and
 * nothing here hardcodes a working week — a provider who works Saturday and Sunday simply fills those rows in.
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OperatingHours = Partial<Record<Weekday, { open: string; close: string }>>;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
