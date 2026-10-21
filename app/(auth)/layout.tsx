import AuthLayout from '@/layouts/AuthLayout';

/**
 * Route group: (auth)
 *
 * Account surfaces: /account/* (security, password update, and the MFA step-up target for admin
 * actions — which is why it lives here rather than in (admin)), plus the three retired
 * credential paths /sign-in, /sign-up and /forgot-password, kept as permanent redirects to
 * their canonical /auth/* equivalents.
 *
 * ⚠️ THE SEVEN SCREENS THAT USED TO BE HERE ARE NOT HERE ANY MORE. /auth/* (sign-in, sign-up,
 * verify, recovery, challenge), /onboarding and /invitations/[token] moved to the
 * (minimal-auth) group, which replaces the site header and the five-column footer with a
 * one-link bar and a single-row footer. They could not stay in this group and get that shell:
 * this group also serves /account/*, and a minimal wrapper here would have turned
 * /account/security — a workspace page — into a sign-in card.
 *
 * The group is unchanged from the outside. Every URL above is exactly what it was; route group
 * names never appear in a path.
 *
 * AuthLayout supplies the public chrome, because app/layout.tsx no longer draws any. See
 * layouts/AuthLayout.tsx and components/navigation/SiteChrome.tsx.
 */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
