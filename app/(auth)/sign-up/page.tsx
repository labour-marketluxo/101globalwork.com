import { permanentRedirect } from 'next/navigation';
import { AUTH_PATHS, aliasTarget, hrefWith, type RawSearchParams } from '@/features/auth/post-auth';

/**
 * /sign-up — retired, redirected.
 *
 * One wrinkle the plain rename does not cover: `?check_email=1` was how the old sign-up action
 * reported "the account exists but the address needs confirming". That state now has its own page,
 * so a URL carrying the flag is sent to /auth/verify instead — otherwise an old link, a bookmarked
 * tab or a browser back button would land on the sign-up form and silently lose the one piece of
 * information the visitor needed.
 *
 * Everything else keeps its parameters: /sign-up?intent=provider&next=/provider/onboarding still
 * lands on the provider journey, which is what the marketing pages link to today.
 */
export default async function LegacySignUpRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  if (params.check_email) {
    permanentRedirect(hrefWith(AUTH_PATHS.verify, { sent: '1', next: aliasNext(params) }));
  }

  permanentRedirect(aliasTarget(AUTH_PATHS.signUp, params));
}

/** The destination, when one was given, so the verify page can hand it back to sign-in. */
function aliasNext(params: RawSearchParams): string | undefined {
  const value = params.next ?? params.redirect;
  return Array.isArray(value) ? value[0] : value;
}
