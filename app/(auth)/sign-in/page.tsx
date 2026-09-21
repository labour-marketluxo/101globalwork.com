import { permanentRedirect } from 'next/navigation';
import { AUTH_PATHS, aliasTarget, type RawSearchParams } from '@/features/auth/post-auth';

/**
 * /sign-in — retired, redirected.
 *
 * The canonical route is /auth/sign-in. This one stays because it is in browser histories, in
 * links the platform itself published (the provider pages, the marketing pages and a dozen
 * `redirect('/sign-in?next=…')` guards sent visitors here until this change), and quite possibly in
 * whatever a crawler already recorded.
 *
 * PERMANENT (308), not temporary: the mapping is a rename, not a runtime lookup, and the old URL
 * will never serve content again. That is the difference from `/search`, which stays a 307 because
 * it resolves a market at request time and must be free to answer differently later.
 *
 * THE QUERY STRING IS CARRIED OVER UNTOUCHED, and that includes `error`. A visitor whose sign-in
 * failed on the old URL gets the failure explained on the new one rather than a blank form —
 * which is exactly the kind of detail that makes a rename feel broken when it is missed.
 */
export default async function LegacySignInRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  permanentRedirect(aliasTarget(AUTH_PATHS.signIn, await searchParams));
}
