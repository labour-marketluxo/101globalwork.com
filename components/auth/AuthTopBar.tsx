import Link from 'next/link';

/**
 * The bar at the top of every minimal auth screen: the brand, and nothing else.
 *
 * ONE LINK, NO SHORTCUT. The bar used to choose between "Need an account? Sign Up" and
 * "Already registered? Sign In" from the pathname, which made it a client component and put a
 * second exit in the chrome of a screen with one job. The brief asks for the logo alone, so that
 * decision — and the hooks, the route map and the redirect threading that only existed to serve
 * it — are gone. Sign-in carries its own account-switch link under the primary action instead.
 *
 * NO DIVIDER AND NO OPAQUE BAR. `bg-slate-50` matches the canvas MinimalAuthLayout puts behind
 * every card, and there is no bottom border, so the top of the page reads as one surface rather
 * than a white strip stacked on a grey one.
 *
 * The container width is the landing navbar's own gutter pattern — `max-w-7xl` with the same
 * responsive padding — so the logo sits on the same optical line as the brand on the public site.
 */
export default function AuthTopBar() {
  return (
    <header className="w-full bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl items-center px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          {/* The monogram stands in for a real logo tile — same slot as MainNav's, so the
              two bars mark the brand the same way. Drop a real logo in both at once. */}
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-primary bg-primary font-sans text-[11px] font-bold text-white"
          >
            101
          </span>
          <span className="text-base font-bold tracking-tight text-primary sm:text-lg">
            101GlobalWork
          </span>
        </Link>
      </div>
    </header>
  );
}
