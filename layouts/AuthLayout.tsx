import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * AuthLayout — the shell for the (auth) route group.
 *
 * ⚠️ WHAT THIS GROUP HOLDS NOW: /account/* (security, password update, and the admin step-up
 * target at /account/security?next=/admin) plus the three retired credential paths
 * (/sign-in, /sign-up, /forgot-password) as redirect aliases. The seven credential and
 * onboarding screens moved to (minimal-auth), which draws its own bar and footer.
 *
 * Account surfaces are workspace pages, not a sign-in card, so they keep the normal header
 * and footer — which is precisely why they were not moved with the sign-in pages, and why this
 * group's shell is the site chrome rather than the minimal one. Putting the minimal shell on
 * this group instead would have quietly turned /account/security into a sign-in card.
 *
 * This was a pass-through while app/layout.tsx drew the chrome; the root layout draws none now,
 * so this supplies it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
