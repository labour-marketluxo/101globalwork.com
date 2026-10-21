/**
 * Where the authentication flows live, and how a URL parameter survives them.
 *
 * WHY THIS MODULE EXISTS
 *
 * Three things have to agree across five pages, four server actions, a route handler and the
 * twenty-odd places that bounce a signed-out visitor to sign-in:
 *
 *   the paths         /auth/sign-in, /auth/sign-up, /auth/recovery, /auth/verify, /auth/challenge
 *   the destination   the `redirect` (or legacy `next`) parameter, validated before it is used
 *   the error         a CODE, never copy — see below
 *
 * BEFORE THIS, every one of those call sites hardcoded `/sign-in?next=…`, the actions built the
 * query string by hand, and the error parameter carried a sentence. Changing a path meant
 * grepping for it, and the second copy of `safeNext` was already drifting from the first.
 *
 * ⚠️ THE ERROR PARAMETER CARRIES A CODE, NOT A MESSAGE, AND THAT IS A SECURITY DECISION.
 *
 * `/auth/sign-in?error=…` is fully user-editable: anyone can send a colleague a link with any
 * text in it, rendered inside the platform's own sign-in card, above the password field. That is
 * a phishing primitive — "Your account is locked, call this number" — and echoing whatever
 * arrives is exactly how it gets used. So the pages accept only the codes below and render copy
 * that lives in this file; anything unrecognised becomes `unknown`. The trade-off is real and
 * deliberate: a caller cannot pass its own wording any more, which is why the two call sites that
 * used to (the `?error=Account setup is not ready` bounces in /work and /provider/onboarding) now
 * pass `account_not_ready` and get their copy from the same place as everyone else.
 *
 * The same reasoning applies to the destination parameter, which is validated here rather than in
 * each caller: an open redirect — `?redirect=https://evil.example` — turns the sign-in page into a
 * credible-looking launchpad for someone else's site.
 */

/** The canonical authentication paths. Referenced, never retyped. */
export const AUTH_PATHS = {
  signIn: '/auth/sign-in',
  signUp: '/auth/sign-up',
  recovery: '/auth/recovery',
  verify: '/auth/verify',
  challenge: '/auth/challenge',
  callback: '/auth/callback',
} as const;

/** The retired paths, kept alive as redirects. See the alias pages. */
export const LEGACY_AUTH_PATHS = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  recovery: '/forgot-password',
} as const;

/** Search params as Next hands them over: a key may repeat, hence the array case. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * An internal path, or the fallback.
 *
 * Rejects anything that is not a rooted, single-slash path: `//evil.example` and
 * `/\evil.example` are both treated as absolute by browsers, which is how a "return to where you
 * were" parameter becomes an open redirect. A backslash is rejected for the same reason — some
 * browsers normalise `\` to `/` before resolving.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/'): string {
  const candidate = String(value ?? '').trim();
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.includes('\\')) return fallback;
  return candidate;
}

/**
 * Where to send someone after they authenticate.
 *
 * `redirect` is the documented parameter; `next` is the name this codebase used first and is
 * still what the form fields and the older links carry, so it is read as a fallback rather than
 * ignored. Reading both costs one line and is the difference between "the parameter is honoured"
 * and "the parameter is honoured if you happened to guess the right spelling".
 */
export function postAuthTarget(
  params: { redirect?: string | string[]; next?: string | string[] },
  fallback = '/',
): string {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return safeInternalPath(first(params.redirect) ?? first(params.next), fallback);
}

/** `?a=1&b=2`, from whatever arrived — repeats preserved, empty params dropped. */
export function queryString(params: RawSearchParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== '') search.append(key, entry);
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/** A path with the given params, skipping undefined values. Used to build links between pages. */
export function hrefWith(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `${path}?${encoded}` : path;
}

/** The alias target for a retired path, carrying its query string over untouched. */
export function aliasTarget(path: string, params: RawSearchParams): string {
  return `${path}${queryString(params)}`;
}

/**
 * The auth error vocabulary.
 *
 * Each code is a state the pages have real copy for. They are not a mapping of the provider's
 * error strings — two different provider failures legitimately land on the same code, and one
 * provider failure (`invalid_credentials`) must not tell the visitor whether the email exists.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'locked'
  | 'unconfirmed'
  | 'account_exists'
  | 'weak_password'
  | 'account_not_ready'
  | 'link_expired'
  | 'oauth_unavailable'
  | 'signup_unavailable'
  | 'reset_unavailable'
  | 'invalid_code'
  | 'code_expired'
  | 'already_verified'
  | 'challenge_expired'
  | 'password_mismatch'
  | 'unknown';

/** Codes that may be accepted from the URL. Anything else is discarded, never rendered. */
const KNOWN_ERROR_CODES: readonly AuthErrorCode[] = [
  'invalid_credentials',
  'rate_limited',
  'locked',
  'unconfirmed',
  'account_exists',
  'weak_password',
  'account_not_ready',
  'link_expired',
  'oauth_unavailable',
  'signup_unavailable',
  'reset_unavailable',
  'invalid_code',
  'code_expired',
  'already_verified',
  'challenge_expired',
  'password_mismatch',
  'unknown',
];

export function authErrorCode(value: string | string[] | undefined): AuthErrorCode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return KNOWN_ERROR_CODES.includes(raw as AuthErrorCode) ? (raw as AuthErrorCode) : 'unknown';
}

const ERROR_COPY: Record<AuthErrorCode, string> = {
  invalid_credentials: 'That email and password combination was not accepted. Check both and try again.',
  rate_limited:
    'Too many attempts from this network in a short time. Wait a few minutes before trying again — nothing is wrong with your account.',
  locked:
    'This account cannot sign in at the moment. If you believe that is a mistake, contact support and quote the email address on the account.',
  unconfirmed:
    'This email address has not been confirmed yet. Open the confirmation link we sent, or send yourself a new one.',
  account_exists:
    'An account already exists for that email address. Sign in instead — or use password recovery if you do not remember the password.',
  weak_password: 'That password is too short. The platform requires at least 10 characters.',
  account_not_ready:
    'Your account was created, but its workspace is not ready yet. Try again in a moment, or contact support if it persists.',
  link_expired:
    'That link is no longer valid. Links expire for safety, and they can only be used once. Request a new one below.',
  oauth_unavailable: 'Google sign-in is not available right now. Use your email and password instead.',
  signup_unavailable:
    'We could not complete that sign-up. Nothing was charged and no account was created. Try again in a moment.',
  reset_unavailable:
    'We could not start a password reset at the moment. Try again shortly — this says nothing about whether an account exists for that address.',
  invalid_code:
    'That code was not accepted. Codes are six digits, and only the most recent one works — an older code stops working as soon as a new one is sent.',
  code_expired:
    'That code has expired. Codes are short-lived by design; request a new one and use the newest email rather than the one you still have open.',
  already_verified:
    'This address is already confirmed, so there is nothing left to verify. Sign in with your password to continue.',
  challenge_expired:
    'That security check expired before it was completed. Sign in again to start a new one — nothing about your account has changed.',
  password_mismatch: 'The two passwords did not match. Retype them both — nothing has been changed yet.',
  unknown: 'Something went wrong with that request. Try again — if it keeps happening, contact support.',
};

export function authErrorMessage(code: AuthErrorCode): string {
  return ERROR_COPY[code];
}

/**
 * Classify a provider error into one of the codes above.
 *
 * Matching on the message is unavoidable: the auth provider does not return a stable error code
 * for every case, and the alternatives are worse (showing raw provider text, or collapsing every
 * failure into one unhelpful sentence — which is what this replaces). The patterns are matched
 * case-insensitively and kept narrow; anything unrecognised becomes `unknown`, and the action
 * decides whether it is safe to say so.
 *
 * DELIBERATELY NOT DISTINGUISHED: "no such user" from "wrong password". Sign-in failures all
 * become `invalid_credentials`, so the page cannot be used to enumerate which email addresses have
 * accounts.
 */
export function classifyAuthError(message: string | null | undefined): AuthErrorCode {
  const text = String(message ?? '').toLowerCase();
  if (!text) return 'unknown';

  if (text.includes('rate limit') || text.includes('too many')) return 'rate_limited';
  if (text.includes('banned') || text.includes('locked') || text.includes('disabled')) return 'locked';
  if (text.includes('already registered') || text.includes('already exists') || text.includes('user already')) {
    return 'account_exists';
  }
  // Order matters here: 'already confirmed' must be tested before the broader token patterns,
  // because the provider's message for a re-used signup token mentions both.
  if (text.includes('already confirmed') || text.includes('already been confirmed')) {
    return 'already_verified';
  }
  // ORDER MATTERS, and it is not obvious. The provider reports a wrong code and a stale code with
  // the same message ("Token has expired or is invalid"), so testing for 'expired' first would tell
  // everyone who mistyped a digit to request a new code. Only the provider's explicit
  // `otp_expired` code is treated as expiry; the combined message falls through to the invalid-code
  // branch, whose copy covers both causes without guessing which one happened.
  if (text.includes('otp_expired')) return 'code_expired';
  if (
    text.includes('invalid token') ||
    text.includes('expired or is invalid') ||
    text.includes('invalid otp') ||
    text.includes('incorrect code') ||
    text.includes('invalid code')
  ) {
    return 'invalid_code';
  }
  if (text.includes('expired')) return 'code_expired';
  if (text.includes('not confirmed') || text.includes('email not confirmed')) return 'unconfirmed';
  if (text.includes('password should be') || text.includes('password is too short') || text.includes('weak password')) {
    return 'weak_password';
  }
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) {
    return 'oauth_unavailable';
  }
  if (text.includes('invalid login') || text.includes('invalid credentials') || text.includes('invalid grant')) {
    return 'invalid_credentials';
  }
  return 'unknown';
}

/**
 * Is this error one the visitor can act on, and one we are willing to publish?
 *
 * Password-recovery requests succeed or fail without revealing anything, so a recovery failure is
 * only ever a transport or rate-limit story: those two are safe to show, and everything else
 * silently takes the same "if an account exists…" path. Saying more would turn the form into an
 * account-existence oracle.
 */
export function recoveryErrorCode(message: string | null | undefined): AuthErrorCode | null {
  const code = classifyAuthError(message);
  return code === 'rate_limited' ? 'rate_limited' : null;
}

/**
 * Mask a contact address for display, keeping enough of it to be recognisable and no more.
 *
 * WHAT THIS IS FOR. The OTP and MFA pages have to say WHERE a code went — "we sent a code" with no
 * destination is a page the visitor cannot act on, because they cannot tell whether the platform
 * has the right address. But printing the address in full puts a personal identifier on a screen
 * that is quite likely being screen-shared, photographed or overlooked.
 *
 * The shape is the conventional one and matches what people expect: `e***l@domain.com` for an
 * address (first character, last character of the local part, domain intact — the domain is what
 * tells them which inbox to open) and `+234 *** **** 89` for a number (country prefix, last two
 * digits).
 *
 * IT IS NOT A SECURITY BOUNDARY, and must never be treated as one. It is a display decision: the
 * masked value is computed on the server and the raw value is never sent to the browser for these
 * pages. There is nothing to gain by attacking a mask, and nothing to lose by showing none.
 */
export function maskContact(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const at = raw.indexOf('@');
  if (at > 0) {
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    if (!domain) return null;
    const head = local.slice(0, 1);
    const tail = local.length > 2 ? local.slice(-1) : '';
    return `${head}***${tail}@${domain}`;
  }

  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length < 6) return null;
  const prefix = digits.startsWith('+') ? digits.slice(0, 4) : digits.slice(0, 2);
  return `${prefix} *** **** ${digits.slice(-2)}`;
}
