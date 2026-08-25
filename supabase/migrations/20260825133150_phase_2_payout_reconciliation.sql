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
