import Link from 'next/link';
import { Boxes, CircleAlert, CircleCheck, Info, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { BADGE_SLATE, CARD, FIELD, LABEL } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { formatRelativeTime } from '@/features/settings/device-label';
import {
  cancelOrderAction,
  placeOrderAction,
  recordShipmentAction,
  requestReturnAction,
} from '@/features/orders/actions';
import {
  CATEGORY_COPY,
  LEDGER_SEPARATION_DISCLOSURE,
  ORDER_STATUS_COPY,
  RETURN_STATE_COPY,
  SHIPMENT_STATE_COPY,
  UNIT_COPY,
  formatMinor,
} from '@/features/orders/copy';
import type { Product, ProjectOrder } from '@/features/orders/orders';

/**
 * The goods hub's presentation, all server components.
 *
 * ⚠️ THE LEDGER SEPARATION IS ON THE PAGE, NOT ONLY IN THE DATABASE. The invariant is enforced in the schema —
 * separate tables, a `commerce.` prefix requirement on every account code, and a namespaced transaction key —
 * but a customer cannot see a schema. What they CAN see is the statement in `LedgerSeparationDisclosure`, the
 * goods-held figure taken from commerce accounts only, and an order's own ledger history, which never shows a
 * payout or an escrow balance. That is the visible half of the same rule.
 *
 * ⚠️ GOODS HAVE THEIR OWN WORDS. An order is not a project; a delivery is not a completion; a refund is not a
 * payout. Every label here is deliberately different from the service side's, because the moment the two
 * vocabularies merge on a screen, people reasonably conclude the money is in one place.
 */

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date);
}

export function OrdersNotice({ tone, children }: { tone: 'success' | 'warning'; children: React.ReactNode }) {
  const isSuccess = tone === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        isSuccess
          ? 'border-primary-subtle bg-primary-surface text-slate-700'
          : 'border-secondary bg-secondary-light text-amber-900'
      }`}
    >
      {isSuccess ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function OrdersUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">The goods hub could not be read.</p>
        <p className="mt-1">
          This is not the same as there being no orders. Nothing has been changed — reload to try again. Orders
          already placed keep their record and their money stays where it is.
        </p>
      </div>
    </div>
  );
}

export function LedgerSeparationDisclosure({ paymentNote }: { paymentNote: string }) {
  return (
    <section aria-labelledby="ledger-heading" className={`${CARD} p-5`}>
      <h2 id="ledger-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
        Goods money is kept separate
      </h2>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-600">{LEDGER_SEPARATION_DISCLOSURE}</p>
      {paymentNote ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{paymentNote}</span>
        </p>
      ) : null}
    </section>
  );
}

export function GoodsHeldPanel({
  goodsHeld,
}: {
  goodsHeld: { currencyCode: string; heldMinor: number }[];
}) {
  if (goodsHeld.length === 0) return null;

  return (
    <section aria-labelledby="held-heading" className={`${CARD} p-5`}>
      <h2 id="held-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Held for goods on this project
      </h2>
      <ul className="mt-2 grid gap-2">
        {goodsHeld.map((balance) => (
          <li key={balance.currencyCode} className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-lg font-bold tracking-tight text-slate-900">
              {formatMinor(balance.heldMinor, balance.currencyCode)}
            </span>
            <span className="text-xs text-slate-500">
              on the commerce ledger, not the escrow ledger
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        This is money paid for goods ordered against this project that has not been refunded. It is not a payout
        figure and it is not comparable with one: service money and goods money are different books.
      </p>
    </section>
  );
}

/**
 * Browse the catalogue and place an order.
 *
 * One form for the whole catalogue rather than a cart in component state: the quantity fields ARE the cart, the
 * page works without JavaScript, and nothing has to be re-validated client-side because the server reads the
 * catalogue itself.
 */
export function CatalogPanel({
  projectId,
  catalog,
  canPlace,
  currencyCode,
}: {
  projectId: string;
  catalog: Product[];
  canPlace: boolean;
  currencyCode: string;
}) {
  const categories = [...new Set(catalog.map((product) => product.category))];

  return (
    <section aria-labelledby="catalog-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="catalog-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Boxes aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Browse materials catalogue
      </h2>
      <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600">
        Construction materials, equipment and safety kit, priced per unit for this market. Put a quantity against
        anything you need and place one order for the whole lot — the prices are read from the catalogue on the
        server when the order is placed, not from this page.
      </p>

      {!canPlace ? (
        <p className="mt-3 rounded-lg bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
          Goods can only be ordered while the project is running. This one is closed, so the catalogue is shown
          for reference and ordering is off.
        </p>
      ) : null}

      <form action={placeOrderAction} className="mt-4 grid gap-5">
        <input type="hidden" name="project_id" value={projectId} />

        {categories.map((category) => (
          <fieldset key={category} className="rounded-xl border border-solid border-slate-200 p-4">
            <legend className={`${LABEL} px-1`}>{CATEGORY_COPY[category] ?? category}</legend>
            <ul className="grid gap-3">
              {catalog
                .filter((product) => product.category === category)
                .map((product) => (
                  <li key={product.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{product.description}</p>
                      <p className="mt-1 font-mono text-xs text-slate-600">
                        {formatMinor(product.unitPriceMinor, product.currencyCode)} per{' '}
                        {UNIT_COPY[product.unit] ?? product.unit}
                        <span className="text-slate-400"> · {product.sku}</span>
                        {product.supplierName ? <span className="text-slate-400"> · {product.supplierName}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`qty_${product.id}`}>
                        Quantity of {product.name}
                      </label>
                      <input
                        id={`qty_${product.id}`}
                        name={`qty_${product.id}`}
                        type="number"
                        min={0}
                        max={10000}
                        step={1}
                        defaultValue={0}
                        disabled={!canPlace}
                        className={`${FIELD} w-24 text-right`}
                      />
                      <span className="text-xs text-slate-500">{UNIT_COPY[product.unit] ?? product.unit}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </fieldset>
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="delivery_address">
              Delivery address
            </label>
            <input
              id="delivery_address"
              name="delivery_address"
              type="text"
              required
              minLength={10}
              maxLength={400}
              disabled={!canPlace}
              placeholder="Where the goods should be delivered, with anything a driver needs to know"
              className={FIELD}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="delivery_note">
              Delivery note (optional)
            </label>
            <input
              id="delivery_note"
              name="delivery_note"
              type="text"
              maxLength={500}
              disabled={!canPlace}
              placeholder="Access times, a contact on site, a gate code"
              className={FIELD}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canPlace}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            Place goods order
          </button>
          <p className="text-xs text-slate-500">
            Orders are priced in {currencyCode}. Nothing is charged at this point — the order waits for the
            platform to record the payment, and the order card says so.
          </p>
        </div>
      </form>
    </section>
  );
}

export function OrdersEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
      <Boxes aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
      <p className="mt-3 text-sm font-semibold text-slate-700">No goods ordered for this project yet.</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
        Orders placed here are for materials, equipment and safety kit for this job. They are tracked separately
        from the work itself, and their money never mixes with it.
      </p>
    </div>
  );
}

export function OrderCard({
  projectId,
  order,
  now,
}: {
  projectId: string;
  order: ProjectOrder;
  now: Date;
}) {
  const status = ORDER_STATUS_COPY[order.status];
  const canFulfil = ['paid', 'preparing', 'dispatched'].includes(order.status);
  const openReturn = order.openReturn;

  return (
    <article className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              {order.reference}
            </span>
            <span
              title={status.explains}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase ${status.className}`}
            >
              {status.label}
            </span>
            <span className={BADGE_SLATE}>Placed by {order.placedByMe ? 'you' : order.placedByName}</span>
            {!order.ledger.balanced ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-red-700 uppercase">
                <CircleAlert aria-hidden="true" className="h-3 w-3" />
                Ledger imbalance
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{order.nextStep}</p>
        </div>
        <p className="text-right">
          <span className="block font-mono text-lg font-bold tracking-tight text-slate-900">
            {formatMinor(order.totalMinor, order.currencyCode)}
          </span>
          <span className="text-[11px] text-slate-500">
            {order.items.length} line{order.items.length === 1 ? '' : 's'}
          </span>
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <caption className="sr-only">Items on order {order.reference}</caption>
          <thead>
            <tr className="border-b border-solid border-slate-200">
              <th scope="col" className="py-2 font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Item
              </th>
              <th scope="col" className="py-2 text-right font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Unit
              </th>
              <th scope="col" className="py-2 text-right font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Qty
              </th>
              <th scope="col" className="py-2 text-right font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Line
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-solid border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-slate-800">
                  {item.name}
                  <span className="ml-2 font-mono text-[10px] text-slate-400">{item.sku}</span>
                </th>
                <td className="py-2 text-right text-slate-600">
                  {formatMinor(item.unitPriceMinor, order.currencyCode)} / {UNIT_COPY[item.unit] ?? item.unit}
                </td>
                <td className="py-2 text-right text-slate-800">{item.quantity}</td>
                <td className="py-2 text-right font-mono text-slate-800">
                  {formatMinor(item.lineTotalMinor, order.currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Delivering to</dt>
          <dd className="mt-0.5 text-slate-700">{order.deliveryAddress}</dd>
          {order.deliveryNote ? <dd className="text-[11px] text-slate-500">{order.deliveryNote}</dd> : null}
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Placed</dt>
          <dd className="mt-0.5 text-slate-700">{formatRelativeTime(order.createdAt, now)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Commerce ledger
          </dt>
          <dd className="mt-0.5 text-slate-700">
            {order.ledger.heldMinor !== 0
              ? `${formatMinor(order.ledger.heldMinor, order.currencyCode)} held for these goods`
              : 'Nothing held for these goods'}
          </dd>
          {order.ledger.posted.length > 0 ? (
            <dd className="mt-0.5 font-mono text-[10px] text-slate-500">
              {order.ledger.posted
                .map((entry) => entry.type.replace('commerce_order_', '').replace('commerce_', ''))
                .join(', ')}
            </dd>
          ) : (
            <dd className="mt-0.5 text-[11px] text-slate-500">
              Nothing posted yet: no money has moved for this order.
            </dd>
          )}
        </div>
      </dl>

      {order.shipments.length > 0 ? (
        <div className="mt-4 border-t border-solid border-slate-200 pt-4">
          <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            <Truck aria-hidden="true" className="h-3.5 w-3.5" />
            Delivery
          </h3>
          <ol className="mt-2 grid gap-1.5">
            {order.shipments.map((shipment) => {
              const state = SHIPMENT_STATE_COPY[shipment.state] ?? SHIPMENT_STATE_COPY.preparing;
              return (
                <li
                  key={shipment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="text-slate-700">
                    {shipment.carrier ?? 'Carrier not recorded'}
                    {shipment.trackingReference ? (
                      <span className="ml-2 font-mono text-[11px] text-slate-500">{shipment.trackingReference}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {shipment.note ? <span className="text-slate-500">{shipment.note}</span> : null}
                    <span className="text-[11px] text-slate-500">
                      {formatDay(shipment.deliveredAt ?? shipment.dispatchedAt ?? shipment.recordedAt) ?? ''}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide uppercase ${state.className}`}>
                      {state.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Each record is kept rather than overwritten, so the timeline shows the whole journey. Carrier tracking
            is a reference somebody typed — the platform does not poll a carrier.
          </p>
        </div>
      ) : null}

      {canFulfil ? (
        <details className="mt-4 border-t border-solid border-slate-200 pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-primary">
            Record what is happening with the delivery
          </summary>
          <form action={recordShipmentAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="order_id" value={order.id} />
            <div>
              <label className={LABEL} htmlFor={`shipment-state-${order.id}`}>
                State
              </label>
              <select id={`shipment-state-${order.id}`} name="state" defaultValue="preparing" className={FIELD}>
                <option value="preparing">Preparing</option>
                <option value="dispatched">Dispatched</option>
                <option value="in_transit">In transit</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor={`shipment-carrier-${order.id}`}>
                Carrier (optional)
              </label>
              <input id={`shipment-carrier-${order.id}`} name="carrier" type="text" maxLength={120} className={FIELD} />
            </div>
            <div>
              <label className={LABEL} htmlFor={`shipment-ref-${order.id}`}>
                Tracking reference (optional)
              </label>
              <input
                id={`shipment-ref-${order.id}`}
                name="tracking_reference"
                type="text"
                maxLength={120}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`shipment-note-${order.id}`}>
                Note (optional)
              </label>
              <input id={`shipment-note-${order.id}`} name="note" type="text" maxLength={500} className={FIELD} />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                <PackageCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Record it
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Either party to the project can record this. The person who receives the goods is not always the
                person who ordered them.
              </p>
            </div>
          </form>
        </details>
      ) : null}

      {openReturn ? (
        <div className="mt-4 rounded-lg border border-solid border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-900">
            {RETURN_STATE_COPY[openReturn.state]?.label ?? 'Return'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {RETURN_STATE_COPY[openReturn.state]?.explains ?? ''} {openReturn.reason}
          </p>
          {openReturn.decisionNote ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Decision: {openReturn.decisionNote}</p>
          ) : null}
          {openReturn.refundedAt ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Refunded {formatRelativeTime(openReturn.refundedAt, now)}
              {openReturn.refundReference ? ` · reference ${openReturn.refundReference}` : ''}
            </p>
          ) : null}
        </div>
      ) : order.status === 'delivered' && order.placedByMe ? (
        <details className="mt-4 border-t border-solid border-slate-200 pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-primary">Request a return or refund</summary>
          <form action={requestReturnAction} className="mt-3 grid gap-3">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="order_id" value={order.id} />
            <label className={LABEL} htmlFor={`return-${order.id}`}>
              What is wrong with the goods?
            </label>
            <textarea
              id={`return-${order.id}`}
              name="return_reason"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              placeholder="What arrived, what was wrong with it, and what you need instead."
              className={FIELD}
            />
            <div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Send the request
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                The request goes to the platform rather than to the supplier: it is the platform that holds the
                money for these goods, and the refund is recorded here once the goods are back.
              </p>
            </div>
          </form>
        </details>
      ) : null}

      {order.status === 'awaiting_payment' && order.placedByMe ? (
        <form action={cancelOrderAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-solid border-slate-200 pt-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="order_id" value={order.id} />
          <label className="sr-only" htmlFor={`cancel-${order.id}`}>
            Why is it being cancelled?
          </label>
          <input
            id={`cancel-${order.id}`}
            name="cancel_reason"
            type="text"
            maxLength={500}
            placeholder="Why it is cancelled (optional)"
            className={`${FIELD} w-64`}
          />
          <ConfirmSubmit
            label="Cancel order"
            triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-transparent bg-transparent px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
            icon="danger"
            title="Cancel this order?"
            description="Nothing has been paid for and nothing has been dispatched, so this ends the order with no money to return. An order that has been paid for cannot be cancelled here — it goes through a return instead."
            confirmLabel="Cancel order"
          />
        </form>
      ) : null}

      <p className="mt-3 text-[11px] text-slate-400">
        <Link href={projectId ? `/projects/${projectId}` : '/work'} className="underline underline-offset-2">
          Back to the project
        </Link>{' '}
        · order placed {formatRelativeTime(order.createdAt, now)}
        {order.paymentReference ? ` · payment reference ${order.paymentReference}` : ''}
      </p>
    </article>
  );
}

export function OrdersFootnote() {
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      Materials ordered here are for this project only. They are not part of the service agreement, they are not
      quoted for the work, and they do not change what the work costs.
    </p>
  );
}
