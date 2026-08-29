import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

    return <nav aria-label="Primary navigation">
      <Link href="/services" className="nav-discovery">Find services</Link>
      <Link href={hasProvider ? '/provider' : '/providers'}>{hasProvider ? 'Provider workspace' : 'Become a provider'}</Link>
      <Link href="/account/security" title={user.email ?? undefined}>Account</Link>
    </nav>;
  }

  return <nav aria-label="Primary navigation">
    <Link href="/services" className="nav-discovery">Find services</Link>
    <Link href="/providers">Become a provider</Link>
    <Link href="/sign-in">Sign in</Link>
    <Link href="/sign-up?intent=customer&next=/" className="header-cta">Create account</Link>
  </nav>;
}
