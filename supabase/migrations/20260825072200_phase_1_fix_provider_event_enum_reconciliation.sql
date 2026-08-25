create or replace function app_private.ingest_provider_event_authoritatively(p_provider_adapter text,p_provider_event_id text,p_event_type text,p_payload_sha256 text,p_payment_attempt_id uuid,p_signature_verified boolean)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare ev uuid; a public.payment_attempts%rowtype; o public.payment_obligations%rowtype; cash_id uuid; payable_id uuid; tx uuid;
begin
  if not p_signature_verified then
    insert into public.payment_provider_events(provider_adapter,provider_event_id,event_type,status,signature_verified,payload_sha256,payment_attempt_id,rejection_reason)
    values(lower(btrim(p_provider_adapter)),p_provider_event_id,p_event_type,'rejected'::public.provider_event_status,false,p_payload_sha256,p_payment_attempt_id,'signature_not_verified')
    on conflict(provider_adapter,provider_event_id) do update set rejection_reason='signature_not_verified' returning id into ev;
    return ev;
  end if;
  insert into public.payment_provider_events(provider_adapter,provider_event_id,event_type,status,signature_verified,payload_sha256,payment_attempt_id,verified_at)
  values(lower(btrim(p_provider_adapter)),p_provider_event_id,p_event_type,'verified'::public.provider_event_status,true,p_payload_sha256,p_payment_attempt_id,now())
  on conflict(provider_adapter,provider_event_id) do update set signature_verified=true,status=case when public.payment_provider_events.status='reconciled'::public.provider_event_status then 'reconciled'::public.provider_event_status else 'verified'::public.provider_event_status end,verified_at=coalesce(public.payment_provider_events.verified_at,now()) returning id into ev;
  if exists(select 1 from public.payment_reconciliations where provider_event_id=ev) then return ev; end if;
  select * into a from public.payment_attempts where id=p_payment_attempt_id for update; if not found then raise exception 'payment attempt not found' using errcode='P0002'; end if;
  select * into o from public.payment_obligations where id=a.obligation_id for update;
  if lower(btrim(p_provider_adapter))<>a.provider_adapter then raise exception 'provider adapter mismatch' using errcode='22023'; end if;
  if a.amount_minor<>o.amount_minor or a.currency_code<>o.currency_code then
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'mismatch',jsonb_build_object('reason','amount_or_currency_mismatch'));
    update public.payment_provider_events set status='rejected'::public.provider_event_status,rejection_reason='amount_or_currency_mismatch' where id=ev; return ev;
  end if;
  if p_event_type='payment_succeeded' then
    cash_id:=app_private.ensure_ledger_account('provider_clearing:'||a.provider_adapter||':'||o.currency_code,'asset','system',null,o.currency_code);
    payable_id:=app_private.ensure_ledger_account('provider_payable:'||o.provider_id::text||':'||o.currency_code,'liability','provider',o.provider_id,o.currency_code);
    tx:=app_private.post_balanced_ledger_transaction('payment_funded','provider-event:'||lower(btrim(p_provider_adapter))||':'||p_provider_event_id,p_provider_event_id,jsonb_build_object('obligation_id',o.id,'attempt_id',a.id),jsonb_build_array(jsonb_build_object('ledger_account_id',cash_id,'currency_code',o.currency_code,'amount_minor',o.amount_minor,'obligation_id',o.id),jsonb_build_object('ledger_account_id',payable_id,'currency_code',o.currency_code,'amount_minor',-o.amount_minor,'obligation_id',o.id)));
    update public.payment_attempts set status='succeeded',provider_reference=coalesce(provider_reference,p_provider_event_id),updated_at=now() where id=a.id;
    update public.payment_obligations set status='funded',updated_at=now() where id=o.id;
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,ledger_transaction_id,result) values(ev,a.id,o.id,tx,'matched');
    update public.payment_provider_events set status='reconciled'::public.provider_event_status,reconciled_at=now() where id=ev;
    perform app_private.refresh_payout_eligibility(o.id);
    insert into public.audit_events(actor_type,action,resource_type,resource_id,data_classification,metadata) values('system','PAYMENT_RECONCILED','payment_obligation',o.id,'system_internal',jsonb_build_object('provider_event_id',ev,'ledger_transaction_id',tx));
    insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('payment_obligation',o.id,'PAYMENT_FUNDED',jsonb_build_object('payment_attempt_id',a.id,'ledger_transaction_id',tx),'payment-funded:'||o.id::text) on conflict(idempotency_key) do nothing;
  elsif p_event_type='payment_failed' then
    update public.payment_attempts set status='failed',updated_at=now() where id=a.id; update public.payment_obligations set status='pending',updated_at=now() where id=o.id and status='funding';
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'matched',jsonb_build_object('outcome','failed')); update public.payment_provider_events set status='reconciled'::public.provider_event_status,reconciled_at=now() where id=ev;
  else
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'ignored',jsonb_build_object('event_type',p_event_type)); update public.payment_provider_events set status='reconciled'::public.provider_event_status,reconciled_at=now() where id=ev;
  end if;
  return ev;
end $$;
