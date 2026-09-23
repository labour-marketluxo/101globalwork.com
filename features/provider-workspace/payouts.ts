import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Payout destinations and transfer history.
 *
 * ⚠️ THE PROVIDER READS THEIR OWN ROWS, NOT A PROJECTION. `payout_destinations_owner_read` and
 * `payouts_provider_select` already scope both tables to the owning account, so this module reads them directly
 * — the destination row is the one the money path uses, and a copy of it on a page is a copy that can disagree
 * with where the money actually goes.
 *
 * ⚠️ WHAT IS MASKED AND WHAT IS NOT. The stored row holds the Paystack recipient code and the last four digits;
 * there is no full account number to leak, because the platform never stored one. `adapter_key` is shown so a
 * provider can see which rail they are on, and `destination_type` distinguishes a bank account from mobile
 * money — which is the difference between "my bank changed my details" and "my number lapsed".
 */

export type PayoutDestination = {
  id: string;
  providerId: string;
  adapterKey: string;
  destinationType: string;
  currencyCode: string;
  bankCode: string | null;
  accountLast4: string | null;
  accountName: string | null;
  recipientCode: string | null;
  verificationStatus: string;
  isDefault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PayoutTransfer = {
  id: string;
  providerId: string;
  currencyCode: string;
  amountMinor: number;
  status: string;
  blockReason: string | null;
  providerReference: string | null;
  providerAdapter: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastValidatedAt: string | null;
};

export type PayoutsRead = {
  destinations: PayoutDestination[];
  transfers: PayoutTransfer[];
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return 0;
};

export async function getPayouts(providerId: string): Promise<PayoutsRead> {
  const supabase = await createSupabaseServerClient();

  const [{ data: destinationRows, error: destinationError }, { data: transferRows, error: transferError }] =
    await Promise.all([
      supabase
        .from('provider_payout_destinations')
        .select('id,provider_id,adapter_key,destination_type,currency_code,bank_code,account_last4,account_name,provider_recipient_code,verification_status,is_default,created_at,updated_at')
        .eq('provider_id', providerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('payouts')
        .select('id,provider_id,currency_code,amount_minor,status,block_reason,provider_reference,provider_adapter,created_at,updated_at,last_validated_at')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  if (destinationError || transferError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[provider-workspace] could not read payouts: ${destinationError?.message ?? transferError?.message ?? ''}`,
      );
    }
    return { destinations: [], transfers: [], unavailable: true };
  }

  return {
    destinations: (destinationRows ?? []).map((row: Raw) => ({
      id: String(row.id),
      providerId: String(row.provider_id),
      adapterKey: String(row.adapter_key ?? 'paystack'),
      destinationType: String(row.destination_type ?? 'bank_account'),
      currencyCode: String(row.currency_code ?? 'NGN'),
      bankCode: text(row.bank_code),
      accountLast4: text(row.account_last4),
      accountName: text(row.account_name),
      recipientCode: text(row.provider_recipient_code),
      verificationStatus: String(row.verification_status ?? 'pending'),
      isDefault: row.is_default === true,
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    })),
    transfers: (transferRows ?? []).map((row: Raw) => ({
      id: String(row.id),
      providerId: String(row.provider_id),
      currencyCode: String(row.currency_code ?? 'NGN'),
      amountMinor: num(row.amount_minor),
      status: String(row.status ?? 'eligible'),
      blockReason: text(row.block_reason),
      providerReference: text(row.provider_reference),
      providerAdapter: text(row.provider_adapter),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
      lastValidatedAt: text(row.last_validated_at),
    })),
    unavailable: false,
  };
}

/**
 * What a transfer status means for the person waiting for their money.
 *
 * ⚠️ `blocked` IS DELIBERATELY NOT CALLED "FAILED". A blocked payout is one the platform refused to send — a
 * destination that is no longer verified, or a refund that has to be reconciled first — and telling a provider
 * their transfer failed would send them to their bank about a problem that is here.
 */
export const TRANSFER_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate'; note: string }> = {
  eligible: {
    label: 'Ready to request',
    tone: 'teal',
    note: 'The job is complete and funded. You can ask for this payout from the earnings page.',
  },
  queued: {
    label: 'Requested',
    tone: 'amber',
    note: 'It is in the platform’s payout queue and will be submitted to the payment provider.',
  },
  processing: {
    label: 'On its way',
    tone: 'amber',
    note: 'Submitted to the payment provider and waiting for their confirmation. A cleared transfer is never guessed at from a browser.',
  },
  paid: {
    label: 'Paid',
    tone: 'teal',
    note: 'The payment provider confirmed the transfer and the ledger has been debited.',
  },
  failed: {
    label: 'Failed',
    tone: 'amber',
    note: 'The provider rejected the transfer. The money is still owed to you; check the destination and ask again.',
  },
  blocked: {
    label: 'Held back',
    tone: 'amber',
    note: 'The platform did not send this one. The reason is recorded on the payout, and it is usually a reversed transfer or a refund that has to be reconciled first.',
  },
  cancelled: { label: 'Cancelled', tone: 'slate', note: 'This payout was cancelled.' },
};

export function transferStatusCopy(status: string) {
  return (
    TRANSFER_STATUS_COPY[status] ?? {
      label: status.replaceAll('_', ' '),
      tone: 'slate' as const,
      note: 'The payout record is in this state.',
    }
  );
}

export const DESTINATION_STATUS_COPY: Record<string, { label: string; tone: 'teal' | 'amber' | 'slate' }> = {
  verified: { label: 'Verified', tone: 'teal' },
  pending: { label: 'Not verified yet', tone: 'amber' },
  failed: { label: 'Verification failed', tone: 'amber' },
  disabled: { label: 'Disabled', tone: 'slate' },
};

/** Bank account or mobile money, said in words — the difference decides which fields to show. */
export function destinationKindLabel(destinationType: string): string {
  if (destinationType === 'mobile_money') return 'Mobile money';
  if (destinationType === 'bank_account') return 'Bank account';
  return destinationType.replaceAll('_', ' ');
}
