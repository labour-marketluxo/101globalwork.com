-- Financial execution interlocks. Eligibility is not authority to send money:
-- every payout is revalidated immediately before provider submission.

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
revoke all on public.payout_reconciliations from anon, authenticated;
grant select on public.payout_reconciliations to authenticated;
drop policy if exists payout_reconciliations_finance_read on public.payout_reconciliations;
create policy payout_reconciliations_finance_read on public.payout_reconciliations for select to authenticated
using(app_private.current_account_has_platform_capability('platform.money.read'));

create or replace function app_private.payout_execution_block_reason(p_payout_id uuid)
returns text language plpgsql stable security definer set search_path='public','app_private' as $$
declare p public.payouts%rowtype; o public.payment_obligations%rowtype; r public.requests%rowtype;
begin
  select * into p from public.payouts where id=p_payout_id; if not found then return 'payout_not_found'; end if;
  select * into o from public.payment_obligations where id=p.obligation_id; if not found or o.status<>'funded' then return 'obligation_not_funded'; end if;
  select * into r from public.requests where id=o.request_id; if not found or r.state<>'completed' then return 'work_not_completed'; end if;
  if exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status not in ('failed','cancelled')) then return 'refund_pending_or_completed'; end if;
  if exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then return 'dispute_not_cleared'; end if;
  if not exists(select 1 from public.provider_payout_destinations d where d.provider_id=p.provider_id and d.adapter_key='paystack' and d.currency_code=p.currency_code and d.verification_status='verified' and d.is_default and nullif(btrim(d.provider_recipient_code),'') is not null) then return 'verified_payout_destination_required'; end if;
  return null;
end$$;

create or replace function app_private.refresh_payout_eligibility(p_obligation_id uuid)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare o public.payment_obligations%rowtype; r public.requests%rowtype; payout_id uuid; blocker boolean;
begin
  select * into o from public.payment_obligations where id=p_obligation_id; if not found or o.status<>'funded' then return null; end if;
  select * into r from public.requests where id=o.request_id; if not found or r.state<>'completed' then return null; end if;
  blocker := exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status not in ('failed','cancelled'))
    or exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout');
  if blocker then return null; end if;
  insert into public.payouts(obligation_id,provider_id,currency_code,amount_minor,status,idempotency_key,last_validated_at)
  values(o.id,o.provider_id,o.currency_code,o.amount_minor,'eligible','payout-eligibility:'||o.id::text,now())
  on conflict(obligation_id) do update set
    status=case when public.payouts.status in ('eligible','failed','blocked') and coalesce(public.payouts.block_reason,'') in ('','refund_pending','dispute_open','transfer_failed') then 'eligible'::public.payout_status else public.payouts.status end,
    block_reason=case when public.payouts.status in ('eligible','failed','blocked') and coalesce(public.payouts.block_reason,'') in ('','refund_pending','dispute_open','transfer_failed') then null else public.payouts.block_reason end,
    last_validated_at=now(),updated_at=now()
  returning id into payout_id;
  return payout_id;
end$$;

create or replace function public.queue_payout_execution_command(p_payout_id uuid)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare p public.payouts%rowtype; reason text; ref text;
begin
  if auth.uid() is null or not app_private.current_account_has_platform_capability('platform.money.payout') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  select * into p from public.payouts where id=p_payout_id for update; if not found then raise exception 'payout not found' using errcode='P0002'; end if;
  if p.status not in ('eligible','queued') then raise exception 'payout is not eligible for submission' using errcode='22023'; end if;
  reason:=app_private.payout_execution_block_reason(p.id);
  if reason is not null then
    update public.payouts set status=case when reason='verified_payout_destination_required' then status else 'blocked' end,block_reason=reason,last_validated_at=now(),updated_at=now() where id=p.id;
    raise exception 'payout blocked: %',reason using errcode='22023';
  end if;
  ref:=coalesce(p.provider_reference,'gw-payout-'||replace(p.id::text,'-',''));
  update public.payouts set status='queued',provider_adapter='paystack',provider_reference=ref,block_reason=null,last_validated_at=now(),updated_at=now() where id=p.id;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PAYOUT_QUEUED','payout',p.id,'payout_execution','system_internal',jsonb_build_object('provider_adapter','paystack','provider_reference',ref));
  return p.id;
end$$;
revoke all on function public.queue_payout_execution_command(uuid) from public,anon;
grant execute on function public.queue_payout_execution_command(uuid) to authenticated;

create or replace function public.lock_payout_for_submission_command(p_payout_id uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','auth' as $$
declare p public.payouts%rowtype; d public.provider_payout_destinations%rowtype; reason text;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into p from public.payouts where id=p_payout_id for update; if not found then raise exception 'payout not found' using errcode='P0002'; end if;
  if p.status not in ('queued','processing') then raise exception 'payout is not queued' using errcode='22023'; end if;
  reason:=app_private.payout_execution_block_reason(p.id);
  if reason is not null then update public.payouts set status='blocked',block_reason=reason,last_validated_at=now(),updated_at=now() where id=p.id; raise exception 'payout blocked: %',reason using errcode='22023'; end if;
  select * into d from public.provider_payout_destinations where provider_id=p.provider_id and adapter_key='paystack' and currency_code=p.currency_code and verification_status='verified' and is_default and nullif(btrim(provider_recipient_code),'') is not null order by updated_at desc limit 1;
  update public.payouts set status='processing',block_reason=null,last_validated_at=now(),updated_at=now() where id=p.id;
  return jsonb_build_object('payout_id',p.id,'amount_minor',p.amount_minor,'currency_code',p.currency_code,'recipient_code',d.provider_recipient_code,'reference',p.provider_reference);
end$$;
revoke all on function public.lock_payout_for_submission_command(uuid) from public,anon,authenticated;
grant execute on function public.lock_payout_for_submission_command(uuid) to service_role;

create or replace function app_private.request_refund_authoritatively(p_obligation_id uuid,p_amount_minor bigint,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare o public.payment_obligations%rowtype; a public.payment_attempts%rowtype; rid uuid; reserved bigint; payout_state public.payout_status;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not app_private.current_account_has_platform_capability('platform.money.refund') then raise exception 'forbidden' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  select * into o from public.payment_obligations where id=p_obligation_id for update; if not found or o.status not in ('funded','partially_refunded') then raise exception 'obligation not refundable' using errcode='22023'; end if;
  select status into payout_state from public.payouts where obligation_id=o.id for update;
  if payout_state in ('processing','paid') then raise exception 'payout already processing or paid; recovery workflow required' using errcode='22023'; end if;
  select coalesce(sum(amount_minor),0) into reserved from public.payment_refunds where obligation_id=o.id and status not in ('failed','cancelled');
  if p_amount_minor<=0 or reserved+p_amount_minor>o.amount_minor then raise exception 'invalid refund amount' using errcode='22023'; end if;
  select * into a from public.payment_attempts where obligation_id=o.id and status='succeeded' order by updated_at desc limit 1; if not found then raise exception 'successful payment attempt required' using errcode='22023'; end if;
  select id into rid from public.payment_refunds where idempotency_key=p_idempotency_key; if rid is not null then return rid; end if;
  insert into public.payment_refunds(obligation_id,payment_attempt_id,adapter_key,amount_minor,currency_code,reason,idempotency_key,requested_by_account_id)
  values(o.id,a.id,a.provider_adapter,p_amount_minor,o.currency_code,nullif(btrim(coalesce(p_reason,'')),''),p_idempotency_key,app_private.current_account_id()) returning id into rid;
  update public.payouts set status='blocked',block_reason='refund_pending',updated_at=now() where obligation_id=o.id and status in ('eligible','queued');
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'account','PAYMENT_REFUND_REQUESTED','payment_refund',rid,'refund_request','system_internal',jsonb_build_object('obligation_id',o.id,'amount_minor',p_amount_minor));
  return rid;
end$$;

create or replace function public.record_refund_provider_state_command(p_refund_id uuid,p_status text,p_provider_reference text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare f public.payment_refunds%rowtype; o public.payment_obligations%rowtype; cash_id uuid; payable_id uuid; tx uuid; succeeded_total bigint; normalized text;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  normalized:=lower(btrim(p_status)); if normalized not in ('submitted','processing','succeeded','failed','needs_attention','cancelled') then raise exception 'invalid refund state' using errcode='22023'; end if;
  select * into f from public.payment_refunds where id=p_refund_id for update; if not found then raise exception 'refund not found' using errcode='P0002'; end if;
  select * into o from public.payment_obligations where id=f.obligation_id for update;
  if f.status='succeeded' and normalized='succeeded' then return; end if;
  update public.payment_refunds set status=normalized,provider_reference=coalesce(provider_reference,nullif(btrim(p_provider_reference),'')),updated_at=now() where id=f.id;
  if normalized='succeeded' then
    cash_id:=app_private.ensure_ledger_account('provider_clearing:'||f.adapter_key||':'||f.currency_code,'asset','system',null,f.currency_code);
    payable_id:=app_private.ensure_ledger_account('provider_payable:'||o.provider_id::text||':'||f.currency_code,'liability','provider',o.provider_id,f.currency_code);
    tx:=app_private.post_balanced_ledger_transaction('payment_refund','refund:'||f.id::text,coalesce(nullif(btrim(p_provider_reference),''),f.id::text),jsonb_build_object('obligation_id',o.id,'refund_id',f.id),jsonb_build_array(
      jsonb_build_object('ledger_account_id',cash_id,'currency_code',f.currency_code,'amount_minor',-f.amount_minor,'obligation_id',o.id),
      jsonb_build_object('ledger_account_id',payable_id,'currency_code',f.currency_code,'amount_minor',f.amount_minor,'obligation_id',o.id)));
    select coalesce(sum(amount_minor),0) into succeeded_total from public.payment_refunds where obligation_id=o.id and status='succeeded';
    update public.payment_obligations set status=case when succeeded_total>=amount_minor then 'refunded'::public.payment_obligation_status else 'partially_refunded'::public.payment_obligation_status end,updated_at=now() where id=o.id;
    update public.payouts set status='blocked',block_reason='refund_completed',updated_at=now() where obligation_id=o.id and status not in ('paid','cancelled');
    insert into public.audit_events(actor_type,action,resource_type,resource_id,data_classification,metadata) values('system','PAYMENT_REFUND_RECONCILED','payment_refund',f.id,'system_internal',jsonb_build_object('ledger_transaction_id',tx,'obligation_id',o.id));
    insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('payment_obligation',o.id,'PAYMENT_REFUNDED',jsonb_build_object('refund_id',f.id,'amount_minor',f.amount_minor,'ledger_transaction_id',tx),'payment-refunded:'||f.id::text) on conflict(idempotency_key) do nothing;
  elsif normalized in ('failed','cancelled') then
    if not exists(select 1 from public.payment_refunds x where x.obligation_id=o.id and x.id<>f.id and x.status not in ('failed','cancelled')) and not exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then
      update public.payouts set status='eligible',block_reason=null,updated_at=now() where obligation_id=o.id and status='blocked' and block_reason='refund_pending';
    end if;
  end if;
end$$;
revoke all on function public.record_refund_provider_state_command(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_refund_provider_state_command(uuid,text,text) to service_role;

create or replace function app_private.upsert_payment_dispute_authoritatively(p_adapter text,p_provider_dispute_id text,p_provider_transaction_reference text,p_status text,p_amount_minor bigint,p_currency_code text,p_reason text,p_due_at timestamptz,p_raw_summary jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare did uuid; attempt_id uuid; obligation_id uuid; resolved boolean;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select pa.id,pa.obligation_id into attempt_id,obligation_id from public.payment_attempts pa where pa.provider_adapter=lower(btrim(p_adapter)) and (pa.checkout_reference=p_provider_transaction_reference or pa.provider_reference=p_provider_transaction_reference) order by pa.updated_at desc limit 1;
  insert into public.payment_disputes(obligation_id,payment_attempt_id,adapter_key,provider_dispute_id,provider_transaction_reference,status,amount_minor,currency_code,reason,due_at,raw_summary)
  values(obligation_id,attempt_id,lower(btrim(p_adapter)),p_provider_dispute_id,p_provider_transaction_reference,p_status,p_amount_minor,p_currency_code,p_reason,p_due_at,coalesce(p_raw_summary,'{}'::jsonb))
  on conflict(adapter_key,provider_dispute_id) do update set status=excluded.status,amount_minor=excluded.amount_minor,currency_code=excluded.currency_code,reason=excluded.reason,due_at=excluded.due_at,raw_summary=excluded.raw_summary,updated_at=now()
  returning id into did;
  resolved:=lower(coalesce(p_status,'')) in ('resolved','closed','won','merchant_won') or lower(coalesce(p_status,'')) like '%resolve%';
  if obligation_id is not null then
    if not resolved then
      update public.payment_obligations set status='disputed',updated_at=now() where id=obligation_id and status not in ('refunded','cancelled');
      update public.payouts set status='blocked',block_reason='dispute_open',updated_at=now() where obligation_id=obligation_id and status not in ('paid','cancelled');
    else
      update public.payment_disputes set resolution=coalesce(resolution,'provider_resolved_requires_finance_clearance'),updated_at=now() where id=did;
    end if;
  end if;
  insert into public.audit_events(actor_type,action,resource_type,resource_id,data_classification,metadata)
  values('system','PAYMENT_DISPUTE_UPDATED','payment_dispute',did,'system_internal',jsonb_build_object('status',p_status,'obligation_id',obligation_id));
  return did;
end$$;

create or replace function public.resolve_payment_dispute_command(p_dispute_id uuid,p_resolution text,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare d public.payment_disputes%rowtype; o public.payment_obligations%rowtype;
begin
  if auth.uid() is null or not app_private.current_account_has_platform_capability('platform.money.dispute_manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if p_resolution not in ('cleared_for_payout','refund_required','loss_confirmed') then raise exception 'invalid resolution' using errcode='22023'; end if;
  select * into d from public.payment_disputes where id=p_dispute_id for update; if not found then raise exception 'dispute not found' using errcode='P0002'; end if;
  if lower(coalesce(d.status,'')) not in ('resolved','closed','won','merchant_won') and lower(coalesce(d.status,'')) not like '%resolve%' then raise exception 'provider dispute is not resolved yet' using errcode='22023'; end if;
  update public.payment_disputes set resolution=p_resolution,updated_at=now() where id=d.id;
  if d.obligation_id is not null and p_resolution='cleared_for_payout' and not exists(select 1 from public.payment_disputes x where x.obligation_id=d.obligation_id and x.id<>d.id and coalesce(x.resolution,'')<>'cleared_for_payout') and not exists(select 1 from public.payment_refunds f where f.obligation_id=d.obligation_id and f.status not in ('failed','cancelled')) then
    select * into o from public.payment_obligations where id=d.obligation_id for update;
    if o.status='disputed' then update public.payment_obligations set status='funded',updated_at=now() where id=o.id; perform app_private.refresh_payout_eligibility(o.id); end if;
  end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'account','PAYMENT_DISPUTE_RESOLVED','payment_dispute',d.id,'dispute_resolution','system_internal',jsonb_build_object('resolution',p_resolution,'reason',p_reason));
end$$;
revoke all on function public.resolve_payment_dispute_command(uuid,text,text) from public,anon;
grant execute on function public.resolve_payment_dispute_command(uuid,text,text) to authenticated;

create or replace function app_private.record_payout_provider_state(p_payout_id uuid,p_adapter text,p_provider_reference text,p_status public.payout_status)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare p public.payouts%rowtype; o public.payment_obligations%rowtype; cash_id uuid; payable_id uuid; tx uuid; event_result text;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_status not in ('processing','paid','failed','blocked') then raise exception 'invalid provider payout state' using errcode='22023'; end if;
  select * into p from public.payouts where id=p_payout_id for update; if not found then raise exception 'payout not found' using errcode='P0002'; end if;
  if lower(btrim(p_adapter))<>coalesce(p.provider_adapter,lower(btrim(p_adapter))) then raise exception 'payout adapter mismatch' using errcode='22023'; end if;
  if p.provider_reference is not null and p.provider_reference<>p_provider_reference then raise exception 'payout reference mismatch' using errcode='22023'; end if;
  select * into o from public.payment_obligations where id=p.obligation_id;
  if p_status='paid' then
    if p.status='paid' then event_result:='duplicate'; else
      cash_id:=app_private.ensure_ledger_account('provider_clearing:'||lower(btrim(p_adapter))||':'||p.currency_code,'asset','system',null,p.currency_code);
      payable_id:=app_private.ensure_ledger_account('provider_payable:'||p.provider_id::text||':'||p.currency_code,'liability','provider',p.provider_id,p.currency_code);
      tx:=app_private.post_balanced_ledger_transaction('provider_payout','payout-paid:'||p.id::text,p_provider_reference,jsonb_build_object('obligation_id',o.id,'payout_id',p.id),jsonb_build_array(
        jsonb_build_object('ledger_account_id',cash_id,'currency_code',p.currency_code,'amount_minor',-p.amount_minor,'obligation_id',o.id),
        jsonb_build_object('ledger_account_id',payable_id,'currency_code',p.currency_code,'amount_minor',p.amount_minor,'obligation_id',o.id)));
      update public.payouts set provider_adapter=lower(btrim(p_adapter)),provider_reference=p_provider_reference,status='paid',block_reason=null,updated_at=now() where id=p.id; event_result:='matched';
    end if;
  elsif p_status='blocked' then
    if p.status='paid' then
      cash_id:=app_private.ensure_ledger_account('provider_clearing:'||lower(btrim(p_adapter))||':'||p.currency_code,'asset','system',null,p.currency_code);
      payable_id:=app_private.ensure_ledger_account('provider_payable:'||p.provider_id::text||':'||p.currency_code,'liability','provider',p.provider_id,p.currency_code);
      tx:=app_private.post_balanced_ledger_transaction('provider_payout_reversal','payout-reversed:'||p.id::text,p_provider_reference,jsonb_build_object('obligation_id',o.id,'payout_id',p.id),jsonb_build_array(
        jsonb_build_object('ledger_account_id',cash_id,'currency_code',p.currency_code,'amount_minor',p.amount_minor,'obligation_id',o.id),
        jsonb_build_object('ledger_account_id',payable_id,'currency_code',p.currency_code,'amount_minor',-p.amount_minor,'obligation_id',o.id)));
    end if;
    update public.payouts set provider_adapter=lower(btrim(p_adapter)),provider_reference=coalesce(provider_reference,p_provider_reference),status='blocked',block_reason='transfer_reversed',updated_at=now() where id=p.id; event_result:='reversed';
  elsif p_status='failed' then
    if p.status<>'paid' then update public.payouts set provider_adapter=lower(btrim(p_adapter)),provider_reference=coalesce(provider_reference,p_provider_reference),status='failed',block_reason='transfer_failed',updated_at=now() where id=p.id; end if; event_result:='failed';
  else
    if p.status not in ('paid','blocked') then update public.payouts set provider_adapter=lower(btrim(p_adapter)),provider_reference=coalesce(provider_reference,p_provider_reference),status='processing',updated_at=now() where id=p.id; end if; event_result:='matched';
  end if;
  insert into public.payout_reconciliations(payout_id,provider_reference,provider_event_type,result,ledger_transaction_id)
  values(p.id,p_provider_reference,'transfer.'||p_status::text,event_result,tx) on conflict(payout_id,provider_reference,provider_event_type) do nothing;
  insert into public.audit_events(actor_type,action,resource_type,resource_id,data_classification,metadata)
  values('system','PAYOUT_PROVIDER_STATE_CHANGED','payout',p.id,'system_internal',jsonb_build_object('status',p_status,'adapter',lower(btrim(p_adapter)),'ledger_transaction_id',tx));
end$$;
