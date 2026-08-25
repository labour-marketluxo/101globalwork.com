alter table public.payouts add column if not exists block_reason text;
alter table public.payouts add column if not exists last_validated_at timestamptz;

create table if not exists public.payout_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete restrict,
  provider_reference text not null,
  provider_event_type text not null,
  result text not null check(result in ('matched','failed','reversed','duplicate')),
  ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  reconciled_at timestamptz not null default now(),
  unique(payout_id,provider_reference,provider_event_type)
);
alter table public.payout_reconciliations enable row level security;
revoke all on public.payout_reconciliations from anon,authenticated;
grant select on public.payout_reconciliations to authenticated;
create policy payout_reconciliations_finance_read on public.payout_reconciliations for select to authenticated using(app_private.current_account_has_platform_capability('platform.money.read'));
