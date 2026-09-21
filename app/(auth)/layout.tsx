import AuthLayout from '@/layouts/AuthLayout';

/**
 * Route group: (auth)
 *
 * Authentication and account surfaces. The auth flows are under /auth/*
 * (sign-in, sign-up, recovery, verify, challenge) plus the callback route handler; the three
 * original paths (/sign-in, /sign-up, /forgot-password) remain as permanent redirects to them,
 * and /account/* holds the signed-in security and recovery surfaces.
 *
 * Note: /account/security is also the MFA step-up target for admin actions
 * (linked as /account/security?next=/admin), so it lives here rather than in
 * (admin).
 *
 * AuthLayout is currently a pass-through. See layouts/AuthLayout.tsx.
 */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
