import { redirect } from 'next/navigation';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The retired job page — kept alive as a redirect.
 *
 * ⚠️ WHY IT IS NOT DELETED. `/provider/assignments/<id>` was linked from the workspace header, from quote detail
 * pages and from anything a provider had bookmarked, and a 404 on a link somebody is following while standing on
 * site is worse than one extra hop.
 *
 * ⚠️ AND WHY IT IS RETIRED. It read `requests` directly, which providers have no read policy on, so a provider
 * opening their own accepted job met `notFound()`. The replacement reads a command that re-checks the
 * provider-assignment relationship, and the route name now says what the page is: work.
 */
export default async function RetiredProviderAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`${PROVIDER_PATHS.work}/${encodeURIComponent(id)}`);
}
