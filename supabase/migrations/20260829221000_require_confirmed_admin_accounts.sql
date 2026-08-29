-- An unconfirmed authentication identity must never hold active platform administration authority.
-- Temporary-access provisioning confirms the auth user first, then keeps the role invited until
-- the one-time password is replaced.
with revoked as (
  update public.platform_admin_memberships pam
  set status='revoked',
      revoked_at=now(),
      reason='Automatically revoked: authentication email was not confirmed'
  from public.accounts a
  join auth.users u on u.id=a.auth_user_id
  where pam.account_id=a.id
    and pam.status='active'
    and u.email_confirmed_at is null
  returning pam.account_id,pam.role_id
)
insert into public.audit_events(actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
select 'system','PLATFORM_ROLE_REVOKED_UNCONFIRMED','account',r.account_id,'admin_identity_not_confirmed','system_internal',jsonb_build_object('role_id',r.role_id)
from revoked r;

create or replace function public.grant_platform_role_command(p_account_id uuid,p_role_key text,p_reason text)
returns void
language plpgsql security definer
set search_path='public','app_private','auth'
as $$
declare me uuid; rid uuid; target_confirmed boolean;
begin
  select id into me from public.accounts where auth_user_id=auth.uid() and status='active';
  if me is null or not app_private.current_account_has_platform_capability('platform.admin.manage') then raise exception 'not authorized' using errcode='42501'; end if;
  if not app_private.current_auth_is_aal2() and not app_private.current_account_is_owner() then raise exception 'step-up authentication required' using errcode='42501'; end if;

  select (u.email_confirmed_at is not null) into target_confirmed
  from public.accounts a join auth.users u on u.id=a.auth_user_id
  where a.id=p_account_id and a.status='active';
  if coalesce(target_confirmed,false)=false then raise exception 'target administrator authentication is not confirmed' using errcode='22023'; end if;

  select id into rid from public.platform_roles where role_key=p_role_key and is_active;
  if rid is null then raise exception 'role not found' using errcode='P0002'; end if;
  if p_role_key='super_admin' and not app_private.current_account_is_owner() then raise exception 'only platform owner may grant super admin' using errcode='42501'; end if;

  insert into public.platform_admin_memberships(account_id,role_id,status,granted_by_account_id,reason)
  values(p_account_id,rid,'active',me,nullif(btrim(p_reason),''))
  on conflict(account_id,role_id) do update set status='active',granted_by_account_id=excluded.granted_by_account_id,granted_at=now(),revoked_by_account_id=null,revoked_at=null,reason=excluded.reason;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values(auth.uid(),'user','PLATFORM_ROLE_GRANTED','account',p_account_id,'admin_access_change','system_internal',jsonb_build_object('role_key',p_role_key,'reason',p_reason));
end$$;

revoke all on function public.grant_platform_role_command(uuid,text,text) from public,anon;
grant execute on function public.grant_platform_role_command(uuid,text,text) to authenticated;
