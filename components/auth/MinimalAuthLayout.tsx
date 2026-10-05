import AuthTopBar from '@/components/auth/AuthTopBar';

/**
 * MinimalAuthLayout — the wrapper for every authentication and onboarding route.
 *
 * WHAT IT REPLACES. These routes used to render inside the full public site chrome: a
 * translucent deep-teal header carrying a mobile menu button, the route dropdowns and a
 * "Post a Request" call to action, and a five-column corporate footer repeating the sitemap.
 * On a sign-in card that is a room full of exits. This keeps one logo-only bar and a centred
 * canvas. The single-row legal footer that used to sit under the canvas is gone too, at the
 * brief's request, so the canvas now runs to the bottom of the page.
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
 * `main { flex: 1 }` still let the canvas fill the viewport. Wrapping the two pieces in a <div>
 * silently breaks that.
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
    </>
  );
}
