'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function submitQuoteAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const providerId = String(formData.get('provider_id') ?? '');
  const currency = String(formData.get('currency_code') ?? '').trim().toUpperCase();
  const major = Number(String(formData.get('amount') ?? '0'));
  const totalMinor = Number.isFinite(major) ? Math.round(major * 100) : -1;
  const summary = String(formData.get('summary') ?? '').trim();
  const validUntilRaw = String(formData.get('valid_until') ?? '').trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/provider/requests/${requestId}/quote?provider=${providerId}`)}`);

  if (totalMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
    redirect(`/provider/requests/${requestId}/quote?provider=${providerId}&error=${encodeURIComponent('Enter a valid amount and currency.')}`);
  }

  const { error } = await supabase.rpc('submit_quote_command', {
    p_request_id: requestId,
    p_provider_id: providerId,
    p_currency_code: currency,
    p_total_minor: totalMinor,
    p_summary: summary || null,
    p_scope_snapshot: {},
    p_valid_until: validUntilRaw ? new Date(validUntilRaw).toISOString() : null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) redirect(`/provider/requests/${requestId}/quote?provider=${providerId}&error=${encodeURIComponent('This quote could not be submitted. Check eligibility and request status, then try again.')}`);
  redirect(`/provider/requests/${requestId}/quote?provider=${providerId}&sent=1`);
}
