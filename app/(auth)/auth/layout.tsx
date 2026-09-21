import type { Metadata } from 'next';

/**
 * Layout for the /auth/* subtree.
 *
 * It exists for ONE reason: `robots: { index: false, follow: false }` applied to a whole subtree
 * rather than to each page. Every page here also declares it — the brief asks for the tag on each
 * of them, and belt-and-braces is cheap for a tag whose absence is invisible — but this is what
 * covers the page somebody adds in six months and forgets.
 *
 * `follow: false` as well as `index: false`, deliberately: these URLs are not useful to a crawler
 * to walk through, and the pages behind them (/work, /admin, /provider) each guard themselves.
 *
 * WHAT THIS DOES NOT COVER: /auth/callback. It is a route handler, not a page, so it renders no
 * HTML and inherits no metadata — which is correct, since it only ever answers with a redirect.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: render any chrome. The root layout already wraps every route
 * with the marketing header and footer, and the (auth) group's own layout is a pass-through, so
 * the card itself is drawn by AuthShell per page. The alternative — hiding the chrome here the way
 * /admin does — would also hide it on /account/*, which the same group serves, and those are
 * workspace pages rather than a sign-in card.
 *
 * `robots.txt` also does NOT disallow /auth/*, and that is on purpose: a disallowed URL cannot be
 * crawled, so its `noindex` tag can never be read. The meta tag is the mechanism that works; the
 * disallow would only hide the evidence.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthSubtreeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
