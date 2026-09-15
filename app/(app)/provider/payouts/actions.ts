'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPaystackTransferRecipient, resolvePaystackAccount } from '@/lib/payments/paystack-operations';

function safeMessage(value: string) {
  return encodeURIComponent(value.replace(/[^a-zA-Z0-9 .,_-]/g, '').slice(0, 160));
}

export async function savePayoutDestinationAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const bankCode = String(formData.get('bank_code') ?? '').trim();
  const accountNumber = String(formData.get('account_number') ?? '').replace(/\s+/g, '');
  const currencyCode = String(formData.get('currency_code') ?? 'NGN').trim().toUpperCase();

  if (!providerId || !/^\d{3,12}$/.test(bankCode) || !/^\d{8,16}$/.test(accountNumber) || !/^[A-Z]{3}$/.test(currencyCode)) {
    redirect('/provider/payouts?error=Check%20the%20bank%20and%20account%20details');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/provider/payouts');

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/provider/onboarding');
  const { data: provider } = await supabase.from('providers').select('id,display_name').eq('id', providerId).eq('owner_account_id', account.id).maybeSingle();
  if (!provider) redirect('/provider/payouts?error=Provider%20not%20found');

  try {
    const resolved = await resolvePaystackAccount({ accountNumber, bankCode });
    const recipient = await createPaystackTransferRecipient({
      name: resolved.account_name || provider.display_name,
      accountNumber,
      bankCode,
      currencyCode,
    });
    if (!recipient.recipient_code) throw new Error('Recipient was not created');

    const service = createSupabaseServiceClient();
    await service.from('provider_payout_destinations').update({ is_default: false, updated_at: new Date().toISOString() }).eq('provider_id', providerId).eq('currency_code', currencyCode);
    const { error } = await service.from('provider_payout_destinations').insert({
      provider_id: providerId,
      adapter_key: 'paystack',
      currency_code: currencyCode,
      destination_type: 'bank_account',
      provider_recipient_code: recipient.recipient_code,
      bank_code: bankCode,
      account_last4: accountNumber.slice(-4),
      account_name: resolved.account_name,
      verification_status: 'verified',
      is_default: true,
      metadata: { source: 'provider_verified_paystack_recipient' },
    });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify payout account';
    redirect(`/provider/payouts?error=${safeMessage(message)}`);
  }

  redirect('/provider/payouts?success=Payout%20account%20verified');
}
