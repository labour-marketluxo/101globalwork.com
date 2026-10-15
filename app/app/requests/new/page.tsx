import { redirect } from 'next/navigation';
import { CUSTOMER_PATHS } from '@/features/customer/intake';

/**
 * The old one-screen intake, kept alive as a redirect.
 *
 * ⚠️ THIS ROUTE IS LINKED FROM EVERY MARKETING CTA ON THE SITE — the pricing page, how-it-works, the
 * service pages, the provider profiles, the market search. The guided flow replaced what happens after
 * the click, so the URL had to keep working: rewriting a dozen CTAs to point at a new path would have
 * been a dozen chances to miss one, and any bookmark, email or ad pointing here would have broken
 * silently. A permanent redirect would be wrong for the same reason this one exists — it is not a
 * permanent relocation of content, it is the same destination reached by a different route, and the
 * old one may be retired properly later.
 *
 * `q` is forwarded because some of those CTAs arrive with a description already typed — the search
 * wizard's outcome prompt, the provider page's "start a request" — and dropping it would mean asking
 * somebody to type what they had just written.
 *
 * There is no auth check here on purpose. The guided flow's first step checks, and it can do it better:
 * it knows which step to come back to, so a signed-out visitor from a marketing CTA signs in and lands
 * on the intent box rather than on the dashboard.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function LegacyNewRequestRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ? `?q=${encodeURIComponent(params.q)}` : '';

  redirect(`${CUSTOMER_PATHS.newRequest}${query}`);
}
