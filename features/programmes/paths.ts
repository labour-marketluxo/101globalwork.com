/**
 * Programme routes — pure, so a client component (the tab bar) can import them.
 *
 * ⚠️ `programmeId` IS THE PROGRAMME'S OWN ID. Unlike the project routes, where the brief's "project" is an
 * assignment, a programme is a real table and the id is its own. The brief's `/app/programmes/{id}` maps onto this
 * repository's `(app)` route group, so the URLs are /programmes/{id}, /programmes/{id}/workers and
 * /programmes/{id}/insights.
 */
export function programmePath(programmeId: string): string {
  return `/programmes/${programmeId}`;
}

export function programmeWorkersPath(programmeId: string): string {
  return `/programmes/${programmeId}/workers`;
}

export function programmeInsightsPath(programmeId: string): string {
  return `/programmes/${programmeId}/insights`;
}

export const PROGRAMME_TABS = [
  { key: 'dashboard', label: 'Dashboard', href: programmePath },
  { key: 'workers', label: 'Worker registry', href: programmeWorkersPath },
  { key: 'insights', label: 'Labour intelligence', href: programmeInsightsPath },
] as const;

export type ProgrammeTabKey = (typeof PROGRAMME_TABS)[number]['key'];
