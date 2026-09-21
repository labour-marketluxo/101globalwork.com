import Link from 'next/link';
import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * Global 404.
 *
 * Replaces Next's bare default page. This is reached from unmatched URLs and
 * from every `notFound()` call in the app — most notably the discovery route
 * (app/(marketing)/[market]/…/[service]/page.tsx), which calls notFound() when
 * no public document exists for the requested path.
 *
 * Next marks 404 responses noindex automatically, so no robots metadata is
 * needed here.
 *
 * It renders the site chrome explicitly. app/layout.tsx no longer draws a header or footer (see
 * components/navigation/SiteChrome.tsx), and a 404 is a dead end people need a way out of — a
 * bare card with no nav would be worse on a 404 than anywhere else, because the visitor is
 * already lost.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <section className="content-shell">
        <p className="eyebrow">404</p>
        <h1>We couldn’t find that page</h1>
        <p className="lede left">
          The link may be out of date, or the page may never have existed. Nothing is
          broken on your side.
        </p>
        <div className="entry-actions">
          <Link href="/" className="button-link">
            Go to the homepage
          </Link>
          <Link href="/services" className="secondary-link">
            Browse services
          </Link>
        </div>
      </section>
    </SiteChrome>
  );
}
