import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import MainNav from '@/components/navigation/MainNav';
import Footer from '@/components/navigation/Footer';
import './globals.css';
import './entry-points.css';

/**
 * Plus Jakarta Sans — the Option A primary typeface.
 *
 * Loaded through next/font so Next self-hosts it: the @font-face rules are
 * inlined and the files fingerprinted. Do NOT also add the Google Fonts <link>
 * and preconnect tags from the design brief — that would fetch the same family
 * a second time from a third-party origin and undo the self-hosting.
 *
 * `.variable` is used rather than `.className` because next/font generates a
 * hashed family name (e.g. "__Plus_Jakarta_Sans_abc123"). A literal
 * `--font-sans: "Plus Jakarta Sans"` could never match that, so `font-sans`
 * would silently fall back to the system stack. Exposing the CSS variable lets
 * `--font-sans` in app/globals.css point at the real font, which is what
 * satisfies "ensure font-sans maps to Plus Jakarta Sans".
 */
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
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
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <body suppressHydrationWarning>
        <MainNav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
