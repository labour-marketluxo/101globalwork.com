import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * The one-time owner setup page keeps the public chrome, as it had before.
 *
 * This is a single-purpose form — paste a bootstrap token, establish the owner — and it is not
 * an auth screen, so it does not belong in (minimal-auth): the visitor here is already signed
 * in, and the page is guarded by a redirect to sign-in and by the ownership check.
 *
 * It renders the chrome explicitly because app/layout.tsx no longer draws any. Left as its own
 * layout rather than moved into a group, since grouping a lone utility page would invent a
 * structure to hold one file.
 */
export default function AdminBootstrapLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
