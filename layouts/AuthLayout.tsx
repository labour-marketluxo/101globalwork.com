/**
 * AuthLayout — pass-through shell for the (auth) route group.
 *
 * Currently renders children unchanged. The centred card shell is applied per
 * page today via the `.auth-shell` class in app/globals.css, so this is a
 * structural seam, not yet a visual one. Renders `children` deliberately —
 * returning null would blank every page in the group.
 *
 * Intended end state: centred card shell + brand mark.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
