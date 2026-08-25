revoke all on public.payment_provider_events, public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.payment_reconciliations from service_role;

create or replace function app_private.ensure_ledger_account(p_code text,p_kind public.ledger_account_kind,p_owner_kind public.ledger_owner_kind,p_owner_id uuid,p_currency text)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare v_id uuid;
begin
  insert into public.ledger_accounts(account_code,account_kind,owner_kind,owner_id,currency_code) values(p_code,p_kind,p_owner_kind,p_owner_id,upper(p_currency))
  on conflict(account_code) do update set is_active=true returning id into v_id;
  return v_id;
end $$;

create or replace function app_private.post_balanced_ledger_transaction(p_transaction_type text,p_idempotency_key text,p_external_reference text,p_metadata jsonb,p_entries jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare tx uuid; e jsonb; v_currency text; v_sum bigint;
begin
  if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<2 then raise exception 'at least two ledger entries required' using errcode='22023'; end if;
  for v_currency in select distinct upper(x->>'currency_code') from jsonb_array_elements(p_entries) x loop
    select coalesce(sum((x->>'amount_minor')::bigint),0) into v_sum from jsonb_array_elements(p_entries) x where upper(x->>'currency_code')=v_currency;
    if v_sum<>0 then raise exception 'unbalanced ledger transaction for currency %',v_currency using errcode='23514'; end if;
  end loop;
  select id into tx from public.ledger_transactions where idempotency_key=p_idempotency_key;
  if tx is not null then return tx; end if;
  insert into public.ledger_transactions(transaction_type,external_reference,idempotency_key,metadata) values(p_transaction_type,p_external_reference,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb)) returning id into tx;
  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.ledger_entries(transaction_id,ledger_account_id,currency_code,amount_minor,obligation_id) values(tx,(e->>'ledger_account_id')::uuid,upper(e->>'currency_code'),(e->>'amount_minor')::bigint,nullif(e->>'obligation_id','')::uuid);
  end loop;
  return tx;
end $$;

create or replace function app_private.create_payment_attempt_authoritatively(p_obligation_id uuid,p_provider_adapter text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare o public.payment_obligations%rowtype; attempt_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into o from public.payment_obligations where id=p_obligation_id for update;
  if not found then raise exception 'payment obligation not found' using errcode='P0002'; end if;
  if o.customer_account_id<>app_private.current_account_id() then raise exception 'forbidden' using errcode='42501'; end if;
  if o.status not in ('pending','funding') then raise exception 'payment obligation is not payable' using errcode='22023'; end if;
  select id into attempt_id from public.payment_attempts where idempotency_key=p_idempotency_key;
  if attempt_id is not null then return attempt_id; end if;
  insert into public.payment_attempts(obligation_id,provider_adapter,amount_minor,currency_code,status,idempotency_key) values(o.id,lower(btrim(p_provider_adapter)),o.amount_minor,o.currency_code,'created',p_idempotency_key) returning id into attempt_id;
  update public.payment_obligations set status='funding',updated_at=now() where id=o.id and status='pending';
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','PAYMENT_ATTEMPT_CREATED','payment_attempt',attempt_id,'participant_private',jsonb_build_object('obligation_id',o.id,'provider_adapter',lower(btrim(p_provider_adapter))));
  return attempt_id;
end $$;
create or replace function public.create_payment_attempt_command(p_obligation_id uuid,p_provider_adapter text,p_idempotency_key text)
returns uuid language sql security invoker set search_path='app_private' as $$ select app_private.create_payment_attempt_authoritatively(p_obligation_id,p_provider_adapter,p_idempotency_key) $$;
revoke execute on function public.create_payment_attempt_command(uuid,text,text) from anon,public;
grant execute on function public.create_payment_attempt_command(uuid,text,text) to authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.create_payment_attempt_authoritatively(uuid,text,text) to authenticated;

create or replace function app_private.refresh_payout_eligibility(p_obligation_id uuid)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare o public.payment_obligations%rowtype; r public.requests%rowtype; payout_id uuid;
begin
  select * into o from public.payment_obligations where id=p_obligation_id;
  if not found or o.status<>'funded' then return null; end if;
  select * into r from public.requests where id=o.request_id;
  if r.state<>'completed' then return null; end if;
  insert into public.payouts(obligation_id,provider_id,currency_code,amount_minor,status,idempotency_key) values(o.id,o.provider_id,o.currency_code,o.amount_minor,'eligible','payout-eligibility:'||o.id::text)
  on conflict(obligation_id) do update set updated_at=now() returning id into payout_id;
  return payout_id;
end $$;

create or replace function app_private.ingest_provider_event_authoritatively(p_provider_adapter text,p_provider_event_id text,p_event_type text,p_payload_sha256 text,p_payment_attempt_id uuid,p_signature_verified boolean)
returns uuid language plpgsql security definer set search_path='public','app_private' as $$
declare ev uuid; a public.payment_attempts%rowtype; o public.payment_obligations%rowtype; cash_id uuid; payable_id uuid; tx uuid;
begin
  if not p_signature_verified then
    insert into public.payment_provider_events(provider_adapter,provider_event_id,event_type,status,signature_verified,payload_sha256,payment_attempt_id,rejection_reason) values(lower(btrim(p_provider_adapter)),p_provider_event_id,p_event_type,'rejected',false,p_payload_sha256,p_payment_attempt_id,'signature_not_verified')
    on conflict(provider_adapter,provider_event_id) do update set rejection_reason='signature_not_verified' returning id into ev; return ev;
  end if;
  insert into public.payment_provider_events(provider_adapter,provider_event_id,event_type,status,signature_verified,payload_sha256,payment_attempt_id,verified_at) values(lower(btrim(p_provider_adapter)),p_provider_event_id,p_event_type,'verified',true,p_payload_sha256,p_payment_attempt_id,now())
  on conflict(provider_adapter,provider_event_id) do update set signature_verified=true,status=case when public.payment_provider_events.status='reconciled' then 'reconciled' else 'verified' end,verified_at=coalesce(public.payment_provider_events.verified_at,now()) returning id into ev;
  if exists(select 1 from public.payment_reconciliations where provider_event_id=ev) then return ev; end if;
  select * into a from public.payment_attempts where id=p_payment_attempt_id for update; if not found then raise exception 'payment attempt not found' using errcode='P0002'; end if;
  select * into o from public.payment_obligations where id=a.obligation_id for update;
  if lower(btrim(p_provider_adapter))<>a.provider_adapter then raise exception 'provider adapter mismatch' using errcode='22023'; end if;
  if a.amount_minor<>o.amount_minor or a.currency_code<>o.currency_code then
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'mismatch',jsonb_build_object('reason','amount_or_currency_mismatch'));
    update public.payment_provider_events set status='rejected',rejection_reason='amount_or_currency_mismatch' where id=ev; return ev;
  end if;
  if p_event_type='payment_succeeded' then
    cash_id:=app_private.ensure_ledger_account('provider_clearing:'||a.provider_adapter||':'||o.currency_code,'asset','system',null,o.currency_code);
    payable_id:=app_private.ensure_ledger_account('provider_payable:'||o.provider_id::text||':'||o.currency_code,'liability','provider',o.provider_id,o.currency_code);
    tx:=app_private.post_balanced_ledger_transaction('payment_funded','provider-event:'||lower(btrim(p_provider_adapter))||':'||p_provider_event_id,p_provider_event_id,jsonb_build_object('obligation_id',o.id,'attempt_id',a.id),jsonb_build_array(jsonb_build_object('ledger_account_id',cash_id,'currency_code',o.currency_code,'amount_minor',o.amount_minor,'obligation_id',o.id),jsonb_build_object('ledger_account_id',payable_id,'currency_code',o.currency_code,'amount_minor',-o.amount_minor,'obligation_id',o.id)));
    update public.payment_attempts set status='succeeded',provider_reference=coalesce(provider_reference,p_provider_event_id),updated_at=now() where id=a.id;
    update public.payment_obligations set status='funded',updated_at=now() where id=o.id;
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,ledger_transaction_id,result) values(ev,a.id,o.id,tx,'matched');
    update public.payment_provider_events set status='reconciled',reconciled_at=now() where id=ev;
    perform app_private.refresh_payout_eligibility(o.id);
    insert into public.audit_events(actor_type,action,resource_type,resource_id,data_classification,metadata) values('system','PAYMENT_RECONCILED','payment_obligation',o.id,'system_internal',jsonb_build_object('provider_event_id',ev,'ledger_transaction_id',tx));
    insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('payment_obligation',o.id,'PAYMENT_FUNDED',jsonb_build_object('payment_attempt_id',a.id,'ledger_transaction_id',tx),'payment-funded:'||o.id::text) on conflict(idempotency_key) do nothing;
  elsif p_event_type='payment_failed' then
    update public.payment_attempts set status='failed',updated_at=now() where id=a.id; update public.payment_obligations set status='pending',updated_at=now() where id=o.id and status='funding';
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'matched',jsonb_build_object('outcome','failed')); update public.payment_provider_events set status='reconciled',reconciled_at=now() where id=ev;
  else
    insert into public.payment_reconciliations(provider_event_id,payment_attempt_id,obligation_id,result,details) values(ev,a.id,o.id,'ignored',jsonb_build_object('event_type',p_event_type)); update public.payment_provider_events set status='reconciled',reconciled_at=now() where id=ev;
  end if;
  return ev;
end $$;
create or replace function public.ingest_payment_provider_event_command(p_provider_adapter text,p_provider_event_id text,p_event_type text,p_payload_sha256 text,p_payment_attempt_id uuid,p_signature_verified boolean)
returns uuid language sql security invoker set search_path='app_private' as $$ select app_private.ingest_provider_event_authoritatively(p_provider_adapter,p_provider_event_id,p_event_type,p_payload_sha256,p_payment_attempt_id,p_signature_verified) $$;
revoke execute on function public.ingest_payment_provider_event_command(text,text,text,text,uuid,boolean) from anon,authenticated,public;
grant execute on function public.ingest_payment_provider_event_command(text,text,text,text,uuid,boolean) to service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.ingest_provider_event_authoritatively(text,text,text,text,uuid,boolean) to service_role;

create or replace function app_private.accept_quote_authoritatively(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare q public.quotes%rowtype; r public.requests%rowtype; aid uuid; oid uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into q from public.quotes where id=p_quote_id for update; if not found then raise exception 'quote not found' using errcode='P0002'; end if;
  select * into r from public.requests where id=q.request_id for update; if r.customer_account_id<>app_private.current_account_id() then raise exception 'forbidden' using errcode='42501'; end if;
  if q.status<>'submitted' then raise exception 'quote is not available for acceptance' using errcode='22023'; end if;
  if q.valid_until is not null and q.valid_until<=now() then update public.quotes set status='expired',updated_at=now() where id=q.id; raise exception 'quote has expired' using errcode='22023'; end if;
  if r.state not in ('quoted','matching','submitted') then raise exception 'request cannot accept a quote in current state' using errcode='22023'; end if;
  if exists(select 1 from public.assignments a where a.request_id=r.id and a.status='active') then raise exception 'request already has an active assignment' using errcode='23505'; end if;
  update public.quotes set status='accepted',accepted_at=now(),updated_at=now() where id=q.id; update public.quotes set status='declined',updated_at=now() where request_id=r.id and id<>q.id and status='submitted';
  insert into public.assignments(request_id,provider_id,accepted_quote_id) values(r.id,q.provider_id,q.id) returning id into aid;
  insert into public.payment_obligations(request_id,assignment_id,quote_id,customer_account_id,provider_id,currency_code,amount_minor,idempotency_key) values(r.id,aid,q.id,r.customer_account_id,q.provider_id,q.currency_code,q.total_minor,'quote-obligation:'||q.id::text) returning id into oid;
  update public.requests set state='accepted',updated_at=now() where id=r.id;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','QUOTE_ACCEPTED','assignment',aid,'participant_private',jsonb_build_object('request_id',r.id,'quote_id',q.id,'provider_id',q.provider_id,'payment_obligation_id',oid));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('request',r.id,'QUOTE_ACCEPTED',jsonb_build_object('assignment_id',aid,'quote_id',q.id,'provider_id',q.provider_id,'payment_obligation_id',oid),'quote-accepted:'||q.id::text); return aid;
end $$;

create or replace function app_private.approve_assignment_completion_authoritatively(p_assignment_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; actor_account uuid; approval_id uuid; obligation_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if; actor_account:=app_private.current_account_id();
  select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
  select * into r from public.requests where id=a.request_id for update; if r.customer_account_id<>actor_account then raise exception 'forbidden' using errcode='42501'; end if;
  if r.state<>'submitted_for_approval' then raise exception 'work must be submitted for approval' using errcode='22023'; end if;
  if not exists(select 1 from public.work_evidence where assignment_id=a.id) then raise exception 'completion evidence required' using errcode='22023'; end if;
  insert into public.completion_approvals(assignment_id,request_id,customer_account_id,note) values(a.id,r.id,actor_account,nullif(btrim(coalesce(p_note,'')),'')) returning id into approval_id;
  update public.assignments set status='completed',ended_at=now() where id=a.id; update public.requests set state='completed' where id=r.id;
  select id into obligation_id from public.payment_obligations where assignment_id=a.id; if obligation_id is not null then perform app_private.refresh_payout_eligibility(obligation_id); end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','ASSIGNMENT_COMPLETION_APPROVED','assignment',a.id,'participant_private',jsonb_build_object('approval_id',approval_id));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'ASSIGNMENT_COMPLETION_APPROVED',jsonb_build_object('request_id',r.id,'approval_id',approval_id),'assignment-completed:'||a.id::text); return approval_id;
end $$;
