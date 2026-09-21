import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * LandingLayout — the public shell for the (marketing) route group.
 *
 * This was a pass-through while app/layout.tsx drew the header and footer. That is now
 * inverted: the root layout draws no chrome at all, and this is where the public pages get
 * theirs. See components/navigation/SiteChrome.tsx for why it moved — the short version is
 * that chrome drawn by the root layout cannot be excluded from any route, and the auth screens
 * needed exactly that.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
