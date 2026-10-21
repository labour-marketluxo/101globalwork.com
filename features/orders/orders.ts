import { createSupabaseServerClient } from '@/lib/supabase/server';
import { orderStatus, type OrderStatus } from '@/features/orders/copy';

/**
 * The read layer for a project's goods hub.
 *
 * ⚠️ `allowed: false` MEANS "NOT A PARTY TO THIS PROJECT", and the page turns that into a 404. The command
 * derives membership from `app_private.project_role_for`, the same function the rest of the project uses, so
 * the orders hub cannot disagree with the project about who may see it.
 *
 * ⚠️ THE LEDGER SUMMARY ON AN ORDER IS COMMERCE ONLY. `ledger.heldMinor` sums entries whose account code begins
 * `commerce.funds.held.`, and those rows come from the commerce tables. Nothing in this module can read an
 * escrow balance, and nothing it returns is a payout figure.
 */

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  unitPriceMinor: number;
  currencyCode: string;
  supplierName: string | null;
};

export type OrderItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
};

export type Shipment = {
  id: string;
  sequence: number;
  state: string;
  carrier: string | null;
  trackingReference: string | null;
  note: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  recordedAt: string | null;
};

export type OrderReturn = {
  id: string;
  state: string;
  reason: string;
  requestedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  refundedAt: string | null;
  refundReference: string | null;
};

export type OrderLedger = {
  posted: { type: string; occurredAt: string | null; reference: string | null }[];
  heldMinor: number;
  balanced: boolean;
};

export type ProjectOrder = {
  id: string;
  reference: string;
  status: OrderStatus;
  currencyCode: string;
  totalMinor: number;
  deliveryAddress: string;
  deliveryNote: string | null;
  placedByMe: boolean;
  placedByName: string;
  paymentReference: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string | null;
  nextStep: string;
  items: OrderItem[];
  shipments: Shipment[];
  openReturn: OrderReturn | null;
  ledger: OrderLedger;
};

export type OrdersRead = {
  available: boolean;
  allowed: boolean;
  role: string | null;
  canPlace: boolean;
  projectLabel: string;
  catalog: Product[];
  orders: ProjectOrder[];
  goodsHeld: { currencyCode: string; heldMinor: number }[];
  paymentNote: string;
};

const UNAVAILABLE: OrdersRead = {
  available: false,
  allowed: false,
  role: null,
  canPlace: false,
  projectLabel: '',
  catalog: [],
  orders: [],
  goodsHeld: [],
  paymentNote: '',
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function toProduct(row: Raw): Product | null {
  const id = textFrom(row.id);
  const name = textFrom(row.name);
  const sku = textFrom(row.sku);
  if (!id || !name || !sku) return null;
  return {
    id,
    sku,
    name,
    description: textFrom(row.description) ?? '',
    category: textFrom(row.category) ?? 'materials',
    unit: textFrom(row.unit) ?? 'each',
    unitPriceMinor: numberFrom(row.unitPriceMinor),
    currencyCode: textFrom(row.currencyCode) ?? 'NGN',
    supplierName: textFrom(row.supplierName),
  };
}

function toOrder(row: Raw): ProjectOrder | null {
  const id = textFrom(row.id);
  const reference = textFrom(row.reference);
  const status = orderStatus(textFrom(row.status));
  if (!id || !reference || !status) return null;

  const ledger = objectFrom(row.ledger);
  const openReturn = row.openReturn && typeof row.openReturn === 'object' ? objectFrom(row.openReturn) : null;

  return {
    id,
    reference,
    status,
    currencyCode: textFrom(row.currencyCode) ?? 'NGN',
    totalMinor: numberFrom(row.totalMinor),
    deliveryAddress: textFrom(row.deliveryAddress) ?? '',
    deliveryNote: textFrom(row.deliveryNote),
    placedByMe: row.placedByMe === true,
    placedByName: textFrom(row.placedByName) ?? 'A participant',
    paymentReference: textFrom(row.paymentReference),
    paidAt: textFrom(row.paidAt),
    deliveredAt: textFrom(row.deliveredAt),
    cancelledAt: textFrom(row.cancelledAt),
    cancelReason: textFrom(row.cancelReason),
    createdAt: textFrom(row.createdAt),
    nextStep: textFrom(row.nextStep) ?? '',
    items: rowsFrom(row.items)
      .map((item) => {
        const itemId = textFrom(item.id);
        const name = textFrom(item.name);
        if (!itemId || !name) return null;
        return {
          id: itemId,
          sku: textFrom(item.sku) ?? '',
          name,
          unit: textFrom(item.unit) ?? 'each',
          unitPriceMinor: numberFrom(item.unitPriceMinor),
          quantity: numberFrom(item.quantity),
          lineTotalMinor: numberFrom(item.lineTotalMinor),
        } satisfies OrderItem;
      })
      .filter((item): item is OrderItem => item !== null),
    shipments: rowsFrom(row.shipments)
      .map((shipment) => {
        const shipmentId = textFrom(shipment.id);
        if (!shipmentId) return null;
        return {
          id: shipmentId,
          sequence: numberFrom(shipment.sequence),
          state: textFrom(shipment.state) ?? 'preparing',
          carrier: textFrom(shipment.carrier),
          trackingReference: textFrom(shipment.trackingReference),
          note: textFrom(shipment.note),
          dispatchedAt: textFrom(shipment.dispatchedAt),
          deliveredAt: textFrom(shipment.deliveredAt),
          recordedAt: textFrom(shipment.recordedAt),
        } satisfies Shipment;
      })
      .filter((shipment): shipment is Shipment => shipment !== null),
    openReturn: openReturn
      ? {
          id: textFrom(openReturn.id) ?? '',
          state: textFrom(openReturn.state) ?? 'requested',
          reason: textFrom(openReturn.reason) ?? '',
          requestedAt: textFrom(openReturn.requestedAt),
          decidedAt: textFrom(openReturn.decidedAt),
          decisionNote: textFrom(openReturn.decisionNote),
          refundedAt: textFrom(openReturn.refundedAt),
          refundReference: textFrom(openReturn.refundReference),
        }
      : null,
    ledger: {
      posted: rowsFrom(ledger.posted).map((entry) => ({
        type: textFrom(entry.type) ?? 'commerce_transaction',
        occurredAt: textFrom(entry.occurredAt),
        reference: textFrom(entry.reference),
      })),
      heldMinor: numberFrom(ledger.heldMinor),
      balanced: ledger.balanced !== false,
    },
  };
}

export async function getProjectOrders(assignmentId: string): Promise<OrdersRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_orders_command', {
    p_assignment_id: assignmentId,
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[orders] could not read the goods hub: ${error.message}`);
    }
    return UNAVAILABLE;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return { ...UNAVAILABLE, available: true };

  return {
    available: true,
    allowed: true,
    role: textFrom(raw.role),
    canPlace: raw.canPlace === true,
    projectLabel: textFrom(raw.projectLabel) ?? 'This project',
    catalog: rowsFrom(raw.catalog)
      .map(toProduct)
      .filter((product): product is Product => product !== null),
    orders: rowsFrom(raw.orders)
      .map(toOrder)
      .filter((order): order is ProjectOrder => order !== null),
    goodsHeld: rowsFrom(raw.goodsHeld).map((entry) => ({
      currencyCode: textFrom(entry.currencyCode) ?? 'NGN',
      heldMinor: numberFrom(entry.heldMinor),
    })),
    paymentNote: textFrom(raw.paymentNote) ?? '',
  };
}
