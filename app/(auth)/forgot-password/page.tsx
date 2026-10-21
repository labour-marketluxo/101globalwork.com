import { permanentRedirect } from 'next/navigation';
import { AUTH_PATHS, aliasTarget, type RawSearchParams } from '@/features/auth/post-auth';

/**
 * /forgot-password — retired, redirected to /auth/recovery.
 *
 * The name change is not cosmetic. "Forgot password" describes the visitor's state; the flow it
 * starts is account recovery, which is the same mechanism for a forgotten password, a lost
 * authenticator device and a lockout. The new URL says what it does, and the copy on the page keeps
 * the visitor's own words.
 *
 * The query string survives, so a `/forgot-password?sent=1` link still shows the confirmation
 * rather than an empty form.
 */
export default async function LegacyForgotPasswordRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  permanentRedirect(aliasTarget(AUTH_PATHS.recovery, await searchParams));
}
