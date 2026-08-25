begin;
create temp table e2e_result(step text, ok boolean, detail text) on commit drop;

do $$
declare
  v_provider_auth uuid := gen_random_uuid();
  v_provider_account uuid;
  v_customer_auth uuid := gen_random_uuid();
  v_customer_account uuid;
  v_trust_auth uuid := gen_random_uuid();
  v_trust_account uuid;
  v_trust_role uuid;
  v_provider_id uuid;
  v_verification_id uuid;
  v_request_id uuid;
  v_market_id uuid := (select id from public.markets where code='NG' limit 1);
  v_service_id uuid := (select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential' limit 1);
  v_location_id uuid := (select id from public.locations where canonical_code='gwarinpa' limit 1);
begin
  if v_market_id is null or v_service_id is null or v_location_id is null then
    raise exception 'Required test seed is missing';
  end if;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
  values
    (v_provider_auth,'authenticated','authenticated','provider-'||substr(v_provider_auth::text,1,8)||'@example.invalid',now(),'{}'::jsonb,jsonb_build_object('display_name','E2E Provider'),now(),now(),false,false),
    (v_customer_auth,'authenticated','authenticated','customer-'||substr(v_customer_auth::text,1,8)||'@example.invalid',now(),'{}'::jsonb,jsonb_build_object('display_name','E2E Customer'),now(),now(),false,false),
    (v_trust_auth,'authenticated','authenticated','trust-'||substr(v_trust_auth::text,1,8)||'@example.invalid',now(),'{}'::jsonb,jsonb_build_object('display_name','E2E Trust'),now(),now(),false,false);

  select id into v_provider_account from public.accounts where auth_user_id=v_provider_auth;
  select id into v_customer_account from public.accounts where auth_user_id=v_customer_auth;
  select id into v_trust_account from public.accounts where auth_user_id=v_trust_auth;
  insert into e2e_result values('account_bootstrap', v_provider_account is not null and v_customer_account is not null and v_trust_account is not null, 'provider/customer/trust accounts');

  select id into v_trust_role from public.platform_roles where role_key='trust_admin';
  insert into public.platform_admin_memberships(account_id,role_id,status,reason) values(v_trust_account,v_trust_role,'active','E2E matching test');

  perform set_config('request.jwt.claim.sub', v_provider_auth::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.aal', 'aal1', true);

  select public.create_provider_command('E2E Plumbing Test', v_market_id, 'e2e-plumbing-'||substr(replace(gen_random_uuid()::text,'-',''),1,8), repeat('Experienced residential plumbing provider for controlled end to end validation. ',2)) into v_provider_id;
  insert into e2e_result values('create_provider', v_provider_id is not null, v_provider_id::text);

  perform public.set_provider_service_command(v_provider_id, v_service_id, true);
  insert into e2e_result values('add_service', exists(select 1 from public.provider_services ps where ps.provider_id=v_provider_id and ps.service_entity_id=v_service_id and ps.is_active), 'service attached');

  perform public.set_provider_service_area_command(v_provider_id, v_location_id, true);
  insert into e2e_result values('add_service_area', exists(select 1 from public.provider_service_areas pa where pa.provider_id=v_provider_id and pa.location_id=v_location_id and pa.is_active), 'area attached');

  perform public.update_provider_profile_command(v_provider_id, 'Trusted plumbing help in Gwarinpa', repeat('Residential plumbing, leak repair and maintenance for homes in Gwarinpa and Abuja. ',2), 5::smallint, true);
  insert into e2e_result values('complete_profile', exists(select 1 from public.provider_onboarding_progress op where op.provider_id=v_provider_id and op.profile_complete), 'profile complete');

  select public.submit_provider_verification_command(v_provider_id, 'identity'::public.verification_kind, 'NG-FCT', 'E2E identity reference') into v_verification_id;
  insert into e2e_result values('submit_verification', exists(select 1 from public.provider_verifications pv where pv.id=v_verification_id and pv.status='pending'), v_verification_id::text);

  perform set_config('request.jwt.claim.sub', v_trust_auth::text, true);
  perform set_config('request.jwt.claim.aal', 'aal2', true);
  perform public.review_provider_verification_command(v_verification_id, 'verified'::public.verification_status, 'E2E trust approval');
  insert into e2e_result values('trust_review', exists(select 1 from public.provider_verifications pv where pv.id=v_verification_id and pv.status='verified'), 'identity verified');

  perform set_config('request.jwt.claim.sub', v_provider_auth::text, true);
  perform set_config('request.jwt.claim.aal', 'aal1', true);
  perform public.publish_provider_profile_command(v_provider_id);
  insert into e2e_result values('publish_provider', exists(select 1 from public.providers p join public.provider_public_profiles pp on pp.provider_id=p.id where p.id=v_provider_id and p.status='active' and pp.is_public and pp.accepts_new_work), 'provider active and public');

  insert into e2e_result values('eligible_matching', exists(select 1 from public.find_eligible_providers(v_service_id,v_location_id,20) m where m.provider_id=v_provider_id), 'provider returned by eligibility function');

  perform set_config('request.jwt.claim.sub', v_customer_auth::text, true);
  select public.create_request_command(v_market_id, 'Fix a leaking pipe under my kitchen sink', 'e2e-'||gen_random_uuid()::text, v_location_id, v_service_id, null, null, 'en-NG', 'Africa/Lagos') into v_request_id;
  insert into e2e_result values('create_request', exists(select 1 from public.requests r where r.id=v_request_id and r.customer_account_id=v_customer_account and r.state='submitted'), v_request_id::text);
  insert into e2e_result values('request_has_match', exists(select 1 from public.find_eligible_providers(v_service_id,v_location_id,20) m where m.provider_id=v_provider_id), 'same service/location match');

  insert into e2e_result values('audit_request_created', exists(select 1 from public.audit_events ae where ae.resource_id=v_request_id and ae.action='REQUEST_CREATED'), 'audit event present');
  insert into e2e_result values('outbox_request_created', exists(select 1 from public.outbox_events oe where oe.aggregate_id=v_request_id and oe.event_type='REQUEST_CREATED'), 'outbox event present');
end $$;

select * from e2e_result order by step;
rollback;
