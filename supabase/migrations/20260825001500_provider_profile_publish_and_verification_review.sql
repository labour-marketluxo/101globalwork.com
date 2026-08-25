create or replace function app_private.current_account_has_capability(p_capability text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.account_capabilities ac where ac.account_id=app_private.current_account_id() and ac.capability=p_capability and ac.revoked_at is null)
$$;

create or replace function app_private.update_provider_profile_authoritatively(p_provider_id uuid,p_headline text,p_description text,p_years_experience smallint,p_accepts_new_work boolean)
returns void language plpgsql security definer set search_path=public,app_private,auth as $$
declare p public.providers%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into p from public.providers where id=p_provider_id; if not found then raise exception 'provider not found' using errcode='P0002'; end if;
 if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_description,'')))<80 then raise exception 'public description must be at least 80 characters' using errcode='22023'; end if;
 if p_years_experience is not null and (p_years_experience<0 or p_years_experience>80) then raise exception 'invalid years experience' using errcode='22023'; end if;
 update public.providers set public_description=trim(p_description),updated_at=now() where id=p_provider_id;
 update public.provider_public_profiles set headline=nullif(trim(p_headline),''),public_description=trim(p_description),years_experience=p_years_experience,accepts_new_work=p_accepts_new_work,updated_at=now() where provider_id=p_provider_id;
 perform app_private.refresh_provider_onboarding(p_provider_id); perform app_private.compute_provider_search_readiness(p_provider_id);
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','PROVIDER_PROFILE_UPDATED','provider',p_provider_id,'participant_private','{}'::jsonb);
end $$;
revoke all on function app_private.update_provider_profile_authoritatively(uuid,text,text,smallint,boolean) from public,anon;
grant execute on function app_private.update_provider_profile_authoritatively(uuid,text,text,smallint,boolean) to authenticated;
create or replace function public.update_provider_profile_command(p_provider_id uuid,p_headline text,p_description text,p_years_experience smallint default null,p_accepts_new_work boolean default true)
returns void language sql security invoker set search_path=app_private as $$ select app_private.update_provider_profile_authoritatively(p_provider_id,p_headline,p_description,p_years_experience,p_accepts_new_work) $$;
revoke all on function public.update_provider_profile_command(uuid,text,text,smallint,boolean) from public,anon; grant execute on function public.update_provider_profile_command(uuid,text,text,smallint,boolean) to authenticated;

create or replace function app_private.publish_provider_profile_authoritatively(p_provider_id uuid)
returns void language plpgsql security definer set search_path=public,app_private,auth as $$
declare p public.providers%rowtype; ready public.provider_search_readiness%rowtype; identity_ok boolean;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into p from public.providers where id=p_provider_id; if not found then raise exception 'provider not found' using errcode='P0002'; end if;
 if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 select exists(select 1 from public.provider_verifications where provider_id=p_provider_id and kind='identity' and status='verified' and (expires_at is null or expires_at>now())) into identity_ok;
 if not identity_ok then raise exception 'verified identity required before publishing' using errcode='22023'; end if;
 update public.providers set status='active',updated_at=now() where id=p_provider_id; ready:=app_private.compute_provider_search_readiness(p_provider_id);
 if ready.total_score<60 or ready.service_score<100 or ready.location_score<100 then update public.providers set status='draft',updated_at=now() where id=p_provider_id; perform app_private.compute_provider_search_readiness(p_provider_id); raise exception 'provider is not ready to publish' using errcode='22023'; end if;
 update public.provider_public_profiles set is_public=true,published_at=coalesce(published_at,now()),readiness_score=ready.total_score,verification_summary=jsonb_build_object('verified',true),updated_at=now() where provider_id=p_provider_id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','PROVIDER_PROFILE_PUBLISHED','provider',p_provider_id,'public',jsonb_build_object('readiness_score',ready.total_score));
end $$;
revoke all on function app_private.publish_provider_profile_authoritatively(uuid) from public,anon; grant execute on function app_private.publish_provider_profile_authoritatively(uuid) to authenticated;
create or replace function public.publish_provider_profile_command(p_provider_id uuid) returns void language sql security invoker set search_path=app_private as $$ select app_private.publish_provider_profile_authoritatively(p_provider_id) $$;
revoke all on function public.publish_provider_profile_command(uuid) from public,anon; grant execute on function public.publish_provider_profile_command(uuid) to authenticated;

create policy provider_verifications_reviewer_select on public.provider_verifications for select to authenticated using (app_private.current_account_has_capability('platform.verification.review'));
create or replace function app_private.review_provider_verification_authoritatively(p_verification_id uuid,p_decision public.verification_status,p_note text default null)
returns void language plpgsql security definer set search_path=public,app_private,auth as $$
declare v public.provider_verifications%rowtype;
begin
 if not app_private.current_account_has_capability('platform.verification.review') then raise exception 'forbidden' using errcode='42501'; end if;
 if p_decision not in ('verified','rejected') then raise exception 'invalid review decision' using errcode='22023'; end if;
 select * into v from public.provider_verifications where id=p_verification_id for update; if not found then raise exception 'verification not found' using errcode='P0002'; end if;
 if v.status<>'pending' then raise exception 'verification is not pending' using errcode='22023'; end if;
 update public.provider_verifications set status=p_decision,reviewed_at=now(),verified_at=case when p_decision='verified' then now() else null end,metadata=metadata||jsonb_build_object('review_note',coalesce(p_note,'')),updated_at=now() where id=p_verification_id;
 perform app_private.refresh_provider_onboarding(v.provider_id); perform app_private.compute_provider_search_readiness(v.provider_id);
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account',case when p_decision='verified' then 'PROVIDER_VERIFICATION_APPROVED' else 'PROVIDER_VERIFICATION_REJECTED' end,'provider_verification',p_verification_id,'regulated_sensitive',jsonb_build_object('provider_id',v.provider_id,'kind',v.kind));
end $$;
revoke all on function app_private.review_provider_verification_authoritatively(uuid,public.verification_status,text) from public,anon; grant execute on function app_private.review_provider_verification_authoritatively(uuid,public.verification_status,text) to authenticated;
create or replace function public.review_provider_verification_command(p_verification_id uuid,p_decision public.verification_status,p_note text default null) returns void language sql security invoker set search_path=app_private,public as $$ select app_private.review_provider_verification_authoritatively(p_verification_id,p_decision,p_note) $$;
revoke all on function public.review_provider_verification_command(uuid,public.verification_status,text) from public,anon; grant execute on function public.review_provider_verification_command(uuid,public.verification_status,text) to authenticated;
