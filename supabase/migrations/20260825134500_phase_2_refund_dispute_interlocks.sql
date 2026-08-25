-- Phase 2 financial safety: refunds and disputes are financial holds, not UI flags.
-- Payout eligibility is recomputed from net provider payable and every execution path
-- revalidates authoritative payment/work/hold state.

alter table public.payment_refunds add column if not exists ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict;
alter table public.payment_refunds add column if not exists provider_submitted_at timestamptz;
alter table public.payment_refunds add column if not exists completed_at timestamptz;
alter table public.payment_disputes add column if not exists resolved_at timestamptz;
alter table public.payment_disputes add column if not exists resolved_by_account_id uuid references public.accounts(id) on delete restrict;
alter table public.payment_disputes add column if not exists resolution_note text;

create index if not exists payment_refunds_obligation_status_idx on public.payment_refunds(obligation_id,status,created_at desc);
create index if not exists payment_disputes_obligation_resolution_idx on public.payment_disputes(obligation_id,resolution,updated_at desc);

create or replace function app_private.net_provider_payable_amount(p_obligation_id uuid)
returns bigint
language sql stable security definer
set search_path='public','app_private'
as $$
  select greatest(
    0::bigint,
    o.amount_minor - coalesce((
      select sum(f.amount_minor)
      from public.payment_refunds f
      where f.obligation_id=o.id and f.status='succeeded'
    ),0::bigint)
  )
  from public.payment_obligations o
  where o.id=p_obligation_id;
$$;

create or replace function app_private.block_payout_for_financial_hold(p_obligation_id uuid,p_reason text)
returns void
language plpgsql security definer
set search_path='public','app_private'
as $$
begin
  update public.payouts
  set status='blocked',block_reason=p_reason,last_validated_at=now(),updated_at=now()
  where obligation_id=p_obligation_id and status in ('eligible','queued');

  -- A provider submission already in flight cannot be truthfully called blocked.
  -- Keep its processing state and surface the late hold for Operations/Finance.
  update public.payouts
  set block_reason=p_reason||'_after_submission',last_validated_at=now(),updated_at=now()
  where obligation_id=p_obligation_id and status='processing';
end$$;

create or replace function app_private.refresh_payout_eligibility(p_obligation_id uuid)
returns uuid
language plpgsql security definer
set search_path='public','app_private'
as $$
declare
  o public.payment_obligations%rowtype;
  r public.requests%rowtype;
  payout_id uuid;
  net_amount bigint;
begin
  select * into o from public.payment_obligations where id=p_obligation_id;
  if not found or o.status not in ('funded','partially_refunded') then return null; end if;

  select * into r from public.requests where id=o.request_id;
  if not found or r.state<>'completed' then return null; end if;

  if exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status in ('requested','submitted','processing','needs_attention')) then return null; end if;
  if exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then return null; end if;

  net_amount:=app_private.net_provider_payable_amount(o.id);
  if coalesce(net_amount,0)<=0 then
    update public.payouts set status='cancelled',block_reason='fully_refunded',last_validated_at=now(),updated_at=now()
    where obligation_id=o.id and status not in ('processing','paid');
    return null;
  end if;

  insert into public.payouts(obligation_id,provider_id,currency_code,amount_minor,status,idempotency_key,last_validated_at)
  values(o.id,o.provider_id,o.currency_code,net_amount,'eligible','payout-eligibility:'||o.id::text,now())
  on conflict(obligation_id) do update
  set amount_minor=case when public.payouts.status in ('eligible','failed','blocked') then excluded.amount_minor else public.payouts.amount_minor end,
      status=case
        when public.payouts.status='eligible' then 'eligible'::public.payout_status
        when public.payouts.status='failed' and public.payouts.block_reason='transfer_failed' then 'eligible'::public.payout_status
        when public.payouts.status='blocked' and public.payouts.block_reason in ('refund_pending','refund_processing','dispute_open') then 'eligible'::public.payout_status
        else public.payouts.status
      end,
      block_reason=case
        when public.payouts.status='eligible' then null
        when public.payouts.status='failed' and public.payouts.block_reason='transfer_failed' then null
        when public.payouts.status='blocked' and public.payouts.block_reason in ('refund_pending','refund_processing','dispute_open') then null
        else public.payouts.block_reason
      end,
      last_validated_at=now(),updated_at=now()
  returning id into payout_id;
  return payout_id;
end$$;

create or replace function app_private.payout_execution_block_reason(p_payout_id uuid)
returns text
language plpgsql stable security definer
set search_path='public','app_private'
as $$
declare
  p public.payouts%rowtype;
  o public.payment_obligations%rowtype;
  r public.requests%rowtype;
  expected_amount bigint;
begin
  select * into p from public.payouts where id=p_payout_id;
  if not found then return 'payout_not_found'; end if;

  select * into o from public.payment_obligations where id=p.obligation_id;
  if not found or o.status not in ('funded','partially_refunded') then return 'obligation_not_payable'; end if;

  select * into r from public.requests where id=o.request_id;
  if not found or r.state<>'completed' then return 'work_not_completed'; end if;

  if exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status in ('requested','submitted','processing','needs_attention')) then return 'refund_pending_or_processing'; end if;
  if exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then return 'dispute_not_cleared'; end if;

  expected_amount:=app_private.net_provider_payable_amount(o.id);
  if coalesce(expected_amount,0)<=0 then return 'fully_refunded'; end if;
  if p.amount_minor<>expected_amount then return 'payout_amount_stale'; end if;

  if not exists(
    select 1 from public.provider_payout_destinations d
    where d.provider_id=p.provider_id and d.adapter_key='paystack' and d.currency_code=p.currency_code
      and d.verification_status='verified' and d.is_default
      and nullif(btrim(d.provider_recipient_code),'') is not null
  ) then return 'verified_payout_destination_required'; end if;

  return null;
end$$;

create or replace function app_private.request_refund_authoritatively(p_obligation_id uuid,p_amount_minor bigint,p_reason text,p_idempotency_key text)
returns uuid
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare
  o public.payment_obligations%rowtype;
  a public.payment_attempts%rowtype;
  existing public.payment_refunds%rowtype;
  committed bigint;
  rid uuid;
  payout_state public.payout_status;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not app_private.current_account_has_platform_capability('platform.money.refund') then raise exception 'forbidden' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency key required' using errcode='22023'; end if;

  select * into existing from public.payment_refunds where idempotency_key=p_idempotency_key;
  if found then
    if existing.obligation_id<>p_obligation_id or existing.amount_minor<>p_amount_minor then raise exception 'idempotency key conflict' using errcode='23505'; end if;
    return existing.id;
  end if;

  select * into o from public.payment_obligations where id=p_obligation_id for update;
  if not found or o.status not in ('funded','partially_refunded') then raise exception 'obligation not refundable' using errcode='22023'; end if;
  if p_amount_minor<=0 then raise exception 'invalid refund amount' using errcode='22023'; end if;

  select coalesce(sum(f.amount_minor),0) into committed
  from public.payment_refunds f
  where f.obligation_id=o.id and f.status not in ('failed','cancelled');
  if p_amount_minor>o.amount_minor-committed then raise exception 'refund exceeds remaining refundable amount' using errcode='22023'; end if;

  select status into payout_state from public.payouts where obligation_id=o.id for update;
  if payout_state in ('processing','paid') then raise exception 'refund blocked because provider payout was already submitted' using errcode='22023'; end if;
  perform app_private.block_payout_for_financial_hold(o.id,'refund_pending');

  select * into a from public.payment_attempts where obligation_id=o.id and status='succeeded' order by updated_at desc limit 1;
  if not found then raise exception 'successful payment attempt required' using errcode='22023'; end if;

  insert into public.payment_refunds(obligation_id,payment_attempt_id,adapter_key,amount_minor,currency_code,reason,idempotency_key,requested_by_account_id)
  values(o.id,a.id,a.provider_adapter,p_amount_minor,o.currency_code,nullif(btrim(coalesce(p_reason,'')),''),p_idempotency_key,app_private.current_account_id())
  returning id into rid;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PAYMENT_REFUND_REQUESTED','payment_refund',rid,'refund_request','system_internal',jsonb_build_object('obligation_id',o.id,'amount_minor',p_amount_minor));
  return rid;
end$$;

create or replace function public.prepare_refund_submission_command(p_refund_id uuid)
returns jsonb
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare
  f public.payment_refunds%rowtype;
  a public.payment_attempts%rowtype;
  p public.payouts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into f from public.payment_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund not found' using errcode='P0002'; end if;
  if f.status not in ('requested','needs_attention') then raise exception 'refund is not ready for submission' using errcode='22023'; end if;

  select * into p from public.payouts where obligation_id=f.obligation_id for update;
  if found and p.status in ('processing','paid') then raise exception 'refund blocked because provider payout was already submitted' using errcode='22023'; end if;
  perform app_private.block_payout_for_financial_hold(f.obligation_id,'refund_processing');

  select * into a from public.payment_attempts where id=f.payment_attempt_id;
  if not found or a.status<>'succeeded' then raise exception 'successful payment attempt required' using errcode='22023'; end if;
  if nullif(btrim(coalesce(a.checkout_reference,a.provider_reference,'')),'') is null then raise exception 'provider transaction reference required' using errcode='22023'; end if;

  return jsonb_build_object(
    'refund_id',f.id,
    'transaction_reference',coalesce(a.checkout_reference,a.provider_reference),
    'amount_minor',f.amount_minor,
    'currency_code',f.currency_code,
    'reason',f.reason
  );
end$$;
revoke all on function public.prepare_refund_submission_command(uuid) from public,anon,authenticated;
grant execute on function public.prepare_refund_submission_command(uuid) to service_role;

create or replace function public.record_refund_provider_state_command(p_refund_id uuid,p_adapter text,p_provider_reference text,p_status text)
returns void
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare
  f public.payment_refunds%rowtype;
  o public.payment_obligations%rowtype;
  p public.payouts%rowtype;
  cash_id uuid;
  contra_id uuid;
  tx uuid;
  succeeded_total bigint;
  normalized_status text:=lower(btrim(p_status));
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if normalized_status not in ('submitted','processing','succeeded','failed','needs_attention','cancelled') then raise exception 'invalid refund provider state' using errcode='22023'; end if;

  select * into f from public.payment_refunds where id=p_refund_id for update;
  if not found then raise exception 'refund not found' using errcode='P0002'; end if;
  if lower(btrim(p_adapter))<>f.adapter_key then raise exception 'refund adapter mismatch' using errcode='22023'; end if;
  if f.provider_reference is not null and nullif(btrim(coalesce(p_provider_reference,'')),'') is not null and f.provider_reference<>p_provider_reference then raise exception 'refund reference mismatch' using errcode='22023'; end if;

  select * into o from public.payment_obligations where id=f.obligation_id for update;
  select * into p from public.payouts where obligation_id=o.id for update;

  if normalized_status='succeeded' then
    if f.status<>'succeeded' then
      cash_id:=app_private.ensure_ledger_account('provider_clearing:'||f.adapter_key||':'||f.currency_code,'asset','system',null,f.currency_code);
      if found and p.status in ('processing','paid') then
        contra_id:=app_private.ensure_ledger_account('provider_receivable:'||o.provider_id::text||':'||f.currency_code,'asset','provider',o.provider_id,f.currency_code);
      else
        contra_id:=app_private.ensure_ledger_account('provider_payable:'||o.provider_id::text||':'||f.currency_code,'liability','provider',o.provider_id,f.currency_code);
      end if;
      tx:=app_private.post_balanced_ledger_transaction(
        'customer_refund',
        'refund-succeeded:'||f.id::text,
        coalesce(nullif(btrim(coalesce(p_provider_reference,'')),''),f.id::text),
        jsonb_build_object('obligation_id',o.id,'refund_id',f.id,'payout_status',case when p.id is null then null else p.status::text end),
        jsonb_build_array(
          jsonb_build_object('ledger_account_id',cash_id,'currency_code',f.currency_code,'amount_minor',-f.amount_minor,'obligation_id',o.id),
          jsonb_build_object('ledger_account_id',contra_id,'currency_code',f.currency_code,'amount_minor',f.amount_minor,'obligation_id',o.id)
        )
      );
    else
      tx:=f.ledger_transaction_id;
    end if;

    update public.payment_refunds
    set status='succeeded',provider_reference=coalesce(provider_reference,nullif(btrim(coalesce(p_provider_reference,'')),'')),ledger_transaction_id=coalesce(ledger_transaction_id,tx),completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=f.id;

    select coalesce(sum(amount_minor),0) into succeeded_total from public.payment_refunds where obligation_id=o.id and status='succeeded';
    update public.payment_obligations
    set status=case when succeeded_total>=amount_minor then 'refunded'::public.payment_obligation_status else 'partially_refunded'::public.payment_obligation_status end,updated_at=now()
    where id=o.id;

    if p.id is not null and p.status not in ('processing','paid') then
      if app_private.net_provider_payable_amount(o.id)<=0 then
        update public.payouts set status='cancelled',block_reason='fully_refunded',last_validated_at=now(),updated_at=now() where id=p.id;
      else
        update public.payouts set amount_minor=app_private.net_provider_payable_amount(o.id),status='blocked',block_reason='refund_completed_revalidate',last_validated_at=now(),updated_at=now() where id=p.id;
      end if;
    end if;

    if app_private.net_provider_payable_amount(o.id)>0 then perform app_private.refresh_payout_eligibility(o.id); end if;

    insert into public.audit_events(actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
    values('system','PAYMENT_REFUND_RECONCILED','payment_refund',f.id,'refund_reconciliation','system_internal',jsonb_build_object('obligation_id',o.id,'ledger_transaction_id',tx));
  else
    update public.payment_refunds
    set status=normalized_status,
        provider_reference=coalesce(provider_reference,nullif(btrim(coalesce(p_provider_reference,'')),'')),
        provider_submitted_at=case when normalized_status in ('submitted','processing','needs_attention') then coalesce(provider_submitted_at,now()) else provider_submitted_at end,
        completed_at=case when normalized_status in ('failed','cancelled') then coalesce(completed_at,now()) else completed_at end,
        updated_at=now()
    where id=f.id;

    if normalized_status in ('failed','cancelled') then
      if not exists(select 1 from public.payment_refunds x where x.obligation_id=o.id and x.id<>f.id and x.status in ('requested','submitted','processing','needs_attention'))
         and not exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then
        perform app_private.refresh_payout_eligibility(o.id);
      end if;
    else
      perform app_private.block_payout_for_financial_hold(o.id,'refund_processing');
    end if;
  end if;
end$$;
revoke all on function public.record_refund_provider_state_command(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_refund_provider_state_command(uuid,text,text,text) to service_role;

create or replace function app_private.upsert_payment_dispute_authoritatively(
  p_adapter text,p_provider_dispute_id text,p_provider_transaction_reference text,p_status text,p_amount_minor bigint,p_currency_code text,p_reason text,p_due_at timestamptz,p_raw_summary jsonb
)
returns uuid
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare
  did uuid;
  attempt_id uuid;
  obligation_id uuid;
  normalized_status text:=lower(btrim(coalesce(p_status,'')));
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_provider_dispute_id,'')),'') is null then raise exception 'provider dispute id required' using errcode='22023'; end if;

  select pa.id,pa.obligation_id into attempt_id,obligation_id
  from public.payment_attempts pa
  where pa.provider_adapter=lower(btrim(p_adapter))
    and (pa.checkout_reference=p_provider_transaction_reference or pa.provider_reference=p_provider_transaction_reference)
  order by pa.updated_at desc limit 1;

  insert into public.payment_disputes(obligation_id,payment_attempt_id,adapter_key,provider_dispute_id,provider_transaction_reference,status,amount_minor,currency_code,reason,due_at,raw_summary,resolution,resolved_at,resolved_by_account_id,resolution_note)
  values(obligation_id,attempt_id,lower(btrim(p_adapter)),p_provider_dispute_id,p_provider_transaction_reference,normalized_status,p_amount_minor,p_currency_code,p_reason,p_due_at,coalesce(p_raw_summary,'{}'::jsonb),case when normalized_status like '%resolved%' then 'provider_resolved_pending_review' else null end,null,null,null)
  on conflict(adapter_key,provider_dispute_id) do update
  set status=excluded.status,amount_minor=excluded.amount_minor,currency_code=excluded.currency_code,reason=excluded.reason,due_at=excluded.due_at,raw_summary=excluded.raw_summary,
      resolution=case
        when public.payment_disputes.resolution='cleared_for_payout' then public.payment_disputes.resolution
        when normalized_status like '%resolved%' then 'provider_resolved_pending_review'
        else null
      end,
      resolved_at=case when normalized_status like '%resolved%' then public.payment_disputes.resolved_at else null end,
      resolved_by_account_id=case when normalized_status like '%resolved%' then public.payment_disputes.resolved_by_account_id else null end,
      resolution_note=case when normalized_status like '%resolved%' then public.payment_disputes.resolution_note else null end,
      updated_at=now()
  returning id into did;

  if obligation_id is not null then
    update public.payment_obligations set status='disputed',updated_at=now() where id=obligation_id and status not in ('refunded','cancelled');
    perform app_private.block_payout_for_financial_hold(obligation_id,'dispute_open');
  end if;

  insert into public.audit_events(actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values('system','PAYMENT_DISPUTE_UPDATED','payment_dispute',did,'provider_dispute_event','system_internal',jsonb_build_object('status',normalized_status,'obligation_id',obligation_id));
  return did;
end$$;

create or replace function public.clear_payment_dispute_for_payout_command(p_dispute_id uuid,p_reason text)
returns void
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare
  d public.payment_disputes%rowtype;
  o public.payment_obligations%rowtype;
  refunded bigint;
begin
  if auth.uid() is null or not app_private.current_account_has_platform_capability('platform.money.dispute_manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'resolution reason required' using errcode='22023'; end if;

  select * into d from public.payment_disputes where id=p_dispute_id for update;
  if not found or d.obligation_id is null then raise exception 'linked dispute required' using errcode='22023'; end if;
  select * into o from public.payment_obligations where id=d.obligation_id for update;

  update public.payment_disputes
  set resolution='cleared_for_payout',resolved_at=now(),resolved_by_account_id=app_private.current_account_id(),resolution_note=p_reason,updated_at=now()
  where id=d.id;

  select coalesce(sum(amount_minor),0) into refunded from public.payment_refunds where obligation_id=o.id and status='succeeded';
  update public.payment_obligations
  set status=case when refunded<=0 then 'funded'::public.payment_obligation_status when refunded>=amount_minor then 'refunded'::public.payment_obligation_status else 'partially_refunded'::public.payment_obligation_status end,updated_at=now()
  where id=o.id;

  if refunded<o.amount_minor then perform app_private.refresh_payout_eligibility(o.id); end if;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PAYMENT_DISPUTE_CLEARED_FOR_PAYOUT','payment_dispute',d.id,'dispute_resolution','system_internal',jsonb_build_object('reason',p_reason,'obligation_id',o.id));
end$$;
revoke all on function public.clear_payment_dispute_for_payout_command(uuid,text) from public,anon;
grant execute on function public.clear_payment_dispute_for_payout_command(uuid,text) to authenticated;
