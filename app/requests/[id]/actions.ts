'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function acceptQuoteAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const quoteId = String(formData.get('quote_id') ?? '');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/requests/${requestId}`)}`);

  const { error } = await supabase.rpc('accept_quote_command', { p_quote_id: quoteId });
  if (error) redirect(`/requests/${requestId}?error=${encodeURIComponent('Unable to accept this quote. Please refresh and try again.')}`);
  redirect(`/requests/${requestId}?accepted=1`);
}
