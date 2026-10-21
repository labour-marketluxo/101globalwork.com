/**
 * How long a quote has left, as words.
 *
 * ⚠️ ITS OWN MODULE, WITH NO IMPORTS, SO THE SERVER AND THE BROWSER CAN AGREE. The expiration timer ticks in the
 * browser, so it needs this calculation on the client; the page needs the same answer on the server to render
 * the first paint. A copy in each place would drift, and the drift would show up as a hydration mismatch or,
 * worse, as a page that says "2 days left" to somebody reading an expired quote.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, so the same function is usable in a test and
 * so the caller decides which clock it means.
 */

export type ExpiryState = {
  /** True once the validity instant has passed. */
  expired: boolean;
  /** Under two days: the point at which a decision needs to be made rather than considered. */
  imminent: boolean;
  /** A short phrase for a badge or a timer: "4 hours left", "Expired 2 days ago". */
  label: string;
  /** The date it lapses, in words. */
  detail: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function expiryState(validUntil: string | null, now: number = Date.now()): ExpiryState | null {
  if (!validUntil) return null;
  const lapses = Date.parse(validUntil);
  if (Number.isNaN(lapses)) return null;

  const detail = `Lapses on ${new Date(lapses).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}.`;

  const remaining = lapses - now;
  if (remaining <= 0) {
    const ago = -remaining;
    const label =
      ago < HOUR
        ? 'Expired less than an hour ago'
        : ago < DAY
          ? `Expired ${plural(Math.floor(ago / HOUR), 'hour')} ago`
          : `Expired ${plural(Math.floor(ago / DAY), 'day')} ago`;
    return { expired: true, imminent: false, label, detail };
  }

  const label =
    remaining < HOUR
      ? `${plural(Math.max(1, Math.floor(remaining / MINUTE)), 'minute')} left`
      : remaining < DAY
        ? `${plural(Math.floor(remaining / HOUR), 'hour')} left`
        : `${plural(Math.floor(remaining / DAY), 'day')} left`;

  return { expired: false, imminent: remaining < 2 * DAY, label, detail };
}
