/**
 * The goods hub's vocabulary.
 *
 * Every state the database can return has words here, and every one of those words is about goods rather than
 * about service work: an order is not a project, a delivery is not a completion, and a refund is not a payout.
 * Keeping that vocabulary separate is the visible half of the ledger separation.
 */

export const ORDER_STATUSES = [
  'awaiting_payment',
  'paid',
  'preparing',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { label: string; className: string; explains: string; nextStep: string }
> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    className: 'bg-secondary-light text-amber-800',
    explains: 'The order is placed with the catalogue and nothing has been paid yet.',
    nextStep: 'The platform records the payment before anything is ordered from the supplier.',
  },
  paid: {
    label: 'Paid',
    className: 'bg-primary-subtle text-primary',
    explains: 'The money for these goods is held on the commerce ledger, separately from service work.',
    nextStep: 'Waiting for the supplier to prepare the goods.',
  },
  preparing: {
    label: 'Preparing',
    className: 'bg-slate-100 text-slate-700',
    explains: 'The supplier is preparing the goods.',
    nextStep: 'Dispatch is recorded when they leave.',
  },
  dispatched: {
    label: 'In transit',
    className: 'bg-slate-100 text-slate-700',
    explains: 'The goods have left the supplier and are on their way.',
    nextStep: 'Delivery is recorded when they arrive on site.',
  },
  delivered: {
    label: 'Delivered',
    className: 'bg-primary-subtle text-primary',
    explains: 'The goods were recorded as delivered to the site.',
    nextStep: 'A return can be requested from here if something is wrong with them.',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-500',
    explains: 'Nothing was dispatched and nothing was paid.',
    nextStep: 'Nothing further happens on this order.',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-slate-100 text-slate-500',
    explains: 'The refund was recorded and reversed on the commerce ledger.',
    nextStep: 'Nothing further happens on this order.',
  },
};

export function orderStatus(value: string | null | undefined): OrderStatus | null {
  return (ORDER_STATUSES as readonly string[]).includes(String(value)) ? (value as OrderStatus) : null;
}

export const SHIPMENT_STATE_COPY: Record<string, { label: string; className: string }> = {
  preparing: { label: 'Preparing', className: 'bg-slate-100 text-slate-600' },
  dispatched: { label: 'Dispatched', className: 'bg-slate-100 text-slate-700' },
  in_transit: { label: 'In transit', className: 'bg-slate-100 text-slate-700' },
  delivered: { label: 'Delivered', className: 'bg-primary-subtle text-primary' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
};

export const RETURN_STATE_COPY: Record<string, { label: string; className: string; explains: string }> = {
  requested: {
    label: 'Return requested',
    className: 'bg-secondary-light text-amber-800',
    explains: 'The platform has been asked to take these goods back. Nothing has moved yet.',
  },
  approved: {
    label: 'Return approved',
    className: 'bg-primary-subtle text-primary',
    explains: 'The return is agreed. The refund is recorded once the goods are back with the supplier.',
  },
  declined: {
    label: 'Return declined',
    className: 'bg-slate-100 text-slate-500',
    explains: 'The return was refused, with the reason recorded against the order.',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-slate-100 text-slate-600',
    explains: 'The money was returned and the reversal is posted on the commerce ledger.',
  },
};

export const CATEGORY_COPY: Record<string, string> = {
  materials: 'Materials',
  equipment: 'Equipment',
  consumables: 'Consumables',
  safety: 'Safety equipment',
};

export const UNIT_COPY: Record<string, string> = {
  each: 'each',
  bag: 'bag',
  tonne: 'tonne',
  length: 'length',
  roll: 'roll',
  sheet: 'sheet',
  pack: 'pack',
  litre: 'litre',
};

export function formatMinor(amountMinor: number, currencyCode: string): string {
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/**
 * ⚠️ THE SEPARATION, IN THE WORDS A CUSTOMER NEEDS.
 *
 * Somebody looking at a project sees a funded service payment and a goods order on the same screen. The one
 * thing they must not conclude is that the two are the same pot of money, or that one can pay the other out.
 */
export const LEDGER_SEPARATION_DISCLOSURE =
  'Goods money is held on a separate commerce ledger. It never touches the money held for service work: a goods order cannot pay a provider, and a service payout cannot come out of goods money. The two are different books, and the platform keeps them that way.';

export const ORDERS_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'not_found',
  'not_payable',
  'not_fulfillable',
  'not_delivered',
  'return_in_progress',
  'mixed_currency',
  'unavailable',
] as const;
export type OrdersFailureCode = (typeof ORDERS_FAILURE_CODES)[number];

export const ORDERS_FAILURE_COPY: Record<OrdersFailureCode, string> = {
  not_authorized: 'That order is not yours to act on, or it does not belong to this project.',
  bad_request: 'That request was missing something it needed, or carried a value the platform does not accept.',
  not_found: 'That order or product could not be found. Reload the page to see the current catalogue.',
  not_payable: 'This order is not in a state where that can happen — see the state it is in on the card.',
  not_fulfillable: 'Dispatch and delivery cannot be recorded until the order has been paid for.',
  not_delivered: 'A return can only be asked for once the goods have been delivered.',
  return_in_progress: 'This order already has a return in progress.',
  mixed_currency: 'An order cannot mix products priced in different currencies.',
  unavailable: 'The change could not be completed. Nothing was changed — try again.',
};

export function ordersFailureCode(value: string | undefined | null): OrdersFailureCode | null {
  if (!value) return null;
  return (ORDERS_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as OrdersFailureCode)
    : null;
}

export const ORDERS_SUCCESS_CODES = ['placed', 'cancelled', 'shipment', 'returned'] as const;
export type OrdersSuccessCode = (typeof ORDERS_SUCCESS_CODES)[number];

export const ORDERS_SUCCESS_COPY: Record<OrdersSuccessCode, string> = {
  placed:
    'The order is placed against the catalogue prices. It is awaiting payment: the platform records that step, and the card below says what happens next.',
  cancelled: 'The order is cancelled. Nothing was dispatched and nothing was paid.',
  shipment: 'The shipment state is recorded on the order. Each record is kept, so the timeline shows the whole journey.',
  returned: 'The return request is on the order. The platform decides it, and the refund is recorded once the goods are back.',
};

export function ordersSuccessCode(value: string | undefined | null): OrdersSuccessCode | null {
  if (!value) return null;
  return (ORDERS_SUCCESS_CODES as readonly string[]).includes(value)
    ? (value as OrdersSuccessCode)
    : null;
}
