import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com'),
  title: { default: '101GlobalWork — Get work done', template: '%s | 101GlobalWork' },
  description: 'Find trusted people and businesses for the work you need done.',
  alternates: { canonical: '/' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">101GlobalWork</Link>
          <nav>
            <Link href="/services">Find services</Link>
            <Link href="/providers">For providers</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>© {new Date().getFullYear()} 101GlobalWork</footer>
      </body>
    </html>
  );
}
