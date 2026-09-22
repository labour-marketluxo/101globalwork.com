'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { paymentFailureFromMessage } from '@/features/customer/payments';
import { startCheckout } from '@/lib/payments/start-checkout';

/**
 * The customer's writes against a payment, and the step-up that has to come first.
 *
 * ⚠️ STARTING A PAYMENT IS NOT AN ACTION IN THIS FILE. It posts to `/api/payments/paystack/checkout`, which is
 * the only place a payment attempt is created and the only place the step-up assertion is made. Routing it
 * through here as well would mean two paths into the money, and the second one would be the one that forgot
 * something. What lives here is everything either side of that: proving who you are before, and asking a
 * human to look at it after.
 */

const paymentsPath = (paymentId: string) => `/customer/payments/${paymentId}`;
const checkoutPath = (paymentId: string) => `/customer/payments/${paymentId}/checkout`;

/**
 * Start the payment.
 *
 * ⚠️ IT IS A SERVER ACTION SO THE BUTTON CAN BE HONEST ABOUT BEING BUSY, AND IT IS DUPLICATE-SAFE BECAUSE OF
 * THE DATABASE, NOT THE BUTTON. `useFormStatus` gives the disabled state, which stops an ordinary double
 * click; what actually stops a double charge is `startCheckout`, where the attempt's idempotency key and the
 * one-active-attempt index mean two presses converge on one attempt and one gateway session. A guard that
 * lived only in the browser would be a guard the browser can be talked out of.
 *
 * ⚠️ THE DECISION IS NOT MADE HERE. Authority, payability, the step-up and the channel list are all checked
 * inside `startCheckout` against the database, so posting to this action directly changes nothing about what
 * is allowed. This only turns the answer into a redirect.
 */
export async function startCheckoutAction(formData: FormData) {
  const paymentId = String(formData.get('payment_id') ?? '');
  const back = checkoutPath(paymentId);
  const channel = String(formData.get('channel') ?? '').trim() || null;

  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  // The origin the gateway sends the payer back to, rebuilt from the request rather than from an env var so a
  // preview deployment returns to itself rather than to production.
  const origin = host ? `${protocol}://${host}` : '';

  const result = await startCheckout({
    obligationId: paymentId,
    channel,
    returnTo: paymentsPath(paymentId),
    origin,
  });

  if (!result.ok) redirect(`${back}?failed=${result.code}`);
  redirect(result.authorizationUrl);
}

export async function sendCheckoutCodeAction(formData: FormData) {
  const paymentId = String(formData.get('payment_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/auth/sign-in?next=${encodeURIComponent(checkoutPath(paymentId))}`);

  // `shouldCreateUser: false` because this is a step-up on an existing session. Without it, a typo in an
  // address would quietly create an account instead of failing to verify one.
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] checkout step-up code not sent: ${error.message}`);
    }
    redirect(`${checkoutPath(paymentId)}?failed=failed`);
  }

  redirect(`${checkoutPath(paymentId)}?verify=1`);
}

/**
 * Verify the code, which is what actually makes the session fresh.
 *
 * ⚠️ THE ORDER IS THE CONTROL. `verifyOtp` rotates the session cookies and the new access token carries an
 * `amr` entry stamped now. `authorize_customer_checkout_command` reads exactly that stamp. A page that showed
 * the Pay button and then asked for a code afterwards would be a checkbox with extra steps.
 */
export async function verifyCheckoutCodeAction(formData: FormData) {
  const paymentId = String(formData.get('payment_id') ?? '');
  const token = String(formData.get('token') ?? '').trim();
  const back = checkoutPath(paymentId);

  if (!/^\d{6}$/.test(token)) redirect(`${back}?verify=1&failed=failed`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.auth.verifyOtp({ email: user.email, token, type: 'email' });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] checkout step-up failed: ${error.message}`);
    }
    redirect(`${back}?verify=1&failed=failed`);
  }

  // A fresh client, deliberately: `verifyOtp` rotated the cookies, and a client created after the rotation
  // is guaranteed to send the new token rather than the one from before.
  redirect(`${back}?verified=1`);
}

export async function raisePaymentDisputeRequestAction(formData: FormData) {
  const paymentId = String(formData.get('payment_id') ?? '');
  const kind = String(formData.get('kind') ?? 'dispute');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('raise_payment_dispute_request_command', {
    p_obligation_id: paymentId,
    p_kind: kind === 'refund' ? 'refund' : 'dispute',
    p_message: String(formData.get('message') ?? ''),
  });

  if (error) redirect(`${paymentsPath(paymentId)}?failed=${paymentFailureFromMessage(error.message)}`);
  redirect(`${paymentsPath(paymentId)}?requested=${kind === 'refund' ? 'refund' : 'dispute'}`);
}

export async function withdrawPaymentDisputeRequestAction(formData: FormData) {
  const paymentId = String(formData.get('payment_id') ?? '');
  const disputeRequestId = String(formData.get('dispute_request_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('withdraw_payment_dispute_request_command', {
    p_dispute_request_id: disputeRequestId,
  });

  if (error) redirect(`${paymentsPath(paymentId)}?failed=${paymentFailureFromMessage(error.message)}`);
  redirect(`${paymentsPath(paymentId)}?requested=withdrawn`);
}
