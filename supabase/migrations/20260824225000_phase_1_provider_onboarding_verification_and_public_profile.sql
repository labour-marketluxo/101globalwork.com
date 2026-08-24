create type public.verification_status as enum ('not_started','pending','verified','rejected','expired');
create type public.verification_kind as enum ('identity','business','address','credential','insurance','licence');

create table public.provider_verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  kind public.verification_kind not null,
  status public.verification_status not null default 'not_started',
  jurisdiction_code text,
  reference_label text,
  verified_at timestamptz,
  expires_at timestamptz,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, kind, jurisdiction_code)
);

create table public.provider_public_profiles (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  slug text not null unique,
  headline text,
  public_description text,
  years_experience smallint check (years_experience is null or years_experience between 0 and 80),
  accepts_new_work boolean not null default true,
  verification_summary jsonb not null default '{}'::jsonb,
  trust_score numeric(5,2) not null default 0 check (trust_score between 0 and 100),
  readiness_score numeric(5,2) not null default 0 check (readiness_score between 0 and 100),
  is_public boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint provider_public_publish_check check (not is_public or published_at is not null)
);

create table public.provider_onboarding_progress (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  identity_complete boolean not null default false,
  services_complete boolean not null default false,
  service_area_complete boolean not null default false,
  profile_complete boolean not null default false,
  verification_started boolean not null default false,
  completion_percent smallint not null default 0 check (completion_percent between 0 and 100),
  next_action text,
  updated_at timestamptz not null default now()
);

create index provider_verifications_provider_status_idx on public.provider_verifications(provider_id, status);
create index provider_verifications_expiry_idx on public.provider_verifications(expires_at) where expires_at is not null;
create index provider_public_profiles_public_idx on public.provider_public_profiles(is_public, readiness_score desc) where is_public;

alter table public.provider_verifications enable row level security;
alter table public.provider_public_profiles enable row level security;
alter table public.provider_onboarding_progress enable row level security;

create policy provider_verifications_owner_select on public.provider_verifications for select to authenticated using (
  exists (select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))))
);
create policy provider_public_profiles_owner_select on public.provider_public_profiles for select to authenticated using (
  exists (select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))) or is_public
);
create policy provider_public_profiles_public_read on public.provider_public_profiles for select to anon using (is_public and published_at is not null);
create policy provider_onboarding_owner_select on public.provider_onboarding_progress for select to authenticated using (
  exists (select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))))
);

revoke all on public.provider_verifications from anon;
revoke all on public.provider_onboarding_progress from anon;
grant select on public.provider_verifications to authenticated;
grant select on public.provider_onboarding_progress to authenticated;
grant select on public.provider_public_profiles to anon, authenticated;

create or replace function app_private.refresh_provider_onboarding(p_provider_id uuid)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare svc boolean; area boolean; prof boolean; ver boolean; pct integer; next_step text;
begin
 select exists(select 1 from public.provider_services where provider_id=p_provider_id and is_active) into svc;
 select exists(select 1 from public.provider_service_areas where provider_id=p_provider_id and is_active) into area;
 select exists(select 1 from public.providers where id=p_provider_id and length(trim(coalesce(public_description,'')))>=80) into prof;
 select exists(select 1 from public.provider_verifications where provider_id=p_provider_id and status in ('pending','verified')) into ver;
 pct := (case when svc then 25 else 0 end)+(case when area then 25 else 0 end)+(case when prof then 25 else 0 end)+(case when ver then 25 else 0 end);
 next_step := case when not svc then 'add_service' when not area then 'add_service_area' when not prof then 'complete_public_profile' when not ver then 'start_verification' else 'ready_for_review' end;
 insert into public.provider_onboarding_progress(provider_id,identity_complete,services_complete,service_area_complete,profile_complete,verification_started,completion_percent,next_action)
 values(p_provider_id,true,svc,area,prof,ver,pct,next_step)
 on conflict(provider_id) do update set services_complete=excluded.services_complete,service_area_complete=excluded.service_area_complete,profile_complete=excluded.profile_complete,verification_started=excluded.verification_started,completion_percent=excluded.completion_percent,next_action=excluded.next_action,updated_at=now();
end $$;
revoke all on function app_private.refresh_provider_onboarding(uuid) from public,anon,authenticated;
