import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import MfaClient from './mfa-client';

export const metadata = { title: 'Account security', robots: { index: false, follow: false } };

function safeNext(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/admin';
  return value;
}

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const query = await searchParams;
  const nextPath = safeNext(query.next);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/account/security?next=${encodeURIComponent(nextPath)}`)}`);

  return <section className="content-shell">
    <p className="eyebrow">Account security</p>
    <h1>Strong authentication for sensitive work.</h1>
    <p className="lede left">Administrator access alone is not enough for high-risk actions. 101GlobalWork requires a second factor before money movement, ownership transfer and similar operations.</p>
    <MfaClient nextPath={nextPath} />
    <p className="hint"><Link href={nextPath}>Return without changing security</Link></p>
  </section>;
}
