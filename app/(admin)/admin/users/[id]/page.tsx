import { redirect } from 'next/navigation';

/**
 * /admin/users/[id] now redirects to /admin/accounts/[accountId].
 *
 * ⚠️ WHY A REDIRECT RATHER THAN TWO ACCOUNT PAGES. This route rendered the raw email address and had no
 * session list, no standing control and no audited contact read — it was the surface
 * /admin/accounts/[accountId] replaced. Leaving both alive would mean two pages that disagree about how
 * much of a person is shown and about which of them can end a session, and the older one would keep
 * printing the address the newer one masks. Keeping the path as a redirect preserves every existing
 * bookmark and every link outside this console.
 */
export default async function RetiredAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/accounts/${id}`);
}
