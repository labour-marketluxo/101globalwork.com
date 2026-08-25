import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaymentAdapter } from '@/lib/payments';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  const { obligationId } = await request.json();
  if (!obligationId) return NextResponse.json({ error: 'obligation_required' }, { status: 400 });

  const idempotencyKey = `checkout:${obligationId}:paystack`;
  const { data: attemptId, error: attemptError } = await supabase.rpc('create_payment_attempt_command', {
    p_obligation_id: obligationId,
    p_provider_adapter: 'paystack',
    p_idempotency_key: idempotencyKey,
  });
  if (attemptError || !attemptId) return NextResponse.json({ error: 'unable_to_create_payment_attempt' }, { status: 400 });

  const { data: obligation } = await supabase.from('payment_obligations').select('id,amount_minor,currency_code').eq('id', obligationId).maybeSingle();
  if (!obligation) return NextResponse.json({ error: 'obligation_not_found' }, { status: 404 });

  const adapter = getPaymentAdapter('paystack');
  const origin = new URL(request.url).origin;
  const checkout = await adapter.initializeCheckout({
    attemptId: String(attemptId),
    obligationId,
    email: user.email,
    amountMinor: Number(obligation.amount_minor),
    currencyCode: obligation.currency_code,
    callbackUrl: `${origin}/payments/paystack/return?attempt=${encodeURIComponent(String(attemptId))}`,
  });

  const { error: bindError } = await supabase.rpc('bind_payment_attempt_checkout_command', {
    p_attempt_id: attemptId,
    p_adapter: 'paystack',
    p_checkout_reference: checkout.providerReference,
  });
  if (bindError) return NextResponse.json({ error: 'unable_to_bind_checkout' }, { status: 500 });

  return NextResponse.json({ authorizationUrl: checkout.authorizationUrl });
}
