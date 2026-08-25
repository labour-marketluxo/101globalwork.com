-- Runs entirely in a transaction and rolls back all synthetic users/data.
begin;
create temp table tx_result(step text, ok boolean, detail text) on commit drop;
do $$
declare
  v_market uuid := (select id from public.markets where code='NG' limit 1);
  v_service uuid := (select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential' limit 1);
  v_location uuid := (select id from public.locations where canonical_code='gwarinpa' limit 1);
  v_provider_auth uuid := gen_random_uuid(); v_provider uuid; v_verification uuid;
  v_reviewer_auth uuid := gen_random_uuid(); v_reviewer_account uuid;
  v_customer_auth uuid := gen_random_uuid(); v_request uuid; v_quote uuid; v_assignment uuid;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_provider_auth,'authenticated','authenticated','provider-'||substr(v_provider_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select public.create_provider_command('Transaction E2E Provider',v_market,'tx-e2e-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),repeat('Qualified residential plumber serving households with repairs and maintenance. ',2)) into v_provider;
  perform public.set_provider_service_command(v_provider,v_service,true);
  perform public.set_provider_service_area_command(v_provider,v_location,true);
  perform public.update_provider_profile_command(v_provider,'Residential plumbing specialist',repeat('Qualified residential plumber serving Gwarinpa and Abuja with clear scopes and reliable maintenance. ',2),7::smallint,true);
  select public.submit_provider_verification_command(v_provider,'identity','NG-FCT','TX E2E identity') into v_verification;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_reviewer_auth,'authenticated','authenticated','reviewer-'||substr(v_reviewer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  select id into v_reviewer_account from public.accounts where auth_user_id=v_reviewer_auth;
  insert into public.account_capabilities(account_id,capability) values(v_reviewer_account,'platform.verification.review');
  perform set_config('request.jwt.claim.sub',v_reviewer_auth::text,true);
  perform public.review_provider_verification_command(v_verification,'verified','controlled test approval');

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  perform public.publish_provider_profile_command(v_provider);

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values(v_customer_auth,'authenticated','authenticated','customer-'||substr(v_customer_auth::text,1,8)||'@example.invalid',now(),'{}','{}',now(),now(),false,false);
  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.create_request_command(v_market,'Repair a leaking kitchen pipe','tx-request-'||gen_random_uuid()::text,v_location,v_service,null,null,'en-NG','Africa/Lagos') into v_request;

  perform set_config('request.jwt.claim.sub',v_provider_auth::text,true);
  select public.submit_quote_command(v_request,v_provider,'NGN',3500000,'Labour and standard fittings included','{}'::jsonb,now()+interval '2 days','tx-quote-'||gen_random_uuid()::text) into v_quote;

  perform set_config('request.jwt.claim.sub',v_customer_auth::text,true);
  select public.accept_quote_command(v_quote) into v_assignment;

  insert into tx_result values('provider_published',exists(select 1 from public.provider_public_profiles where provider_id=v_provider and is_public),'published');
  insert into tx_result values('quote_accepted',exists(select 1 from public.quotes where id=v_quote and status='accepted'),'accepted');
  insert into tx_result values('assignment_created',exists(select 1 from public.assignments where id=v_assignment and status='active'),'active');
  insert into tx_result values('request_accepted',exists(select 1 from public.requests where id=v_request and state='accepted'),'accepted');
  insert into tx_result values('audit_evidence',exists(select 1 from public.audit_events where resource_id=v_assignment and action='QUOTE_ACCEPTED'),'present');
  insert into tx_result values('outbox_evidence',exists(select 1 from public.outbox_events where aggregate_id=v_request and event_type='QUOTE_ACCEPTED'),'present');
end $$;
select * from tx_result order by step;
rollback;
