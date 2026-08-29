import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPaymentAdapter } from '@/lib/payments';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

type PaystackEvent = { event?: string; data?: Record<string, unknown> };

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!getPaymentAdapter('paystack').verifyWebhook(rawBody, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: PaystackEvent;
  try { event = JSON.parse(rawBody) as PaystackEvent; }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const type = String(event.event ?? 'unknown');
  const data = event.data ?? {};
  const service = createSupabaseServiceClient();

  if (type.startsWith('charge.dispute.')) {
    const disputeId = String(data.id ?? data.dispute_id ?? '');
    if (disputeId) {
      const transaction = (data.transaction && typeof data.transaction === 'object') ? data.transaction as Record<string, unknown> : {};
      const reference = String(transaction.reference ?? data.transaction_reference ?? '');
      await service.rpc('upsert_payment_dispute_command', {
        p_adapter: 'paystack',
        p_provider_dispute_id: disputeId,
        p_provider_transaction_reference: reference || null,
        p_status: String(data.status ?? type),
        p_amount_minor: data.amount == null ? null : Number(data.amount),
        p_currency_code: data.currency == null ? null : String(data.currency),
        p_reason: data.reason == null ? null : String(data.reason),
        p_due_at: data.due_at == null ? null : String(data.due_at),
        p_raw_summary: data,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (type.startsWith('transfer.')) {
    const reference = String(data.reference ?? '');
    if (reference) {
      const { data: payout } = await service.from('payouts').select('id').eq('provider_adapter', 'paystack').eq('provider_reference', reference).maybeSingle();
      if (payout) {
        // The internal payout enum uses `blocked` for a provider reversal. The authoritative
        // command detects a previously paid payout and posts the reversal ledger transaction.
        const status = type === 'transfer.success' ? 'paid' : type === 'transfer.failed' ? 'failed' : 'blocked';
        const { error } = await service.rpc('record_payout_provider_state_command', { p_payout_id: payout.id, p_adapter: 'paystack', p_provider_reference: reference, p_status: status });
        if (error) return NextResponse.json({ ok: false }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (type.startsWith('refund.')) {
    const transactionReference = String(data.transaction_reference ?? '');
    if (transactionReference) {
      const { data: attempt } = await service.from('payment_attempts').select('id').eq('provider_adapter', 'paystack').or(`checkout_reference.eq.${transactionReference},provider_reference.eq.${transactionReference}`).maybeSingle();
      if (attempt) {
        const amountMinor = data.amount == null ? null : Number(data.amount);
        const eventReference = String(data.refund_reference ?? data.id ?? '');
        const { data: candidates } = await service
          .from('payment_refunds')
          .select('id,amount_minor,status,provider_reference,created_at')
          .eq('payment_attempt_id', attempt.id)
          .in('status', ['requested','submitted','processing','needs_attention'])
          .order('created_at', { ascending: true });

        const refund = (candidates ?? []).find(item => {
          if (eventReference && item.provider_reference && item.provider_reference === eventReference) return true;
          return amountMinor != null && Number(item.amount_minor) === amountMinor;
        }) ?? candidates?.[0];

        if (refund) {
          const normalizedStatus = type === 'refund.processed'
            ? 'succeeded'
            : type === 'refund.failed'
              ? 'failed'
              : type === 'refund.needs-attention'
                ? 'needs_attention'
                : type === 'refund.processing'
                  ? 'processing'
                  : 'submitted';
          const { error } = await service.rpc('record_refund_provider_state_command', {
            p_refund_id: refund.id,
            p_adapter: 'paystack',
            p_provider_reference: eventReference || refund.provider_reference || '',
            p_status: normalizedStatus,
          });
          if (error) return NextResponse.json({ ok: false }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  const reference = String(data.reference ?? '');
  if (!reference) return NextResponse.json({ ok: true });
  const { data: attempt } = await service.from('payment_attempts').select('id').eq('provider_adapter', 'paystack').eq('checkout_reference', reference).maybeSingle();
  if (!attempt) return NextResponse.json({ ok: true });

  const normalizedType = type === 'charge.success' ? 'payment_succeeded' : type === 'charge.failed' ? 'payment_failed' : type;
  const providerEventId = `${type}:${String(data.id ?? reference)}`;
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const { error } = await service.rpc('ingest_payment_provider_event_command', {
    p_provider_adapter: 'paystack', p_provider_event_id: providerEventId, p_event_type: normalizedType,
    p_payload_sha256: payloadHash, p_payment_attempt_id: attempt.id, p_signature_verified: true,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
