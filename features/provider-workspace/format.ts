/**
 * Formatting for the provider workspace.
 *
 * PURE AND SERVER-SAFE: nothing here imports the Supabase client, so a page can format money and
 * dates without dragging a request-scoped client into the module graph.
 *
 * WHY ITS OWN MONEY FORMATTER RATHER THAN THE CUSTOMER ONE. `components/customer/CustomerSections.tsx`
 * exports a `formatMoney` that is right for a customer reading a total they owe. The provider case
 * has a different requirement: an amount that never arrives is not zero. Every function here takes
 * `number | null` and renders "Quoted" or "Not funded" for null rather than ₦0.00, because ₦0.00 is
 * a number a provider would act on.
 */

export function formatMoney(minor: number | null, currency: string | null, fallback = '—'): string {
  if (minor === null || !Number.isFinite(minor)) return fallback;
  const code = currency ?? 'NGN';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    // An unknown currency code must not blank an amount: the number matters more than its symbol.
    return `${code} ${(minor / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * "Today", "Tomorrow", "Yesterday", then a weekday and date.
 *
 * Compared at local midnight rather than by subtracting 24 hours, because a 9am job tomorrow and a
 * 9am job today are 24 hours apart only twice a year.
 */
export function formatDayLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return null;

  const days = Math.round((startOfDay(then) - startOfDay(now)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(then);
}

/** The clock face in the timezone the provider scheduled in, so the time they set is the time shown. */
export function formatTime(iso: string | null, timezone: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(then);
  } catch {
    // An invalid timezone string in the row must not blank the appointment time.
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(then);
  }
}

/** "09:30–12:00", "09:30", or null when no time has been agreed yet. */
export function formatWindow(
  startIso: string | null,
  endIso: string | null,
  timezone: string | null,
): string | null {
  const start = formatTime(startIso, timezone);
  if (!start) return null;
  const end = formatTime(endIso, timezone);
  return end ? `${start}–${end}` : start;
}

/** A date for an expiry, with the distance from today made explicit where it matters. */
export function formatExpiry(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY);
  if (days < 0) return `${formatted} — expired`;
  if (days === 0) return `${formatted} — expires today`;
  if (days <= 60) return `${formatted} — in ${days} day${days === 1 ? '' : 's'}`;
  return formatted;
}
