-- Earnings, payout requests, and the rest of availability management.
--
-- ── WHAT THIS ADDS, AND WHY EACH PIECE IS THE SMALLEST HONEST ONE ──────────────────────────────
--
-- 1. A LEDGER-TRUTH EARNINGS READ. The ledger tables are revoked from `authenticated` entirely, so a provider
--    cannot read their own financial record at all today. `get_my_earnings_command` is a definer function that
--    reads the provider's own payable account (`provider_payable:<provider_id>:<currency>`, owner_kind
--    'provider') and the operational rows beside it, and CROSS-CHECKS the two. The pages claim "reconciled ledger
--    records are financial truth" — this function is what makes that claim checkable rather than decorative.
--
-- 2. A PROVIDER-INITIATED PAYOUT REQUEST. `queue_payout_execution_command` requires the platform capability
--    `platform.money.payout`, so a provider could see an eligible payout and do nothing with it. The new command
--    lets a provider queue THEIR OWN eligible payout after the same block checks — verified destination, eligible
--    status — and it stops there: the actual transfer still needs the service-role path, because moving money is
--    not something a browser session does. The audit event says who asked.
--
-- 3. BLACKOUT DATES. Nothing in this schema could express "I am away from the 3rd to the 9th". The matching
--    engine does NOT read this table and is not being changed to: a blackout is the provider's own rule, applied
--    where scheduling happens (the schedule action refuses a date inside one unless the provider overrides it on
--    the form), and stated as such on the page rather than implied to be a platform guarantee.
--
-- 4. AVAILABILITY SETTINGS that are not the weekly hours: a travel note, and a vacation pause with an end date.
--    Vacation mode also flips `accepts_new_work` off through the existing command, because that is the switch
--    matching actually reads — the pause date is the note-to-self about when to come back.

-- ── 1. Blackout dates ─────────────────────────────────────────────────────────────────────────

create table public.provider_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 200),
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  -- A window, not a date: "away for a week" is one intention and would otherwise be seven rows that can
  -- disagree with each other.
  constraint provider_blackout_window_chk check (ends_on >= starts_on)
);

create index provider_blackout_provider_idx on public.provider_blackout_dates(provider_id, starts_on);

alter table public.provider_blackout_dates enable row level security;

create policy provider_blackout_dates_owner_read on public.provider_blackout_dates
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.provider_blackout_dates from anon;
revoke insert, update, delete on public.provider_blackout_dates from authenticated;
grant select on public.provider_blackout_dates to authenticated;

comment on table public.provider_blackout_dates is
  'Dates the provider is away. Their own rule: matching ignores it, and the schedule form refuses a date inside one unless overridden.';

-- ── 2. Availability settings ──────────────────────────────────────────────────────────────────

create table public.provider_availability_settings (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  travel_notes text check (travel_notes is null or char_length(btrim(travel_notes)) between 1 and 500),
  paused_until date,
  pause_reason text check (pause_reason is null or char_length(btrim(pause_reason)) between 1 and 200),
  updated_at timestamptz not null default now()
);

alter table public.provider_availability_settings enable row level security;

create policy provider_availability_settings_owner_read on public.provider_availability_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.provider_availability_settings from anon;
revoke insert, update, delete on public.provider_availability_settings from authenticated;
grant select on public.provider_availability_settings to authenticated;

comment on table public.provider_availability_settings is
  'The availability facts that are not the weekly hours: a travel note for customers and a vacation pause with an end date.';

-- ── 3. Commands ───────────────────────────────────────────────────────────────────────────────

create or replace function public.add_my_blackout_command(
  p_provider_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  blackout_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null then
    raise exception 'a start and an end date are required' using errcode = '22023';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'the end date cannot be before the start date' using errcode = '22023';
  end if;
  if p_ends_on - p_starts_on > 365 then
    raise exception 'a blackout can be at most a year long' using errcode = '22023';
  end if;

  insert into public.provider_blackout_dates(provider_id, starts_on, ends_on, reason, created_by_account_id)
  values (p_provider_id, p_starts_on, p_ends_on, nullif(btrim(coalesce(p_reason, '')), ''), acct)
  returning id into blackout_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_BLACKOUT_ADDED', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('blackout_id', blackout_id, 'starts_on', p_starts_on, 'ends_on', p_ends_on));

  return blackout_id;
end $$;

revoke all on function public.add_my_blackout_command(uuid, date, date, text) from public, anon;
grant execute on function public.add_my_blackout_command(uuid, date, date, text) to authenticated;

create or replace function public.remove_my_blackout_command(p_blackout_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  row public.provider_blackout_dates%rowtype;
  prov public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into row from public.provider_blackout_dates where id = p_blackout_id;
  if not found then return; end if;
  select * into prov from public.providers where id = row.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.provider_blackout_dates where id = p_blackout_id;
end $$;

revoke all on function public.remove_my_blackout_command(uuid) from public, anon;
grant execute on function public.remove_my_blackout_command(uuid) to authenticated;

/**
 * The travel note and the vacation pause.
 *
 * ⚠️ THIS DOES NOT TOUCH `accepts_new_work`. Pausing for a holiday means going offline AND noting until when; the
 * action that does both calls this and the existing availability command, because they are two different facts —
 * "not taking work" is what matching reads, and "back on the 12th" is what the provider needs to remember.
 */
create or replace function public.update_my_availability_settings_command(
  p_provider_id uuid,
  p_travel_notes text,
  p_paused_until date,
  p_pause_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  notes text := nullif(btrim(coalesce(p_travel_notes, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if notes is not null and char_length(notes) > 500 then
    raise exception 'the travel note is too long' using errcode = '22023';
  end if;
  if p_paused_until is not null and p_paused_until > current_date + 365 then
    raise exception 'a pause can be at most a year long' using errcode = '22023';
  end if;

  insert into public.provider_availability_settings(provider_id, travel_notes, paused_until, pause_reason, updated_at)
  values (p_provider_id, notes, p_paused_until, nullif(btrim(coalesce(p_pause_reason, '')), ''), now())
  on conflict (provider_id) do update
    set travel_notes = excluded.travel_notes,
        paused_until = excluded.paused_until,
        pause_reason = excluded.pause_reason,
        updated_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_AVAILABILITY_SETTINGS_UPDATED', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('paused_until', p_paused_until, 'has_travel_note', notes is not null));
end $$;

revoke all on function public.update_my_availability_settings_command(uuid, text, date, text) from public, anon;
grant execute on function public.update_my_availability_settings_command(uuid, text, date, text) to authenticated;

/**
 * Ask the platform to pay an eligible payout.
 *
 * ⚠️ IT QUEUES, AND STOPPING THERE IS THE POINT. `lock_payout_for_submission_command` requires the service role,
 * so a provider cannot move money from a browser session even by asking — what they can do is put their own
 * eligible payout in the queue the platform's execution path already reads. Every block check the admin path
 * applies runs here first, so a provider cannot queue a payout the platform would refuse: no verified default
 * destination, a failed or blocked status, or a refund that has not been reconciled.
 */
create or replace function public.request_my_payout_command(p_payout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  p public.payouts%rowtype;
  prov public.providers%rowtype;
  reason text;
  ref text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into p from public.payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = p.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Already asked for: the same request arriving twice is the same intention, so it is not an error.
  if p.status in ('queued','processing','paid') then return p.id; end if;
  if p.status <> 'eligible' then
    raise exception 'this payout is not eligible to request' using errcode = '22023';
  end if;

  reason := app_private.payout_execution_block_reason(p.id);
  if reason is not null then
    raise exception 'payout is not ready: %', reason using errcode = '22023';
  end if;

  ref := coalesce(p.provider_reference, 'gw-payout-' || replace(p.id::text, '-', ''));
  update public.payouts
     set status = 'queued',
         provider_adapter = coalesce(provider_adapter, 'paystack'),
         provider_reference = ref,
         block_reason = null,
         last_validated_at = now(),
         updated_at = now()
   where id = p.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'PAYOUT_REQUESTED_BY_PROVIDER', 'payout', p.id, 'provider_payout_request', 'system_internal',
          jsonb_build_object('provider_id', p.provider_id, 'provider_reference', ref));

  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('payout', p.id, 'PAYOUT_REQUESTED', jsonb_build_object('provider_id', p.provider_id, 'amount_minor', p.amount_minor, 'currency_code', p.currency_code),
          'payout-requested:' || p.id::text)
  on conflict (idempotency_key) do nothing;

  return p.id;
end $$;

revoke all on function public.request_my_payout_command(uuid) from public, anon;
grant execute on function public.request_my_payout_command(uuid) to authenticated;

-- ── 4. The earnings read, from the ledger ─────────────────────────────────────────────────────

/**
 * What this provider has earned, owed, been paid, and had deducted — read from the ledger.
 *
 * ⚠️ THE LEDGER IS THE CONTRACT HERE, AND THE PAGE SAYS SO BECAUSE THIS FUNCTION CHECKS IT. `provider_payable`
 * is credited (negative) when a customer's payment is reconciled and debited (positive) when a payout is sent,
 * so the account's balance is what the platform still owes. The operational tables say the same thing from the
 * other side: funded work not yet completed is held, eligible and queued payouts are on their way, blocked ones
 * are stuck. Those two must agree, and `reconciled` reports whether they do per currency — the mechanism the
 * admin money page uses, applied to a provider's own books.
 *
 * ⚠️ `platform_fee_minor` IS COMPUTED, NOT ASSUMED, AND IT IS ZERO TODAY. No fee schedule is in force
 * (`FEE_POLICY.published` is false in the app) and no fee transaction has ever been posted for this provider, so
 * the sum below is 0. It is a SUM over ledger transaction types rather than a hard-coded 0, so the day a fee is
 * posted it appears here — and the page is written to show the number the row says either way.
 *
 * ⚠️ NOTHING CUSTOMER-IDENTIFYING IS RETURNED. The itemised rows carry the request, the amount, the dates and
 * the payout state. They do not carry the customer's name: this page is about money, and the work list is where
 * a provider finds out who they worked for.
 */
create or replace function public.get_my_earnings_command(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  currencies jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
  payout_verified boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.provider_payout_destinations d
    where d.provider_id = p_provider_id and d.verification_status = 'verified'
  ) into payout_verified;

  /**
   * The currency list is the union of the three sources, because money can exist in the ledger, in an obligation
   * or in a payout before the other two know about it — and a currency missing from this list would be money the
   * page silently does not show.
   */
  select coalesce(jsonb_agg(entry order by entry ->> 'currency_code'), '[]'::jsonb)
    into currencies
    from (
      select jsonb_build_object(
        'currency_code', c.currency_code,
        'ledger_balance_minor', coalesce(ledger.balance_minor, 0),
        'gross_funded_minor', coalesce(funded.gross_minor, 0),
        'in_escrow_minor', coalesce(funded.escrow_minor, 0),
        'eligible_minor', coalesce(payouts.eligible_minor, 0),
        'in_flight_minor', coalesce(payouts.in_flight_minor, 0),
        'blocked_minor', coalesce(payouts.blocked_minor, 0),
        'paid_out_minor', coalesce(payouts.paid_minor, 0),
        'reduced_minor', coalesce(reductions.total_minor, 0),
        'platform_fee_minor', coalesce(reductions.fee_minor, 0),
        -- Positive means the ledger says more is owed than the operational rows admit to; negative means the
        -- reverse. Either way it is the number worth looking at, not a boolean that hides the size.
        'reconciliation_delta_minor',
          coalesce(ledger.balance_minor, 0)
          - (coalesce(funded.escrow_minor, 0) + coalesce(payouts.eligible_minor, 0) + coalesce(payouts.in_flight_minor, 0) + coalesce(payouts.blocked_minor, 0))
      ) as entry
      from (
        select distinct currency_code from (
          select la.currency_code from public.ledger_accounts la
          where la.owner_kind = 'provider' and la.owner_id = p_provider_id
          union
          select o.currency_code from public.payment_obligations o where o.provider_id = p_provider_id
          union
          select p.currency_code from public.payouts p where p.provider_id = p_provider_id
        ) all_currencies
      ) c
      left join (
        select la.currency_code,
               -- The account is a liability credited on funding, so what is still owed is the NEGATIVE of the
               -- sum: a positive balance here would mean the provider owes the platform.
               -sum(le.amount_minor) as balance_minor
        from public.ledger_accounts la
        join public.ledger_entries le on le.ledger_account_id = la.id
        where la.owner_kind = 'provider' and la.owner_id = p_provider_id
        group by la.currency_code
      ) ledger on ledger.currency_code = c.currency_code
      left join (
        select o.currency_code,
               sum(o.amount_minor) as gross_minor,
               sum(case when r.state = 'completed' then 0 else o.amount_minor end) as escrow_minor
        from public.payment_obligations o
        join public.requests r on r.id = o.request_id
        where o.provider_id = p_provider_id and o.status in ('funded','partially_refunded')
        group by o.currency_code
      ) funded on funded.currency_code = c.currency_code
      left join (
        select p.currency_code,
               sum(case when p.status = 'eligible' then p.amount_minor else 0 end) as eligible_minor,
               sum(case when p.status in ('queued','processing') then p.amount_minor else 0 end) as in_flight_minor,
               sum(case when p.status in ('failed','blocked') then p.amount_minor else 0 end) as blocked_minor,
               sum(case when p.status = 'paid' then p.amount_minor else 0 end) as paid_minor
        from public.payouts p
        where p.provider_id = p_provider_id
        group by p.currency_code
      ) payouts on payouts.currency_code = c.currency_code
      left join (
        select la.currency_code,
               sum(le.amount_minor) as total_minor,
               -- Fees and taxes would arrive as their own transaction types; today none exist, and the sum over
               -- an empty set is zero rather than an assumption.
               sum(case when lt.transaction_type like 'platform_fee%' or lt.transaction_type like '%tax%' then le.amount_minor else 0 end) as fee_minor
        from public.ledger_accounts la
        join public.ledger_entries le on le.ledger_account_id = la.id
        join public.ledger_transactions lt on lt.id = le.transaction_id
        where la.owner_kind = 'provider' and la.owner_id = p_provider_id
          -- Positive entries on this account reduce what is owed: payouts sent, refunds applied, reversals.
          and le.amount_minor > 0
          -- Payouts are reported as their own figure, so they are not also a "reduction".
          and lt.transaction_type <> 'provider_payout'
        group by la.currency_code
      ) reductions on reductions.currency_code = c.currency_code
      -- `rows` is a keyword in Postgres, so the alias is spelled out.
    ) currency_rows;

  select coalesce(jsonb_agg(entry order by entry ->> 'completed_at' desc nulls last, entry ->> 'obligation_created_at' desc), '[]'::jsonb)
    into items
    from (
      select jsonb_build_object(
        'obligation_id', o.id,
        'request_id', o.request_id,
        'need_text', coalesce(nullif(btrim(r.need_text), ''), 'Completed work'),
        'request_state', r.state::text,
        'completed_at', r.completed_at,
        'obligation_created_at', o.created_at,
        'gross_minor', o.amount_minor,
        'currency_code', o.currency_code,
        'obligation_status', o.status::text,
        'refunded_minor', coalesce((
          select sum(f.amount_minor) from public.payment_refunds f
          where f.obligation_id = o.id and f.status = 'succeeded'
        ), 0),
        'net_payable_minor', app_private.net_provider_payable_amount(o.id),
        'payout_id', p.id,
        'payout_status', p.status::text,
        'payout_amount_minor', p.amount_minor,
        'payout_paid_at', case when p.status = 'paid' then p.updated_at else null end,
        'payout_reference', p.provider_reference
      ) as entry
      from public.payment_obligations o
      join public.requests r on r.id = o.request_id
      left join public.payouts p on p.obligation_id = o.id
      where o.provider_id = p_provider_id
      order by r.completed_at desc nulls last, o.created_at desc
      limit 200
    ) item_rows;

  return jsonb_build_object(
    'provider', jsonb_build_object(
      'id', prov.id,
      'display_name', prov.display_name,
      'payout_verified', payout_verified
    ),
    'currencies', currencies,
    'items', items
  );
end $$;

revoke all on function public.get_my_earnings_command(uuid) from public, anon;
grant execute on function public.get_my_earnings_command(uuid) to authenticated;

comment on function public.get_my_earnings_command(uuid) is
  'The provider''s own books: ledger balance, escrow, eligible, in-flight, paid, reductions and fees per currency, the reconciliation delta between the ledger and the operational rows, and the itemised obligations behind them.';
