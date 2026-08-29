-- Publication gates must be enforced by the authoritative command, not only by UI state.
create or replace function app_private.publish_provider_profile_authoritatively(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private', 'auth'
as $function$
declare
  p public.providers%rowtype;
  ready public.provider_search_readiness%rowtype;
  identity_ok boolean;
  service_ok boolean;
  area_ok boolean;
  profile_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode='28000';
  end if;

  select * into p from public.providers where id=p_provider_id for update;
  if not found then raise exception 'provider not found' using errcode='P0002'; end if;
  if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select exists(
    select 1 from public.provider_verifications
    where provider_id=p_provider_id and kind='identity' and status='verified'
      and (expires_at is null or expires_at>now())
  ) into identity_ok;

  select exists(
    select 1 from public.provider_services
    where provider_id=p_provider_id and is_active
  ) into service_ok;

  select exists(
    select 1 from public.provider_service_areas
    where provider_id=p_provider_id and is_active
  ) into area_ok;

  select exists(
    select 1 from public.provider_public_profiles
    where provider_id=p_provider_id
      and length(trim(coalesce(public_description,''))) >= 80
  ) into profile_ok;

  if not service_ok then raise exception 'service required before publishing' using errcode='22023'; end if;
  if not area_ok then raise exception 'service area required before publishing' using errcode='22023'; end if;
  if not profile_ok then raise exception 'public description must be at least 80 characters before publishing' using errcode='22023'; end if;
  if not identity_ok then raise exception 'verified identity required before publishing' using errcode='22023'; end if;

  update public.providers set status='active', updated_at=now() where id=p_provider_id;
  ready := app_private.compute_provider_search_readiness(p_provider_id);

  if ready.total_score < 60 or ready.service_score < 100 or ready.location_score < 100 then
    update public.providers set status='draft', updated_at=now() where id=p_provider_id;
    perform app_private.compute_provider_search_readiness(p_provider_id);
    raise exception 'provider is not ready to publish' using errcode='22023';
  end if;

  update public.provider_public_profiles
     set is_public=true,
         published_at=coalesce(published_at,now()),
         readiness_score=ready.total_score,
         verification_summary=jsonb_build_object('verified',true),
         updated_at=now()
   where provider_id=p_provider_id;

  if not found then
    update public.providers set status='draft', updated_at=now() where id=p_provider_id;
    perform app_private.compute_provider_search_readiness(p_provider_id);
    raise exception 'public profile required before publishing' using errcode='22023';
  end if;

  perform app_private.refresh_provider_onboarding(p_provider_id);

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','PROVIDER_PROFILE_PUBLISHED','provider',p_provider_id,'public',
    jsonb_build_object('readiness_score',ready.total_score,'publication_gates',jsonb_build_object('service',service_ok,'area',area_ok,'profile',profile_ok,'identity',identity_ok)));
end
$function$;
