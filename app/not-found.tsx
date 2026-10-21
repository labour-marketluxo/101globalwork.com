import NotFoundContent from '@/components/ui/NotFoundContent';

/**
 * Global 404 — content only.
 *
 * Next marks 404 responses noindex automatically, so no robots metadata is needed here.
 *
 * WHY THERE IS NO SiteChrome HERE. A `not-found.tsx` is rendered inside the layout of the segment
 * that owns it; the root file's owner is app/layout.tsx, which draws no chrome, and the marketing
 * file's owner is app/(marketing)/layout.tsx, which draws SiteChrome. The old version drew
 * SiteChrome itself, so a marketing 404 rendered the header and footer twice — once from the
 * marketing layout and once from here. The chrome is now the layout's job and the 404 only supplies
 * the body. See components/ui/NotFoundContent.tsx.
 *
 * A path that matches no group at all has no chrome to inherit and renders this block on its own;
 * that is the one case with no navigation, and the block still carries both escape links.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
