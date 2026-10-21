import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FEE_POLICY, feeFor } from '@/features/pricing/fee-policy';

/**
 * The customer's view of their own money.
 *
 * ⚠️ EVERY FIGURE HERE COMES FROM THE DATABASE'S OWN RECONCILIATION, NOT FROM THE PROVIDER'S REPORT.
 * `payment_attempts.status` says what the gateway told us; it is not the platform's books. The rows below
 * carry `reconciledState`, which `get_customer_payment_ledger` derives from `payment_reconciliations` — a
 * matched row with a balanced ledger transaction behind it. A page that showed "Paid" because an attempt
 * said `succeeded` would be repeating a claim the platform has not finished checking, which is exactly what
 * the funding gate elsewhere in this codebase refuses to do.
 *
 * ⚠️ THE LEDGER TABLES ARE NOT READABLE BY A CUSTOMER, ON PURPOSE. `ledger_entries`, `ledger_transactions`,
 * `payment_reconciliations` and `payment_provider_events` are revoked from `authenticated`; they name every
 * counterparty on the platform. The definer function this module calls returns the reconciliation facts
 * about the caller's own obligations and asserts ownership before it returns anything.
 */

export type ReconciledState = 'reconciled' | 'pending' | 'attention';

export type PaymentLedgerRow = {
  /** The obligation id. This is what the routes call `paymentId`. */
  paymentId: string;
  requestId: string;
  requestLabel: string;
  requestState: string;
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  amountMinor: number;
  currencyCode: string;
  obligationStatus: string;
  createdAt: string;
  updatedAt: string;
  /** When a balanced ledger transaction was posted for this obligation. Null until the books have it. */
  settledAt: string | null;
  /** When the provider was actually paid. Null unless a payout row is `paid`. */
  releasedAt: string | null;
  payoutStatus: string | null;
  refundedMinor: number;
  openDisputeRequests: number;
  attemptCount: number;
  latestAttemptId: string | null;
  latestAttemptStatus: string | null;
  /** A reference that identifies the payment at the gateway. Never an internal row id. */
  paymentReference: string | null;
  reconciledState: ReconciledState;
  reconciledAt: string | null;
  hasLedgerTransaction: boolean;
};

type LedgerRpcRow = {
  payment_id: string;
  request_id: string;
  request_label: string;
  request_state: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  amount_minor: number | string;
  currency_code: string;
  obligation_status: string;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
  released_at: string | null;
  payout_status: string | null;
  refunded_minor: number | string;
  open_dispute_requests: number;
  attempt_count: number;
  latest_attempt_id: string | null;
  latest_attempt_status: string | null;
  payment_reference: string | null;
  reconciled_state: string;
  reconciled_at: string | null;
  has_ledger_transaction: boolean;
};

function toLedgerRow(row: LedgerRpcRow): PaymentLedgerRow {
  return {
    paymentId: row.payment_id,
    requestId: row.request_id,
    requestLabel: row.request_label,
    requestState: row.request_state,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerSlug: row.provider_slug,
    amountMinor: Number(row.amount_minor),
    currencyCode: row.currency_code,
    obligationStatus: row.obligation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settledAt: row.settled_at,
    releasedAt: row.released_at,
    payoutStatus: row.payout_status,
    refundedMinor: Number(row.refunded_minor ?? 0),
    openDisputeRequests: Number(row.open_dispute_requests ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    latestAttemptId: row.latest_attempt_id,
    latestAttemptStatus: row.latest_attempt_status,
    paymentReference: row.payment_reference,
    reconciledState: (['reconciled', 'pending', 'attention'] as const).includes(
      row.reconciled_state as ReconciledState,
    )
      ? (row.reconciled_state as ReconciledState)
      : 'pending',
    reconciledAt: row.reconciled_at,
    hasLedgerTransaction: Boolean(row.has_ledger_transaction),
  };
}

export async function getCustomerPaymentLedger(): Promise<{
  rows: PaymentLedgerRow[];
  unavailable: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_payment_ledger');
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read the payment ledger: ${error.message}`);
    }
    return { rows: [], unavailable: true };
  }
  return { rows: ((data ?? []) as LedgerRpcRow[]).map(toLedgerRow), unavailable: false };
}

export async function getCustomerPayment(paymentId: string): Promise<{
  row: PaymentLedgerRow | null;
  unavailable: boolean;
}> {
  const { rows, unavailable } = await getCustomerPaymentLedger();
  return { row: rows.find(row => row.paymentId === paymentId) ?? null, unavailable };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The groups the list presents. Derived from status, never stored.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const PAYMENT_GROUP_KEYS = ['due', 'held', 'released', 'refunded', 'disputed', 'closed'] as const;
export type PaymentGroupKey = (typeof PAYMENT_GROUP_KEYS)[number];

/**
 * ⚠️ ONE OBLIGATION BELONGS TO EXACTLY ONE GROUP, AND THE ORDER OF THESE TESTS IS WHAT DECIDES IT.
 * "Released" outranks "Held" because a funded obligation whose payout has gone out is no longer being held;
 * "Refunded" and "Disputed" outrank both because those are the states a reader most needs to see.
 */
export function paymentGroupOf(row: PaymentLedgerRow): PaymentGroupKey {
  if (row.obligationStatus === 'cancelled') return 'closed';
  if (row.obligationStatus === 'disputed') return 'disputed';
  if (row.obligationStatus === 'refunded' || row.obligationStatus === 'partially_refunded') return 'refunded';
  if (row.payoutStatus === 'paid') return 'released';
  if (row.obligationStatus === 'funded') return 'held';
  return 'due';
}

export const PAYMENT_GROUPS: {
  key: PaymentGroupKey;
  label: string;
  blurb: string;
}[] = [
  {
    key: 'due',
    label: 'Due now',
    blurb: 'Accepted work waiting for your payment. Nothing has been taken.',
  },
  {
    key: 'held',
    label: 'Held for the work',
    blurb: 'Paid, checked against the ledger, and held until you approve the completed work.',
  },
  {
    key: 'released',
    label: 'Released to the provider',
    blurb: 'Work you approved. The provider has been paid.',
  },
  {
    key: 'refunded',
    label: 'Refunded',
    blurb: 'Money returned to you, in full or in part.',
  },
  {
    key: 'disputed',
    label: 'Disputed',
    blurb: 'Held back because something about the payment is being looked at.',
  },
  {
    key: 'closed',
    label: 'Cancelled',
    blurb: 'Obligations that were cancelled before any money moved.',
  },
];

export const RECONCILED_COPY: Record<ReconciledState, { label: string; explanation: string }> = {
  reconciled: {
    label: 'Reconciled',
    explanation:
      'A verified payment event has been matched to a balanced entry in the platform ledger. This is the record that counts.',
  },
  pending: {
    label: 'Awaiting reconciliation',
    explanation:
      'No verified event has been matched to the ledger for this payment yet. Whatever a browser or a gateway page says, this is not yet a financial fact here.',
  },
  attention: {
    label: 'Needs attention',
    explanation:
      'An event arrived that did not match this payment — a different amount, a different currency, or a signature that did not verify. Nothing was posted to the ledger from it.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Checkout
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type CheckoutAdapter = {
  key: string;
  displayName: string;
  channels: string[];
  supportedCurrencies: string[];
};

type AdapterRow = {
  adapter_key: string;
  display_name: string;
  supported_currencies: string[] | null;
  config: { checkout_channels?: unknown } | null;
};

/** Human words for the gateway's channel keys, in the order the config lists them. */
export const CHANNEL_LABELS: Record<string, { label: string; detail: string }> = {
  card: { label: 'Card', detail: 'Debit or credit card, on the gateway’s own secure page.' },
  bank: { label: 'Bank account', detail: 'Pay directly from a bank account where your bank supports it.' },
  bank_transfer: { label: 'Bank transfer', detail: 'A one-off account number is issued for this payment.' },
  ussd: { label: 'USSD', detail: 'Dial a code from the phone registered to the account.' },
  qr: { label: 'QR code', detail: 'Scan with a banking app to approve the payment.' },
  mobile_money: { label: 'Mobile money', detail: 'Approve from a mobile money wallet.' },
  eft: { label: 'Instant EFT', detail: 'Log in to online banking and approve the payment.' },
};

/**
 * ⚠️ THE LIST IS READ, NOT HARD-CODED. Which channels exist is a fact about the gateway and the market, and it
 * is stored on `payment_adapters.config.checkout_channels`. The page renders what this returns and the API
 * refuses any channel that is not in it, so adding a market or a gateway is a configuration change here and
 * not a code change in three places.
 */
export async function getCheckoutAdapters(currencyCode: string): Promise<{
  adapters: CheckoutAdapter[];
  unavailable: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payment_adapters')
    .select('adapter_key,display_name,supported_currencies,config')
    .eq('is_enabled', true);

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read payment adapters: ${error.message}`);
    }
    // ⚠️ A READ FAILURE IS NOT "THERE IS NO PROVIDER". Returning an empty list would have the page state, as a
    // fact, that this currency cannot be paid — which is a different and possibly false claim. The caller is
    // told which of the two it is.
    return { adapters: [], unavailable: true };
  }

  return {
    adapters: ((data ?? []) as AdapterRow[])
      .filter(row => (row.supported_currencies ?? []).includes(currencyCode))
      .map(row => ({
        key: row.adapter_key,
        displayName: row.display_name,
        channels: Array.isArray(row.config?.checkout_channels)
          ? (row.config?.checkout_channels as unknown[]).filter((value): value is string => typeof value === 'string')
          : [],
        supportedCurrencies: row.supported_currencies ?? [],
      })),
    unavailable: false,
  };
}

export type CheckoutBreakdown = {
  /** The agreed price, before anything the platform adds. */
  amountMinor: number;
  /** The platform's own fee, or null when no schedule is in force. */
  platformFeeMinor: number | null;
  feeSchedulePublished: boolean;
  /** What the customer will actually be asked to pay. Equal to the obligation, always. */
  totalMinor: number;
  currencyCode: string;
};

/**
 * ⚠️ THE TOTAL IS THE OBLIGATION, AND IT IS NOT ALLOWED TO BE ANYTHING ELSE. The gateway is initialised with
 * `payment_obligations.amount_minor`, and the reconciliation step refuses any provider event whose amount or
 * currency differs from it. So a page that displayed a total the obligation does not have would be showing a
 * number the platform would then refuse to honour.
 *
 * The platform fee comes from the published policy — currently unpublished, in which case this returns null
 * and the page says the platform adds nothing, which is the same statement `/pricing` makes.
 */
export function checkoutBreakdown(row: PaymentLedgerRow): CheckoutBreakdown {
  const fee = feeFor({ amountMinor: row.amountMinor, currency: row.currencyCode }, 'customer');
  return {
    amountMinor: row.amountMinor,
    platformFeeMinor: fee?.amountMinor ?? null,
    feeSchedulePublished: FEE_POLICY.published,
    totalMinor: row.amountMinor,
    currencyCode: row.currencyCode,
  };
}

export function formatMoney(amountMinor: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export function isPayable(row: PaymentLedgerRow): boolean {
  return ['pending', 'funding'].includes(row.obligationStatus);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The activity behind one payment
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type PaymentEvent = {
  eventId: string;
  eventType: string;
  status: string;
  signatureVerified: boolean;
  receivedAt: string;
  reconciledAt: string | null;
  rejectionReason: string | null;
  result: string | null;
  ledgerTransactionId: string | null;
};

export type PaymentAttempt = {
  attemptId: string;
  status: string;
  providerAdapter: string;
  paymentReference: string | null;
  amountMinor: number;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
  events: PaymentEvent[];
};

type ActivityRpcRow = {
  attempt_id: string;
  attempt_status: string;
  provider_adapter: string;
  payment_reference: string | null;
  amount_minor: number | string;
  currency_code: string;
  created_at: string;
  updated_at: string;
  events: unknown;
};

/**
 * ⚠️ A MALFORMED EVENT IS DROPPED, NOT THROWN OVER. These rows come out of a `jsonb` aggregate, so a shape the
 * database never promised would take the whole page down if it were cast. Anything that is not the object this
 * expects is skipped, and the timeline shows the events it could read.
 */
function parseEvents(value: unknown): PaymentEvent[] {
  if (!Array.isArray(value)) return [];
  const events: PaymentEvent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.event_id !== 'string' || typeof record.event_type !== 'string') continue;
    events.push({
      eventId: record.event_id,
      eventType: record.event_type,
      status: typeof record.status === 'string' ? record.status : 'unknown',
      signatureVerified: record.signature_verified === true,
      receivedAt: typeof record.received_at === 'string' ? record.received_at : '',
      reconciledAt: typeof record.reconciled_at === 'string' ? record.reconciled_at : null,
      rejectionReason: typeof record.rejection_reason === 'string' ? record.rejection_reason : null,
      result: typeof record.result === 'string' ? record.result : null,
      ledgerTransactionId:
        typeof record.ledger_transaction_id === 'string' ? record.ledger_transaction_id : null,
    });
  }
  return events;
}

export async function getCustomerPaymentActivity(paymentId: string): Promise<{
  attempts: PaymentAttempt[];
  unavailable: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_customer_payment_activity', { p_payment_id: paymentId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read payment activity: ${error.message}`);
    }
    return { attempts: [], unavailable: true };
  }

  return {
    attempts: ((data ?? []) as ActivityRpcRow[]).map(row => ({
      attemptId: row.attempt_id,
      status: row.attempt_status,
      providerAdapter: row.provider_adapter,
      paymentReference: row.payment_reference,
      amountMinor: Number(row.amount_minor),
      currencyCode: row.currency_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      events: parseEvents(row.events),
    })),
    unavailable: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Failure vocabulary — a fixed list, because these travel in the query string.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const PAYMENT_FAILURES = [
  'step_up_required',
  'payment_not_found',
  'payment_not_payable',
  'already_confirmed',
  'no_channel',
  'too_short',
  'not_taken',
  'already_open',
  'closed',
  'failed',
] as const;
export type PaymentFailure = (typeof PAYMENT_FAILURES)[number];

export const PAYMENT_FAILURE_COPY: Record<PaymentFailure, string> = {
  step_up_required:
    'For a payment we ask you to verify again. Send the code and enter it below — then the payment can be started.',
  payment_not_found: 'That payment is not on your account, or it no longer exists.',
  payment_not_payable: 'This payment is no longer waiting to be paid. Nothing was charged.',
  already_confirmed: 'This payment is already confirmed against the ledger. There is nothing to pay again.',
  no_channel: 'Choose how you want to pay. Nothing was charged.',
  too_short: 'Add a sentence or two — a reason nobody can read is not a reason.',
  not_taken: 'No money has been taken for this payment yet, so there is nothing to dispute. Cancel the booking instead.',
  already_open: 'You already have an open request about this payment. Withdraw it first if you want to change it.',
  closed: 'This request is closed, so nothing on it can be changed any more.',
  failed: 'That did not work, and nothing was changed. Try again.',
};

export function paymentFailureCode(value: string | undefined | null): PaymentFailure | null {
  if (!value) return null;
  return (PAYMENT_FAILURES as readonly string[]).includes(value) ? (value as PaymentFailure) : null;
}

export function paymentFailureFromMessage(message: string): PaymentFailure {
  const text = message.toLowerCase();
  if (text.includes('step-up')) return 'step_up_required';
  if (text.includes('not on your account') || text.includes('not found')) return 'payment_not_found';
  if (text.includes('not payable') || text.includes('no longer waiting')) return 'payment_not_payable';
  if (text.includes('already confirmed') || text.includes('already been confirmed')) return 'already_confirmed';
  if (text.includes('nothing to dispute') || text.includes('has not been taken')) return 'not_taken';
  if (text.includes('already open') || text.includes('already have')) return 'already_open';
  if (text.includes('is closed') || text.includes('can no longer')) return 'closed';
  if (text.includes('sentence') || text.includes('say what')) return 'too_short';
  return 'failed';
}
