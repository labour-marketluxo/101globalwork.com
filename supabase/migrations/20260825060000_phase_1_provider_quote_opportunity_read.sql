create or replace function public.get_provider_quote_opportunity(p_request_id uuid, p_provider_id uuid)
returns table(request_id uuid, need_text text, request_state public.request_state, service_entity_id uuid, location_id uuid, market_id uuid)
language plpgsql security definer set search_path='public','app_private','auth' as $$
declare p public.providers%rowtype; r public.requests%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into p from public.providers where id=p_provider_id;
  if not found then return; end if;
  if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then return; end if;
  select * into r from public.requests where id=p_request_id;
  if not found or r.state not in ('submitted','matching','quoted') or r.service_entity_id is null or r.location_id is null then return; end if;
  if p.status<>'active' then return; end if;
  if not exists(select 1 from public.provider_services ps where ps.provider_id=p.id and ps.service_entity_id=r.service_entity_id and ps.is_active) then return; end if;
  if not exists(select 1 from public.provider_service_areas pa where pa.provider_id=p.id and pa.location_id=r.location_id and pa.is_active) then return; end if;
  if not exists(select 1 from public.provider_public_profiles pp where pp.provider_id=p.id and pp.is_public and pp.published_at is not null and pp.accepts_new_work and pp.readiness_score>=60) then return; end if;
  return query select r.id,r.need_text,r.state,r.service_entity_id,r.location_id,r.market_id;
end $$;
grant execute on function public.get_provider_quote_opportunity(uuid,uuid) to authenticated;
