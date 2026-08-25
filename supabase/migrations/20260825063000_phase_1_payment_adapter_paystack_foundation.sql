create table if not exists public.payment_adapters (
  id uuid primary key default gen_random_uuid(), adapter_key text not null unique, display_name text not null,
  adapter_type text not null check (adapter_type in ('payment','payout','both')), is_enabled boolean not null default false,
  is_default boolean not null default false, supported_markets text[] not null default '{}', supported_currencies text[] not null default '{}',
  config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.payment_adapters(adapter_key,display_name,adapter_type,is_enabled,is_default,supported_markets,supported_currencies,config)
values('paystack','Paystack','both',true,true,array['NG'],array['NGN'],jsonb_build_object('checkout','transaction_initialize','webhook_signature','hmac_sha512','payout','transfer'))
on conflict(adapter_key) do update set display_name=excluded.display_name,adapter_type=excluded.adapter_type,supported_markets=excluded.supported_markets,supported_currencies=excluded.supported_currencies,config=excluded.config,updated_at=now();

create table if not exists public.provider_payout_destinations (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete cascade,
 adapter_key text not null references public.payment_adapters(adapter_key), currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 destination_type text not null, provider_recipient_code text, bank_code text, account_last4 text, account_name text,
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','failed','disabled')),
 is_default boolean not null default false, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider_id,adapter_key,currency_code,destination_type,provider_recipient_code)
);
create table if not exists public.payment_refunds (
 id uuid primary key default gen_random_uuid(), obligation_id uuid not null references public.payment_obligations(id), payment_attempt_id uuid not null references public.payment_attempts(id),
 adapter_key text not null references public.payment_adapters(adapter_key), amount_minor bigint not null check(amount_minor>0), currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 status text not null default 'requested' check(status in ('requested','submitted','processing','succeeded','failed','needs_attention','cancelled')), provider_reference text,
 reason text,idempotency_key text not null unique,requested_by_account_id uuid references public.accounts(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.payment_disputes (
 id uuid primary key default gen_random_uuid(), obligation_id uuid references public.payment_obligations(id),payment_attempt_id uuid references public.payment_attempts(id),
 adapter_key text not null references public.payment_adapters(adapter_key),provider_dispute_id text not null,provider_transaction_reference text,status text not null,
 amount_minor bigint,currency_code text,reason text,due_at timestamptz,resolution text,raw_summary jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(adapter_key,provider_dispute_id)
);
alter table public.payment_adapters enable row level security; alter table public.provider_payout_destinations enable row level security; alter table public.payment_refunds enable row level security; alter table public.payment_disputes enable row level security;
create policy payment_adapters_authenticated_read on public.payment_adapters for select to authenticated using(is_enabled);
create policy payout_destinations_owner_read on public.provider_payout_destinations for select to authenticated using(exists(select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
create policy refunds_customer_read on public.payment_refunds for select to authenticated using(exists(select 1 from public.payment_obligations o where o.id=obligation_id and o.customer_account_id=app_private.current_account_id()));
create policy disputes_participant_read on public.payment_disputes for select to authenticated using(exists(select 1 from public.payment_obligations o join public.providers p on p.id=o.provider_id where o.id=obligation_id and (o.customer_account_id=app_private.current_account_id() or p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
revoke all on public.payment_adapters,public.provider_payout_destinations,public.payment_refunds,public.payment_disputes from anon;
grant select on public.payment_adapters,public.provider_payout_destinations,public.payment_refunds,public.payment_disputes to authenticated;
create index if not exists idx_payout_destinations_provider on public.provider_payout_destinations(provider_id,adapter_key,currency_code);
create index if not exists idx_refunds_obligation on public.payment_refunds(obligation_id,status);
create index if not exists idx_disputes_obligation on public.payment_disputes(obligation_id,status);
