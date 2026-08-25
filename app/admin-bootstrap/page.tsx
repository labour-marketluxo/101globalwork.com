import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bootstrapOwnerAction } from './actions';

export const metadata = { title: 'Establish platform owner', robots: { index: false, follow: false } };

export default async function BootstrapOwnerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin-bootstrap');
  const { data: ownership } = await supabase.from('platform_ownership').select('owner_account_id').maybeSingle();
  if (ownership) redirect('/admin');
  return <section className="content-shell auth-shell"><p className="eyebrow">One-time setup</p><h1>Establish the Platform Owner</h1><p className="lede left">This is a one-time protected operation. The owner cannot be deleted or stripped by another administrator. Remove the bootstrap secret from Vercel after setup.</p>{error ? <p className="notice" role="alert">{error}</p> : null}<form action={bootstrapOwnerAction} className="stack-form"><label htmlFor="bootstrap-token">Bootstrap token</label><input id="bootstrap-token" name="bootstrap_token" type="password" required autoComplete="off"/><button type="submit">Establish this account as owner</button></form></section>;
}
