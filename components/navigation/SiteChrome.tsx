import MainNav from '@/components/navigation/MainNav';
import Footer from '@/components/navigation/Footer';

/**
 * SiteChrome — the public header, the page container, and the corporate footer, as one
 * component.
 *
 * WHY THIS EXISTS NOW. The root layout used to draw this for every route in the app, which
 * made it impossible to have a route without it: a nested layout can add to a parent's output
 * but cannot remove it. The only way to exclude chrome from a route was to hide it with CSS —
 * which is what app/(admin)/admin/layout.tsx did, injecting `.site-header, body > footer {
 * display: none }` on every admin screen and still shipping the nav markup to the browser.
 *
 * So the chrome moved here, and each route group decides whether to render it:
 *
 *   (marketing)   yes — the public pages
 *   (app)         yes — the signed-in workspace
 *   (auth)        yes — /account/* and the redirect aliases, which are workspace surfaces
 *   (minimal-auth) no — it draws its own bar and footer instead
 *   (admin)       no — it has its own frame and hides nothing now
 *
 * THE FRAGMENT IS LOAD-BEARING. `<header>`, `<main>` and `<footer>` must all stay DIRECT
 * children of `<body>`: Footer.tsx is deliberately written as a bare <footer> so that
 * `body > footer` matches it, and globals.css sets `body { display: flex; flex-direction:
 * column }` with `main { flex: 1 }` so the footer sits at the bottom of a short page. Wrapping
 * these three in a <div> would break the sticky footer and the selectors that go with it.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MainNav />
      <main>{children}</main>
      <Footer />
    </>
  );
}
