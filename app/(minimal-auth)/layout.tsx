import MinimalAuthLayout from '@/components/auth/MinimalAuthLayout';

/**
 * Route group: (minimal-auth)
 *
 * The routes that must not carry the public site chrome:
 *
 *   /auth/sign-in   /auth/sign-up   /auth/verify
 *   /auth/recovery  /auth/challenge
 *   /onboarding
 *   /invitations/[token]
 *
 * WHY THIS IS A GROUP AND NOT THREE LAYOUT FILES. The requirement is a list of seven routes,
 * and a group states that list once. Three separate layout.tsx files — one for /auth/*, one
 * for /onboarding, one for /invitations — would each have to be found and kept in step, and
 * the eighth route added later would be the one that gets it wrong.
 *
 * WHY IT IS NOT `(auth)`. That group also serves /account/* — security settings, password
 * update, the admin step-up target at /account/security?next=/admin — and those are workspace
 * pages with the normal header and footer, exactly as they were. The same group also holds
 * the three retired paths (/sign-in, /sign-up, /forgot-password) as redirect aliases. Putting
 * this shell on the group would have quietly turned the account page into a sign-in card.
 *
 * The group name never appears in a URL: /auth/sign-in is still /auth/sign-in, /onboarding is
 * still /onboarding, /invitations/{token} is unchanged.
 */
export default function MinimalAuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <MinimalAuthLayout>{children}</MinimalAuthLayout>;
}

/**
 * ⚠️ FORCED DYNAMIC — a correctness decision, not a caching preference. Do not remove it to
 * "let these pages prerender".
 *
 * Every route here decides something per request. /auth/sign-in and /auth/sign-up redirect a
 * visitor who already has a session to their destination. /auth/challenge sends anyone without
 * one back to sign-in and renders the mask for whichever factor that account has enrolled.
 * /onboarding reads the account's recorded intent. None of those answers can be computed at
 * build time, and a cached one is not merely stale — it is a page telling a signed-in person
 * they are signed out.
 *
 * WHY IT IS WRITTEN DOWN RATHER THAN ASSUMED. These routes were dynamic by accident until now:
 * app/layout.tsx read cookies for the header, which made every route in the app dynamic. That
 * layout renders no chrome any more, so the only thing keeping these pages dynamic is each
 * page's own session read — and the build proved the gap immediately:
 *
 *   ⨯ useSearchParams() should be wrapped in a suspense boundary at page "/auth/challenge"
 *
 * Next had decided /auth/challenge could be generated statically. It cannot. Rather than wrap
 * the top bar in a Suspense boundary to satisfy a prerender that should not be happening, the
 * group states what it needs. A page added here later inherits this instead of having to
 * remember it.
 */
export const dynamic = 'force-dynamic';
