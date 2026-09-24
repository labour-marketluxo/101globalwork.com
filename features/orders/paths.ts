/**
 * Where a project's goods orders live.
 *
 * ⚠️ IT IS UNDER THE PROJECT, NOT UNDER /app/orders. An order belongs to a job: it is materials for that work,
 * it is read by the two parties to that work, and its money is tied to that assignment. `projectId` is the
 * assignment id, the same mapping every other project surface uses.
 */
export function projectOrdersPath(projectId: string): string {
  return `/projects/${projectId}/orders`;
}
