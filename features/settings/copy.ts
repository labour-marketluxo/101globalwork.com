/**
 * Failure and outcome vocabulary for the settings surfaces.
 *
 * PURE, and a separate module for a specific reason: the profile page is the first settings surface with
 * a control that must run in the browser — the avatar picker shows the chosen file before it is sent —
 * and a client component that imported the copy from a module which also imports the Supabase server
 * client would drag the server client into the browser bundle.
 *
 * Every code here is a fixed value read from a query parameter. Whatever the URL says, only these are
 * rendered.
 */

export const PROFILE_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'duplicate_contact',
  'too_many_pending',
  'wrong_code',
  'expired_code',
  'too_many_attempts',
  'unverified_contact',
  'avatar_unavailable',
  'email_change_failed',
  'unavailable',
] as const;
export type ProfileFailureCode = (typeof PROFILE_FAILURE_CODES)[number];

export const PROFILE_FAILURE_COPY: Record<ProfileFailureCode, string> = {
  not_authorized: 'That item belongs to a different account, so nothing was changed.',
  bad_request: 'That request was missing something it needed. Nothing was changed.',
  duplicate_contact: 'That address or number is already on your account.',
  too_many_pending: 'There are already five contacts waiting to be verified. Verify or remove one first.',
  wrong_code: 'That code is not correct. Check the last message sent to that contact and try again.',
  expired_code: 'That code has expired. Send a new one and use the newest message.',
  too_many_attempts: 'That code was entered incorrectly too many times. Send a new one.',
  unverified_contact: 'Verify that contact before making it the one the platform uses first.',
  avatar_unavailable:
    'The image could not be stored. It must be a JPEG, PNG or WebP under 2 MB — anything else is rejected before it is saved.',
  email_change_failed:
    'The sign-in address was not changed. The authentication provider refused it — most often because that address already has an account, or because email is not configured on this deployment.',
  unavailable: 'The change could not be completed. Reload this page before assuming it was saved.',
};

export function profileFailureCode(value: string | undefined | null): ProfileFailureCode | null {
  if (!value) return null;
  return (PROFILE_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as ProfileFailureCode)
    : null;
}

export const PROFILE_SUCCESS_CODES = [
  'saved',
  'contact_added',
  'contact_verified',
  'contact_removed',
  'primary_set',
  'code_sent',
  'avatar_removed',
  'email_change_started',
] as const;
export type ProfileSuccessCode = (typeof PROFILE_SUCCESS_CODES)[number];

export const PROFILE_SUCCESS_COPY: Record<ProfileSuccessCode, string> = {
  saved: 'Your profile is saved.',
  contact_added:
    'A verification code was queued for that contact. It cannot be used until the code comes back and is entered below.',
  contact_verified: 'That contact is verified and can be used for notices.',
  contact_removed: 'That contact was removed from the account.',
  primary_set: 'That is now the contact the platform reaches you on first.',
  code_sent: 'A new code was queued for that contact. Any earlier code no longer works.',
  avatar_removed: 'Your photo was removed. Your initials are shown instead.',
  email_change_started:
    'A confirmation message is on its way to the new address. Your sign-in address does not change until that link is followed — and depending on how this deployment is configured, the address you are leaving may also have to confirm the change.',
};

export function profileSuccessCode(value: string | undefined | null): ProfileSuccessCode | null {
  if (!value) return null;
  return (PROFILE_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as ProfileSuccessCode)
    : null;
}

/**
 * Security outcomes.
 *
 * `password_changed` and `factor_removed` are separate from the failure codes because both are things the
 * visitor asked for; the failures are the ones worth a warning tone.
 */
export const SECURITY_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'weak_password',
  'password_mismatch',
  'step_up_required',
  'unavailable',
] as const;
export type SecurityFailureCode = (typeof SECURITY_FAILURE_CODES)[number];

export const SECURITY_FAILURE_COPY: Record<SecurityFailureCode, string> = {
  not_authorized: 'That factor belongs to a different account, so nothing was removed.',
  bad_request: 'That request was missing something it needed. Nothing was changed.',
  weak_password: 'Passwords must be at least 10 characters. Nothing was changed.',
  password_mismatch: 'The two passwords were not the same. Nothing was changed.',
  step_up_required:
    'This account has a second factor, and this change needs a session that has passed it. Confirm it is you, then try again.',
  unavailable: 'The change could not be completed. Nothing was changed — try again.',
};

export function securityFailureCode(value: string | undefined | null): SecurityFailureCode | null {
  if (!value) return null;
  return (SECURITY_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as SecurityFailureCode)
    : null;
}

export const SECURITY_SUCCESS_CODES = ['password_changed'] as const;
export type SecuritySuccessCode = (typeof SECURITY_SUCCESS_CODES)[number];

export const SECURITY_SUCCESS_COPY: Record<SecuritySuccessCode, string> = {
  password_changed:
    'Your password is changed. Other devices keep their current session until it next needs a token, and they will have to sign in again after that.',
};

export function securitySuccessCode(value: string | undefined | null): SecuritySuccessCode | null {
  if (!value) return null;
  return (SECURITY_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as SecuritySuccessCode)
    : null;
}

/**
 * Factor types, as the authentication provider names them.
 *
 * `webauthn` is what the provider calls a passkey. The label is the word people use; the check below
 * keeps an unknown type rendering as itself rather than being silently called a passkey.
 */
export const FACTOR_LABELS: Record<string, string> = {
  totp: 'Authenticator app',
  phone: 'SMS',
  webauthn: 'Passkey',
};

export function factorLabel(value: string | null | undefined): string {
  const key = String(value ?? '');
  return FACTOR_LABELS[key] ?? (key ? key : 'Unknown factor');
}

export const CONTACT_KIND_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
};

/** Notification-preference outcomes. */
export const PREFERENCE_FAILURE_CODES = ['not_authorized', 'bad_request', 'locked', 'unavailable'] as const;
export type PreferenceFailureCode = (typeof PREFERENCE_FAILURE_CODES)[number];

export const PREFERENCE_FAILURE_COPY: Record<PreferenceFailureCode, string> = {
  not_authorized: 'That setting belongs to a different account, so nothing was changed.',
  bad_request: 'That request named an event or channel the platform does not have.',
  locked:
    'Security, legal and payment-dispute notices are mandatory: they are how you find out something has gone wrong with your money or your account, so they cannot be switched off.',
  unavailable: 'The change could not be saved. Reload this page before assuming it was.',
};

export function preferenceFailureCode(value: string | undefined | null): PreferenceFailureCode | null {
  if (!value) return null;
  return (PREFERENCE_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as PreferenceFailureCode)
    : null;
}
