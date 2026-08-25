-- Phase 2 testability: keep admin mutations behind audited commands and add a safe
-- temporary-password fallback for administrator creation. Ordinary marketplace
-- users/providers still use the normal registration/onboarding flow.

create table if not exists app_private.platform_admin_password_bootstraps (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  role_id uuid not null references public.platform_roles(id) on delete restrict,
  invited_by_account_id uuid not null references public.accounts(id) on delete restrict,
  initial_password_fingerprint text not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on app_private.platform_admin_password_bootstraps from public, anon, authenticated;

create or replace function public.platform_admin_manage_allowed_command()
returns boolean
language sql stable security definer
set search_path='public','app_private'
as $$
  select auth.uid() is not null
    and app_private.current_account_has_platform_capability('platform.admin.manage');
$$;
revoke all on function public.platform_admin_manage_allowed_command() from public, anon;
grant execute on function public.platform_admin_manage_allowed_command() to authenticated;

-- These commands intentionally use SECURITY DEFINER because the underlying
-- administration tables expose read-only RLS policies to humans. Authorization
-- remains explicit inside each command; callers never receive direct table write access.
create or replace function public.grant_platform_role_command(p_account_id uuid,p_role_key text,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare me uuid; rid uuid;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() and not app_private.current_account_is_owner() then raise exception 'step-up authentication required' using errcode='42501'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key and is_active;
  if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may grant super admin' using errcode='42501'; end if;
  insert into public.platform_admin_memberships(account_id,role_id,status,granted_by_account_id,reason)
  values(p_account_id,rid,'active',me,nullif(btrim(p_reason),''))
  on conflict(account_id,role_id) do update set status='active',granted_by_account_id=excluded.granted_by_account_id,granted_at=now(),revoked_by_account_id=null,revoked_at=null,reason=excluded.reason;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ROLE_GRANTED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'reason',p_reason));
end$$;

create or replace function public.revoke_platform_role_command(p_account_id uuid,p_role_key text,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare me uuid; rid uuid;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if p_account_id=(select owner_account_id from public.platform_ownership limit 1) then raise exception 'platform owner cannot be revoked' using errcode='42501'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may revoke super admin' using errcode='42501'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key;
  update public.platform_admin_memberships set status='revoked',revoked_by_account_id=me,revoked_at=now(),reason=nullif(btrim(p_reason),'') where account_id=p_account_id and role_id=rid and revoked_at is null;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ROLE_REVOKED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'reason',p_reason));
end$$;

create or replace function public.transfer_platform_ownership_command(p_new_owner_account_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare old_owner uuid;
begin
  if not app_private.current_account_is_owner() then raise exception 'owner required' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() then raise exception 'aal2 required' using errcode='42501'; end if;
  if not exists(select 1 from public.accounts where id=p_new_owner_account_id and status='active') then raise exception 'active new owner required' using errcode='22023'; end if;
  select owner_account_id into old_owner from public.platform_ownership where singleton=true for update;
  update public.platform_ownership set previous_owner_account_id=old_owner,owner_account_id=p_new_owner_account_id,transferred_at=now(),transfer_reason=nullif(btrim(p_reason),'') where singleton=true;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_OWNERSHIP_TRANSFERRED','account',p_new_owner_account_id,'ownership_transfer','system_internal',jsonb_build_object('previous_owner_account_id',old_owner,'reason',p_reason));
end$$;

create or replace function public.create_platform_admin_invitation_command(p_email text,p_role_key text,p_token_hash text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare me uuid; rid uuid; iid uuid; email_norm text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may invite super admin' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '14 days' then raise exception 'invalid expiry' using errcode='22023'; end if;
  email_norm:=lower(btrim(p_email)); if email_norm='' or position('@' in email_norm)<2 then raise exception 'valid email required' using errcode='22023'; end if;
  select id into rid from public.platform_roles where role_key=p_role_key and is_active; if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  update public.platform_admin_invitations set status='revoked',revoked_at=now() where email_normalized=email_norm and status='pending';
  insert into public.platform_admin_invitations(email_normalized,role_id,token_hash,invited_by_account_id,expires_at) values(email_norm,rid,p_token_hash,me,p_expires_at) returning id into iid;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_INVITED','platform_admin_invitation',iid,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'expires_at',p_expires_at));
  return iid;
end$$;

create or replace function public.accept_platform_admin_invitation_command(p_token text)
returns text language plpgsql security definer set search_path='public','app_private','auth','extensions' as $$
declare me uuid; invite public.platform_admin_invitations%rowtype; rid_key text; expected_hash text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active'; if me is null then raise exception 'active account required' using errcode='42501'; end if;
  expected_hash:=encode(digest(p_token,'sha256'),'hex');
  select * into invite from public.platform_admin_invitations where token_hash=expected_hash and status='pending' for update;
  if not found then raise exception 'invitation not found' using errcode='P0002'; end if;
  if invite.expires_at<=now() then update public.platform_admin_invitations set status='expired' where id=invite.id; raise exception 'invitation expired' using errcode='22023'; end if;
  if lower(coalesce(auth.jwt()->>'email',''))<>invite.email_normalized then raise exception 'invitation email does not match signed-in account' using errcode='42501'; end if;
  select role_key into rid_key from public.platform_roles where id=invite.role_id;
  if rid_key='super_admin' and not exists(select 1 from public.platform_ownership where owner_account_id=invite.invited_by_account_id) then raise exception 'super admin invitation must originate from owner' using errcode='42501'; end if;
  insert into public.platform_admin_memberships(account_id,role_id,status,granted_by_account_id,reason)
  values(me,invite.role_id,'active',invite.invited_by_account_id,'accepted invitation')
  on conflict(account_id,role_id) do update set status='active',granted_by_account_id=excluded.granted_by_account_id,granted_at=now(),revoked_at=null,revoked_by_account_id=null,reason='accepted invitation';
  update public.platform_admin_invitations set status='accepted',accepted_by_account_id=me,accepted_at=now() where id=invite.id;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_INVITATION_ACCEPTED','account',me,'admin_access_change','system_internal',jsonb_build_object('invitation_id',invite.id,'role_key',rid_key));
  return rid_key;
end$$;

create or replace function public.revoke_platform_admin_invitation_command(p_invitation_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
begin
  if not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  update public.platform_admin_invitations set status='revoked',revoked_at=now() where id=p_invitation_id and status='pending';
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_INVITATION_REVOKED','platform_admin_invitation',p_invitation_id,'admin_access_change','system_internal',jsonb_build_object('reason',p_reason));
end$$;

create or replace function public.provision_platform_admin_role_command(p_account_id uuid,p_role_key text,p_expires_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path='public','app_private','auth','extensions' as $$
declare me uuid; rid uuid; password_hash text; fingerprint text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
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
end$$;

create or replace function public.platform_admin_activation_required_command()
returns boolean language sql stable security definer set search_path='public','app_private' as $$
  select exists(
    select 1 from app_private.platform_admin_password_bootstraps b
    join public.accounts a on a.id=b.account_id
    join public.platform_admin_memberships m on m.account_id=b.account_id and m.role_id=b.role_id
    where a.auth_user_id=auth.uid() and b.completed_at is null and b.expires_at>now() and m.status='invited' and m.revoked_at is null
  );
$$;

create or replace function public.activate_provisioned_admin_command()
returns text language plpgsql security definer set search_path='public','app_private','auth','extensions' as $$
declare me uuid; b app_private.platform_admin_password_bootstraps%rowtype; current_hash text; current_fingerprint text; role_key text;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active'; if me is null then raise exception 'active account required' using errcode='42501'; end if;
  select * into b from app_private.platform_admin_password_bootstraps where account_id=me and completed_at is null for update;
  if not found then raise exception 'temporary administrator access not found' using errcode='P0002'; end if;
  if b.expires_at<=now() then
    update public.platform_admin_memberships set status='revoked',revoked_at=now(),reason='temporary access expired' where account_id=me and role_id=b.role_id and status='invited';
    raise exception 'temporary administrator access expired' using errcode='22023';
  end if;
  select encrypted_password into current_hash from auth.users where id=auth.uid();
  current_fingerprint:=encode(digest(coalesce(current_hash,''),'sha256'),'hex');
  if current_fingerprint=b.initial_password_fingerprint then raise exception 'password change required before administrator access' using errcode='42501'; end if;
  update public.platform_admin_memberships set status='active',granted_at=now(),reason='temporary credential replaced on first sign-in' where account_id=me and role_id=b.role_id and status='invited';
  update app_private.platform_admin_password_bootstraps set completed_at=now() where account_id=me;
  select r.role_key into role_key from public.platform_roles r where r.id=b.role_id;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ADMIN_TEMP_ACCESS_ACTIVATED','account',me,'admin_access_change','system_internal',jsonb_build_object('role_key',role_key));
  return role_key;
end$$;

revoke all on function public.provision_platform_admin_role_command(uuid,text,timestamptz,text), public.platform_admin_activation_required_command(), public.activate_provisioned_admin_command() from public, anon;
grant execute on function public.provision_platform_admin_role_command(uuid,text,timestamptz,text), public.platform_admin_activation_required_command(), public.activate_provisioned_admin_command() to authenticated;
