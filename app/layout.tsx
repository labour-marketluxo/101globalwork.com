import type { Metadata } from 'next';
import MainNav from '@/components/navigation/MainNav';
import Footer from '@/components/navigation/Footer';
import './globals.css';
import './entry-points.css';

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
    <html lang="en">
      <body suppressHydrationWarning>
        <MainNav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
