'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Catches render/data errors in any segment BELOW the root layout, and renders
 * a recoverable UI instead of Next's default error screen.
 *
 * Limitation worth knowing: this renders *inside* app/layout.tsx, so it cannot
 * catch an error thrown by that layout itself — see app/global-error.tsx for
 * that case.
 *
 * The error message is deliberately not rendered: it can contain internal
 * detail (and the app already reflects Postgres messages into query strings
 * elsewhere). It is logged to the console; only the opaque digest reaches the
 * UI so a user can quote it to support.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="content-shell" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>This page couldn’t be loaded</h1>
      <p className="lede left">
        The fault is on our side, not yours. Try again, or head somewhere that is
        working.
      </p>
      <div className="entry-actions">
        <button type="button" onClick={reset} className="button-link">
          Try again
        </button>
        <Link href="/" className="secondary-link">
          Go to the homepage
        </Link>
      </div>
      {error.digest ? (
        <p className="hint">
          Reference for support: <code>{error.digest}</code>
        </p>
      ) : null}
    </section>
  );
}
