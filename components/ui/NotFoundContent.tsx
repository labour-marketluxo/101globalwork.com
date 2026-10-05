import Link from 'next/link';

/**
 * NotFoundContent — the body of the 404, with no header, footer or <main> of its own.
 *
 * WHY IT IS SEPARATE FROM not-found.tsx. Next renders a `not-found.tsx` INSIDE the layout of the
 * segment that owns it, so app/(marketing)/not-found.tsx renders inside the public SiteChrome and
 * app/not-found.tsx renders under the root layout. If the content drew its own SiteChrome it would
 * stack a second navbar and footer on every marketing 404 — which is exactly what happened on
 * /[market]/services/[slug].
 *
 * NO <main> HERE, deliberately: SiteChrome already wraps page content in <main>, and nesting a
 * second one is invalid HTML (and would pick up the `main { flex: 1 }` rule twice). The block is a
 * plain <div> so it is correct both inside the chrome and on its own.
 *
 * `no-underline` is explicit on both links because this project does not import Tailwind's
 * preflight, so a bare anchor keeps the browser's underline and blue.
 */
export default function NotFoundContent() {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 py-20 text-center">
      <span className="mb-3 font-mono text-xs font-semibold tracking-wider text-[#F59E0B] uppercase">
        404
      </span>
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
        We couldn’t find that page
      </h1>
      <p className="mb-8 max-w-lg text-base leading-relaxed text-slate-600">
        The link may be out of date, or the page may never have existed. Nothing is broken on your
        side.
      </p>
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-slate-800"
        >
          Go to the homepage
        </Link>
        <Link
          href="/services"
          className="px-4 py-3 text-sm font-semibold text-slate-700 no-underline transition-colors hover:text-slate-900"
        >
          Browse services
        </Link>
      </div>
    </div>
  );
}
