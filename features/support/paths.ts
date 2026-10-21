/**
 * Support paths — a pure module, deliberately.
 *
 * The server actions, the pages and the account shell all need the same base path, and the help centre links to
 * it from public pages. One constant means the safety card on /help and the case workspace cannot end up
 * pointing at two different places.
 *
 * ⚠️ IT IS `/app/account/support`, BECAUSE SUPPORT BELONGS TO THE ACCOUNT. These four surfaces — support,
 * notifications, messages and settings — are the signed-in person's, not either workspace's, so they
 * live under one `/app/account` prefix that says whose they are. The folder is `app/(app)/account/support`.
 */
export const SUPPORT_PATH = '/app/account/support';

export function supportCasePath(caseId: string): string {
  return `${SUPPORT_PATH}/${caseId}`;
}
