/**
 * Settings paths and the tab bar's contents — a pure module, deliberately.
 *
 * The tab bar is a client component (it reads the pathname to mark the current tab) and the server
 * actions need the same paths, so this cannot live in sessions.ts: that module imports the Supabase
 * server client, which cannot cross into a client bundle.
 */

export const SESSIONS_PATH = '/settings/security/sessions';

export type SettingsTab = {
  label: string;
  /** Null when the area does not exist yet — rendered as a non-interactive tab with a reason. */
  href: string | null;
  /** Shown as a tooltip and to screen readers. Required when href is null. */
  note?: string;
};

/**
 * ⚠️ THE BRIEF ASKED FOR [ Profile | Account | Security & Sessions | Notifications ], AND THIS
 * PLATFORM DOES NOT HAVE THAT INFORMATION ARCHITECTURE. Rather than rename two real pages into tabs
 * that misdescribe them, the bar lists the three settings surfaces that exist and the two the brief
 * names that do not. The unavailable pair are rendered as non-interactive tabs carrying the reason,
 * for the same purpose as the disabled "Manage a team" card on /onboarding: a visitor who was told
 * to look for a setting can see it is genuinely not there, instead of hunting for a control that
 * silently never appears.
 *
 * The two that DO exist point at the account pages that already own them. Two-factor enrolment and
 * password change are not duplicated into /settings — a second copy of a security form is how two
 * copies of a security policy start disagreeing.
 */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  { label: 'Security & sessions', href: SESSIONS_PATH },
  { label: 'Two-factor', href: '/account/security' },
  { label: 'Password', href: '/account/update-password' },
  {
    label: 'Profile',
    href: null,
    note: 'There is no profile editor. The account holds a display name and no page edits it yet.',
  },
  {
    label: 'Notifications',
    href: null,
    note: 'There are no notification preferences to set: the platform sends no email of its own yet, so there is nothing to switch off.',
  },
];

/**
 * Failure codes that may appear in `?failed=` on the sessions page.
 *
 * A fixed vocabulary for the same reason the sign-in page has one: the parameter is user-editable,
 * and rendering whatever it contains inside a card is how a page becomes a phishing surface.
 */
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
