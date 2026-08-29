'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPaystackRefund, initiatePaystackTransfer } from '@/lib/payments/paystack-operations';

function safeMessage(message: string) {
  return encodeURIComponent(message.replace(/[^a-zA-Z0-9 .,_:-]/g, '').slice(0, 180));
}

function back(obligationId: string, kind: 'error' | 'success', message: string): never {
  redirect(`/admin/money/${obligationId}?${kind}=${safeMessage(message)}`);
}

function normalizeRefundStatus(status?: string) {
  const value = String(status ?? '').toLowerCase();
  if (value === 'processed' || value === 'succeeded' || value === 'success') return 'succeeded';
  if (value === 'processing') return 'processing';
  if (value === 'failed') return 'failed';
  if (value === 'needs-attention' || value === 'needs_attention') return 'needs_attention';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  return 'submitted';
}

export async function queueAndSubmitPayoutAction(formData: FormData) {
  const obligationId = String(formData.get('obligation_id') ?? '');
  const payoutId = String(formData.get('payout_id') ?? '');
  if (!obligationId || !payoutId) back(obligationId || 'unknown', 'error', 'Payout is not available');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/admin/money/${obligationId}`)}`);

  const { error: queueError } = await supabase.rpc('queue_payout_execution_command', { p_payout_id: payoutId });
  if (queueError) back(obligationId, 'error', queueError.message);

  const service = createSupabaseServiceClient();
  const { data: locked, error: lockError } = await service.rpc('lock_payout_for_submission_command', { p_payout_id: payoutId });
  if (lockError || !locked) back(obligationId, 'error', lockError?.message ?? 'Payout revalidation failed');

  const payload = locked as { amount_minor: number | string; currency_code: string; recipient_code: string; reference: string };
  try {
    await initiatePaystackTransfer({
      amountMinor: Number(payload.amount_minor),
      currencyCode: payload.currency_code,
      recipientCode: payload.recipient_code,
      reference: payload.reference,
      reason: `101GlobalWork provider payout ${payoutId}`,
    });
    const { error: stateError } = await service.rpc('record_payout_provider_state_command', {
      p_payout_id: payoutId,
      p_adapter: 'paystack',
      p_provider_reference: payload.reference,
      p_status: 'processing',
    });
    if (stateError) back(obligationId, 'error', `Transfer submitted but internal processing state needs attention: ${stateError.message}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paystack transfer submission failed';
    // The payout was already locked as processing. Do not automatically make it retryable:
    // a network failure can be ambiguous after the provider receives the request.
    back(obligationId, 'error', `${message}. Payout remains locked for reconciliation; do not retry blindly.`);
  }

  back(obligationId, 'success', 'Transfer submitted to Paystack. Payment remains processing until a signed transfer webhook reconciles it.');
}

export async function requestRefundAction(formData: FormData) {
  const obligationId = String(formData.get('obligation_id') ?? '');
  const amount = Number(formData.get('amount') ?? NaN);
  const reason = String(formData.get('reason') ?? '').trim();
  const nonce = String(formData.get('nonce') ?? crypto.randomUUID());
  if (!obligationId || !Number.isFinite(amount) || amount <= 0 || !reason) back(obligationId || 'unknown', 'error', 'Enter a valid refund amount and reason');

  const amountMinor = Math.round(amount * 100);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/admin/money/${obligationId}`)}`);

  const { data: refundId, error } = await supabase.rpc('request_refund_command', {
    p_obligation_id: obligationId,
    p_amount_minor: amountMinor,
    p_reason: reason,
    p_idempotency_key: `finance-refund:${obligationId}:${nonce}`,
  });
  if (error || !refundId) back(obligationId, 'error', error?.message ?? 'Refund request could not be created');
  back(obligationId, 'success', 'Refund request recorded. Review it below, then submit it to Paystack.');
}

export async function submitRefundAction(formData: FormData) {
  const obligationId = String(formData.get('obligation_id') ?? '');
  const refundId = String(formData.get('refund_id') ?? '');
  if (!obligationId || !refundId) back(obligationId || 'unknown', 'error', 'Refund is not available');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/admin/money/${obligationId}`)}`);

  // Re-check the human's Finance authority before the service-role submission step.
  const { data: context, error: contextError } = await supabase.rpc('admin_context_command');
  const capabilities = new Set<string>((context?.capabilities ?? []) as string[]);
  if (contextError || (!context?.is_owner && !capabilities.has('platform.money.refund'))) back(obligationId, 'error', 'Finance refund permission required');

  const service = createSupabaseServiceClient();
  const { data: prepared, error: prepareError } = await service.rpc('prepare_refund_submission_command', { p_refund_id: refundId });
  if (prepareError || !prepared) back(obligationId, 'error', prepareError?.message ?? 'Refund failed revalidation');
  const payload = prepared as { transaction_reference: string; amount_minor: number | string; currency_code: string; reason?: string | null };

  try {
    const provider = await createPaystackRefund({
      transactionReference: payload.transaction_reference,
      amountMinor: Number(payload.amount_minor),
      currencyCode: payload.currency_code,
      customerNote: payload.reason ?? '101GlobalWork refund',
      merchantNote: `101GlobalWork refund ${refundId}`,
    });
    const { error: recordError } = await service.rpc('record_refund_provider_state_command', {
      p_refund_id: refundId,
      p_adapter: 'paystack',
      p_provider_reference: String(provider.id),
      p_status: normalizeRefundStatus(provider.status),
    });
    if (recordError) back(obligationId, 'error', `Paystack accepted the refund but reconciliation needs attention: ${recordError.message}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paystack refund submission failed';
    back(obligationId, 'error', `${message}. The internal refund request remains visible for investigation.`);
  }

  back(obligationId, 'success', 'Refund submitted to Paystack. Final financial state will follow the signed refund webhook.');
}

export async function clearDisputeForPayoutAction(formData: FormData) {
  const obligationId = String(formData.get('obligation_id') ?? '');
  const disputeId = String(formData.get('dispute_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!obligationId || !disputeId || !reason) back(obligationId || 'unknown', 'error', 'A dispute and resolution reason are required');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('clear_payment_dispute_for_payout_command', { p_dispute_id: disputeId, p_reason: reason });
  if (error) back(obligationId, 'error', error.message);
  back(obligationId, 'success', 'Dispute cleared for payout after Finance review. Payout eligibility was recalculated.');
}
