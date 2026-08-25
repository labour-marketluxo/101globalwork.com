import 'server-only';

const API = 'https://api.paystack.co';
function secret() {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  return value;
}
async function paystack<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || !body?.status) throw new Error(`Paystack request failed: ${path}`);
  return body.data as T;
}

export async function createPaystackRefund(input: { transactionReference: string; amountMinor: number; currencyCode: string; customerNote?: string; merchantNote?: string }) {
  return paystack<{ id: number; status: string }>(`/refund`, {
    method: 'POST',
    body: JSON.stringify({ transaction: input.transactionReference, amount: input.amountMinor, currency: input.currencyCode, customer_note: input.customerNote, merchant_note: input.merchantNote }),
  });
}

export async function createPaystackTransferRecipient(input: { name: string; accountNumber: string; bankCode: string; currencyCode: string }) {
  return paystack<{ recipient_code: string; active: boolean }>(`/transferrecipient`, {
    method: 'POST',
    body: JSON.stringify({ type: 'nuban', name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: input.currencyCode }),
  });
}

export async function initiatePaystackTransfer(input: { amountMinor: number; currencyCode: string; recipientCode: string; reference: string; reason?: string }) {
  return paystack<{ transfer_code: string; reference: string; status: string }>(`/transfer`, {
    method: 'POST',
    body: JSON.stringify({ source: 'balance', amount: input.amountMinor, currency: input.currencyCode, recipient: input.recipientCode, reference: input.reference, reason: input.reason }),
  });
}
