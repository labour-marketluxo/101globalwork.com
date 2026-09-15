/**
 * DashboardLayout — pass-through shell for the (app) route group.
 *
 * Currently renders children unchanged; the header and footer still come from
 * app/layout.tsx and the admin sidebar still comes from
 * app/(admin)/admin/layout.tsx. Renders `children` deliberately — returning
 * null would blank every page in the group.
 *
 * Intended end state: app header + sidebar + page shell, shared by the
 * customer and provider workspaces.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
