import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import {
  CatalogPanel,
  GoodsHeldPanel,
  LedgerSeparationDisclosure,
  OrderCard,
  OrdersEmpty,
  OrdersFootnote,
  OrdersNotice,
  OrdersUnavailable,
} from '@/components/orders/OrderSections';
import { getProjectOrders } from '@/features/orders/orders';
import {
  ordersFailureCode,
  ordersSuccessCode,
  ORDERS_FAILURE_COPY,
  ORDERS_SUCCESS_COPY,
} from '@/features/orders/copy';

/**
 * Goods and materials for one project — /projects/{projectId}/orders
 *
 * ⚠️ `projectId` IS THE ASSIGNMENT ID, and it is the only project identity this route accepts. The hub derives
 * both parties from `app_private.project_role_for`, so a project the caller is not part of is a 404 rather than
 * a refusal — a distinct "that project exists but is not yours" is an existence oracle, and assignment ids are
 * guessable in bulk.
 *
 * ⚠️ TWO IDENTITIES ON ONE PAGE, AND THEY ARE LABELLED. The service side of this project has a funded payment
 * obligation and, eventually, a payout. This page has goods orders and a commerce balance. Both are real money,
 * they are held on different ledgers, and neither can pay the other out. The separation statement is rendered
 * above the catalogue, before anybody has a chance to read the figures as one number.
 *
 * ⚠️ THE CATALOGUE IS SHOWN EVEN WHEN NOTHING CAN BE ORDERED. On a closed project the prices are still useful
 * — somebody reading the record a month later wants to know what a bag of cement cost on this job — so ordering
 * is switched off and the list stays.
 */
export const metadata: Metadata = {
  title: 'Goods & materials',
  description: 'Materials, equipment and safety kit ordered for this project.',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Params = Promise<{ projectId: string }>;
type SearchParams = Promise<{ failed?: string; saved?: string }>;

export default async function ProjectOrdersPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(projectId)) notFound();

  const read = await getProjectOrders(projectId);

  // ⚠️ A FAILED READ IS NOT A REFUSAL. The first case is "you are not a party to this project" — a 404, because
  // confirming a project exists to somebody who cannot open it is an existence oracle. The second is "the hub
  // could not be read", which is an outage and not the caller's problem, so it gets an honest state with a
  // reload rather than a 404 that would send them looking for a permissions problem that does not exist.
  if (read.available && !read.allowed) notFound();

  const failure = ordersFailureCode(query.failed);
  const success = ordersSuccessCode(query.saved);
  const now = new Date();
  const currency = read.catalog[0]?.currencyCode ?? 'NGN';

  if (!read.available) {
    return (
      <div className="grid gap-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            <Package aria-hidden="true" className="h-6 w-6 text-primary" />
            Goods &amp; materials
          </h1>
        </header>
        <OrdersUnavailable />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          <Package aria-hidden="true" className="h-6 w-6 text-primary" />
          Goods &amp; materials
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Materials, equipment and safety kit for {read.projectLabel}. Order them here, follow the delivery, and
          ask for a return if something arrives wrong — all on a ledger of its own, kept apart from the money
          held for the work itself.
        </p>
      </header>

      {failure ? <OrdersNotice tone="warning">{ORDERS_FAILURE_COPY[failure]}</OrdersNotice> : null}
      {success ? <OrdersNotice tone="success">{ORDERS_SUCCESS_COPY[success]}</OrdersNotice> : null}

      <LedgerSeparationDisclosure paymentNote={read.paymentNote} />

      <section aria-labelledby="orders-heading" className="grid gap-3">
        <h2 id="orders-heading" className="text-lg font-bold tracking-tight text-slate-900">
          Orders on this project
          <span className="ml-2 font-mono text-xs font-normal text-slate-500">{read.orders.length}</span>
        </h2>
        {read.orders.length === 0 ? (
          <OrdersEmpty />
        ) : (
          <ul className="grid gap-4">
            {read.orders.map((order) => (
              <li key={order.id}>
                <OrderCard projectId={projectId} order={order} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <GoodsHeldPanel goodsHeld={read.goodsHeld} />

      <CatalogPanel
        projectId={projectId}
        catalog={read.catalog}
        canPlace={read.canPlace}
        currencyCode={currency}
      />

      <OrdersFootnote />
    </div>
  );
}
