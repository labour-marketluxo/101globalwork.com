import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AuthNav — the header's link group, rendered per session state.
 *
 * Styling comes from Tailwind utilities on the landing palette. `.nav-discovery`
 * and `.header-cta` are kept as semantic hooks, and the sign-in link keeps the
 * literal href="/sign-in".
 *
 * Responsive behaviour is now Tailwind's job rather than the media query that
 * used to live in app/entry-points.css: secondary links drop out on small
 * screens so the bar stays one row — brand, primary CTA, and only what fits.
 */
const LINK =
  'text-sm font-medium text-text-muted no-underline transition-colors hover:text-text-main';

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
      <nav aria-label="Primary navigation" className="flex items-center gap-3 sm:gap-5">
        <Link href="/services" className={`nav-discovery hidden md:inline-flex ${LINK}`}>Find services</Link>
        <Link href="/work" className={LINK}>My work</Link>
        <Link href={hasProvider ? '/provider' : '/providers'} className={`hidden sm:inline-flex ${LINK}`}>
          {hasProvider ? 'Provider workspace' : 'Become a provider'}
        </Link>
        <Link href="/account/security" title={user.email ?? undefined} className={LINK}>Account</Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary navigation" className="flex items-center gap-3 sm:gap-5">
      <Link href="/services" className={`nav-discovery hidden md:inline-flex ${LINK}`}>Find services</Link>
      <Link href="/providers" className={`hidden sm:inline-flex ${LINK}`}>Become a provider</Link>
      <Link href="/sign-in" className={`hidden items-center gap-1.5 sm:inline-flex ${LINK}`}>
        <LogIn aria-hidden="true" className="h-4 w-4" />
        Sign in
      </Link>
      <Link
        href="/sign-up?intent=customer&next=/"
        className="header-cta inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand-hover"
      >
        Create account
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </nav>
  );
}
