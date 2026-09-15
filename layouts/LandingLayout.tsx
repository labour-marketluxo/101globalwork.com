/**
 * LandingLayout — pass-through shell for the (marketing) route group.
 *
 * Currently renders children unchanged: the real header and footer are still
 * provided by app/layout.tsx, so this is a structural seam, not yet a visual
 * one. It renders `children` deliberately — returning null here would blank
 * every page in the group.
 *
 * Intended end state: MainNav + page content + Footer, with the header and
 * footer relocated out of the root layout.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
