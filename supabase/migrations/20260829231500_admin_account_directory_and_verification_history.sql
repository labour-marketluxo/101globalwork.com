-- Capability-gated admin projections for marketplace account support and trust history.
-- These functions expose only the fields needed by authenticated platform operators.

create or replace function public.admin_user_directory_command(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','auth'
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.support.read')
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      a.id as account_id,
      coalesce(nullif(btrim(p.display_name),''), u.email, 'Profile not completed') as display_name,
      u.email,
      (u.email_confirmed_at is not null) as email_confirmed,
      u.last_sign_in_at,
      a.status::text as account_status,
      a.created_at,
      (select count(*) from public.providers pr where pr.owner_account_id=a.id) as provider_count,
      (select count(*) from public.requests rq where rq.customer_account_id=a.id) as request_count,
      coalesce((
        select jsonb_agg(jsonb_build_object('key',r.role_key,'name',r.display_name,'status',m.status::text) order by r.display_name)
        from public.platform_admin_memberships m
        join public.platform_roles r on r.id=m.role_id
        where m.account_id=a.id
      ), '[]'::jsonb) as admin_roles,
      coalesce((
        select jsonb_agg(jsonb_build_object('id',pr.id,'display_name',pr.display_name,'status',pr.status::text) order by pr.created_at)
        from public.providers pr
        where pr.owner_account_id=a.id
      ), '[]'::jsonb) as providers
    from public.accounts a
    join auth.users u on u.id=a.auth_user_id
    left join public.profiles p on p.account_id=a.id
    order by a.created_at desc
    limit greatest(1,least(coalesce(p_limit,100),200))
  ) x;

  return result;
end
$$;

revoke all on function public.admin_user_directory_command(integer) from public;
grant execute on function public.admin_user_directory_command(integer) to authenticated;

create or replace function public.admin_user_detail_command(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','auth'
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.support.read')
    or app_private.current_account_has_platform_capability('platform.trust.read')
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select jsonb_build_object(
    'account_id',a.id,
    'display_name',coalesce(nullif(btrim(p.display_name),''),u.email,'Profile not completed'),
    'email',u.email,
    'email_confirmed',u.email_confirmed_at is not null,
    'email_confirmed_at',u.email_confirmed_at,
    'last_sign_in_at',u.last_sign_in_at,
    'account_status',a.status::text,
    'created_at',a.created_at,
    'admin_roles',coalesce((
      select jsonb_agg(jsonb_build_object('key',r.role_key,'name',r.display_name,'status',m.status::text,'granted_at',m.granted_at,'revoked_at',m.revoked_at) order by r.display_name)
      from public.platform_admin_memberships m
      join public.platform_roles r on r.id=m.role_id
      where m.account_id=a.id
    ),'[]'::jsonb),
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,
        'display_name',pr.display_name,
        'status',pr.status::text,
        'created_at',pr.created_at,
        'is_public',coalesce(pp.is_public,false),
        'published_at',pp.published_at,
        'readiness_score',sr.total_score,
        'readiness',sr.readiness::text,
        'setup_percent',op.completion_percent,
        'next_action',op.next_action
      ) order by pr.created_at)
      from public.providers pr
      left join public.provider_public_profiles pp on pp.provider_id=pr.id
      left join public.provider_search_readiness sr on sr.provider_id=pr.id
      left join public.provider_onboarding_progress op on op.provider_id=pr.id
      where pr.owner_account_id=a.id
    ),'[]'::jsonb),
    'verifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',v.id,
        'provider_id',v.provider_id,
        'provider_name',pr.display_name,
        'kind',v.kind::text,
        'status',v.status::text,
        'jurisdiction_code',v.jurisdiction_code,
        'reference_label',v.reference_label,
        'created_at',v.created_at,
        'reviewed_at',v.reviewed_at,
        'review_note',nullif(v.metadata->>'review_note','')
      ) order by v.created_at desc)
      from public.provider_verifications v
      join public.providers pr on pr.id=v.provider_id
      where pr.owner_account_id=a.id
    ),'[]'::jsonb),
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object('id',q.id,'need_text',q.need_text,'state',q.state::text,'created_at',q.created_at) order by q.created_at desc)
      from (select * from public.requests rq where rq.customer_account_id=a.id order by rq.created_at desc limit 20) q
    ),'[]'::jsonb)
  ) into result
  from public.accounts a
  join auth.users u on u.id=a.auth_user_id
  left join public.profiles p on p.account_id=a.id
  where a.id=p_account_id;

  if result is null then raise exception 'account not found' using errcode='P0002'; end if;
  return result;
end
$$;

revoke all on function public.admin_user_detail_command(uuid) from public;
grant execute on function public.admin_user_detail_command(uuid) to authenticated;

create or replace function public.admin_verification_records_command(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','auth'
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by (x.status='pending') desc, x.created_at desc),'[]'::jsonb)
    into result
  from (
    select
      v.id,
      v.provider_id,
      pr.display_name as provider_name,
      pr.owner_account_id as account_id,
      coalesce(nullif(btrim(owner_profile.display_name),''),owner_user.email,'Profile not completed') as owner_name,
      owner_user.email as owner_email,
      v.kind::text as kind,
      v.status::text as status,
      v.jurisdiction_code,
      v.reference_label,
      v.created_at,
      v.reviewed_at,
      v.verified_at,
      nullif(v.metadata->>'review_note','') as review_note,
      (
        select coalesce(nullif(btrim(reviewer_profile.display_name),''), reviewer_user.email, ae.actor_type)
        from public.audit_events ae
        left join auth.users reviewer_user on reviewer_user.id=ae.actor_user_id
        left join public.accounts reviewer_account on reviewer_account.auth_user_id=reviewer_user.id
        left join public.profiles reviewer_profile on reviewer_profile.account_id=reviewer_account.id
        where ae.resource_type='provider_verification'
          and ae.resource_id=v.id
          and ae.action in ('PROVIDER_VERIFICATION_APPROVED','PROVIDER_VERIFICATION_REJECTED')
        order by ae.occurred_at desc
        limit 1
      ) as reviewer_name
    from public.provider_verifications v
    join public.providers pr on pr.id=v.provider_id
    left join public.accounts owner_account on owner_account.id=pr.owner_account_id
    left join auth.users owner_user on owner_user.id=owner_account.auth_user_id
    left join public.profiles owner_profile on owner_profile.account_id=owner_account.id
    order by (v.status='pending') desc, v.created_at desc
    limit greatest(1,least(coalesce(p_limit,100),200))
  ) x;

  return result;
end
$$;

revoke all on function public.admin_verification_records_command(integer) from public;
grant execute on function public.admin_verification_records_command(integer) to authenticated;
