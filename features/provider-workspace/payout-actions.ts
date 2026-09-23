'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  createPaystackTransferRecipient,
  fetchPaystackTransferRecipient,
  resolvePaystackAccount,
} from '@/lib/payments/paystack-operations';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import { PROVIDER_PATHS, type ProviderFailureCode } from '@/features/provider-workspace/paths';

/**
 * Payout writes. Separate from the rest of the workspace's actions because these are the only ones that touch the
 * payment provider and the service-role client, and a module that imports those should be small enough to read in
 * one sitting.
 *
 * ⚠️ EVERY DESTINATION CHANGE IS GATED BY A STEP-UP. If the account has a verified second factor and this session
 * has not passed it, the action sends the provider to `/auth/challenge` and back. Accounts WITHOUT a factor fall
 * through, and the page says so rather than implying a check that will not happen — the same honest limit the
 * sessions page states, for the same reason: this platform has no password re-entry primitive.
 *
 * ⚠️ THE ACCOUNT NUMBER NEVER REACHES OUR DATABASE. It goes to Paystack to be resolved and turned into a recipient
 * code; what is stored is the code, the account name they confirmed and the last four digits.
 */

async function authedClient(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function targetPath(formData: FormData, fallback: string): string {
  return safeInternalPath(String(formData.get('next') ?? ''), fallback);
}

function backTo(formData: FormData, params: Record<string, string>, fallback: string = PROVIDER_PATHS.payouts): never {
  const target = targetPath(formData, fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

function fail(formData: FormData, code: ProviderFailureCode, fallback?: string): never {
  return backTo(formData, { failed: code }, fallback ?? PROVIDER_PATHS.payouts);
}

function failureCode(message: string): ProviderFailureCode {
  const text = message.toLowerCase();
  if (text.includes('authentication required') || text.includes('active account required')) return 'not_authorized';
  if (text.includes('not authorized') || text.includes('forbidden') || text.includes('not found')) return 'not_authorized';
  if (text.includes('required') || text.includes('invalid') || text.includes('could not be verified')) return 'bad_request';
  return 'unavailable';
}

/**
 * The step-up gate, as a function.
 *
 * It redirects when a factor exists and this session has not passed it, and returns quietly otherwise — so a
 * caller that continues knows it is either at aal2 or on an account with nothing to challenge.
 */
async function requiresFactorStepUp(next: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    redirect(hrefWith(AUTH_PATHS.challenge, { next }));
  }
}

function safeMessage(value: string) {
  return value.replace(/[^a-zA-Z0-9 .,_-]/g, '').slice(0, 160);
}

/**
 * Add or replace the payout destination.
 *
 * ⚠️ THE NEW DESTINATION BECOMES THE DEFAULT AND THE OLD ONE STOPS BEING IT, in that order, inside one request.
 * Two defaults would make "which account is my money going to" a question with two answers, and the payout
 * execution path picks the default.
 */
export async function savePayoutDestinationAction(formData: FormData) {
  const providerId = String(formData.get('provider_id') ?? '');
  const destinationType = String(formData.get('destination_type') ?? 'bank_account');
  const bankCode = String(formData.get('bank_code') ?? '').trim();
  const accountNumber = String(formData.get('account_number') ?? '').replace(/\s+/g, '');
  const currencyCode = String(formData.get('currency_code') ?? 'NGN').trim().toUpperCase();
  const nextPath = `${PROVIDER_PATHS.payouts}?provider=${providerId}`;

  if (!providerId || !['bank_account', 'mobile_money'].includes(destinationType)) {
    return fail(formData, 'bad_request');
  }
  if (!/^\d{3,12}$/.test(bankCode) || !/^\d{8,16}$/.test(accountNumber) || !/^[A-Z]{3}$/.test(currencyCode)) {
    return fail(formData, 'bad_request');
  }

  const supabase = await authedClient(PROVIDER_PATHS.payouts);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user?.id ?? '').maybeSingle();
  if (!account) return fail(formData, 'not_authorized');

  const { data: provider } = await supabase
    .from('providers')
    .select('id,display_name')
    .eq('id', providerId)
    .eq('owner_account_id', account.id)
    .maybeSingle();
  if (!provider) return fail(formData, 'not_authorized');

  // Step-up last, so a malformed form never sends somebody through a second factor for nothing.
  await requiresFactorStepUp(nextPath);

  try {
    const resolved = await resolvePaystackAccount({ accountNumber, bankCode });
    const recipient = await createPaystackTransferRecipient({
      name: resolved.account_name || provider.display_name,
      accountNumber,
      bankCode,
      currencyCode,
      type: destinationType === 'mobile_money' ? 'mobile_money' : 'nuban',
    });
    if (!recipient.recipient_code) throw new Error('Recipient was not created');

    const service = createSupabaseServiceClient();
    await service
      .from('provider_payout_destinations')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('provider_id', providerId)
      .eq('currency_code', currencyCode);

    const { error } = await service.from('provider_payout_destinations').insert({
      provider_id: providerId,
      adapter_key: 'paystack',
      currency_code: currencyCode,
      destination_type: destinationType,
      provider_recipient_code: recipient.recipient_code,
      bank_code: bankCode,
      account_last4: accountNumber.slice(-4),
      account_name: resolved.account_name,
      verification_status: 'verified',
      is_default: true,
      metadata: {
        source: destinationType === 'mobile_money' ? 'provider_verified_paystack_momo' : 'provider_verified_paystack_recipient',
      },
    });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify the payout destination';
    return fail(formData, failureCode(message));
  }

  backTo(formData, { payout: 'destination_saved' });
}

/**
 * Ask the payment provider whether a destination is still usable.
 *
 * ⚠️ IT CHECKS THE RECIPIENT WE ALREADY HOLD; IT DOES NOT ASK FOR THE ACCOUNT NUMBER AGAIN. "Retry verification"
 * on a stored destination means "is this still valid at Paystack", and re-resolving an account number would be a
 * different action — a change of destination, with its own step-up. A recipient Paystack reports as inactive is
 * marked failed here, which stops the payout path choosing it silently.
 */
export async function retryPayoutVerificationAction(formData: FormData) {
  const destinationId = String(formData.get('destination_id') ?? '');
  const supabase = await authedClient(PROVIDER_PATHS.payouts);

  const { data: destination } = await supabase
    .from('provider_payout_destinations')
    .select('id,provider_id,provider_recipient_code,adapter_key')
    .eq('id', destinationId)
    .maybeSingle();
  if (!destination) return fail(formData, 'not_authorized');
  if (destination.adapter_key !== 'paystack' || !destination.provider_recipient_code) {
    return fail(formData, 'bad_request');
  }

  await requiresFactorStepUp(`${PROVIDER_PATHS.payouts}?provider=${destination.provider_id}`);

  try {
    const recipient = await fetchPaystackTransferRecipient(destination.provider_recipient_code);
    const service = createSupabaseServiceClient();
    const { error } = await service
      .from('provider_payout_destinations')
      .update({
        verification_status: recipient.active ? 'verified' : 'failed',
        updated_at: new Date().toISOString(),
        metadata: { verification_checked_at: new Date().toISOString(), provider_active: recipient.active },
      })
      .eq('id', destination.id);
    if (error) throw error;
    backTo(formData, { payout: recipient.active ? 'reverified' : 'reverify_failed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification check failed';
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] recipient check failed: ${safeMessage(message)}`);
    }
    return fail(formData, 'unavailable');
  }
}

/**
 * Ask the platform to send eligible payouts.
 *
 * ⚠️ IT QUEUES, AND THE DATABASE DECIDES WHICH ONES. Every id posted goes to `request_my_payout_command`, which
 * re-checks ownership, status and the same block reasons the admin path uses — so a tampered form cannot queue
 * somebody else's payout, or one that is not ready. The transfer itself still needs the platform's service-role
 * execution path; a browser session never moves money.
 */
export async function requestPayoutsAction(formData: FormData) {
  const payoutIds = formData.getAll('payout_ids').map(value => String(value)).filter(Boolean);
  const supabase = await authedClient(PROVIDER_PATHS.earnings);
  if (payoutIds.length === 0) return fail(formData, 'bad_request', PROVIDER_PATHS.earnings);

  let queued = 0;
  let refused = false;
  for (const payoutId of payoutIds) {
    const { error } = await supabase.rpc('request_my_payout_command', { p_payout_id: payoutId });
    if (error) {
      refused = true;
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[provider-workspace] payout request refused: ${safeMessage(error.message)}`);
      }
      continue;
    }
    queued += 1;
  }

  if (queued === 0) return fail(formData, 'unavailable', PROVIDER_PATHS.earnings);
  backTo(
    formData,
    refused ? { payout: 'partially_requested', count: String(queued) } : { payout: 'requested', count: String(queued) },
    PROVIDER_PATHS.earnings,
  );
}
