'use client';

import { useEffect } from 'react';

/**
 * Last-resort error boundary — the only one that can catch a failure inside
 * app/layout.tsx.
 *
 * This is not a duplicate of app/error.tsx. That boundary renders *within* the
 * root layout, so when the root layout itself throws — which is exactly what
 * happened when the header's AuthNav ran without Supabase environment
 * variables — every route returned a bare 500 with no recovery path. Nothing
 * below the root layout can catch that; only this can.
 *
 * Because it replaces the root layout while active, it must render its own
 * <html>/<body> and cannot rely on app/globals.css being applied. Styles are
 * therefore inline, using the same design tokens as the rest of the app.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#fbfaf7',
          color: '#1b1f1e',
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ maxWidth: '560px' }}>
          <p
            style={{
              margin: '0 0 12px',
              color: '#23685d',
              fontSize: '11px',
              fontWeight: 760,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            101GlobalWork
          </p>
          <h1
            style={{
              margin: '0 0 14px',
              fontSize: '32px',
              lineHeight: 1.1,
              letterSpacing: '-.03em',
            }}
          >
            The application failed to start
          </h1>
          <p style={{ margin: '0 0 24px', color: '#4f5754', lineHeight: 1.6 }}>
            This is a fault on our side, not yours. Nothing you did caused it, and
            no data was lost.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '46px',
              padding: '0 18px',
              border: 0,
              borderRadius: '10px',
              background: '#1b1f1e',
              color: '#ffffff',
              fontWeight: 720,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: '24px', color: '#747b78', fontSize: '14px' }}>
              Reference for support: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
