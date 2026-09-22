/**
 * Device labels and relative times for the sessions page.
 *
 * PURE, and in its own module on purpose: nothing here imports the Supabase server client, so the
 * parser can be run against real user-agent strings from a command line. That matters more than it
 * sounds — the strings this page has to describe were captured from live sessions in this project's
 * own database (`curl/8.18.0`, a macOS Chrome UA, an iPhone Safari UA, a Windows Edge UA), and the
 * only way to know the labels are right is to run the parser over them.
 *
 * WHY A HAND-WRITTEN PARSER AND NOT A LIBRARY. `ua-parser-js` and friends are a dependency and a
 * supply-chain surface for what is, here, six ordered regexes. The rules cover the clients this
 * platform's own sessions actually come from; anything else gets described honestly — the raw
 * product token, or "Unrecognised client" — rather than mislabelled as Chrome.
 */

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type DeviceDescription = {
  /** "Chrome on macOS", or as little of that as could be established. */
  label: string;
  browser: string | null;
  system: string | null;
  kind: DeviceKind;
  /** The user agent as recorded, for the tooltip. Null when GoTrue had none. */
  raw: string | null;
};

/**
 * ORDER MATTERS, twice over.
 *
 * Edge, Opera and Samsung Internet all put `Chrome/…` in their user agent, so they have to be
 * matched before Chrome. Safari also carries `Chrome`-less `Safari/…` in Chrome's UA, so Safari has
 * to come after Chrome. Getting this order wrong makes every Edge user appear to be on Chrome.
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg[A-Z]?\//, 'Edge'],
  [/\bOPR\/|\bOpera[ /]/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFxiOS\//, 'Firefox'],
  [/\bFirefox\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\/|\bChromium\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*Safari\//, 'Safari'],
  [/\bcurl\//, 'curl'],
  [/\bwget\//, 'wget'],
  [/\bPostmanRuntime\//, 'Postman'],
  [/\bnode-fetch\/|\bundici\//, 'Node'],
];

/**
 * Android and ChromeOS both contain `Linux`, and an iPhone UA contains `Mac OS X`, so the specific
 * systems are matched before the general ones.
 */
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\biPhone\b|\biPad\b|\biPod\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows NT\b|\bWindows Phone\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

const MOBILE = /\biPhone\b|\biPod\b|\bAndroid\b.*\bMobile\b|\bWindows Phone\b/;
const TABLET = /\biPad\b|\bTablet\b|\bAndroid\b(?!.*\bMobile\b)/;

function firstProductToken(userAgent: string): string | null {
  const token = userAgent.trim().split(/[\s(]+/)[0];
  return token && token.length > 0 ? token : null;
}

/**
 * Describe a user agent.
 *
 * The fallback chain is the point: a full label, then browser only, then system only, then the raw
 * first product token, then a plain admission that nothing could be read. Each step down is a
 * smaller claim rather than a guess — this page is shown to somebody deciding whether a device they
 * do not recognise is an intruder, so "Unrecognised client" is more useful than a plausible lie.
 */
export function describeDevice(userAgent: string | null | undefined): DeviceDescription {
  const ua = (userAgent ?? '').trim();
  if (ua.length === 0) {
    return { label: 'Unrecognised client', browser: null, system: null, kind: 'unknown', raw: null };
  }

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

  const kind: DeviceKind = MOBILE.test(ua)
    ? 'mobile'
    : TABLET.test(ua)
      ? 'tablet'
      : browser || system
        ? 'desktop'
        : 'unknown';

  const label =
    browser && system
      ? `${browser} on ${system}`
      : (browser ?? system ?? firstProductToken(ua) ?? 'Unrecognised client');

  return { label, browser, system, kind, raw: ua };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Just now", "6 minutes ago", "3 hours ago", "2 days ago" — and a date beyond a month, because
 * "47 days ago" is a number nobody converts into a date in their head.
 *
 * `now` is passed in rather than read from the clock so the caller can render one consistent
 * timestamp for a whole page; a server component that called `Date.now()` per row could label two
 * rows a second apart differently.
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date, fallback = 'Unknown'): string {
  if (!iso) return fallback;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return fallback;

  const diff = now.getTime() - then;

  // A clock skew between this server and GoTrue would otherwise print "in 3 seconds".
  if (diff < MINUTE) return 'Just now';

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diff < 30 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(then));
}
