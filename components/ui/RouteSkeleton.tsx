/**
 * Shared streaming skeleton.
 *
 * Extracted so the route-group loading boundaries stay one-liners. The pulse
 * animation comes from Tailwind's `animate-pulse` utility; `.skeleton` and
 * `.skeleton-stack` in app/globals.css only handle sizing.
 */
export default function RouteSkeleton() {
  return (
    <section className="content-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="skeleton-stack" aria-hidden="true">
        <span className="skeleton bg-line animate-pulse" data-size="title" />
        <span className="skeleton bg-line animate-pulse" data-size="body" />
        <span className="skeleton bg-line animate-pulse" data-size="body" />
        <span className="skeleton bg-line animate-pulse" data-size="short" />
      </div>
    </section>
  );
}
