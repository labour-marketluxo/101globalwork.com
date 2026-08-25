import type { PaymentAdapter } from './types';
import { paystackAdapter } from './paystack';

const adapters: Record<string, PaymentAdapter> = {
  paystack: paystackAdapter,
};

export function getPaymentAdapter(key: string): PaymentAdapter {
  const adapter = adapters[key];
  if (!adapter) throw new Error(`Unsupported payment adapter: ${key}`);
  return adapter;
}
