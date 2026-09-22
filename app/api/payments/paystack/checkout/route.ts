import { NextResponse } from 'next/server';
import { safeReturnTo, startCheckout } from '@/lib/payments/start-checkout';

/**
 * The programmatic way to start a payment.
 *
 * ⚠️ THIS IS A THIN WRAPPER, AND IT IS DELIBERATELY THIN. Everything that decides whether a payment may start
 * — ownership, payability, the step-up, the channel against the adapter's configured list, the attempt's
 * idempotency — happens in `lib/payments/start-checkout.ts`, which the checkout page's server action calls
 * too. Two copies of that logic would be two chances to forget the step-up, and the copy that gets forgotten
 * is never the one that gets tested.
 *
 * It answers both a form post (a 303 to the gateway, which is what a native form needs) and a JSON request
 * (the authorization URL, for anything calling this directly), and it keeps the `payment_error` vocabulary it
 * has always used so existing callers do not have to change.
 */

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  const asForm =
    contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

  let obligationId = '';
  let channel: string | null = null;
  let returnTo = '/customer/payments';

  try {
    if (asForm) {
      const form = await request.formData();
      obligationId = String(form.get('obligationId') ?? '');
      channel = String(form.get('channel') ?? '').trim() || null;
      returnTo = safeReturnTo(String(form.get('returnTo') ?? ''), '/customer/payments');
    } else {
      const body = (await request.json()) as { obligationId?: unknown; channel?: unknown; returnTo?: unknown };
      obligationId = typeof body.obligationId === 'string' ? body.obligationId : '';
      channel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim() : null;
      returnTo = safeReturnTo(typeof body.returnTo === 'string' ? body.returnTo : null, '/customer/payments');
    }
  } catch {
    return failure(request, returnTo, asForm, 'invalid_request', 400);
  }

  const result = await startCheckout({
    obligationId,
    channel,
    returnTo,
    origin: new URL(request.url).origin,
  });

  if (!result.ok) {
    const status =
      result.code === 'authentication_required' ? 401
      : result.code === 'obligation_not_found' ? 404
      : result.code === 'payment_provider_unavailable' ? 502
      : result.code === 'unable_to_bind_checkout' ? 500
      : 409;
    return failure(request, returnTo, asForm, result.code, status);
  }

  if (asForm) return NextResponse.redirect(result.authorizationUrl, 303);
  return NextResponse.json({ authorizationUrl: result.authorizationUrl, returnTo });
}

function failure(request: Request, returnTo: string, asForm: boolean, code: string, status: number) {
  if (asForm) {
    const url = new URL(returnTo, new URL(request.url).origin);
    url.searchParams.set('payment_error', code);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ error: code }, { status });
}
