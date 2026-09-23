import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FEE_POLICY } from '@/features/pricing/fee-policy';

/**
 * The provider's books.
 *
 * ⚠️ THE FIGURES COME FROM THE LEDGER, NOT FROM A CACHE OR A TOTAL SOMEWHERE. `get_my_earnings_command` reads
 * the provider's own `provider_payable` account beside the operational rows and reports the difference between
 * them, so "reconciled ledger records are financial truth" is a claim this module can check rather than repeat.
 * When the delta is not zero the page shows it; nothing here rounds it away.
 *
 * ⚠️ EVERY FIGURE IS A CURRENCY FIGURE, AND NONE OF THEM IS A SUM ACROSS CURRENCIES. Adding naira to dollars
 * produces a number that means nothing, so the page groups by currency and shows each on its own line. That is
 * also why the cards iterate rather than totalling.
 *
 * ⚠️ THE PLATFORM FEE IS WHATEVER THE LEDGER SAYS, WHICH IS ZERO TODAY. `FEE_POLICY.published` is false — no fee
 * schedule is in force — and no fee transaction has been posted for any provider. The copy below is written to
 * describe the number in the row, so it stays true on the day a fee exists.
 */

export type CurrencyBooks = {
  currencyCode: string;
  /** What the ledger says the platform still owes this provider. */
  ledgerBalanceMinor: number;
  /** Everything customers have paid for this provider's work, ever. */
  grossFundedMinor: number;
  /** Funded work that is not finished, so it is held rather than owed. */
  inEscrowMinor: number;
  /** Payouts the platform can send now. */
  eligibleMinor: number;
  /** Payouts already queued or in progress. */
  inFlightMinor: number;
  /** Payouts that stopped: failed transfers, refund interlocks. */
  blockedMinor: number;
  /** Sent and confirmed by the provider's bank. */
  paidOutMinor: number;
  /** Everything that reduced the payable besides payouts: refunds and reversals. */
  reducedMinor: number;
  /** Fees and taxes posted against this provider. Zero until a fee schedule exists. */
  platformFeeMinor: number;
  /** Ledger balance minus the operational total. Anything but zero is a discrepancy worth seeing. */
  reconciliationDeltaMinor: number;
};

export type EarningItem = {
  obligationId: string;
  requestId: string;
  needText: string;
  requestState: string;
  completedAt: string | null;
  createdAt: string | null;
  grossMinor: number;
  currencyCode: string;
  obligationStatus: string;
  refundedMinor: number;
  netPayableMinor: number;
  payoutId: string | null;
  payoutStatus: string | null;
  payoutAmountMinor: number | null;
  payoutPaidAt: string | null;
  payoutReference: string | null;
};

export type EarningsRead = {
  provider: { id: string; displayName: string; payoutVerified: boolean };
  currencies: CurrencyBooks[];
  items: EarningItem[];
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

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

export async function getEarnings(providerId: string): Promise<EarningsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_earnings_command', { p_provider_id: providerId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read earnings: ${error.message}`);
    }
    return {
      provider: { id: providerId, displayName: 'Your account', payoutVerified: false },
      currencies: [],
      items: [],
      unavailable: true,
    };
  }

  const raw = obj(data);
  const provider = obj(raw.provider);

  return {
    provider: {
      id: text(provider.id) ?? providerId,
      displayName: text(provider.display_name) ?? 'Your account',
      payoutVerified: provider.payout_verified === true,
    },
    currencies: rows(raw.currencies)
      .map(entry => {
        const currencyCode = text(entry.currency_code);
        if (!currencyCode) return null;
        return {
          currencyCode,
          ledgerBalanceMinor: num(entry.ledger_balance_minor),
          grossFundedMinor: num(entry.gross_funded_minor),
          inEscrowMinor: num(entry.in_escrow_minor),
          eligibleMinor: num(entry.eligible_minor),
          inFlightMinor: num(entry.in_flight_minor),
          blockedMinor: num(entry.blocked_minor),
          paidOutMinor: num(entry.paid_out_minor),
          reducedMinor: num(entry.reduced_minor),
          platformFeeMinor: num(entry.platform_fee_minor),
          reconciliationDeltaMinor: num(entry.reconciliation_delta_minor),
        } satisfies CurrencyBooks;
      })
      .filter((entry): entry is CurrencyBooks => entry !== null),
    items: rows(raw.items)
      .map(entry => {
        const obligationId = text(entry.obligation_id);
        const requestId = text(entry.request_id);
        const currencyCode = text(entry.currency_code);
        if (!obligationId || !requestId || !currencyCode) return null;
        return {
          obligationId,
          requestId,
          needText: text(entry.need_text) ?? 'Completed work',
          requestState: text(entry.request_state) ?? 'unknown',
          completedAt: text(entry.completed_at),
          createdAt: text(entry.obligation_created_at),
          grossMinor: num(entry.gross_minor),
          currencyCode,
          obligationStatus: text(entry.obligation_status) ?? 'funded',
          refundedMinor: num(entry.refunded_minor),
          netPayableMinor: num(entry.net_payable_minor),
          payoutId: text(entry.payout_id),
          payoutStatus: text(entry.payout_status),
          payoutAmountMinor: entry.payout_amount_minor === null ? null : num(entry.payout_amount_minor),
          payoutPaidAt: text(entry.payout_paid_at),
          payoutReference: text(entry.payout_reference),
        } satisfies EarningItem;
      })
      .filter((entry): entry is EarningItem => entry !== null),
    unavailable: false,
  };
}

/** The platform's fee position, stated once so the page and the CSV cannot disagree about it. */
export const PLATFORM_FEE_STATUS = FEE_POLICY.published
  ? 'A fee schedule is in force; any charge to you appears below as its own deduction.'
  : 'No fee schedule is in force, so the platform has deducted nothing from you. The fee line below is the sum of what the ledger actually posted, which is zero until a schedule exists.';

/**
 * A short, stable reference for a request, so the itemised list is readable without printing a uuid.
 *
 * Same treatment the customer pages use: the first block of the identifier is enough to match a row against a
 * conversation or an email, and it is not the whole key.
 */
export function requestReference(requestId: string): string {
  return `#${requestId.slice(0, 8).toUpperCase()}`;
}

export type PayoutEligibility = {
  /** Rows the provider can ask to be paid now. */
  requestable: EarningItem[];
  totalRequestableMinor: number;
  currencyCode: string | null;
  note: string;
};

/**
 * Which payouts the provider may ask for.
 *
 * ⚠️ ONE CURRENCY AT A TIME, BECAUSE THE DESTINATION IS ONE CURRENCY. A payout is sent to a verified destination
 * in its own currency, so the page offers the requestable rows grouped by currency rather than a single "pay me"
 * button that would have to pick one.
 */
export function requestablePayouts(earnings: EarningsRead): PayoutEligibility[] {
  const grouped = new Map<string, EarningItem[]>();
  for (const item of earnings.items) {
    if (item.payoutStatus !== 'eligible') continue;
    const list = grouped.get(item.currencyCode) ?? [];
    list.push(item);
    grouped.set(item.currencyCode, list);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, list]) => ({
      currencyCode,
      requestable: list,
      totalRequestableMinor: list.reduce((sum, item) => sum + (item.payoutAmountMinor ?? item.netPayableMinor), 0),
      // The count is of JOBS, not of payouts: `payouts` is one row per obligation, so "2 payouts" is two
      // completed jobs being paid out together, which is what the provider sees in the list.
      note:
        list.length === 1
          ? 'One completed job is ready to be paid out.'
          : `${list.length} completed jobs are ready to be paid out.`,
    }));
}
