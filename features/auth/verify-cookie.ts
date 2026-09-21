import { cookies } from 'next/headers';

/**
 * The pending verification record: which address a code went to, and when.
 *
 * WHY A COOKIE RATHER THAN THE URL. The verification page has to name the address it sent a code
 * to — "we sent a code" with no destination is a page the visitor cannot act on, because they
 * cannot tell whether the platform holds the right address. The two obvious alternatives are both
 * worse:
 *
 *   in the query string   a personal identifier in a URL, which lands in access logs, proxy logs,
 *                         referrer headers and browser history, and which anyone can edit to make
 *                         the page display a plausible-looking wrong address.
 *   asking every time     the "Resend code" link then needs the address retyped on every attempt,
 *                         which is the interaction the brief specifically asks to avoid.
 *
 * So the server remembers it instead: `httpOnly` (no script can read it), `sameSite=lax`,
 * `path=/auth` (it is never sent to any other part of the site), and it expires in fifteen minutes
 * — the window in which a verification code is useful at all. It is cleared the moment the address
 * is confirmed, so it does not outlive its purpose. The page renders a MASK derived from it; the
 * raw address is used only to talk to the auth provider.
 *
 * WHAT IS NOT STORED: anything about the code itself, and no record at all of whether the address
 * has an account — the resend path answers identically either way, exactly like recovery does.
 */

const EMAIL_COOKIE = 'auth_verify_email';
const SENT_COOKIE = 'auth_verify_sent_at';

/** How long a pending verification is worth remembering. */
const PENDING_MAX_AGE_SECONDS = 60 * 15;

/**
 * The provider's own floor between two sends to the same address, mirrored here so the button's
 * countdown and the server's refusal cannot disagree about when "resend" is allowed.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

const BASE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/auth',
  secure: process.env.NODE_ENV === 'production',
} as const;

export type PendingVerification = {
  /** The address a code was sent to, or null when this browser has no pending verification. */
  email: string | null;
  /** When the last code was sent, epoch milliseconds, or null. */
  sentAt: number | null;
  /** When the next send is allowed, epoch milliseconds. */
  availableAt: number;
  /** Seconds until `availableAt`, floored at zero. Computed here so the page and the client agree. */
  secondsUntilAvailable: number;
};

/** Record that a code was just sent to this address. Called by sign-up and by resend. */
export async function rememberPendingVerification(email: string): Promise<void> {
  const store = await cookies();
  store.set(EMAIL_COOKIE, email, { ...BASE_OPTIONS, maxAge: PENDING_MAX_AGE_SECONDS });
  store.set(SENT_COOKIE, String(Date.now()), { ...BASE_OPTIONS, maxAge: PENDING_MAX_AGE_SECONDS });
}

/**
 * What this browser is waiting to verify.
 *
 * Reading cookies is allowed in a Server Component; writing is not, which is why every write in
 * this module happens inside a Server Action or a route handler. The read side is used by the
 * verification page itself, so the countdown it renders is the server's own record rather than a
 * client-side guess that a reload would reset.
 */
export async function readPendingVerification(): Promise<PendingVerification> {
  const store = await cookies();
  const email = store.get(EMAIL_COOKIE)?.value ?? null;
  const sentAtRaw = store.get(SENT_COOKIE)?.value;
  const sentAt = sentAtRaw ? Number(sentAtRaw) : null;
  const valid = sentAt !== null && Number.isFinite(sentAt) ? sentAt : null;

  const availableAt = (valid ?? 0) + RESEND_COOLDOWN_SECONDS * 1000;
  const secondsUntilAvailable = valid ? Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)) : 0;

  return { email, sentAt: valid, availableAt, secondsUntilAvailable };
}

/** Forget the pending verification — after confirmation, or when the visitor changes address. */
export async function clearPendingVerification(): Promise<void> {
  const store = await cookies();
  store.delete({ name: EMAIL_COOKIE, path: '/auth' });
  store.delete({ name: SENT_COOKIE, path: '/auth' });
}
