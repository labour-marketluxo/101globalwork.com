import DashboardLayout from '@/layouts/DashboardLayout';

/**
 * Route group: (app)
 *
 * Signed-in workspace surfaces: /work, /requests/* and /provider/*. The group
 * name does not appear in the URL.
 *
 * DashboardLayout is currently a pass-through; the header and footer still
 * come from the root layout. See layouts/DashboardLayout.tsx.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
