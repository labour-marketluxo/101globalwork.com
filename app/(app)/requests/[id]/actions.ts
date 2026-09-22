'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function acceptQuoteAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const quoteId = String(formData.get('quote_id') ?? '');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/requests/${requestId}`)}`);

  const { error } = await supabase.rpc('accept_quote_command', { p_quote_id: quoteId });
  if (error) redirect(`/requests/${requestId}?error=${encodeURIComponent('Unable to accept this quote. Please refresh and try again.')}`);
  redirect(`/requests/${requestId}?accepted=1`);
}

/**
 * ⚠️ THE APPROVAL ACTION THAT USED TO LIVE HERE IS GONE, NOT DISABLED. Approving a job releases money to the
 * provider, and it now requires the agreed-criteria checklist and the financial warning on the completion page.
 * Leaving a second action that posted the same command with a note and nothing else would have been the path
 * around that gate — and a path around a gate is the gate not existing. The approval is
 * `approveProjectCompletionAction` in features/customer/completion-actions.ts.
 */
