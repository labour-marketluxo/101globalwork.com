begin;

do $$
declare
  owner_auth uuid := gen_random_uuid();
  owner_account uuid;
  super_auth uuid := gen_random_uuid();
  super_account uuid;
  trust_auth uuid := gen_random_uuid();
  trust_account uuid;
  finance_auth uuid := gen_random_uuid();
  finance_account uuid;
  auditor_auth uuid := gen_random_uuid();
  auditor_account uuid;
  super_role uuid;
  trust_role uuid;
  finance_role uuid;
  auditor_role uuid;
  blocked boolean;
begin
  insert into auth.users(id,is_sso_user,is_anonymous) values
    (owner_auth,false,false),(super_auth,false,false),(trust_auth,false,false),(finance_auth,false,false),(auditor_auth,false,false);

  select id into owner_account from public.accounts where auth_user_id=owner_auth;
  select id into super_account from public.accounts where auth_user_id=super_auth;
  select id into trust_account from public.accounts where auth_user_id=trust_auth;
  select id into finance_account from public.accounts where auth_user_id=finance_auth;
  select id into auditor_account from public.accounts where auth_user_id=auditor_auth;

  if owner_account is null or super_account is null or trust_account is null or finance_account is null or auditor_account is null then
    raise exception 'account bootstrap trigger failed';
  end if;

  delete from public.platform_ownership;
  insert into public.platform_ownership(singleton,owner_account_id) values(true,owner_account);

  select id into super_role from public.platform_roles where role_key='super_admin';
  select id into trust_role from public.platform_roles where role_key='trust_admin';
  select id into finance_role from public.platform_roles where role_key='finance_admin';
  select id into auditor_role from public.platform_roles where role_key='auditor';

  insert into public.platform_admin_memberships(account_id,role_id,status) values
    (super_account,super_role,'active'),(trust_account,trust_role,'active'),(finance_account,finance_role,'active'),(auditor_account,auditor_role,'active');

  perform set_config('request.jwt.claim.sub',super_auth::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  if not app_private.current_account_has_platform_capability('platform.admin.manage') then
    raise exception 'super admin missing admin.manage';
  end if;

  blocked := false;
  begin
    perform public.revoke_platform_role_command(owner_account,'super_admin','authorization test');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'owner revocation was not blocked'; end if;

  blocked := false;
  begin
    perform public.grant_platform_role_command(trust_account,'super_admin','authorization test');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'non-owner super-admin grant was not blocked'; end if;

  perform set_config('request.jwt.claim.sub',trust_auth::text,true);
  if not app_private.current_account_has_platform_capability('platform.trust.verify') then raise exception 'trust admin missing trust.verify'; end if;
  if app_private.current_account_has_platform_capability('platform.money.refund') then raise exception 'trust admin incorrectly has money.refund'; end if;

  perform set_config('request.jwt.claim.sub',finance_auth::text,true);
  if not app_private.current_account_has_platform_capability('platform.money.refund') then raise exception 'finance admin missing money.refund'; end if;
  if app_private.current_account_has_platform_capability('platform.trust.verify') then raise exception 'finance admin incorrectly has trust.verify'; end if;

  perform set_config('request.jwt.claim.sub',auditor_auth::text,true);
  if not app_private.current_account_has_platform_capability('platform.admin.view_audit') then raise exception 'auditor missing view_audit'; end if;
  if app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'auditor incorrectly has admin.manage'; end if;
  if app_private.current_account_has_platform_capability('platform.money.refund') then raise exception 'auditor incorrectly has money.refund'; end if;
end $$;

rollback;
select 'authorization_matrix_passed' as result;
