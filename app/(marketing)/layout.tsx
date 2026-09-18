import LandingLayout from '@/layouts/LandingLayout';

/**
 * Route group: (marketing)
 *
 * Public, unauthenticated pages. The group name does not appear in the URL —
 * `/`, `/services`, `/providers` and `/[market]/...` are unchanged. `/search` is no
 * longer a page: it answers with a 307 to `/[market]/search`, so search only ever
 * renders under a market.
 *
 * LandingLayout is currently a pass-through; the header and footer still come
 * from the root layout. See layouts/LandingLayout.tsx.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <LandingLayout>{children}</LandingLayout>;
}
