import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * DashboardLayout — the shell for the (app) route group: /work, /requests/* and /provider/*.
 *
 * The customer and provider workspaces currently share the public header and footer, which is
 * what this returns. A workspace sidebar and its own header would be a design decision nobody
 * has taken yet, and inventing one here would be a redesign smuggled into a routing change.
 *
 * It is a real seam now rather than a pass-through: the root layout draws nothing, so a change
 * to this file changes these routes and nothing else.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
