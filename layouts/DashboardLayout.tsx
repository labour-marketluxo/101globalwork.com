/**
 * DashboardLayout — the shell for the (app) route group: the signed-in workspace surfaces
 * (/customer/*, /provider/*, /settings/*, /messages, /notifications, /requests/*, /projects/*,
 * /org/*, /programmes/*, /work and /support).
 *
 * ⚠️ IT RENDERS NO PUBLIC CHROME, AND THAT IS THE POINT. The marketing header and footer
 * (components/navigation/SiteChrome.tsx) advertise "Sign in" and "Create an account", so they
 * have no business on a screen that already knows who you are. The public chrome used to surround
 * every workspace page, which also left the customer and provider shells drawing a second bar
 * beneath a first one that disagreed with it about where the visitor was.
 *
 * Each workspace draws its own identity and navigation now: app/(app)/customer/layout.tsx
 * (breadcrumbs + view switcher), app/(app)/provider/layout.tsx (workspace header + sidebar) and
 * the account header shared by /settings, /messages and /notifications. A workspace route that
 * draws nothing simply inherits the plain canvas instead of the marketing bar.
 *
 * ⚠️ <main> STAYS A DIRECT CHILD OF <body>. globals.css sets `body { display: flex;
 * flex-direction: column }` and `main { flex: 1 }`; wrapping this in a <div> would put the flex
 * child between body and main and undo that rule for every workspace page.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
