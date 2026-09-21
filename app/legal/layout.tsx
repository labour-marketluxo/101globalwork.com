import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * The legal surface keeps the public chrome.
 *
 * /legal and /legal/[slug] sit outside every route group. That was fine while app/layout.tsx
 * drew the header and footer for the entire app — every route got them whether it wanted them
 * or not. The chrome is now opt-in per group (see components/navigation/SiteChrome.tsx), so
 * this file is what keeps these pages looking like the rest of the public site rather than
 * becoming the only naked pages on it.
 *
 * A future tidy would move this directory into (marketing), which is where the public pages
 * live. It is deliberately left as its own layout here so that relocating a route family does
 * not ride along inside a change about the auth screens.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
