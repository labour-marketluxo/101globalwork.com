import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaymentAdapter } from '@/lib/payments';

/**
 * Starting a payment — one implementation, two callers.
 *
 * ⚠️ WHY THIS MOVED OUT OF THE ROUTE HANDLER. The checkout page needs a button that is disabled while the
 * request is in flight, and a button gets that from a server action, not from a native form post to a URL.
 * The obvious shortcut was to copy the route's body into an action, and the obvious cost of that shortcut is
 * two places where a payment attempt is created — the second one being the one that eventually forgets the
 * step-up check. So the logic lives here and both entry points call it: the route handler keeps its HTTP
 * contract for anything programmatic, and the page uses an action.
 *
 * ⚠️ EVERY REFUSAL IS A CODE, NOT A MESSAGE. The route puts these in a query string and the page renders
 * words for them. Passing the provider's or the database's own text through would let anyone type a sentence
 * into the platform's own notice styling, and the codes are a closed set.
 *
 * ⚠️ IT IS DUPLICATE-SAFE AT THREE LEVELS, AND NONE OF THEM IS THE BUTTON.
 *   1. `payment_attempts` has a unique `idempotency_key`, and the key for a retry of the same obligation is
 *      the same key, so a second call returns the first attempt instead of creating another.
 *   2. A partial unique index allows only one attempt per obligation in `created` or `pending_provider`, so a
 *      race that got past the first check still cannot produce two live attempts.
 *   3. If the attempt already carries an authorization URL, this returns THAT url rather than asking the
 *      gateway for a second session — which is what makes two simultaneous presses resolve to one payment.
 * The disabled button is the fourth thing, and it is a courtesy rather than a control.
 */

export const CHECKOUT_ERROR_CODES = [
  'invalid_request',
  'obligation_required',
  'authentication_required',
  'obligation_not_found',
  'obligation_not_payable',
  'step_up_required',
  'no_channel',
  'payment_already_confirmed',
  'unable_to_create_payment_attempt',
  'unable_to_bind_checkout',
  'payment_provider_unavailable',
] as const;
export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];

export type StartCheckoutResult =
  | { ok: true; authorizationUrl: string }
  | { ok: false; code: CheckoutErrorCode };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADAPTER_KEY = 'paystack';

export async function startCheckout(input: {
  obligationId: string;
  /** The channel the payer picked, or null to let the gateway offer its own. */
  channel: string | null;
  returnTo: string;
  origin: string;
}): Promise<StartCheckoutResult> {
  if (!UUID.test(input.obligationId)) return { ok: false, code: 'obligation_required' };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, code: 'authentication_required' };

  // ── The step-up, enforced here rather than on the page ───────────────────────────────────────────────
  // The command asserts ownership, payability and an authentication inside the last 15 minutes. Doing it
  // before anything is created means a stale session cannot even produce a payment attempt to resume later.
  const { error: authorizeError } = await supabase.rpc('authorize_customer_checkout_command', {
    p_obligation_id: input.obligationId,
  });
  if (authorizeError) {
    const text = authorizeError.message.toLowerCase();
    if (text.includes('step-up')) return { ok: false, code: 'step_up_required' };
    if (text.includes('not found')) return { ok: false, code: 'obligation_not_found' };
    if (text.includes('not authorized')) return { ok: false, code: 'obligation_not_found' };
    if (text.includes('not payable')) return { ok: false, code: 'obligation_not_payable' };
    return { ok: false, code: 'invalid_request' };
  }

  const { data: obligation } = await supabase
    .from('payment_obligations')
    .select('id,amount_minor,currency_code,status')
    .eq('id', input.obligationId)
    .maybeSingle();
  if (!obligation) return { ok: false, code: 'obligation_not_found' };
  if (!['pending', 'funding'].includes(obligation.status)) {
    return { ok: false, code: 'obligation_not_payable' };
  }

  // ── The channel, against the adapter's configured list ───────────────────────────────────────────────
  const { data: adapter } = await supabase
    .from('payment_adapters')
    .select('adapter_key,config,supported_currencies')
    .eq('adapter_key', ADAPTER_KEY)
    .eq('is_enabled', true)
    .maybeSingle();
  if (!adapter || !(adapter.supported_currencies ?? []).includes(obligation.currency_code)) {
    return { ok: false, code: 'payment_provider_unavailable' };
  }

  const configured: string[] = Array.isArray(adapter.config?.checkout_channels)
    ? (adapter.config.checkout_channels as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
  const channels = input.channel ? [input.channel] : [];
  // A channel the adapter is not configured for is refused rather than passed on: the gateway would reject it
  // with a message the customer cannot act on, and the platform would have forwarded a choice it never made.
  if (input.channel && (!configured.includes(input.channel))) {
    return { ok: false, code: 'no_channel' };
  }

  // ── The attempt ──────────────────────────────────────────────────────────────────────────────────────
  const { data: latestAttempts, count } = await supabase
    .from('payment_attempts')
    .select('id,status,idempotency_key,checkout_authorization_url', { count: 'exact' })
    .eq('obligation_id', input.obligationId)
    .eq('provider_adapter', ADAPTER_KEY)
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = latestAttempts?.[0];

  if (latest?.status === 'succeeded') return { ok: false, code: 'payment_already_confirmed' };
  if (latest?.status === 'pending_provider' && latest.checkout_authorization_url) {
    return { ok: true, authorizationUrl: latest.checkout_authorization_url };
  }

  const activeWithoutSession =
    latest && ['created', 'pending_provider'].includes(latest.status) && !latest.checkout_authorization_url;
  const idempotencyKey = activeWithoutSession
    ? latest.idempotency_key
    : `checkout:${input.obligationId}:${ADAPTER_KEY}:${(count ?? 0) + 1}`;

  const { data: attemptId, error: attemptError } = await supabase.rpc('create_payment_attempt_command', {
    p_obligation_id: input.obligationId,
    p_provider_adapter: ADAPTER_KEY,
    p_idempotency_key: idempotencyKey,
  });
  if (attemptError || !attemptId) return { ok: false, code: 'unable_to_create_payment_attempt' };

  /**
   * ⚠️ RE-READ AFTER CREATING, BEFORE CALLING THE GATEWAY. Two presses that arrive together both get past the
   * reads above and both reach this point; the database hands them the same attempt (the idempotency key and
   * the one-active-attempt index). Whoever loses that race finds the URL already bound here and is sent to it
   * instead of opening a second checkout session against the same attempt.
   */
  const { data: claimed } = await supabase
    .from('payment_attempts')
    .select('status,checkout_authorization_url')
    .eq('id', attemptId)
    .maybeSingle();
  if (claimed?.status === 'pending_provider' && claimed.checkout_authorization_url) {
    return { ok: true, authorizationUrl: claimed.checkout_authorization_url };
  }

  try {
    const checkout = await getPaymentAdapter(ADAPTER_KEY).initializeCheckout({
      attemptId: String(attemptId),
      obligationId: input.obligationId,
      email: user.email,
      amountMinor: Number(obligation.amount_minor),
      currencyCode: obligation.currency_code,
      callbackUrl: `${input.origin}/payments/paystack/return?attempt=${encodeURIComponent(String(attemptId))}&returnTo=${encodeURIComponent(input.returnTo)}`,
      channels,
    });

    const { error: bindError } = await supabase.rpc('bind_payment_attempt_checkout_session_command', {
      p_attempt_id: attemptId,
      p_adapter: ADAPTER_KEY,
      p_checkout_reference: checkout.providerReference,
      p_authorization_url: checkout.authorizationUrl,
    });
    if (bindError) return { ok: false, code: 'unable_to_bind_checkout' };

    return { ok: true, authorizationUrl: checkout.authorizationUrl };
  } catch {
    return { ok: false, code: 'payment_provider_unavailable' };
  }
}

/** Redirect targets are user-supplied, so they are re-checked rather than trusted. */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
