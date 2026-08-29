-- Rollback-safe: prove paid work cannot start before funding and can proceed after reconciliation.
begin;
create temp table funding_gate_result(step text, ok boolean, detail text) on commit drop;
do $$
declare
  v_market uuid := (select id from public.markets where code='NG' limit 1);
  v_service uuid := (select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential' limit 1);
  v_location uuid := (select id from public.locations where canonical_code='gwarinpa' limit 1);
  v_provider_auth uuid := gen_random_uuid();
  v_provider uuid;
  v_verification uuid;
  v_reviewer_auth uuid := gen_random_uuid();
  v_reviewer_account uuid;
  v_trust_role uuid;
  v_customer_auth uuid := gen_random_uuid();
  v_request uuid;
  v_quote uuid;
  v_assignment uuid;
  v_obligation uuid;
  v_attempt uuid;
  v_evidence uuid;
  v_approval uuid;
  blocked boolean := false;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_provider_auth,'authenticated','authenticated','funding-provider-'||substr(v_provider_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select public.create_provider_command('Funding Gate Provider',v_market,'funding-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),repeat('Experienced provider completing paid work only after protected customer funding. ',2)) into v_provider;
  perform public.set_provider_service_command(v_provider,v_service,true);
  perform public.set_provider_service_area_command(v_provider,v_location,true);
  perform public.update_provider_profile_command(v_provider,'Funding gate provider',repeat('Experienced provider serving customers with clear scope and reliable completion evidence. ',2),5::smallint,true);
  select public.submit_provider_verification_command(v_provider,'identity','NG-FCT','FUNDING TEST') into v_verification;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_reviewer_auth,'authenticated','authenticated','funding-reviewer-'||substr(v_reviewer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  select id into v_reviewer_account from public.accounts where auth_user_id=v_reviewer_auth;
  select id into v_trust_role from public.platform_roles where role_key='trust_admin' and is_active;
  insert into public.platform_admin_memberships(account_id,role_id,status,reason) values(v_reviewer_account,v_trust_role,'active','rollback-safe funding gate test');
  perform set_config('request.jwt.claim.sub',v_reviewer_auth::text,true);
  perform public.review_provider_verification_command(v_verification,'verified','funding gate test');

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform public.publish_provider_profile_command(v_provider);

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_customer_auth,'authenticated','authenticated','funding-customer-'||substr(v_customer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.create_request_command(v_market,'Funding-gated paid work','funding-request-'||gen_random_uuid()::text,v_location,v_service,null,null,'en-NG','Africa/Lagos') into v_request;

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  select public.submit_quote_command(v_request,v_provider,'NGN',250000,'Funding gate quote','{}'::jsonb,now()+interval '2 days','funding-quote-'||gen_random_uuid()::text) into v_quote;

  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.accept_quote_command(v_quote) into v_assignment;
  select id into v_obligation from public.payment_obligations where assignment_id=v_assignment;
  insert into funding_gate_result values('obligation_created',v_obligation is not null,'accepted paid quote creates payment obligation');

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform public.schedule_assignment_command(v_assignment,now()+interval '1 hour',now()+interval '2 hours','Africa/Lagos','funding gate test');

  blocked := false;
  begin
    perform public.start_assignment_command(v_assignment);
  exception when others then
    if sqlerrm like '%customer payment must be funded before paid work starts%' then blocked := true; else raise; end if;
  end;
  insert into funding_gate_result values('start_blocked_before_funding',blocked,'provider cannot start paid work while obligation is pending');
  insert into funding_gate_result values('state_still_scheduled',exists(select 1 from public.requests where id=v_request and state='scheduled'),'failed start leaves authoritative work state unchanged');

  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.create_payment_attempt_command(v_obligation,'paystack','funding-attempt-'||gen_random_uuid()::text) into v_attempt;
  perform app_private.ingest_provider_event_authoritatively('paystack','funding-event-'||gen_random_uuid()::text,'payment_succeeded',repeat('b',64),v_attempt,true);
  insert into funding_gate_result values('payment_reconciled',exists(select 1 from public.payment_obligations where id=v_obligation and status='funded'),'verified provider event funds obligation');

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform public.start_assignment_command(v_assignment);
  insert into funding_gate_result values('start_allowed_after_funding',exists(select 1 from public.requests where id=v_request and state='in_progress'),'same assignment can start after financial truth becomes funded');
  select public.submit_work_evidence_command(v_assignment,'note','Work completed for funding gate regression',null,null,'funding-evidence-'||gen_random_uuid()::text) into v_evidence;

  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.approve_assignment_completion_command(v_assignment,'Approved in rollback-safe funding gate regression') into v_approval;
  insert into funding_gate_result values('completion_after_funding',v_approval is not null and exists(select 1 from public.requests where id=v_request and state='completed'),'funded work can complete through authoritative evidence and approval commands');
end $$;
select * from funding_gate_result order by step;
rollback;
