create table public.provider_matching_eligibility (
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_eligible boolean not null default false,
  eligibility_score numeric(5,2) not null default 0 check (eligibility_score between 0 and 100),
  reasons text[] not null default '{}'::text[],
  evaluated_at timestamptz not null default now(),
  primary key(provider_id, service_entity_id, location_id)
);

create index provider_matching_lookup_idx on public.provider_matching_eligibility(service_entity_id, location_id, is_eligible, eligibility_score desc);
alter table public.provider_matching_eligibility enable row level security;
create policy provider_matching_public_read on public.provider_matching_eligibility for select to anon, authenticated using (is_eligible);
revoke all on public.provider_matching_eligibility from anon, authenticated;
grant select on public.provider_matching_eligibility to anon, authenticated;

create or replace function app_private.evaluate_provider_match(p_provider_id uuid,p_service_entity_id uuid,p_location_id uuid)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare active_provider boolean; has_service boolean; has_area boolean; verified boolean; ready numeric; score numeric:=0; rs text[]:='{}'; eligible boolean;
begin
 select exists(select 1 from public.providers where id=p_provider_id and status='active') into active_provider;
 select exists(select 1 from public.provider_services where provider_id=p_provider_id and service_entity_id=p_service_entity_id and is_active) into has_service;
 select exists(select 1 from public.provider_service_areas where provider_id=p_provider_id and location_id=p_location_id and is_active) into has_area;
 select exists(select 1 from public.provider_verifications where provider_id=p_provider_id and status='verified' and (expires_at is null or expires_at>now())) into verified;
 select coalesce(readiness_score,0) into ready from public.provider_public_profiles where provider_id=p_provider_id;
 score := (case when active_provider then 25 else 0 end)+(case when has_service then 25 else 0 end)+(case when has_area then 25 else 0 end)+(case when verified then 15 else 0 end)+least(10,coalesce(ready,0)/10);
 if not active_provider then rs:=array_append(rs,'provider_not_active'); end if;
 if not has_service then rs:=array_append(rs,'service_not_offered'); end if;
 if not has_area then rs:=array_append(rs,'outside_service_area'); end if;
 if not verified then rs:=array_append(rs,'verification_incomplete'); end if;
 if coalesce(ready,0)<60 then rs:=array_append(rs,'search_readiness_low'); end if;
 eligible := active_provider and has_service and has_area and coalesce(ready,0)>=60;
 insert into public.provider_matching_eligibility(provider_id,service_entity_id,location_id,is_eligible,eligibility_score,reasons,evaluated_at)
 values(p_provider_id,p_service_entity_id,p_location_id,eligible,score,rs,now())
 on conflict(provider_id,service_entity_id,location_id) do update set is_eligible=excluded.is_eligible,eligibility_score=excluded.eligibility_score,reasons=excluded.reasons,evaluated_at=excluded.evaluated_at;
end $$;
revoke all on function app_private.evaluate_provider_match(uuid,uuid,uuid) from public,anon,authenticated;
