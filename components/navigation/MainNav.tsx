import Link from 'next/link';
import AuthNav from '@/components/navigation/AuthNav';

/**
 * MainNav — the site header.
 *
 * Extracted verbatim from the root layout so the markup has a named home.
 * Rendered by app/layout.tsx today, which is why every route still gets it —
 * including the admin workspace, where app/(admin)/admin/layout.tsx hides
 * `.site-header` with an injected style rule.
 *
 * Note: the mobile presentation is CSS-only today. app/globals.css hides the
 * nav below 700px, then app/entry-points.css (unlayered, so it wins) restores
 * it as a flex row with the `.nav-discovery` and sign-in links hidden. There is
 * no separate mobile nav component yet.
 */
export default function MainNav() {
  return (
    <header className="site-header">
      <Link href="/" className="brand">101GlobalWork</Link>
      <AuthNav />
    </header>
  );
}
