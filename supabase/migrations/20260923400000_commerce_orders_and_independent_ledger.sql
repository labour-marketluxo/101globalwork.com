-- Goods and materials ordered against a project: the commerce hub behind
-- /projects/{projectId}/orders, and the ledger it posts to.
--
-- ── THE INVARIANT, AND HOW IT IS ENFORCED RATHER THAN INTENDED ────────────────────────────────
--
-- The brief's rule is that product orders must operate on an INDEPENDENT commerce ledger, keeping goods
-- purchases distinct from escrowed service work and its payouts. That is enforced structurally, in four
-- places, so it cannot be undone by a later change that only meant to add a column:
--
--   1. THE TABLES ARE DIFFERENT TABLES. `commerce_ledger_transactions` and `commerce_ledger_entries` are not
--      `ledger_transactions` and `ledger_entries`. There is no shared row, no shared id and no foreign key
--      between them.
--
--   2. A COMMERCE ENTRY CANNOT NAME A SERVICE ACCOUNT. `commerce_ledger_accounts.account_code` must begin
--      with `commerce.`, and every service account code in this platform begins with something else. A
--      posting that tried to reach the escrow accounts would have to violate the CHECK to do it.
--
--   3. A COMMERCE TRANSACTION CANNOT REUSE A SERVICE TRANSACTION TYPE OR KEY.
--      `transaction_type like 'commerce_%'` and `idempotency_key like 'commerce:%'` are both enforced, so a
--      service reconciliation key ('provider-event:…') and a commerce key occupy different namespaces and a
--      duplicate-key collision between the two ledgers is impossible by construction.
--
--   4. THE BALANCE HELPER IS A SECOND COPY, ON PURPOSE. `post_balanced_commerce_transaction` mirrors
--      `post_balanced_ledger_transaction` rather than calling it, because a shared helper is exactly the seam
--      through which the two ledgers would eventually be joined. The duplicated twenty lines are the price of
--      the separation, and the duplication is checked by test: both refuse an unbalanced set, both are
--      idempotent by key, and neither can write to the other's tables.
--
-- The consequence, stated because it is the point: a goods order cannot pay a provider, cannot be paid out of,
-- and cannot appear in the obligation or payout ledger. Money for goods is held and returned on its own books.
--
-- ── WHAT PAYS FOR AN ORDER, HONESTLY ─────────────────────────────────────────────────────────
--
-- Card checkout for goods is NOT wired in this deployment. An order is placed, priced from the catalogue on
-- the server, and sits in `awaiting_payment` until the platform's money process records that it was settled —
-- a step gated on the `platform.money.reconcile` capability and on aal2, the same rule the administrator
-- money console applies to every other movement of money. The order page says which state it is in and who
-- has to act next, rather than showing a pay button that does not work.
--
-- ── WHO MAY DO WHAT ───────────────────────────────────────────────────────────────────────────
--
-- Both parties to the assignment can read the hub: a provider buying materials they will use on the job and a
-- customer buying them for the same job are the same transaction from different sides. Placing an order, and
-- asking for a return, is for the party that placed it. Recording dispatch and delivery is for either party —
-- the person who receives the goods is not always the person who bought them, and making the buyer the only
-- one who can say "it arrived" produces orders that are delivered and permanently undispatched in the record.

create type public.commerce_order_status as enum (
  'awaiting_payment', 'paid', 'preparing', 'dispatched', 'delivered', 'cancelled', 'refunded'
);
create type public.commerce_shipment_state as enum ('preparing', 'dispatched', 'in_transit', 'delivered', 'failed');
create type public.commerce_return_state as enum ('requested', 'approved', 'declined', 'refunded');
create type public.commerce_ledger_account_kind as enum ('asset', 'liability', 'revenue', 'expense');
create type public.commerce_ledger_owner_kind as enum ('platform', 'customer', 'provider');

-- ── 1. The catalogue ──────────────────────────────────────────────────────────────────────────

create table public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Z0-9-]{3,32}$'),
  market_id uuid references public.markets(id) on delete restrict,
  -- Who supplies it, when it comes from a provider on this platform. Null means the platform's own stock.
  supplier_provider_id uuid references public.providers(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  category text not null check (category in ('materials', 'equipment', 'consumables', 'safety')),
  unit text not null check (unit in ('each', 'bag', 'tonne', 'length', 'roll', 'sheet', 'pack', 'litre')),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commerce_products_category_idx on public.commerce_products(category) where is_active;

alter table public.commerce_products enable row level security;

-- The catalogue is public reference data with no personal content: readable when active, never writable
-- through the Data API.
create policy commerce_products_public_read on public.commerce_products
  for select to authenticated using (is_active);

insert into public.commerce_products (sku, market_id, name, description, category, unit, unit_price_minor, currency_code)
values
  ('MAT-CEM-50', (select id from public.markets where code = 'NG'), 'Portland cement, 50 kg bag',
   'General-purpose Portland cement for structural and non-structural concrete on site.', 'materials', 'bag', 950000, 'NGN'),
  ('MAT-SAND-01', (select id from public.markets where code = 'NG'), 'Sharp sand, per tonne',
   'Washed sharp sand for concrete mixing and bedding, delivered by the tonne.', 'materials', 'tonne', 3200000, 'NGN'),
  ('MAT-GRAN-01', (select id from public.markets where code = 'NG'), 'Granite aggregate, 20 mm, per tonne',
   'Crushed granite aggregate graded at 20 mm for concrete works.', 'materials', 'tonne', 4500000, 'NGN'),
  ('MAT-BLK-09', (select id from public.markets where code = 'NG'), 'Concrete block, 9 inch',
   'Hollow sandcrete block, 9 inch, for load-bearing and partition walls.', 'materials', 'each', 70000, 'NGN'),
  ('MAT-RBR-12', (select id from public.markets where code = 'NG'), 'Reinforcement bar, 12 mm, 12 m length',
   'Deformed high-yield reinforcement bar sold by the 12 metre length.', 'materials', 'length', 980000, 'NGN'),
  ('MAT-PVC-110', (select id from public.markets where code = 'NG'), 'PVC soil pipe, 110 mm, 3 m',
   'Solvent-weld PVC soil and waste pipe, 110 mm diameter, 3 metre length.', 'materials', 'length', 650000, 'NGN'),
  ('MAT-CBL-25', (select id from public.markets where code = 'NG'), 'Electrical cable, 2.5 mm², 100 m roll',
   'Single-core PVC-insulated copper cable, 2.5 mm², supplied on a 100 metre roll.', 'materials', 'roll', 4800000, 'NGN'),
  ('MAT-WPM-20', (select id from public.markets where code = 'NG'), 'Waterproofing membrane, 20 m² roll',
   'Self-adhesive bituminous membrane for wet areas and roofs, 20 square metre roll.', 'materials', 'roll', 5500000, 'NGN'),
  ('MAT-PNT-20', (select id from public.markets where code = 'NG'), 'Emulsion paint, 20 litre',
   'Vinyl matt emulsion for interior walls and ceilings, 20 litre container.', 'materials', 'each', 3800000, 'NGN'),
  ('SAF-HLM-01', (select id from public.markets where code = 'NG'), 'Safety helmet, vented',
   'Vented ABS safety helmet with six-point harness. Sold singly.', 'safety', 'each', 1200000, 'NGN'),
  ('SAF-VST-01', (select id from public.markets where code = 'NG'), 'High-visibility vest, class 2',
   'Class 2 high-visibility vest with reflective banding.', 'safety', 'each', 650000, 'NGN'),
  ('SAF-GLV-01', (select id from public.markets where code = 'NG'), 'Cut-resistant gloves, pair',
   'Level C cut-resistant gloves for handling sheet metal and glass.', 'safety', 'each', 850000, 'NGN'),
  ('EQP-GEN-35', (select id from public.markets where code = 'NG'), 'Portable generator, 3.5 kVA',
   'Petrol generator, 3.5 kVA, for site power where no supply is available.', 'equipment', 'each', 48000000, 'NGN'),
  ('CNS-TAR-01', (select id from public.markets where code = 'NG'), 'Tarpaulin, 4 m × 6 m',
   'Heavy-duty reinforced tarpaulin for covering materials and openings.', 'consumables', 'each', 1450000, 'NGN')
on conflict (sku) do update
  set name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      unit = excluded.unit,
      unit_price_minor = excluded.unit_price_minor,
      currency_code = excluded.currency_code,
      is_active = true;

-- ── 2. Orders ─────────────────────────────────────────────────────────────────────────────────

create table public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^ORD-[0-9A-F]{10}$'),
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  -- The account that placed it. The other party to the project can read the order but cannot return it.
  placed_by_account_id uuid not null references public.accounts(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  status public.commerce_order_status not null default 'awaiting_payment',
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor > 0),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 10 and 400),
  delivery_note text check (delivery_note is null or char_length(btrim(delivery_note)) between 1 and 500),
  payment_reference text,
  payment_recorded_by_account_id uuid references public.accounts(id) on delete set null,
  paid_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_orders_paid_shape check ((paid_at is null) or (payment_reference is not null)),
  constraint commerce_orders_cancelled_shape check ((status <> 'cancelled') or (cancelled_at is not null)),
  constraint commerce_orders_delivered_shape check ((status not in ('delivered', 'refunded')) or (delivered_at is not null))
);

create index commerce_orders_assignment_idx on public.commerce_orders(assignment_id, created_at desc);
create index commerce_orders_status_idx on public.commerce_orders(status, created_at desc);

create table public.commerce_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  product_id uuid not null references public.commerce_products(id) on delete restrict,
  -- ⚠️ THE NAME, UNIT AND PRICE ARE SNAPSHOTS, TAKEN AT PLACEMENT. A catalogue edited next month must not
  -- restate what somebody was charged last month, and an order line that re-read the product would do exactly
  -- that for every historic order on the page.
  sku text not null,
  name text not null,
  unit text not null,
  unit_price_minor bigint not null check (unit_price_minor > 0),
  quantity integer not null check (quantity between 1 and 10000),
  line_total_minor bigint not null check (line_total_minor > 0),
  created_at timestamptz not null default now(),
  constraint commerce_order_items_line_total_chk check (line_total_minor = unit_price_minor * quantity)
);

create index commerce_order_items_order_idx on public.commerce_order_items(order_id);
create index commerce_order_items_product_idx on public.commerce_order_items(product_id);

create table public.commerce_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  sequence integer not null check (sequence between 1 and 100),
  state public.commerce_shipment_state not null default 'preparing',
  carrier text check (carrier is null or char_length(btrim(carrier)) between 1 and 120),
  tracking_reference text check (tracking_reference is null or char_length(btrim(tracking_reference)) between 1 and 120),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  recorded_by_account_id uuid not null references public.accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, sequence),
  constraint commerce_shipments_dispatch_shape check ((state in ('preparing', 'failed')) = (dispatched_at is null)),
  constraint commerce_shipments_delivery_shape check ((state = 'delivered') = (delivered_at is not null))
);

create index commerce_shipments_order_idx on public.commerce_shipments(order_id, sequence);

create table public.commerce_return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 2000),
  state public.commerce_return_state not null default 'requested',
  requested_by_account_id uuid not null references public.accounts(id) on delete restrict,
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 500),
  -- The reversal, once it is posted. Null until the money has actually moved.
  refund_transaction_id uuid,
  refund_reference text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commerce_return_requests_decision_shape check (
    (state = 'requested') = (decided_at is null)
  ),
  constraint commerce_return_requests_refund_shape check (
    (state = 'refunded') = (refunded_at is not null)
  )
);

create unique index commerce_return_requests_one_open_idx
  on public.commerce_return_requests(order_id) where state = 'requested';
create index commerce_return_requests_order_idx on public.commerce_return_requests(order_id, created_at desc);

-- ── 3. The independent commerce ledger ────────────────────────────────────────────────────────

create table public.commerce_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  -- ⚠️ THE PREFIX CHECK IS INVARIANT 2. It is what makes "a commerce posting cannot touch a service account"
  -- a property of the schema rather than a convention somebody has to remember.
  account_code text not null unique check (account_code like 'commerce.%'),
  account_kind public.commerce_ledger_account_kind not null,
  owner_kind public.commerce_ledger_owner_kind not null,
  owner_id uuid,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commerce_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type like 'commerce\_%'),
  -- ⚠️ INVARIANT 3, both halves: the type and the key are namespaced, so nothing that reconciles a service
  -- payment can collide with, or be mistaken for, a goods movement.
  idempotency_key text not null unique check (idempotency_key like 'commerce:%'),
  commerce_order_id uuid references public.commerce_orders(id) on delete restrict,
  external_reference text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.commerce_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.commerce_ledger_transactions(id) on delete restrict,
  commerce_account_id uuid not null references public.commerce_ledger_accounts(id) on delete restrict,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Positive is a debit, negative is a credit, and the sum of a transaction's entries is zero per currency.
  amount_minor bigint not null check (amount_minor <> 0),
  -- ⚠️ INVARIANT 1. This column is a commerce order. There is no `obligation_id` here and no
  -- `commerce_order_id` on `ledger_entries`, so a service obligation cannot be paid out of goods money.
  commerce_order_id uuid references public.commerce_orders(id) on delete restrict,
  commerce_return_id uuid references public.commerce_return_requests(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index commerce_ledger_entries_tx_idx on public.commerce_ledger_entries(transaction_id);
create index commerce_ledger_entries_order_idx on public.commerce_ledger_entries(commerce_order_id);
create index commerce_ledger_tx_order_idx on public.commerce_ledger_transactions(commerce_order_id, occurred_at desc);

alter table public.commerce_orders enable row level security;
alter table public.commerce_order_items enable row level security;
alter table public.commerce_shipments enable row level security;
alter table public.commerce_return_requests enable row level security;
alter table public.commerce_ledger_accounts enable row level security;
alter table public.commerce_ledger_transactions enable row level security;
alter table public.commerce_ledger_entries enable row level security;

-- Everything is denied through the Data API. The reads and writes below are the only way in, which is where
-- project membership is re-derived and where the internal ledger rows are shaped for the page.
create policy commerce_orders_deny_direct on public.commerce_orders for all to authenticated using (false) with check (false);
create policy commerce_order_items_deny_direct on public.commerce_order_items for all to authenticated using (false) with check (false);
create policy commerce_shipments_deny_direct on public.commerce_shipments for all to authenticated using (false) with check (false);
create policy commerce_return_requests_deny_direct on public.commerce_return_requests for all to authenticated using (false) with check (false);
create policy commerce_ledger_accounts_deny_direct on public.commerce_ledger_accounts for all to authenticated using (false) with check (false);
create policy commerce_ledger_transactions_deny_direct on public.commerce_ledger_transactions for all to authenticated using (false) with check (false);
create policy commerce_ledger_entries_deny_direct on public.commerce_ledger_entries for all to authenticated using (false) with check (false);

comment on table public.commerce_ledger_entries is
  'Entries on the independent commerce ledger. Never joined to ledger_entries or payment_obligations: goods money is held and returned on its own books.';

-- ── 4. The commerce posting helper ────────────────────────────────────────────────────────────

/**
 * The commerce twin of `post_balanced_ledger_transaction`, and deliberately a second implementation.
 *
 * ⚠️ IT IS NOT A WRAPPER AROUND THE SERVICE HELPER. The whole invariant is that the two ledgers are separate;
 * a shared posting function is the seam through which they would eventually become one, and the first change
 * that needed "just one flag" would put goods and escrow money in the same journal. Twenty duplicated lines is
 * a cheap price for a boundary that cannot be crossed by accident.
 *
 * Takes the same shape of entry array — {commerce_account_id, currency_code, amount_minor, commerce_order_id,
 * commerce_return_id} — refuses an unbalanced set per currency, and returns the existing transaction when the
 * idempotency key has been seen before.
 */
create or replace function app_private.post_balanced_commerce_transaction(
  p_transaction_type text,
  p_idempotency_key text,
  p_commerce_order_id uuid,
  p_external_reference text,
  p_metadata jsonb,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  tx uuid;
  e jsonb;
  v_currency text;
  v_sum bigint;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'at least two ledger entries required' using errcode = '22023';
  end if;
  for v_currency in select distinct upper(x ->> 'currency_code') from jsonb_array_elements(p_entries) x loop
    select coalesce(sum((x ->> 'amount_minor')::bigint), 0) into v_sum
      from jsonb_array_elements(p_entries) x
     where upper(x ->> 'currency_code') = v_currency;
    if v_sum <> 0 then
      raise exception 'unbalanced commerce ledger transaction for currency %', v_currency using errcode = '23514';
    end if;
  end loop;

  select id into tx from public.commerce_ledger_transactions where idempotency_key = p_idempotency_key;
  if tx is not null then
    return tx;
  end if;

  insert into public.commerce_ledger_transactions (transaction_type, idempotency_key, commerce_order_id, external_reference, metadata)
  values (p_transaction_type, p_idempotency_key, p_commerce_order_id, p_external_reference, coalesce(p_metadata, '{}'::jsonb))
  returning id into tx;

  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.commerce_ledger_entries (
      transaction_id, commerce_account_id, currency_code, amount_minor, commerce_order_id, commerce_return_id
    )
    values (
      tx,
      (e ->> 'commerce_account_id')::uuid,
      upper(e ->> 'currency_code'),
      (e ->> 'amount_minor')::bigint,
      nullif(e ->> 'commerce_order_id', '')::uuid,
      nullif(e ->> 'commerce_return_id', '')::uuid
    );
  end loop;

  return tx;
end $$;

/** Ensures a commerce account exists, in the same shape as the service ledger's equivalent. */
create or replace function app_private.ensure_commerce_account(
  p_code text,
  p_kind public.commerce_ledger_account_kind,
  p_owner_kind public.commerce_ledger_owner_kind,
  p_owner_id uuid,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  existing uuid;
begin
  select id into existing from public.commerce_ledger_accounts
   where account_code = p_code and currency_code = upper(p_currency);
  if existing is not null then
    return existing;
  end if;
  insert into public.commerce_ledger_accounts (account_code, account_kind, owner_kind, owner_id, currency_code)
  values (p_code, p_kind, p_owner_kind, p_owner_id, upper(p_currency))
  returning id into existing;
  return existing;
end $$;

/**
 * The separation check, as a query rather than a claim.
 *
 * Returns one row per commerce transaction whose entries do not sum to zero per currency. It should always be
 * empty; the hub reads it and shows a warning when it is not, the same way the administrator money console
 * surfaces an escrow imbalance instead of trusting its own arithmetic.
 */
create or replace function app_private.commerce_ledger_imbalances()
returns table (transaction_id uuid, currency_code text, total_minor bigint)
language sql
stable
security definer
set search_path = public, app_private
as $$
  select t.id, e.currency_code, sum(e.amount_minor)
    from public.commerce_ledger_transactions t
    join public.commerce_ledger_entries e on e.transaction_id = t.id
   group by t.id, e.currency_code
  having sum(e.amount_minor) <> 0;
$$;

revoke all on function app_private.post_balanced_commerce_transaction(text, text, uuid, text, jsonb, jsonb) from public;
revoke all on function app_private.ensure_commerce_account(text, public.commerce_ledger_account_kind, public.commerce_ledger_owner_kind, uuid, text) from public;
revoke all on function app_private.commerce_ledger_imbalances() from public;

-- ── 5. Reads ──────────────────────────────────────────────────────────────────────────────────

/**
 * Everything the project's orders page needs, in one round trip.
 *
 * `role` comes from `app_private.project_role_for`, the same function every other project surface uses, so the
 * orders hub cannot disagree with the project about who is a party to it.
 */
create or replace function public.get_project_orders_command(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  catalog jsonb;
  orders jsonb;
  balances jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if role is null then
    return jsonb_build_object('allowed', false);
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then
    return jsonb_build_object('allowed', false);
  end if;
  select * into r from public.requests where id = a.request_id;

  select coalesce(jsonb_agg(entry order by category, name), '[]'::jsonb)
    into catalog
    from (
      select jsonb_build_object(
               'id', p.id,
               'sku', p.sku,
               'name', p.name,
               'description', p.description,
               'category', p.category,
               'unit', p.unit,
               'unitPriceMinor', p.unit_price_minor,
               'currencyCode', p.currency_code,
               'supplierName', sup.display_name
             ) as entry,
             p.category, p.name
        from public.commerce_products p
        left join public.providers sup on sup.id = p.supplier_provider_id
       where p.is_active
         and (p.market_id is null or p.market_id = r.market_id)
    ) listed;

  select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
    into orders
    from (
      select jsonb_build_object(
               'id', o.id,
               'reference', o.reference,
               'status', o.status,
               'currencyCode', o.currency_code,
               'totalMinor', o.total_minor,
               'deliveryAddress', o.delivery_address,
               'deliveryNote', o.delivery_note,
               'placedByMe', o.placed_by_account_id = me,
               'placedByName', case when o.placed_by_account_id = me then 'You'
                                    when o.placed_by_account_id = r.customer_account_id then 'The customer'
                                    else 'The provider' end,
               'paymentReference', o.payment_reference,
               'paidAt', o.paid_at,
               'deliveredAt', o.delivered_at,
               'cancelledAt', o.cancelled_at,
               'cancelReason', o.cancel_reason,
               'createdAt', o.created_at,
               -- The next thing that has to happen, worked out here so the list and the detail cannot
               -- describe the same order as being in two different places in the process.
               'nextStep', case o.status
                 when 'awaiting_payment' then 'Payment has to be recorded by the platform before this order is placed with the supplier.'
                 when 'paid' then 'Waiting for the supplier to prepare the goods.'
                 when 'preparing' then 'The goods are being prepared.'
                 when 'dispatched' then 'In transit. Delivery is recorded when they arrive.'
                 when 'delivered' then 'Delivered. A return can be requested from here.'
                 when 'cancelled' then 'Cancelled. Nothing was dispatched.'
                 else 'Refunded on the commerce ledger. The reversal is posted against this order.'
               end,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', i.id,
                          'sku', i.sku,
                          'name', i.name,
                          'unit', i.unit,
                          'unitPriceMinor', i.unit_price_minor,
                          'quantity', i.quantity,
                          'lineTotalMinor', i.line_total_minor
                        ) order by i.name)
                   from public.commerce_order_items i where i.order_id = o.id
               ), '[]'::jsonb),
               'shipments', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id,
                          'sequence', s.sequence,
                          'state', s.state,
                          'carrier', s.carrier,
                          'trackingReference', s.tracking_reference,
                          'note', s.note,
                          'dispatchedAt', s.dispatched_at,
                          'deliveredAt', s.delivered_at,
                          'recordedAt', s.updated_at
                        ) order by s.sequence)
                   from public.commerce_shipments s where s.order_id = o.id
               ), '[]'::jsonb),
               'openReturn', (
                 select jsonb_build_object(
                          'id', rr.id,
                          'state', rr.state,
                          'reason', rr.reason,
                          'requestedAt', rr.created_at,
                          'decidedAt', rr.decided_at,
                          'decisionNote', rr.decision_note,
                          'refundedAt', rr.refunded_at,
                          'refundReference', rr.refund_reference
                        )
                   from public.commerce_return_requests rr
                  where rr.order_id = o.id and rr.state <> 'declined'
                  order by rr.created_at desc limit 1
               ),
               -- ⚠️ THE LEDGER, ON THE ORDER'S OWN PAGE, IN ITS OWN WORDS. An order shows what was posted for
               -- it on the commerce ledger, not a number borrowed from the escrow ledger, and the entries are
               -- summarised by account kind rather than by dumping raw rows on a customer page.
               'ledger', jsonb_build_object(
                 'posted', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'type', t.transaction_type,
                            'occurredAt', t.occurred_at,
                            'reference', t.external_reference
                          ) order by t.occurred_at)
                     from public.commerce_ledger_transactions t where t.commerce_order_id = o.id
                 ), '[]'::jsonb),
                 'heldMinor', coalesce((
                   select sum(e.amount_minor)
                     from public.commerce_ledger_entries e
                     join public.commerce_ledger_accounts acc on acc.id = e.commerce_account_id
                    where e.commerce_order_id = o.id and acc.account_code like 'commerce.funds.held.%'
                 ), 0),
                 'balanced', not exists (
                   select 1 from app_private.commerce_ledger_imbalances() imb
                    join public.commerce_ledger_transactions t2 on t2.id = imb.transaction_id
                   where t2.commerce_order_id = o.id
                 )
               )
             ) as entry,
             o.created_at
        from public.commerce_orders o
       where o.assignment_id = p_assignment_id
    ) listed;

  -- What the platform still holds for goods on this project, by currency. Not a payout figure and not
  -- comparable with one: this is commerce money, on commerce books.
  select coalesce(jsonb_agg(jsonb_build_object('currencyCode', e.currency_code, 'heldMinor', e.total)), '[]'::jsonb)
    into balances
    from (
      select e.currency_code, sum(e.amount_minor) as total
        from public.commerce_ledger_entries e
        join public.commerce_orders o on o.id = e.commerce_order_id
        join public.commerce_ledger_accounts acc on acc.id = e.commerce_account_id
       where o.assignment_id = p_assignment_id
         and acc.account_code like 'commerce.funds.held.%'
       group by e.currency_code
    ) e;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'canPlace', a.status = 'active',
    'projectLabel', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'This project'),
    'catalog', catalog,
    'orders', orders,
    'goodsHeld', balances,
    'paymentNote', 'Card payment for goods is not wired in this deployment. An order is priced from the catalogue and the platform records the payment when it is settled; the order shows which state it is in and what happens next.'
  );
end $$;

-- ── 6. Writes ─────────────────────────────────────────────────────────────────────────────────

/**
 * Place an order.
 *
 * ⚠️ THE PRICES ARE READ FROM THE CATALOGUE ON THE SERVER, and the payload from the browser carries product
 * ids and quantities and nothing else. A client-supplied price is not merely unchecked here — it is not read,
 * so there is no field for a forged price to arrive in. The same rule as the quote builder: the only price the
 * platform can hold anybody to is one it looked up itself.
 */
create or replace function public.place_commerce_order_command(
  p_assignment_id uuid,
  p_items jsonb,
  p_delivery_address text,
  p_delivery_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  address text := btrim(coalesce(p_delivery_address, ''));
  note text := nullif(btrim(coalesce(p_delivery_note, '')), '');
  currency text;
  order_id uuid;
  reference_code text;
  total bigint := 0;
  line jsonb;
  product public.commerce_products%rowtype;
  quantity integer;
  lines integer := 0;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if role is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'an order can carry at most 40 lines' using errcode = '22023';
  end if;
  if char_length(address) < 10 or char_length(address) > 400 then
    raise exception 'a delivery address of 10 to 400 characters is required' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'a delivery note of at most 500 characters' using errcode = '22023';
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if a.status <> 'active' then
    raise exception 'goods can only be ordered on a project that is still running' using errcode = '22023';
  end if;
  select * into r from public.requests where id = a.request_id;

  -- Pass one: resolve every line and total it, so a bad line refuses the whole order rather than half-writing it.
  for line in select * from jsonb_array_elements(p_items) loop
    quantity := coalesce((line ->> 'quantity')::integer, 0);
    if quantity < 1 or quantity > 10000 then
      raise exception 'every line needs a quantity between 1 and 10000' using errcode = '22023';
    end if;

    select * into product from public.commerce_products p
     where p.id = (line ->> 'product_id')::uuid and p.is_active;
    if not found then
      raise exception 'one of those products is not available' using errcode = 'P0002';
    end if;
    if product.market_id is not null and product.market_id <> r.market_id then
      raise exception 'one of those products is not supplied in this market' using errcode = '22023';
    end if;

    if currency is null then
      currency := product.currency_code;
    elsif currency <> product.currency_code then
      -- One order, one currency: a mixed-currency order would need an exchange rate the platform does not have
      -- and cannot quote, and a total that adds two currencies is not a total.
      raise exception 'an order cannot mix currencies' using errcode = '22023';
    end if;

    -- Pass one WRITES NOTHING. It resolves and totals every line first, so a bad line refuses the whole
    -- order instead of leaving half of one behind.
    total := total + (product.unit_price_minor * quantity);
    lines := lines + 1;
  end loop;

  reference_code := 'ORD-' || upper(encode(gen_random_bytes(5), 'hex'));

  insert into public.commerce_orders (
    reference, assignment_id, request_id, placed_by_account_id, customer_account_id, provider_id,
    currency_code, total_minor, delivery_address, delivery_note
  )
  values (
    reference_code, a.id, r.id, me, r.customer_account_id, a.provider_id,
    currency, total, address, note
  )
  returning id into order_id;

  -- Pass two: write the lines now that the order exists.
  for line in select * from jsonb_array_elements(p_items) loop
    quantity := (line ->> 'quantity')::integer;
    select * into product from public.commerce_products p where p.id = (line ->> 'product_id')::uuid;
    insert into public.commerce_order_items (
      order_id, product_id, sku, name, unit, unit_price_minor, quantity, line_total_minor
    )
    values (
      order_id, product.id, product.sku, product.name, product.unit,
      product.unit_price_minor, quantity, product.unit_price_minor * quantity
    );
  end loop;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_ORDER_PLACED', 'commerce_order', order_id, 'participant_private',
          jsonb_build_object('assignment_id', a.id, 'lines', lines, 'total_minor', total, 'currency', currency));

  return jsonb_build_object(
    'id', order_id,
    'reference', reference_code,
    'status', 'awaiting_payment',
    'totalMinor', total,
    'currencyCode', currency
  );
end $$;

create or replace function public.cancel_commerce_order_command(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  o public.commerce_orders%rowtype;
  role text;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'a reason of at most 500 characters' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  role := app_private.project_role_for(o.assignment_id);
  if role is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.placed_by_account_id <> me and role <> 'admin' then
    raise exception 'only the account that placed this order can cancel it' using errcode = '42501';
  end if;

  if o.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'alreadyCancelled', true);
  end if;
  -- ⚠️ ONCE MONEY IS ON THE COMMERCE LEDGER, CANCELLING IS NOT THE WAY BACK. It would leave funds held against
  -- nothing; the return and refund path is the one that reverses the posting, and it is the path an operator
  -- has to approve.
  if o.status <> 'awaiting_payment' then
    raise exception 'this order has been paid for; use a return request instead' using errcode = '22023';
  end if;

  update public.commerce_orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = reason, updated_at = now()
   where id = o.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_ORDER_CANCELLED', 'commerce_order', o.id, 'participant_private',
          jsonb_build_object('by_role', role));

  return jsonb_build_object('status', 'cancelled', 'alreadyCancelled', false);
end $$;

/**
 * Record a shipment and its state.
 *
 * Either party to the project may record this, and each call appends a new row rather than editing the last
 * one: a delivery record that can be rewritten is not a record. The order's status follows the furthest
 * shipment state that has been recorded.
 */
create or replace function public.record_commerce_shipment_command(
  p_order_id uuid,
  p_state text,
  p_carrier text default null,
  p_tracking_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  o public.commerce_orders%rowtype;
  role text;
  state public.commerce_shipment_state;
  next_sequence integer;
  carrier text := nullif(btrim(coalesce(p_carrier, '')), '');
  tracking text := nullif(btrim(coalesce(p_tracking_reference, '')), '');
  note text := nullif(btrim(coalesce(p_note, '')), '');
  shipment_id uuid;
  new_status public.commerce_order_status;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  state := p_state::public.commerce_shipment_state;
  if carrier is not null and char_length(carrier) > 120 then
    raise exception 'a carrier name of at most 120 characters' using errcode = '22023';
  end if;
  if tracking is not null and char_length(tracking) > 120 then
    raise exception 'a tracking reference of at most 120 characters' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'a note of at most 500 characters' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  role := app_private.project_role_for(o.assignment_id);
  if role is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- ⚠️ NOTHING MOVES BEFORE THE MONEY DOES. Recording a dispatch against an order nobody has paid for would
  -- put goods on a site with no funds behind them, which is the one thing the commerce ledger exists to
  -- prevent on the goods side.
  if o.status in ('awaiting_payment', 'cancelled') then
    raise exception 'this order cannot be fulfilled in its current state' using errcode = '22023';
  end if;

  select coalesce(max(s.sequence), 0) + 1 into next_sequence
    from public.commerce_shipments s where s.order_id = o.id;

  insert into public.commerce_shipments (
    order_id, sequence, state, carrier, tracking_reference, note,
    dispatched_at, delivered_at, recorded_by_account_id
  )
  values (
    o.id, next_sequence, state, carrier, tracking, note,
    case when state in ('dispatched', 'in_transit', 'delivered') then now() else null end,
    case when state = 'delivered' then now() else null end,
    me
  )
  returning id into shipment_id;

  new_status := case state
    when 'preparing' then 'preparing'
    when 'dispatched' then 'dispatched'
    when 'in_transit' then 'dispatched'
    when 'delivered' then 'delivered'
    else o.status
  end;

  update public.commerce_orders
     set status = case when o.status = 'refunded' then o.status else new_status end,
         delivered_at = case when state = 'delivered' then coalesce(o.delivered_at, now()) else o.delivered_at end,
         updated_at = now()
   where id = o.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_SHIPMENT_RECORDED', 'commerce_order', o.id, 'participant_private',
          jsonb_build_object('shipment_id', shipment_id, 'state', state, 'by_role', role));

  return jsonb_build_object('shipmentId', shipment_id, 'state', state, 'orderStatus', new_status);
end $$;

create or replace function public.request_commerce_return_command(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  o public.commerce_orders%rowtype;
  role text;
  reason text := btrim(coalesce(p_reason, ''));
  request_id uuid;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(reason) < 10 or char_length(reason) > 2000 then
    raise exception 'say what is wrong with the goods (10 to 2000 characters)' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  role := app_private.project_role_for(o.assignment_id);
  if role is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.placed_by_account_id <> me and role <> 'admin' then
    raise exception 'only the account that placed this order can ask for a return' using errcode = '42501';
  end if;

  -- A return is about goods that arrived. Before delivery there is nothing to send back, and after a refund
  -- there is nothing left to return.
  if o.delivered_at is null or o.status <> 'delivered' then
    raise exception 'a return can be requested once the goods have been delivered' using errcode = '22023';
  end if;
  if exists (select 1 from public.commerce_return_requests rr where rr.order_id = o.id and rr.state in ('requested', 'approved', 'refunded')) then
    raise exception 'this order already has a return in progress' using errcode = '22023';
  end if;

  insert into public.commerce_return_requests (order_id, reason, requested_by_account_id)
  values (o.id, reason, me)
  returning id into request_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_RETURN_REQUESTED', 'commerce_order', o.id, 'participant_private',
          jsonb_build_object('return_id', request_id, 'by_role', role));

  return jsonb_build_object('id', request_id, 'state', 'requested');
end $$;

/**
 * Decide a return.
 *
 * Gated on `platform.money.refund` and aal2 — the same rule the administrator money console applies to every
 * other refund on this platform. Approving does NOT move money: it says the goods may come back. The refund
 * itself is the separate step below, so there is never a posting for a refund of goods nobody has returned.
 */
create or replace function public.decide_commerce_return_command(
  p_return_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  rr public.commerce_return_requests%rowtype;
  o public.commerce_orders%rowtype;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app_private.current_account_has_platform_capability('platform.money.refund') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'a decision is required' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'a note of at most 500 characters' using errcode = '22023';
  end if;

  select * into rr from public.commerce_return_requests where id = p_return_id for update;
  if not found then
    raise exception 'return request not found' using errcode = 'P0002';
  end if;
  if rr.state <> 'requested' then
    raise exception 'that request has already been decided' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = rr.order_id;

  update public.commerce_return_requests
     set state = case when p_approve then 'approved' else 'declined' end,
         decided_by_account_id = app_private.current_account_id(),
         decided_at = now(),
         decision_note = note
   where id = rr.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user',
          case when p_approve then 'COMMERCE_RETURN_APPROVED' else 'COMMERCE_RETURN_DECLINED' end,
          'commerce_order', o.id, 'money_refund', 'system_internal',
          jsonb_build_object('return_id', rr.id));

  return jsonb_build_object('state', case when p_approve then 'approved' else 'declined' end);
end $$;

/**
 * Record the payment for goods, and post it to the commerce ledger.
 *
 * ⚠️ THE POSTING IS THE LEDGER'S, NOT THE ORDER'S. `commerce_order_paid` moves the money into
 * `commerce.funds.held` and against `commerce.supplier.payable.*`, on commerce accounts, in a commerce
 * transaction whose key begins `commerce:`. Nothing here can touch an escrow account: the account codes are
 * looked up on the commerce table, whose own CHECK requires the `commerce.` prefix.
 *
 * Gated on `platform.money.reconcile` and aal2, the same rule as every other reconciliation on the platform.
 */
create or replace function public.record_commerce_order_payment_command(p_order_id uuid, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  o public.commerce_orders%rowtype;
  reference text := btrim(coalesce(p_reference, ''));
  held_id uuid;
  payable_id uuid;
  payable_code text;
  tx uuid;
begin
  if not app_private.current_account_has_platform_capability('platform.money.reconcile') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if char_length(reference) < 3 or char_length(reference) > 120 then
    raise exception 'a payment reference is required' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Idempotent by the order's own key: recording the same payment twice returns the existing transaction
  -- rather than posting the money twice, which is the failure mode that matters most on a money path.
  if o.status <> 'awaiting_payment' then
    if o.status = 'cancelled' then
      raise exception 'this order was cancelled' using errcode = '22023';
    end if;
    return jsonb_build_object('status', o.status, 'alreadyRecorded', true, 'paymentReference', o.payment_reference);
  end if;

  held_id := app_private.ensure_commerce_account(
    'commerce.funds.held.' || o.currency_code, 'asset', 'platform', null, o.currency_code);
  payable_code := 'commerce.supplier.payable.' || coalesce(o.provider_id::text, 'platform') || '.' || o.currency_code;
  payable_id := app_private.ensure_commerce_account(
    payable_code, 'liability', 'provider', o.provider_id, o.currency_code);

  tx := app_private.post_balanced_commerce_transaction(
    'commerce_order_paid',
    'commerce:order-paid:' || o.id::text,
    o.id,
    reference,
    jsonb_build_object('order_reference', o.reference, 'recorded_by', app_private.current_account_id()),
    jsonb_build_array(
      jsonb_build_object('commerce_account_id', held_id, 'currency_code', o.currency_code,
                         'amount_minor', o.total_minor, 'commerce_order_id', o.id),
      jsonb_build_object('commerce_account_id', payable_id, 'currency_code', o.currency_code,
                         'amount_minor', -o.total_minor, 'commerce_order_id', o.id)
    )
  );

  update public.commerce_orders
     set status = 'paid',
         payment_reference = reference,
         payment_recorded_by_account_id = app_private.current_account_id(),
         paid_at = now(),
         updated_at = now()
   where id = o.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_ORDER_PAYMENT_RECORDED', 'commerce_order', o.id, 'money_reconcile',
          'system_internal', jsonb_build_object('ledger_transaction_id', tx, 'amount_minor', o.total_minor, 'currency', o.currency_code));

  return jsonb_build_object('status', 'paid', 'alreadyRecorded', false, 'ledgerTransactionId', tx);
end $$;

/**
 * Record the refund, and reverse the posting on the commerce ledger.
 *
 * The reversal debits the supplier payable and credits the funds held — the exact mirror of the payment — so
 * the money leaves the commerce ledger through the same accounts it arrived on, and the order's own page can
 * show the whole story of its goods money without ever reading the escrow books.
 */
create or replace function public.record_commerce_return_refund_command(p_return_id uuid, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  rr public.commerce_return_requests%rowtype;
  o public.commerce_orders%rowtype;
  reference text := btrim(coalesce(p_reference, ''));
  held_id uuid;
  payable_id uuid;
  tx uuid;
begin
  if not app_private.current_account_has_platform_capability('platform.money.refund') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if char_length(reference) < 3 or char_length(reference) > 120 then
    raise exception 'a refund reference is required' using errcode = '22023';
  end if;

  select * into rr from public.commerce_return_requests where id = p_return_id for update;
  if not found then
    raise exception 'return request not found' using errcode = 'P0002';
  end if;
  if rr.state = 'refunded' then
    return jsonb_build_object('state', 'refunded', 'alreadyRefunded', true, 'paymentReference', rr.refund_reference);
  end if;
  if rr.state <> 'approved' then
    raise exception 'the return has to be approved before the refund is recorded' using errcode = '22023';
  end if;

  select * into o from public.commerce_orders where id = rr.order_id for update;
  if o.paid_at is null then
    raise exception 'nothing was ever paid for this order' using errcode = '22023';
  end if;

  held_id := app_private.ensure_commerce_account(
    'commerce.funds.held.' || o.currency_code, 'asset', 'platform', null, o.currency_code);
  payable_id := app_private.ensure_commerce_account(
    'commerce.supplier.payable.' || coalesce(o.provider_id::text, 'platform') || '.' || o.currency_code,
    'liability', 'provider', o.provider_id, o.currency_code);

  tx := app_private.post_balanced_commerce_transaction(
    'commerce_order_refunded',
    'commerce:order-refunded:' || rr.id::text,
    o.id,
    reference,
    jsonb_build_object('order_reference', o.reference, 'return_id', rr.id, 'recorded_by', app_private.current_account_id()),
    jsonb_build_array(
      jsonb_build_object('commerce_account_id', payable_id, 'currency_code', o.currency_code,
                         'amount_minor', o.total_minor, 'commerce_order_id', o.id, 'commerce_return_id', rr.id),
      jsonb_build_object('commerce_account_id', held_id, 'currency_code', o.currency_code,
                         'amount_minor', -o.total_minor, 'commerce_order_id', o.id, 'commerce_return_id', rr.id)
    )
  );

  update public.commerce_return_requests
     set state = 'refunded', refund_transaction_id = tx, refund_reference = reference, refunded_at = now()
   where id = rr.id;

  update public.commerce_orders
     set status = 'refunded', updated_at = now()
   where id = o.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'COMMERCE_ORDER_REFUNDED', 'commerce_order', o.id, 'money_refund',
          'system_internal', jsonb_build_object('ledger_transaction_id', tx, 'return_id', rr.id, 'amount_minor', o.total_minor));

  return jsonb_build_object('state', 'refunded', 'alreadyRefunded', false, 'ledgerTransactionId', tx);
end $$;

revoke all on function public.get_project_orders_command(uuid) from public, anon;
revoke all on function public.place_commerce_order_command(uuid, jsonb, text, text) from public, anon;
revoke all on function public.cancel_commerce_order_command(uuid, text) from public, anon;
revoke all on function public.record_commerce_shipment_command(uuid, text, text, text, text) from public, anon;
revoke all on function public.request_commerce_return_command(uuid, text) from public, anon;
revoke all on function public.decide_commerce_return_command(uuid, boolean, text) from public, anon;
revoke all on function public.record_commerce_order_payment_command(uuid, text) from public, anon;
revoke all on function public.record_commerce_return_refund_command(uuid, text) from public, anon;

grant execute on function public.get_project_orders_command(uuid) to authenticated;
grant execute on function public.place_commerce_order_command(uuid, jsonb, text, text) to authenticated;
grant execute on function public.cancel_commerce_order_command(uuid, text) to authenticated;
grant execute on function public.record_commerce_shipment_command(uuid, text, text, text, text) to authenticated;
grant execute on function public.request_commerce_return_command(uuid, text) to authenticated;
grant execute on function public.decide_commerce_return_command(uuid, boolean, text) to authenticated;
grant execute on function public.record_commerce_order_payment_command(uuid, text) to authenticated;
grant execute on function public.record_commerce_return_refund_command(uuid, text) to authenticated;
