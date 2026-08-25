import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPaymentAdapter } from '@/lib/payments';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  const adapter = getPaymentAdapter('paystack');
  if (!adapter.verifyWebhook(rawBody, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const reference = event?.data?.reference;
  if (!reference) return NextResponse.json({ ok: true });

  const service = createSupabaseServiceClient();
  const { data: attempt } = await service.from('payment_attempts').select('id').eq('provider_adapter', 'paystack').eq('checkout_reference', String(reference)).maybeSingle();
  if (!attempt) return NextResponse.json({ ok: true });

  const normalizedType = event.event === 'charge.success' ? 'payment_succeeded' : event.event === 'charge.failed' ? 'payment_failed' : String(event.event ?? 'unknown');
  const providerEventId = `${event.event}:${event?.data?.id ?? reference}`;
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  const { error } = await service.rpc('ingest_payment_provider_event_command', {
    p_provider_adapter: 'paystack',
    p_provider_event_id: providerEventId,
    p_event_type: normalizedType,
    p_payload_sha256: payloadHash,
    p_payment_attempt_id: attempt.id,
    p_signature_verified: true,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
