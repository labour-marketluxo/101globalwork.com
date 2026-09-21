'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';

/**
 * The bar at the top of every minimal auth screen: the brand, and at most one shortcut.
 *
 * WHY THIS IS A CLIENT COMPONENT. The bar is the same on all seven routes except for one
 * link, and which link it is depends on the URL. A server layout receives `params`, not
 * `pathname`, so the decision has to be made where the pathname exists. That is also why the
 * shortcut comes from a route map rather than from session state: this bar does not care who
 * you are, only which page you are on.
 *
 * ONLY SIGN-IN AND SIGN-UP OFFER THE OTHER ONE. Verify, recovery, challenge, onboarding and
 * the invitation are single-purpose screens — a code to enter, a decision to make, an account
 * to set up — and a second link in the chrome is an exit from a task with one correct next
 * step. Sign-in and sign-up are the one pair people genuinely arrive at reversed, which is
 * exactly the pair that gets a shortcut.
 *
 * THE DESTINATION RIDES THROUGH. Somebody who followed a deep link to sign in and then
 * realises they need an account should still end up where they were going, so `redirect` is
 * carried across — the same parameter the pages themselves already pass between each other.
 */
export default function AuthTopBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const shortcut = SHORTCUTS[pathname] ?? null;
  const destination = searchParams?.get('redirect') ?? searchParams?.get('next') ?? undefined;
  const href = shortcut ? hrefWith(shortcut.href, { redirect: destination }) : null;

  return (
    <header className="w-full border-b border-solid border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          {/* The monogram stands in for a real logo tile — same slot as MainNav's, so the
              two bars mark the brand the same way. Drop a real logo in both at once. */}
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-primary bg-primary font-mono text-[11px] font-bold text-white"
          >
            101
          </span>
          <span className="text-base font-bold tracking-tight text-primary sm:text-lg">
            101GlobalWork
          </span>
        </Link>

        {shortcut ? (
          <Link href={href ?? shortcut.href} className={SHORTCUT}>
            <span className="hidden text-slate-500 sm:inline">{shortcut.prompt}</span>
            <span className="font-bold text-primary">{shortcut.action}</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * A pill, not a button: small, quiet, and visibly secondary to the card's own call to action.
 * Preflight is not imported, so `no-underline` and `border-solid` are both explicit — and the
 * focus ring is written out because the site's global `:focus-visible` rule is a soft teal
 * outline that reads as decoration on a white bar.
 */
const SHORTCUT =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-solid border-slate-300 bg-white px-3.5 py-1.5 text-xs no-underline transition-colors hover:border-primary hover:bg-primary-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Keyed by pathname. Anything not in here renders no shortcut at all. */
const SHORTCUTS: Record<string, { prompt: string; action: string; href: string }> = {
  [AUTH_PATHS.signIn]: {
    prompt: 'Need an account?',
    action: 'Sign Up',
    href: AUTH_PATHS.signUp,
  },
  [AUTH_PATHS.signUp]: {
    prompt: 'Already registered?',
    action: 'Sign In',
    href: AUTH_PATHS.signIn,
  },
};
