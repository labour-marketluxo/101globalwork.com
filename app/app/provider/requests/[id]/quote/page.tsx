import { redirect } from 'next/navigation';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The retired quote form — kept alive as a redirect.
 *
 * ⚠️ WHY IT IS NOT DELETED OUTRIGHT. This URL was linked from the provider workspace, from the opportunity
 * cards and from anything a provider had bookmarked, and a 404 on a link somebody is following mid-job is worse
 * than one extra hop. It stays until those links have aged out.
 *
 * ⚠️ `?provider=<uuid>` IS DROPPED HERE ON PURPOSE. The old route needed it because the form was rendered from
 * a query parameter; the quote builder resolves the provider from the session and re-checks ownership inside the
 * command, so a canonical identifier no longer travels in the URL bar, the browser history, or whatever
 * somebody pastes into a chat.
 */
export default async function RetiredProviderQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // The old failure code was free text in the query string; the builder takes a fixed vocabulary, so an old
  // refusal becomes the generic one rather than being echoed into a platform notice.
  const suffix = query.error ? '&failed=eligibility' : '';
  redirect(`${PROVIDER_PATHS.quotesNew}?request=${encodeURIComponent(id)}${suffix}`);
}
