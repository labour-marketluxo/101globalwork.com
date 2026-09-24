/**
 * Support paths — a pure module, deliberately.
 *
 * The server actions, the pages and the account shell all need the same base path, and the help centre links to
 * it from public pages. One constant means the safety card on /help and the case workspace cannot end up
 * pointing at two different places.
 *
 * ⚠️ IT IS `/support`, NOT `/app/support`. The brief's `/app/support/[caseId]` is this repository's `(app)`
 * route group: the group name does not appear in the URL, which is the same mapping every other signed-in
 * surface in this codebase uses (see app/(app)/layout.tsx).
 */
export const SUPPORT_PATH = '/support';

export function supportCasePath(caseId: string): string {
  return `${SUPPORT_PATH}/${caseId}`;
}
