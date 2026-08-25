-- Rollback-safe financial integrity test. No synthetic data persists.
begin;
create temp table pay_result(step text, ok boolean, detail text) on commit drop;
do $$
declare
  v_market uuid := (select id from public.markets where code='NG' limit 1);
  v_service uuid := (select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential' limit 1);
  v_location uuid := (select id from public.locations where canonical_code='gwarinpa' limit 1);
  v_provider_auth uuid := gen_random_uuid(); v_provider uuid; v_verification uuid;
  v_reviewer_auth uuid := gen_random_uuid(); v_reviewer_account uuid; v_trust_role uuid;
  v_finance_auth uuid := gen_random_uuid(); v_finance_account uuid; v_finance_role uuid; v_refund uuid;
  v_customer_auth uuid := gen_random_uuid(); v_request uuid; v_quote uuid; v_assignment uuid; v_obligation uuid; v_attempt uuid; v_event uuid; v_payout uuid;
  blocked boolean;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values(v_provider_auth,'authenticated','authenticated','p-'||substr(v_provider_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
  select public.create_provider_command('Payment Test Provider',v_market,'pay-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),repeat('Experienced residential provider with clear scope and reliable delivery. ',2)) into v_provider;
  perform public.set_provider_service_command(v_provider,v_service,true); perform public.set_provider_service_area_command(v_provider,v_location,true); perform public.update_provider_profile_command(v_provider,'Payment test provider',repeat('Experienced residential provider serving Gwarinpa with reliable delivery and clear scope. ',2),5::smallint,true);
  select public.submit_provider_verification_command(v_provider,'identity','NG-FCT','PAY TEST') into v_verification;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values(v_reviewer_auth,'authenticated','authenticated','r-'||substr(v_reviewer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  select id into v_reviewer_account from public.accounts where auth_user_id=v_reviewer_auth;
  select id into v_trust_role from public.platform_roles where role_key='trust_admin' and is_active;
  insert into public.platform_admin_memberships(account_id,role_id,status,reason) values(v_reviewer_account,v_trust_role,'active','rollback-safe financial integrity test');
  perform set_config('request.jwt.claim.sub',v_reviewer_auth::text,true);
  perform public.review_provider_verification_command(v_verification,'verified','test');
  insert into pay_result values('trust_admin_review',exists(select 1 from public.provider_verifications where id=v_verification and status='verified'),'canonical Trust Admin capability can perform review');

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true); perform public.publish_provider_profile_command(v_provider);
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values(v_customer_auth,'authenticated','authenticated','c-'||substr(v_customer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true); select public.create_request_command(v_market,'Payment-safe test work','pay-request-'||gen_random_uuid()::text,v_location,v_service,null,null,'en-NG','Africa/Lagos') into v_request;
  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true); select public.submit_quote_command(v_request,v_provider,'NGN',4200000,'Test quote','{}'::jsonb,now()+interval '2 days','pay-quote-'||gen_random_uuid()::text) into v_quote;
  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true); select public.accept_quote_command(v_quote) into v_assignment;
  select id into v_obligation from public.payment_obligations where assignment_id=v_assignment;
  insert into pay_result values('obligation_created',v_obligation is not null,'quote acceptance created obligation');
  select public.create_payment_attempt_command(v_obligation,'testpay','attempt-'||gen_random_uuid()::text) into v_attempt;
  insert into pay_result values('attempt_created',exists(select 1 from public.payment_attempts where id=v_attempt and status='created'),'customer attempt');
  select app_private.ingest_provider_event_authoritatively('testpay','evt-'||gen_random_uuid()::text,'payment_succeeded',repeat('a',64),v_attempt,true) into v_event;
  insert into pay_result values('provider_event_reconciled',exists(select 1 from public.payment_provider_events where id=v_event and status='reconciled' and signature_verified),'verified provider event');
  insert into pay_result values('obligation_funded',exists(select 1 from public.payment_obligations where id=v_obligation and status='funded'),'financial truth from reconciliation');
  insert into pay_result values('ledger_balanced',not exists(select 1 from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id where e.obligation_id=v_obligation group by t.id,e.currency_code having sum(e.amount_minor)<>0),'double entry sums zero');

  -- Domain separation: Trust Admin must not be able to request a refund.
  perform set_config('request.jwt.claim.sub',v_reviewer_auth::text,true);
  blocked := false;
  begin
    perform public.request_refund_command(v_obligation,100000,'authorization separation test','trust-refund-'||gen_random_uuid()::text);
  exception when insufficient_privilege then
    blocked := true;
  end;
  insert into pay_result values('trust_admin_refund_blocked',blocked,'Trust Admin cannot operate Money');

  -- Canonical Finance Admin can create the authoritative refund request.
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values(v_finance_auth,'authenticated','authenticated','f-'||substr(v_finance_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  select id into v_finance_account from public.accounts where auth_user_id=v_finance_auth;
  select id into v_finance_role from public.platform_roles where role_key='finance_admin' and is_active;
  insert into public.platform_admin_memberships(account_id,role_id,status,reason) values(v_finance_account,v_finance_role,'active','rollback-safe financial integrity test');
  perform set_config('request.jwt.claim.sub',v_finance_auth::text,true);
  select public.request_refund_command(v_obligation,100000,'rollback-safe finance test','finance-refund-'||gen_random_uuid()::text) into v_refund;
  insert into pay_result values('finance_admin_refund_requested',exists(select 1 from public.payment_refunds where id=v_refund and status='requested'),'canonical Finance Admin can create audited refund request');

  select app_private.refresh_payout_eligibility(v_obligation) into v_payout; insert into pay_result values('payout_blocked_before_completion',v_payout is null,'funding alone insufficient');
  update public.requests set state='scheduled' where id=v_request; update public.requests set state='in_progress' where id=v_request; update public.requests set state='submitted_for_approval' where id=v_request; update public.requests set state='completed' where id=v_request;
  select app_private.refresh_payout_eligibility(v_obligation) into v_payout; insert into pay_result values('payout_eligible_after_completion',v_payout is not null and exists(select 1 from public.payouts where id=v_payout and status='eligible'),'requires funded + completed');
  insert into pay_result values('reconciliation_recorded',exists(select 1 from public.payment_reconciliations where provider_event_id=v_event and result='matched'),'provider truth reconciled');
end $$;
select * from pay_result order by step;
rollback;
