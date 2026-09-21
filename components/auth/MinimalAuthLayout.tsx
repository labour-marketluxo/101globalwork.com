import Link from 'next/link';
import AuthTopBar from '@/components/auth/AuthTopBar';

/**
 * MinimalAuthLayout — the wrapper for every authentication and onboarding route.
 *
 * WHAT IT REPLACES. These routes used to render inside the full public site chrome: a
 * translucent deep-teal header carrying a mobile menu button, the route dropdowns and a
 * "Post a Request" call to action, and a five-column corporate footer repeating the sitemap.
 * On a sign-in card that is a room full of exits. This wraps the same content in a bar with
 * one link, a centred canvas, and a single-row footer carrying only the things a person
 * entering credentials might actually want to check.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: draw the card. The heading, the notice and the card all
 * still come from AuthShell, per page, for one concrete reason — the shell has two widths.
 * `max-w-md` for the credential forms, `max-w-xl` for the invitation, whose role, inviter,
 * permissions and expiry all have to be readable before the buttons. Hoisting the card into
 * the layout would have meant either losing that distinction or teaching the layout to read
 * the page's mind. The card's STYLING moved here conceptually and lives in one place instead,
 * the AUTH_CARD constant in AuthSections.tsx.
 *
 * THE FRAGMENT IS LOAD-BEARING, as it is in SiteChrome: <main> has to stay a direct child of
 * <body> so that globals.css's `body { display: flex; flex-direction: column }` and
 * `main { flex: 1 }` still push the footer to the bottom of an otherwise short page. Wrapping
 * the three pieces in a <div> silently breaks that.
 *
 * The centring is `min-h-[80vh]` + `justify-center` rather than a fixed height: a verify page
 * with an error notice is taller than one without, and a challenge page with a second factor
 * hanging off it is taller again. A centred column with a floor grows; a fixed height clips.
 */
export default function MinimalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthTopBar />

      <main className="flex min-h-[80vh] flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="w-full border-t border-solid border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          {/* Rendered on the server, like Footer.tsx does, so there is no client/server
              clock disagreement — the year cannot differ mid-hydration because the client
              never renders this. */}
          <p>&copy; {new Date().getFullYear()} 101GlobalWork. All rights reserved.</p>

          {/*
            ⚠️ THERE IS NO SUPPORT OR HELP CENTRE, and the brief asked for one. There is no
            /support, /help or /contact route anywhere in this app — a link to one would be a
            404 in the footer of the page where somebody is deciding whether to trust the
            platform with a password. /how-it-works is the closest thing that exists: it
            explains the quote-then-pay model in plain language. It is labelled as itself
            rather than as "Support", because a link whose label and destination disagree is
            how a footer starts lying.
          */}
          <nav aria-label="Legal and help" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/legal/terms" className={FOOTER_LINK}>
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className={FOOTER_LINK}>
              Privacy Policy
            </Link>
            <Link href="/how-it-works" className={FOOTER_LINK}>
              How it works
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

/** Muted, underlined, and explicit about both — Preflight is not imported here. */
const FOOTER_LINK =
  'text-slate-500 underline underline-offset-2 transition-colors hover:text-primary';
