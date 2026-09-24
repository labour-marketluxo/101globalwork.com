/**
 * The project tab bar's routes.
 *
 * ⚠️ IT LIVES APART FROM `project.ts` SO A CLIENT COMPONENT CAN IMPORT IT. The tab bar is a client component (the
 * current tab comes from the pathname), and `project.ts` imports the request-scoped Supabase client — importing the
 * tab list from there pulled `next/headers` into the browser bundle, which Next refuses at build time. The routes are
 * pure strings and belong on their own side of that boundary.
 */

export const PROJECT_TABS = [
  { key: 'overview', label: 'Overview', href: (id: string) => `/projects/${id}` },
  { key: 'work', label: 'Work', href: (id: string) => `/projects/${id}/work` },
  { key: 'messages', label: 'Messages', href: (id: string) => `/projects/${id}/messages` },
  { key: 'evidence', label: 'Evidence', href: (id: string) => `/projects/${id}/evidence` },
  { key: 'timeline', label: 'Timeline', href: (id: string) => `/projects/${id}/timeline` },
  { key: 'documents', label: 'Documents', href: (id: string) => `/projects/${id}/documents` },
  { key: 'changes', label: 'Changes', href: (id: string) => `/projects/${id}/changes` },
  { key: 'orders', label: 'Goods', href: (id: string) => `/projects/${id}/orders` },
  { key: 'milestones', label: 'Milestones', href: (id: string) => `/projects/${id}/milestones` },
] as const;
