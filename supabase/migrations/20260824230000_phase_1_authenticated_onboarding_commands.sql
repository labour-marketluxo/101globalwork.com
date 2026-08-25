-- Account bootstrap and authoritative provider onboarding commands.
-- Applied first to the isolated Supabase phase-0-foundation branch.

create or replace function app_private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare new_account_id uuid;
begin
 insert into public.accounts(auth_user_id,status) values(new.id,'active') on conflict(auth_user_id) do update set auth_user_id=excluded.auth_user_id returning id into new_account_id;
 insert into public.profiles(account_id,display_name,preferred_language_code,timezone) values(new_account_id,nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')),''),nullif(new.raw_user_meta_data->>'language_code',''),nullif(new.raw_user_meta_data->>'timezone','')) on conflict(account_id) do nothing;
 return new;
end $$;
revoke all on function app_private.handle_new_auth_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function app_private.handle_new_auth_user();

create or replace function app_private.refresh_provider_onboarding(p_provider_id uuid)
returns void language plpgsql security definer set search_path=public,app_private as $$
declare ident boolean; svc boolean; area boolean; prof boolean; ver boolean; pct smallint; nxt text;
begin
 select exists(select 1 from public.providers p where p.id=p_provider_id and length(trim(coalesce(p.display_name,'')))>=2) into ident;
 select exists(select 1 from public.provider_services ps where ps.provider_id=p_provider_id and ps.is_active) into svc;
 select exists(select 1 from public.provider_service_areas pa where pa.provider_id=p_provider_id and pa.is_active) into area;
 select exists(select 1 from public.provider_public_profiles pp where pp.provider_id=p_provider_id and length(trim(coalesce(pp.public_description,'')))>=80) into prof;
 select exists(select 1 from public.provider_verifications pv where pv.provider_id=p_provider_id and pv.status in ('pending','verified')) into ver;
 pct:=((ident::int+svc::int+area::int+prof::int+ver::int)*20)::smallint;
 nxt:=case when not ident then 'complete_identity' when not svc then 'add_service' when not area then 'add_service_area' when not prof then 'complete_public_profile' when not ver then 'start_verification' else 'review_search_readiness' end;
 insert into public.provider_onboarding_progress(provider_id,identity_complete,services_complete,service_area_complete,profile_complete,verification_started,completion_percent,next_action,updated_at) values(p_provider_id,ident,svc,area,prof,ver,pct,nxt,now()) on conflict(provider_id) do update set identity_complete=excluded.identity_complete,services_complete=excluded.services_complete,service_area_complete=excluded.service_area_complete,profile_complete=excluded.profile_complete,verification_started=excluded.verification_started,completion_percent=excluded.completion_percent,next_action=excluded.next_action,updated_at=now();
end $$;
revoke all on function app_private.refresh_provider_onboarding(uuid) from public,anon,authenticated;

create or replace function app_private.create_provider_authoritatively(p_display_name text,p_market_id uuid,p_slug text,p_description text default null)
returns uuid language plpgsql security definer set search_path=public,app_private,auth as $$
declare acct uuid; pid uuid; clean_slug text;
begin
 acct:=app_private.current_account_id(); if acct is null then raise exception 'active account required' using errcode='28000'; end if;
 if length(trim(coalesce(p_display_name,'')))<2 then raise exception 'display name too short' using errcode='22023'; end if;
 clean_slug:=trim(both '-' from lower(regexp_replace(trim(coalesce(p_slug,'')),'[^a-zA-Z0-9]+','-','g'))); if length(clean_slug)<3 then raise exception 'invalid slug' using errcode='22023'; end if;
 if exists(select 1 from public.provider_public_profiles where slug=clean_slug) then raise exception 'slug unavailable' using errcode='23505'; end if;
 insert into public.providers(owner_account_id,status,display_name,public_description,primary_market_id) values(acct,'draft',trim(p_display_name),nullif(trim(coalesce(p_description,'')),''),p_market_id) returning id into pid;
 insert into public.provider_public_profiles(provider_id,slug,headline,public_description,is_public) values(pid,clean_slug,trim(p_display_name),nullif(trim(coalesce(p_description,'')),''),false);
 perform app_private.refresh_provider_onboarding(pid);
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification) values(auth.uid(),'account','PROVIDER_CREATED','provider',pid,'participant_private');
 return pid;
end $$;
revoke all on function app_private.create_provider_authoritatively(text,uuid,text,text) from public,anon;
grant execute on function app_private.create_provider_authoritatively(text,uuid,text,text) to authenticated;
create or replace function public.create_provider_command(p_display_name text,p_market_id uuid,p_slug text,p_description text default null) returns uuid language sql security invoker set search_path=app_private as $$ select app_private.create_provider_authoritatively(p_display_name,p_market_id,p_slug,p_description) $$;
revoke all on function public.create_provider_command(text,uuid,text,text) from public,anon; grant execute on function public.create_provider_command(text,uuid,text,text) to authenticated;

create or replace function app_private.set_provider_service_authoritatively(p_provider_id uuid,p_service_entity_id uuid,p_is_primary boolean default false) returns uuid language plpgsql security definer set search_path=public,app_private as $$ declare rid uuid; begin if not exists(select 1 from public.providers p where p.id=p_provider_id and p.owner_account_id=app_private.current_account_id()) then raise exception 'not authorized' using errcode='42501'; end if; if not exists(select 1 from public.taxonomy_entities t where t.id=p_service_entity_id and t.kind='service' and t.is_active) then raise exception 'invalid service' using errcode='22023'; end if; insert into public.provider_services(provider_id,service_entity_id,is_primary,is_active) values(p_provider_id,p_service_entity_id,p_is_primary,true) on conflict(provider_id,service_entity_id) do update set is_primary=excluded.is_primary,is_active=true returning id into rid; perform app_private.refresh_provider_onboarding(p_provider_id); return rid; end $$;
revoke all on function app_private.set_provider_service_authoritatively(uuid,uuid,boolean) from public,anon; grant execute on function app_private.set_provider_service_authoritatively(uuid,uuid,boolean) to authenticated;
create or replace function public.set_provider_service_command(p_provider_id uuid,p_service_entity_id uuid,p_is_primary boolean default false) returns uuid language sql security invoker set search_path=app_private as $$ select app_private.set_provider_service_authoritatively(p_provider_id,p_service_entity_id,p_is_primary) $$;
revoke all on function public.set_provider_service_command(uuid,uuid,boolean) from public,anon; grant execute on function public.set_provider_service_command(uuid,uuid,boolean) to authenticated;

create or replace function app_private.set_provider_service_area_authoritatively(p_provider_id uuid,p_location_id uuid,p_is_primary boolean default false) returns uuid language plpgsql security definer set search_path=public,app_private as $$ declare rid uuid; begin if not exists(select 1 from public.providers p where p.id=p_provider_id and p.owner_account_id=app_private.current_account_id()) then raise exception 'not authorized' using errcode='42501'; end if; insert into public.provider_service_areas(provider_id,location_id,is_primary,is_active) values(p_provider_id,p_location_id,p_is_primary,true) on conflict(provider_id,location_id) do update set is_primary=excluded.is_primary,is_active=true returning id into rid; perform app_private.refresh_provider_onboarding(p_provider_id); return rid; end $$;
revoke all on function app_private.set_provider_service_area_authoritatively(uuid,uuid,boolean) from public,anon; grant execute on function app_private.set_provider_service_area_authoritatively(uuid,uuid,boolean) to authenticated;
create or replace function public.set_provider_service_area_command(p_provider_id uuid,p_location_id uuid,p_is_primary boolean default false) returns uuid language sql security invoker set search_path=app_private as $$ select app_private.set_provider_service_area_authoritatively(p_provider_id,p_location_id,p_is_primary) $$;
revoke all on function public.set_provider_service_area_command(uuid,uuid,boolean) from public,anon; grant execute on function public.set_provider_service_area_command(uuid,uuid,boolean) to authenticated;

create or replace function app_private.submit_provider_verification_authoritatively(p_provider_id uuid,p_kind public.verification_kind,p_jurisdiction_code text default null,p_reference_label text default null) returns uuid language plpgsql security definer set search_path=public,app_private,auth as $$ declare rid uuid; begin if not exists(select 1 from public.providers p where p.id=p_provider_id and p.owner_account_id=app_private.current_account_id()) then raise exception 'not authorized' using errcode='42501'; end if; insert into public.provider_verifications(provider_id,kind,status,jurisdiction_code,reference_label,updated_at) values(p_provider_id,p_kind,'pending',nullif(trim(coalesce(p_jurisdiction_code,'')),''),nullif(trim(coalesce(p_reference_label,'')),''),now()) returning id into rid; perform app_private.refresh_provider_onboarding(p_provider_id); insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','VERIFICATION_SUBMITTED','provider_verification',rid,'regulated_sensitive',jsonb_build_object('provider_id',p_provider_id,'kind',p_kind)); return rid; end $$;
revoke all on function app_private.submit_provider_verification_authoritatively(uuid,public.verification_kind,text,text) from public,anon; grant execute on function app_private.submit_provider_verification_authoritatively(uuid,public.verification_kind,text,text) to authenticated;
create or replace function public.submit_provider_verification_command(p_provider_id uuid,p_kind public.verification_kind,p_jurisdiction_code text default null,p_reference_label text default null) returns uuid language sql security invoker set search_path=app_private as $$ select app_private.submit_provider_verification_authoritatively(p_provider_id,p_kind,p_jurisdiction_code,p_reference_label) $$;
revoke all on function public.submit_provider_verification_command(uuid,public.verification_kind,text,text) from public,anon; grant execute on function public.submit_provider_verification_command(uuid,public.verification_kind,text,text) to authenticated;

create or replace function public.find_eligible_providers(p_service_entity_id uuid,p_location_id uuid,p_limit integer default 20)
returns table(provider_id uuid,slug text,headline text,public_description text,readiness_score numeric,trust_score numeric,verification_summary jsonb)
language sql stable security invoker set search_path=public as $$ select p.id,pp.slug,pp.headline,pp.public_description,pp.readiness_score,pp.trust_score,pp.verification_summary from public.providers p join public.provider_services ps on ps.provider_id=p.id and ps.service_entity_id=p_service_entity_id and ps.is_active join public.provider_service_areas pa on pa.provider_id=p.id and pa.location_id=p_location_id and pa.is_active join public.provider_public_profiles pp on pp.provider_id=p.id and pp.is_public and pp.published_at is not null where p.status='active' and pp.accepts_new_work and pp.readiness_score>=60 and exists(select 1 from public.provider_verifications pv where pv.provider_id=p.id and pv.kind='identity' and pv.status='verified') order by pp.readiness_score desc,pp.trust_score desc,p.id limit least(greatest(coalesce(p_limit,20),1),50) $$;
revoke all on function public.find_eligible_providers(uuid,uuid,integer) from public; grant execute on function public.find_eligible_providers(uuid,uuid,integer) to anon,authenticated;
