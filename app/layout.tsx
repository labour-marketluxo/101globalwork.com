import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import './entry-points.css';

/**
 * Typography — the design specifies two faces:
 *
 *   Hanken Grotesk   everything structural: display, headline, title, body
 *   JetBrains Mono   quantitative metadata only — metrics, IDs, timestamps
 *
 * Both load through next/font so Next self-hosts them: the @font-face rules are
 * inlined and the files fingerprinted. Do NOT also add Google Fonts <link> tags
 * — that fetches the same families a second time from a third-party origin and
 * undoes the self-hosting.
 *
 * `.variable` is used rather than `.className` because next/font generates a
 * HASHED family name (e.g. "__Hanken_Grotesk_abc123"). A literal
 * `--font-sans: "Hanken Grotesk"` could never match that, so `font-sans` would
 * silently fall back to system-ui. The variables are consumed by --font-sans
 * and --font-mono in app/globals.css.
 */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hanken-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com'),
  title: { default: '101GlobalWork — Get work done', template: '%s | 101GlobalWork' },
  description: 'Find trusted people and businesses for the work you need done.',
  alternates: { canonical: '/' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // `suppressHydrationWarning` on <body> is scoped to that element's OWN
  // attributes (one level deep). It does not suppress mismatches in children, so
  // genuine hydration bugs below <body> are still reported.
  //
  // It is needed because browser extensions mutate <body> after the server HTML
  // arrives but before React hydrates. Grammarly is the one we see: it injects
  // `data-gr-ext-installed` and `data-new-gr-c-s-check-loaded`. React then reports
  // an unfixable mismatch that has nothing to do with this app's markup. Verified:
  // neither attribute appears anywhere in this repository, so nothing here emits
  // them.
  //
  // Kept as a JS comment rather than a JSX comment deliberately — a comment node
  // directly inside <html> risks a DOM-nesting warning of its own.
  //
  // ⚠️ THIS LAYOUT RENDERS NO CHROME, and that is the point rather than an omission. The
  // marketing header and footer used to be drawn here, which made them impossible to opt out
  // of: a nested layout can add to its parent's output but cannot remove any of it, so the
  // only way to keep the nav off a route was to hide it with CSS — which is exactly what
  // app/(admin)/admin/layout.tsx had to do, injecting `display: none` on every admin screen
  // while still shipping the nav markup.
  //
  // Each group draws its own now: components/navigation/SiteChrome.tsx for the public and
  // workspace routes, components/auth/MinimalAuthLayout.tsx for the credential and onboarding
  // screens, and its own frame for /admin. <body> keeps `display: flex; flex-direction:
  // column` from globals.css, so whichever layout renders here must still put <main> directly
  // under <body> — that is what pins the footer to the bottom of a short page.
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
