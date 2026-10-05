import type { Metadata } from 'next';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';

/**
 * Route group: (auth-split)
 *
 * Holds the two credential screens that render the 60/40 split instead of the minimal-auth chrome:
 * /auth/sign-in and /auth/sign-up. The group name never appears in a URL.
 *
 * The metadata repeats what the (minimal-auth)/auth layout gave these pages: `robots: { index:
 * false, follow: false }`. Each page also declares it, but the subtree rule is the thing that
 * covers a page added here later and forgotten.
 *
 * FORCED DYNAMIC for the same reason it was forced in (minimal-auth): both pages read the session
 * to redirect an already-signed-in visitor, which cannot be decided at build time. A cached
 * sign-in page would tell a signed-in person they are signed out.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AuthSplitGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthSplitLayout>{children}</AuthSplitLayout>;
}
