import AuthLayout from '@/layouts/AuthLayout';

/**
 * Route group: (auth)
 *
 * Authentication and account surfaces: /sign-in, /sign-up, /forgot-password,
 * /auth/callback and /account/*. The group name does not appear in the URL.
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
