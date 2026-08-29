-- Phase-1 onboarding currently presents one primary service and one primary area.
-- These commands make that UX truthful: changing the selection replaces the old
-- onboarding choice instead of accidentally leaving stale eligibility behind.

create or replace function app_private.replace_provider_primary_service_for_onboarding(
  p_provider_id uuid,
  p_service_entity_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public','app_private','auth'
as $$
declare
  rid uuid;
begin
  if not exists(
    select 1 from public.providers p
    where p.id=p_provider_id and p.owner_account_id=app_private.current_account_id()
  ) then raise exception 'not authorized' using errcode='42501'; end if;

  if not exists(
    select 1 from public.taxonomy_entities t
    where t.id=p_service_entity_id and t.kind='service' and t.is_active
  ) then raise exception 'invalid service' using errcode='22023'; end if;

  update public.provider_services
  set is_primary=false, is_active=false
  where provider_id=p_provider_id and service_entity_id<>p_service_entity_id and is_active;

  insert into public.provider_services(provider_id,service_entity_id,is_primary,is_active)
  values(p_provider_id,p_service_entity_id,true,true)
  on conflict(provider_id,service_entity_id) do update
    set is_primary=true,is_active=true
  returning id into rid;

  perform app_private.refresh_provider_onboarding(p_provider_id);
  perform app_private.compute_provider_search_readiness(p_provider_id);
  return rid;
end
$$;

create or replace function public.replace_provider_primary_service_for_onboarding_command(
  p_provider_id uuid,
  p_service_entity_id uuid
) returns uuid
language sql
set search_path to 'app_private'
as $$
  select app_private.replace_provider_primary_service_for_onboarding(p_provider_id,p_service_entity_id)
$$;

revoke execute on function public.replace_provider_primary_service_for_onboarding_command(uuid,uuid) from anon;
grant execute on function public.replace_provider_primary_service_for_onboarding_command(uuid,uuid) to authenticated;

create or replace function app_private.replace_provider_primary_area_for_onboarding(
  p_provider_id uuid,
  p_location_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public','app_private','auth'
as $$
declare
  rid uuid;
  provider_market uuid;
begin
  select p.primary_market_id into provider_market
  from public.providers p
  where p.id=p_provider_id and p.owner_account_id=app_private.current_account_id();
  if not found then raise exception 'not authorized' using errcode='42501'; end if;

  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id and l.is_active and (provider_market is null or l.market_id=provider_market)
  ) then raise exception 'invalid service area for provider market' using errcode='22023'; end if;

  update public.provider_service_areas
  set is_primary=false, is_active=false
  where provider_id=p_provider_id and location_id<>p_location_id and is_active;

  insert into public.provider_service_areas(provider_id,location_id,is_primary,is_active)
  values(p_provider_id,p_location_id,true,true)
  on conflict(provider_id,location_id) do update
    set is_primary=true,is_active=true
  returning id into rid;

  perform app_private.refresh_provider_onboarding(p_provider_id);
  perform app_private.compute_provider_search_readiness(p_provider_id);
  return rid;
end
$$;

create or replace function public.replace_provider_primary_area_for_onboarding_command(
  p_provider_id uuid,
  p_location_id uuid
) returns uuid
language sql
set search_path to 'app_private'
as $$
  select app_private.replace_provider_primary_area_for_onboarding(p_provider_id,p_location_id)
$$;

revoke execute on function public.replace_provider_primary_area_for_onboarding_command(uuid,uuid) from anon;
grant execute on function public.replace_provider_primary_area_for_onboarding_command(uuid,uuid) to authenticated;
