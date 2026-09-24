/**
 * Settings paths and the tab bar's contents — a pure module, deliberately.
 *
 * The tab bar is a client component (it reads the pathname to mark the current tab) and the server
 * actions need the same paths, so this cannot live in sessions.ts: that module imports the Supabase
 * server client, which cannot cross into a client bundle.
 */

export const PROFILE_PATH = '/settings/profile';
export const SECURITY_PATH = '/settings/security';
export const NOTIFICATION_SETTINGS_PATH = '/settings/notifications';
export const SESSIONS_PATH = '/settings/security/sessions';
/** The account's two inboxes. Named here because several surfaces link to them. */
export const NOTIFICATIONS_PATH = '/notifications';
export const MESSAGES_PATH = '/messages';

export type SettingsTab = {
  label: string;
  href: string;
  /** Read out to a screen reader; the bar itself shows only the label. */
  description: string;
};

/**
 * The three account settings surfaces, and only those three.
 *
 * ⚠️ THE BAR USED TO LIST TWO DEAD TABS AND TWO PAGES THAT LIVE SOMEWHERE ELSE. "Profile" and
 * "Notifications" were rendered as disabled text carrying the reason there was nothing to configure
 * yet, and "Two-factor" and "Password" pointed out to /account/*. Both halves of that are gone: profile
 * and notification preferences are real pages now, so the security hub links out to the enrolment and
 * password pages instead of the tab bar doing it — a tab bar whose third entry leaves the settings area
 * is a tab bar people stop trusting to stay put.
 *
 * ⚠️ "SESSIONS" IS DELIBERATELY ABSENT. Active sessions are one section of the security hub and one
 * click from it; promoting them to a sibling tab would say they are a different subject from the
 * account's protection, which is the mistake the old bar made.
 */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    label: 'Profile',
    href: PROFILE_PATH,
    description: 'Your name, contacts, language, timezone and the workspaces you can switch between.',
  },
  {
    label: 'Security',
    href: SECURITY_PATH,
    description: 'Password, two-factor authentication, recovery and the devices signed in.',
  },
  {
    label: 'Notifications',
    href: NOTIFICATION_SETTINGS_PATH,
    description: 'Which events reach you, and on which channel.',
  },
];

/** Failure codes that may appear in `?failed=` on the sessions page. */
export const SESSION_FAILURE_CODES = ['not_authorized', 'bad_request', 'unavailable'] as const;
export type SessionFailureCode = (typeof SESSION_FAILURE_CODES)[number];

export const SESSION_FAILURE_COPY: Record<SessionFailureCode, string> = {
  not_authorized: 'That session belongs to a different account, so nothing was changed.',
  bad_request: 'That request was missing the session it was meant to end. Nothing was changed.',
  unavailable:
    'The change could not be completed. The session may still be signed in — reload this page before assuming otherwise.',
};

export function sessionFailureCode(value: string | undefined | null): SessionFailureCode | null {
  if (!value) return null;
  return (SESSION_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as SessionFailureCode)
    : null;
}
