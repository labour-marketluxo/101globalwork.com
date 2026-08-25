import crypto from 'node:crypto';
import type { CheckoutInput, CheckoutResult, PaymentAdapter } from './types';

const API = 'https://api.paystack.co';

function secret() {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  return value;
}

export const paystackAdapter: PaymentAdapter = {
  key: 'paystack',
  async initializeCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const reference = `ps_${input.attemptId.replaceAll('-', '')}`.slice(0, 48);
    const response = await fetch(`${API}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        amount: String(input.amountMinor),
        currency: input.currencyCode,
        reference,
        callback_url: input.callbackUrl,
        metadata: JSON.stringify({ payment_attempt_id: input.attemptId, obligation_id: input.obligationId }),
      }),
      cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok || !body?.status || !body?.data?.authorization_url || !body?.data?.reference) {
      throw new Error('Paystack checkout initialization failed');
    }
    return { providerReference: body.data.reference, authorizationUrl: body.data.authorization_url };
  },
  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature) return false;
    const digest = crypto.createHmac('sha512', secret()).update(rawBody).digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },
};
