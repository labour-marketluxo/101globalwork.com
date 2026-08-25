import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptAdminInvitationAction } from './actions';

export const metadata = { title: 'Accept administrator access', robots: { index: false, follow: false } };

export default async function AcceptAdminInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token) redirect('/');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/admin/invitations/accept?token=${token}`)}`);

  return <section className="content-shell auth-shell"><p className="eyebrow">Administrator invitation</p><h1>Accept platform access</h1><p className="lede left">This adds administrative responsibilities to your existing 101GlobalWork account. Your actions will be permission-checked and audited.</p>{error ? <p className="notice" role="alert">{error}</p> : null}<form action={acceptAdminInvitationAction} className="stack-form"><input type="hidden" name="token" value={token}/><button type="submit">Accept administrator access</button></form></section>;
}
