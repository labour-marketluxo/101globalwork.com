import NotFoundContent from '@/components/ui/NotFoundContent';

/**
 * 404 for the (marketing) group.
 *
 * This exists so a public 404 has a boundary INSIDE the group: it renders inside
 * app/(marketing)/layout.tsx, which draws the public header and footer, so the page gets the site
 * chrome exactly once. Without it the request bubbles to app/not-found.tsx, which is what produced
 * the stacked navbar and footer on /[market]/services/[slug].
 *
 * The content draws no chrome of its own — see components/ui/NotFoundContent.tsx.
 */
export default function MarketingNotFound() {
  return <NotFoundContent />;
}
