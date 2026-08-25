create type public.payment_obligation_status as enum ('pending','funding','funded','partially_refunded','refunded','cancelled','disputed');
create type public.payment_attempt_status as enum ('created','pending_provider','succeeded','failed','cancelled');
create type public.provider_event_status as enum ('received','verified','reconciled','rejected');
create type public.ledger_account_kind as enum ('asset','liability','revenue','expense','equity');
create type public.ledger_owner_kind as enum ('platform','customer','provider','system');
create type public.payout_status as enum ('eligible','queued','processing','paid','failed','blocked','cancelled');

create table public.payment_obligations (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), assignment_id uuid not null references public.assignments(id), quote_id uuid not null references public.quotes(id), customer_account_id uuid not null references public.accounts(id), provider_id uuid not null references public.providers(id), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), amount_minor bigint not null check (amount_minor > 0), status public.payment_obligation_status not null default 'pending', idempotency_key text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (assignment_id), unique (quote_id)
);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(), obligation_id uuid not null references public.payment_obligations(id), provider_adapter text not null, provider_reference text, amount_minor bigint not null check (amount_minor > 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), status public.payment_attempt_status not null default 'created', idempotency_key text not null unique, checkout_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (provider_adapter, provider_reference)
);
create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(), provider_adapter text not null, provider_event_id text not null, event_type text not null, status public.provider_event_status not null default 'received', signature_verified boolean not null default false, payload_sha256 text not null, payment_attempt_id uuid references public.payment_attempts(id), received_at timestamptz not null default now(), verified_at timestamptz, reconciled_at timestamptz, rejection_reason text, unique (provider_adapter, provider_event_id)
);
create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(), account_code text not null unique, account_kind public.ledger_account_kind not null, owner_kind public.ledger_owner_kind not null, owner_id uuid, currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(), transaction_type text not null, external_reference text, idempotency_key text not null unique, occurred_at timestamptz not null default now(), created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(), transaction_id uuid not null references public.ledger_transactions(id), ledger_account_id uuid not null references public.ledger_accounts(id), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), amount_minor bigint not null check (amount_minor <> 0), obligation_id uuid references public.payment_obligations(id), created_at timestamptz not null default now()
);
create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(), provider_event_id uuid not null references public.payment_provider_events(id), payment_attempt_id uuid not null references public.payment_attempts(id), obligation_id uuid not null references public.payment_obligations(id), ledger_transaction_id uuid references public.ledger_transactions(id), result text not null check (result in ('matched','duplicate','mismatch','ignored')), details jsonb not null default '{}'::jsonb, reconciled_at timestamptz not null default now(), unique (provider_event_id)
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(), obligation_id uuid not null references public.payment_obligations(id), provider_id uuid not null references public.providers(id), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), amount_minor bigint not null check (amount_minor > 0), status public.payout_status not null default 'eligible', provider_adapter text, provider_reference text, idempotency_key text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (obligation_id)
);
create index payment_obligations_request_idx on public.payment_obligations(request_id);
create index payment_obligations_provider_idx on public.payment_obligations(provider_id,status);
create index payment_attempts_obligation_idx on public.payment_attempts(obligation_id,status);
create index provider_events_attempt_idx on public.payment_provider_events(payment_attempt_id,status);
create index ledger_entries_transaction_idx on public.ledger_entries(transaction_id);
create index ledger_entries_obligation_idx on public.ledger_entries(obligation_id);
create index payouts_provider_idx on public.payouts(provider_id,status);
alter table public.payment_obligations enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payment_reconciliations enable row level security;
alter table public.payouts enable row level security;
create policy payment_obligations_participant_select on public.payment_obligations for select to authenticated using (customer_account_id=app_private.current_account_id() or exists(select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
create policy payment_attempts_customer_select on public.payment_attempts for select to authenticated using (exists(select 1 from public.payment_obligations o where o.id=obligation_id and o.customer_account_id=app_private.current_account_id()));
create policy payouts_provider_select on public.payouts for select to authenticated using (exists(select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
revoke all on public.payment_provider_events, public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.payment_reconciliations from anon, authenticated, service_role;
revoke insert, update, delete on public.payment_obligations, public.payment_attempts, public.payouts from anon, authenticated;
