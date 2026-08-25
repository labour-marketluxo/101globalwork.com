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
  blocker:=exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status not in ('failed','cancelled')) or exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout');
  if blocker then return null; end if;
  insert into public.payouts(obligation_id,provider_id,currency_code,amount_minor,status,idempotency_key,last_validated_at)
  values(o.id,o.provider_id,o.currency_code,o.amount_minor,'eligible','payout-eligibility:'||o.id::text,now())
  on conflict(obligation_id) do update set
    status=case when payouts.status in ('eligible','failed','blocked') and coalesce(payouts.block_reason,'') in ('','refund_pending','dispute_open','transfer_failed') then 'eligible'::public.payout_status else payouts.status end,
    block_reason=case when payouts.status in ('eligible','failed','blocked') and coalesce(payouts.block_reason,'') in ('','refund_pending','dispute_open','transfer_failed') then null else payouts.block_reason end,
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
      tx:=app_private.post_balanced_ledger_transaction('provider_payout','payout-paid:'||p.id::text,p_provider_reference,jsonb_build_object('obligation_id',o.id,'payout_id',p.id),jsonb_build_array(jsonb_build_object('ledger_account_id',cash_id,'currency_code',p.currency_code,'amount_minor',-p.amount_minor,'obligation_id',o.id),jsonb_build_object('ledger_account_id',payable_id,'currency_code',p.currency_code,'amount_minor',p.amount_minor,'obligation_id',o.id)));
      update public.payouts set provider_adapter=lower(btrim(p_adapter)),provider_reference=p_provider_reference,status='paid',block_reason=null,updated_at=now() where id=p.id; event_result:='matched';
    end if;
  elsif p_status='blocked' then
    if p.status='paid' then
      cash_id:=app_private.ensure_ledger_account('provider_clearing:'||lower(btrim(p_adapter))||':'||p.currency_code,'asset','system',null,p.currency_code);
      payable_id:=app_private.ensure_ledger_account('provider_payable:'||p.provider_id::text||':'||p.currency_code,'liability','provider',p.provider_id,p.currency_code);
      tx:=app_private.post_balanced_ledger_transaction('provider_payout_reversal','payout-reversed:'||p.id::text,p_provider_reference,jsonb_build_object('obligation_id',o.id,'payout_id',p.id),jsonb_build_array(jsonb_build_object('ledger_account_id',cash_id,'currency_code',p.currency_code,'amount_minor',p.amount_minor,'obligation_id',o.id),jsonb_build_object('ledger_account_id',payable_id,'currency_code',p.currency_code,'amount_minor',-p.amount_minor,'obligation_id',o.id)));
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
