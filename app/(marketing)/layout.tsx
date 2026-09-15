import LandingLayout from '@/layouts/LandingLayout';

/**
 * Route group: (marketing)
 *
 * Public, unauthenticated pages. The group name does not appear in the URL —
 * `/`, `/services`, `/search`, `/providers` and `/[country]/...` are unchanged.
 *
 * LandingLayout is currently a pass-through; the header and footer still come
 * from the root layout. See layouts/LandingLayout.tsx.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <LandingLayout>{children}</LandingLayout>;
}
