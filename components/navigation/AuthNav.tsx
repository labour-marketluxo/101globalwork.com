import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AuthNav — the header's right-hand action group, rendered per session state.
 *
 * Ported to the design: slate-200 links that go white on hover, and the amber
 * "Post a request" CTA. The CTA is the ONLY amber element in the chrome, which
 * is what the design asks for — amber is reserved for actions and status
 * emphasis, never decoration.
 *
 * Every anchor carries `no-underline` explicitly: preflight is deliberately not
 * imported in this project, so there is no global `a { text-decoration: none }`
 * and a bare <a> renders browser-default blue and underlined.
 *
 * The CTA always targets /requests/new. Signed-out visitors are routed through
 * sign-up first, carrying `next` so they land back on the request form rather
 * than the homepage.
 *
 * Responsive order of disappearance: section links (MainNav, <lg), trust pill
 * (<xl), then here — Account (<md), provider link (<lg), sign-in (<sm). The CTA
 * never collapses, so the bar is always actionable and always one row.
 */

const LINK =
  'no-underline text-[14px] font-medium text-slate-200 transition-colors hover:text-white';

const CTA =
  'inline-flex shrink-0 items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 font-mono text-sm font-medium text-white no-underline shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark sm:px-5';

export default async function AuthNav() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
    let hasProvider = false;
    if (account?.id) {
      const { count } = await supabase.from('providers').select('id', { count: 'exact', head: true }).eq('owner_account_id', account.id).neq('status', 'closed');
      hasProvider = Boolean(count);
    }

    return (
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <nav aria-label="Account navigation" className="hidden items-center gap-5 sm:flex">
          <Link href="/work" className={LINK}>My work</Link>
          <Link href={hasProvider ? '/provider' : '/providers'} className={`hidden lg:inline-flex ${LINK}`}>
            {hasProvider ? 'Provider workspace' : 'Become a provider'}
          </Link>
          <Link
            href="/account/security"
            title={user.email ?? undefined}
            className={`hidden md:inline-flex ${LINK}`}
          >
            Account
          </Link>
        </nav>
        <Link href="/requests/new" className={CTA}>
          Post a request
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <Link href="/sign-in" className={`hidden items-center gap-1.5 sm:inline-flex ${LINK}`}>
        <LogIn aria-hidden="true" className="h-4 w-4" />
        Sign in
      </Link>
      <Link
        href={`/sign-up?intent=customer&next=${encodeURIComponent('/requests/new')}`}
        className={CTA}
      >
        Post a request
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}
