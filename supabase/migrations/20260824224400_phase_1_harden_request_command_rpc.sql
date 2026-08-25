create or replace function app_private.create_request_authoritatively(p_market_id uuid,p_need_text text,p_idempotency_key text,p_location_id uuid default null,p_service_entity_id uuid default null,p_problem_entity_id uuid default null,p_outcome_entity_id uuid default null,p_locale text default null,p_timezone text default null)
returns uuid language plpgsql security definer set search_path=public,app_private,auth as $$
declare acct uuid; existing_id uuid; request_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 acct:=app_private.current_account_id(); if acct is null then raise exception 'active account required' using errcode='28000'; end if;
 if length(trim(coalesce(p_need_text,'')))<5 then raise exception 'need_text too short' using errcode='22023'; end if;
 if length(p_idempotency_key)<16 then raise exception 'idempotency key too short' using errcode='22023'; end if;
 select id into existing_id from public.requests where idempotency_key=p_idempotency_key; if existing_id is not null then return existing_id; end if;
 insert into public.requests(customer_account_id,market_id,location_id,service_entity_id,problem_entity_id,outcome_entity_id,state,need_text,source,locale,timezone,idempotency_key)
 values(acct,p_market_id,p_location_id,p_service_entity_id,p_problem_entity_id,p_outcome_entity_id,'submitted',trim(p_need_text),'web',p_locale,p_timezone,p_idempotency_key) returning id into request_id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','REQUEST_CREATED','request',request_id,'participant_private',jsonb_build_object('account_id',acct));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('request',request_id,'REQUEST_CREATED',jsonb_build_object('request_id',request_id,'customer_account_id',acct),'request-created:'||p_idempotency_key);
 return request_id;
end $$;
revoke all on function app_private.create_request_authoritatively(uuid,text,text,uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function app_private.create_request_authoritatively(uuid,text,text,uuid,uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.create_request_command(p_market_id uuid,p_need_text text,p_idempotency_key text,p_location_id uuid default null,p_service_entity_id uuid default null,p_problem_entity_id uuid default null,p_outcome_entity_id uuid default null,p_locale text default null,p_timezone text default null)
returns uuid language sql security invoker set search_path=app_private as $$
 select app_private.create_request_authoritatively(p_market_id,p_need_text,p_idempotency_key,p_location_id,p_service_entity_id,p_problem_entity_id,p_outcome_entity_id,p_locale,p_timezone)
$$;
revoke all on function public.create_request_command(uuid,text,text,uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.create_request_command(uuid,text,text,uuid,uuid,uuid,uuid,text,text) to authenticated;
