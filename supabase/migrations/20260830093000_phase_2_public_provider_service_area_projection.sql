create or replace function public.get_public_provider_profile_command(p_slug text)
returns table(
  provider_id uuid,
  slug text,
  headline text,
  public_description text,
  years_experience smallint,
  accepts_new_work boolean,
  verification_summary jsonb,
  trust_score numeric,
  readiness_score numeric,
  service_entity_id uuid,
  service_name text,
  location_id uuid,
  location_name text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    pp.provider_id,
    pp.slug,
    pp.headline,
    pp.public_description,
    pp.years_experience,
    pp.accepts_new_work,
    pp.verification_summary,
    pp.trust_score,
    pp.readiness_score,
    ps.service_entity_id,
    sc.display_name as service_name,
    pa.location_id,
    lc.display_name as location_name
  from public.provider_public_profiles pp
  join public.providers p on p.id=pp.provider_id and p.status='active'
  left join lateral (
    select s.service_entity_id
    from public.provider_services s
    where s.provider_id=pp.provider_id and s.is_active
    order by s.is_primary desc,s.created_at asc
    limit 1
  ) ps on true
  left join public.public_service_catalog sc on sc.service_entity_id=ps.service_entity_id
  left join lateral (
    select a.location_id
    from public.provider_service_areas a
    where a.provider_id=pp.provider_id and a.is_active
    order by a.is_primary desc,a.created_at asc
    limit 1
  ) pa on true
  left join public.public_location_catalog lc on lc.location_id=pa.location_id
  where pp.slug=p_slug
    and pp.is_public
    and pp.published_at is not null
  limit 1
$function$;

grant execute on function public.get_public_provider_profile_command(text) to anon,authenticated;
