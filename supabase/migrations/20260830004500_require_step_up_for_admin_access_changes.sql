-- Administrator access changes are sensitive operations. Platform ownership does not bypass step-up authentication.
create or replace function public.platform_admin_manage_allowed_command()
returns boolean
language sql
stable security definer
set search_path to 'public','app_private'
as $function$
  select auth.uid() is not null
    and app_private.current_auth_is_aal2()
    and app_private.current_account_has_platform_capability('platform.admin.manage');
$function$;

create or replace function public.create_platform_admin_invitation_command(p_email text,p_role_key text,p_token_hash text,p_expires_at timestamptz)
returns uuid
language plpgsql security definer
set search_path to 'public','app_private','auth'
as $function$
declare me uuid; rid uuid; iid uuid; email_norm text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may invite super admin' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '14 days' then raise exception 'invalid expiry' using errcode='22023'; end if;
  email_norm:=lower(btrim(p_email)); if email_norm='' or position('@' in email_norm)<2 then raise exception 'valid email required' using errcode='22023'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key and is_active; if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  update public.platform_admin_invitations set status='revoked',revoked_at=now() where email_normalized=email_norm and status='pending';
  insert into public.platform_admin_invitations(email_normalized,role_id,token_hash,invited_by_account_id,expires_at) values(email_norm,rid,p_token_hash,me,p_expires_at) returning id into iid;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_INVITED','platform_admin_invitation',iid,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'expires_at',p_expires_at));
  return iid;
end $function$;

create or replace function public.grant_platform_role_command(p_account_id uuid,p_role_key text,p_reason text)
returns void
language plpgsql security definer
set search_path to 'public','app_private','auth'
as $function$
declare me uuid; rid uuid; target_confirmed boolean;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  select (u.email_confirmed_at is not null) into target_confirmed from public.accounts a join auth.users u on u.id=a.auth_user_id where a.id=p_account_id and a.status='active';
  if coalesce(target_confirmed,false)=false then raise exception 'target administrator authentication is not confirmed' using errcode='22023'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key and is_active; if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may grant super admin' using errcode='42501'; end if;
  insert into public.platform_admin_memberships(account_id,role_id,status,granted_by_account_id,reason)
  values(p_account_id,rid,'active',me,nullif(btrim(p_reason),''))
  on conflict(account_id,role_id) do update set status='active',granted_by_account_id=excluded.granted_by_account_id,granted_at=now(),revoked_by_account_id=null,revoked_at=null,reason=excluded.reason;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ROLE_GRANTED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'reason',p_reason));
end $function$;

create or replace function public.revoke_platform_role_command(p_account_id uuid,p_role_key text,p_reason text)
returns void
language plpgsql security definer
set search_path to 'public','app_private','auth'
as $function$
declare me uuid; rid uuid;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if p_account_id=(select owner_account_id from public.platform_ownership limit 1) then raise exception 'platform owner cannot be revoked' using errcode='42501'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may revoke super admin' using errcode='42501'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key;
  update public.platform_admin_memberships set status='revoked',revoked_by_account_id=me,revoked_at=now(),reason=nullif(btrim(p_reason),'') where account_id=p_account_id and role_id=rid and revoked_at is null;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ROLE_REVOKED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'reason',p_reason));
end $function$;

create or replace function public.revoke_platform_admin_invitation_command(p_invitation_id uuid,p_reason text)
returns void
language plpgsql security definer
set search_path to 'public','app_private','auth'
as $function$
begin
  if auth.uid() is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  update public.platform_admin_invitations set status='revoked',revoked_at=now() where id=p_invitation_id and status='pending';
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_INVITATION_REVOKED','platform_admin_invitation',p_invitation_id,'admin_access_change','system_internal',jsonb_build_object('reason',p_reason));
end $function$;

create or replace function public.provision_platform_admin_role_command(p_account_id uuid,p_role_key text,p_expires_at timestamptz,p_reason text)
returns void
language plpgsql security definer
set search_path to 'public','app_private','auth','extensions'
as $function$
declare me uuid; rid uuid; password_hash text; fingerprint text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may provision super admin' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '24 hours' then raise exception 'temporary access must expire within 24 hours' using errcode='22023'; end if;
  select r.id into rid from public.platform_roles r where r.role_key=p_role_key and r.is_active; if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  select u.encrypted_password into password_hash from public.accounts a join auth.users u on u.id=a.auth_user_id where a.id=p_account_id and a.status='active';
  if password_hash is null or password_hash='' then raise exception 'password account required' using errcode='22023'; end if;
  fingerprint:=encode(digest(password_hash,'sha256'),'hex');
  insert into public.platform_admin_memberships(account_id,role_id,status,granted_by_account_id,reason)
  values(p_account_id,rid,'invited',me,nullif(btrim(p_reason),''))
  on conflict(account_id,role_id) do update set status='invited',granted_by_account_id=excluded.granted_by_account_id,granted_at=now(),revoked_at=null,revoked_by_account_id=null,reason=excluded.reason;
  insert into app_private.platform_admin_password_bootstraps(account_id,role_id,invited_by_account_id,initial_password_fingerprint,expires_at,completed_at)
  values(p_account_id,rid,me,fingerprint,p_expires_at,null)
  on conflict(account_id) do update set role_id=excluded.role_id,invited_by_account_id=excluded.invited_by_account_id,initial_password_fingerprint=excluded.initial_password_fingerprint,expires_at=excluded.expires_at,completed_at=null,created_at=now();
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_TEMP_ACCESS_PROVISIONED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'expires_at',p_expires_at));
end $function$;
