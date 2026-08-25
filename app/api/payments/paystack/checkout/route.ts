import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaymentAdapter } from '@/lib/payments';

const obligationSchema = z.string().uuid();

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function checkoutResponse(request: Request, authorizationUrl: string, returnTo: string, asForm: boolean) {
  if (asForm) return NextResponse.redirect(authorizationUrl, 303);
  return NextResponse.json({ authorizationUrl, returnTo });
}

function failureResponse(request: Request, returnTo: string, asForm: boolean, code: string, status: number) {
  if (asForm) {
    const url = new URL(returnTo, new URL(request.url).origin);
    url.searchParams.set('payment_error', code);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  const asForm = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

  let rawObligationId = '';
  let returnTo = '/';
  try {
    if (asForm) {
      const form = await request.formData();
      rawObligationId = String(form.get('obligationId') ?? '');
      returnTo = safeReturnTo(String(form.get('returnTo') ?? '/'));
    } else {
      const body = await request.json() as { obligationId?: unknown; returnTo?: unknown };
      rawObligationId = typeof body.obligationId === 'string' ? body.obligationId : '';
      returnTo = safeReturnTo(typeof body.returnTo === 'string' ? body.returnTo : '/');
    }
  } catch {
    return failureResponse(request, returnTo, asForm, 'invalid_request', 400);
  }

  const parsedObligation = obligationSchema.safeParse(rawObligationId);
  if (!parsedObligation.success) return failureResponse(request, returnTo, asForm, 'obligation_required', 400);
  const obligationId = parsedObligation.data;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return failureResponse(request, returnTo, asForm, 'authentication_required', 401);

  const { data: obligation } = await supabase
    .from('payment_obligations')
    .select('id,amount_minor,currency_code,status')
    .eq('id', obligationId)
    .maybeSingle();
  if (!obligation) return failureResponse(request, returnTo, asForm, 'obligation_not_found', 404);
  if (!['pending', 'funding'].includes(obligation.status)) {
    return failureResponse(request, returnTo, asForm, 'obligation_not_payable', 409);
  }

  const { data: latestAttempts, count } = await supabase
    .from('payment_attempts')
    .select('id,status,idempotency_key,checkout_authorization_url', { count: 'exact' })
    .eq('obligation_id', obligationId)
    .eq('provider_adapter', 'paystack')
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = latestAttempts?.[0];

  if (latest?.status === 'pending_provider' && latest.checkout_authorization_url) {
    return checkoutResponse(request, latest.checkout_authorization_url, returnTo, asForm);
  }

  if (latest?.status === 'succeeded') {
    return failureResponse(request, returnTo, asForm, 'payment_already_confirmed', 409);
  }

  const activeWithoutSession = latest && ['created', 'pending_provider'].includes(latest.status) && !latest.checkout_authorization_url;
  const idempotencyKey = activeWithoutSession
    ? latest.idempotency_key
    : `checkout:${obligationId}:paystack:${(count ?? 0) + 1}`;

  const { data: attemptId, error: attemptError } = await supabase.rpc('create_payment_attempt_command', {
    p_obligation_id: obligationId,
    p_provider_adapter: 'paystack',
    p_idempotency_key: idempotencyKey,
  });
  if (attemptError || !attemptId) {
    return failureResponse(request, returnTo, asForm, 'unable_to_create_payment_attempt', 409);
  }

  try {
    const adapter = getPaymentAdapter('paystack');
    const origin = new URL(request.url).origin;
    const checkout = await adapter.initializeCheckout({
      attemptId: String(attemptId),
      obligationId,
      email: user.email,
      amountMinor: Number(obligation.amount_minor),
      currencyCode: obligation.currency_code,
      callbackUrl: `${origin}/payments/paystack/return?attempt=${encodeURIComponent(String(attemptId))}&returnTo=${encodeURIComponent(returnTo)}`,
    });

    const { error: bindError } = await supabase.rpc('bind_payment_attempt_checkout_session_command', {
      p_attempt_id: attemptId,
      p_adapter: 'paystack',
      p_checkout_reference: checkout.providerReference,
      p_authorization_url: checkout.authorizationUrl,
    });
    if (bindError) return failureResponse(request, returnTo, asForm, 'unable_to_bind_checkout', 500);

    return checkoutResponse(request, checkout.authorizationUrl, returnTo, asForm);
  } catch {
    return failureResponse(request, returnTo, asForm, 'payment_provider_unavailable', 502);
  }
}
