-- Provider search-readiness, deterministic SEO indexability and authoritative request command.
create type public.readiness_state as enum ('not_ready','needs_attention','ready');

create table public.provider_search_readiness (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  identity_score smallint not null default 0 check (identity_score between 0 and 100),
  service_score smallint not null default 0 check (service_score between 0 and 100),
  location_score smallint not null default 0 check (location_score between 0 and 100),
  trust_score smallint not null default 0 check (trust_score between 0 and 100),
  content_score smallint not null default 0 check (content_score between 0 and 100),
  operations_score smallint not null default 0 check (operations_score between 0 and 100),
  total_score smallint not null default 0 check (total_score between 0 and 100),
  readiness public.readiness_state not null default 'not_ready',
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now()
);
comment on table public.provider_search_readiness is 'Deterministic provider discoverability readiness. This is not a promise of search ranking.';
alter table public.provider_search_readiness enable row level security;
create policy provider_search_readiness_owner_read on public.provider_search_readiness for select to authenticated
using (exists (select 1 from public.providers p where p.id=provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
revoke all on public.provider_search_readiness from anon;
grant select on public.provider_search_readiness to authenticated;

create table public.indexability_policies (
  id uuid primary key default gen_random_uuid(), market_id uuid references public.markets(id) on delete cascade,
  entity_kind public.entity_kind not null, minimum_supply integer not null default 1 check (minimum_supply>=0),
  minimum_quality_score numeric(5,2) not null default 60 check (minimum_quality_score between 0 and 100),
  require_unique_content boolean not null default true, require_public_summary boolean not null default true,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (market_id,entity_kind)
);
alter table public.indexability_policies enable row level security;
create policy indexability_policies_deny_direct on public.indexability_policies for select to anon,authenticated using(false);

create table public.route_indexability_evaluations (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.public_routes(id) on delete cascade,
  evaluated_state public.indexability_state not null, supply_count integer not null default 0, quality_score numeric(5,2), content_hash text,
  reasons jsonb not null default '[]'::jsonb, evaluated_at timestamptz not null default now()
);
create index route_indexability_eval_route_idx on public.route_indexability_evaluations(route_id,evaluated_at desc);
alter table public.route_indexability_evaluations enable row level security;
create policy route_indexability_evaluations_deny_direct on public.route_indexability_evaluations for select to anon,authenticated using(false);

create or replace function app_private.compute_provider_search_readiness(target_provider_id uuid)
returns public.provider_search_readiness language plpgsql security definer set search_path=public,app_private as $$
declare p public.providers%rowtype; identity_s int:=0; service_s int:=0; location_s int:=0; trust_s int:=0; content_s int:=0; operations_s int:=0; total_s int:=0; state public.readiness_state:='not_ready'; why jsonb:='[]'::jsonb; result_row public.provider_search_readiness%rowtype;
begin
 select * into p from public.providers where id=target_provider_id; if not found then raise exception 'provider not found'; end if;
 identity_s:=case when nullif(trim(p.display_name),'') is not null then 100 else 0 end;
 service_s:=case when exists(select 1 from public.provider_services ps where ps.provider_id=p.id and ps.is_active) then 100 else 0 end;
 location_s:=case when exists(select 1 from public.provider_service_areas pa where pa.provider_id=p.id and pa.is_active) then 100 else 0 end;
 trust_s:=case when p.status='active' then 60 else 20 end;
 content_s:=case when length(coalesce(p.public_description,''))>=120 then 100 when length(coalesce(p.public_description,''))>=40 then 60 else 20 end;
 operations_s:=case when p.status='active' then 70 else 20 end;
 total_s:=round((identity_s+service_s+location_s+trust_s+content_s+operations_s)::numeric/6)::int;
 if service_s=0 then why:=why||jsonb_build_array('add_service'); end if; if location_s=0 then why:=why||jsonb_build_array('add_service_area'); end if; if content_s<60 then why:=why||jsonb_build_array('improve_public_description'); end if; if p.status<>'active' then why:=why||jsonb_build_array('provider_not_active'); end if;
 state:=case when total_s>=75 and service_s=100 and location_s=100 and p.status='active' then 'ready'::public.readiness_state when total_s>=45 then 'needs_attention'::public.readiness_state else 'not_ready'::public.readiness_state end;
 insert into public.provider_search_readiness(provider_id,identity_score,service_score,location_score,trust_score,content_score,operations_score,total_score,readiness,reasons,evaluated_at)
 values(p.id,identity_s,service_s,location_s,trust_s,content_s,operations_s,total_s,state,why,now())
 on conflict(provider_id) do update set identity_score=excluded.identity_score,service_score=excluded.service_score,location_score=excluded.location_score,trust_score=excluded.trust_score,content_score=excluded.content_score,operations_score=excluded.operations_score,total_score=excluded.total_score,readiness=excluded.readiness,reasons=excluded.reasons,evaluated_at=excluded.evaluated_at returning * into result_row;
 return result_row;
end $$;
revoke all on function app_private.compute_provider_search_readiness(uuid) from public,anon,authenticated;

create or replace function app_private.evaluate_route_indexability(target_route_id uuid)
returns public.indexability_state language plpgsql security definer set search_path=public,app_private as $$
declare r public.public_routes%rowtype; pol public.indexability_policies%rowtype; supply_n int:=0; new_state public.indexability_state:='noindex_follow'; why jsonb:='[]'::jsonb; doc_hash text; summary_text text;
begin
 select * into r from public.public_routes where id=target_route_id; if not found then raise exception 'route not found'; end if;
 select * into pol from public.indexability_policies where is_active and entity_kind=r.entity_kind and (market_id=r.market_id or market_id is null) order by (market_id is not null) desc limit 1;
 if r.entity_kind='service' and r.location_id is not null then select count(distinct ps.provider_id) into supply_n from public.provider_services ps join public.provider_service_areas pa on pa.provider_id=ps.provider_id and pa.location_id=r.location_id and pa.is_active join public.providers p on p.id=ps.provider_id and p.status='active' where ps.service_entity_id=r.entity_id and ps.is_active; end if;
 select content_hash,summary into doc_hash,summary_text from public.public_discovery_documents where route_id=r.id;
 if pol.id is null then new_state:='noindex_follow'; why:=why||jsonb_build_array('no_policy');
 elsif supply_n<pol.minimum_supply then new_state:='insufficient_supply'; why:=why||jsonb_build_array('insufficient_supply');
 elsif coalesce(r.quality_score,0)<pol.minimum_quality_score then new_state:='insufficient_content'; why:=why||jsonb_build_array('quality_below_threshold');
 elsif pol.require_public_summary and length(coalesce(summary_text,''))<80 then new_state:='insufficient_content'; why:=why||jsonb_build_array('summary_too_thin');
 elsif pol.require_unique_content and doc_hash is null then new_state:='insufficient_content'; why:=why||jsonb_build_array('missing_content_hash'); else new_state:='indexable'; end if;
 update public.public_routes set indexability=new_state,updated_at=now() where id=r.id;
 update public.public_discovery_documents set indexability=new_state,updated_at=now(),published_at=case when new_state='indexable' then coalesce(published_at,now()) else null end where route_id=r.id;
 insert into public.route_indexability_evaluations(route_id,evaluated_state,supply_count,quality_score,content_hash,reasons) values(r.id,new_state,supply_n,r.quality_score,doc_hash,why);
 return new_state;
end $$;
revoke all on function app_private.evaluate_route_indexability(uuid) from public,anon,authenticated;

create or replace function public.create_request_command(p_market_id uuid,p_need_text text,p_idempotency_key text,p_location_id uuid default null,p_service_entity_id uuid default null,p_problem_entity_id uuid default null,p_outcome_entity_id uuid default null,p_locale text default null,p_timezone text default null)
returns uuid language plpgsql security definer set search_path=public,app_private,auth as $$
declare acct uuid; existing_id uuid; request_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 acct:=app_private.current_account_id(); if acct is null then raise exception 'active account required' using errcode='28000'; end if;
 if length(trim(coalesce(p_need_text,'')))<5 then raise exception 'need_text too short' using errcode='22023'; end if;
 if length(p_idempotency_key)<16 then raise exception 'idempotency key too short' using errcode='22023'; end if;
 select id into existing_id from public.requests where idempotency_key=p_idempotency_key; if existing_id is not null then return existing_id; end if;
 insert into public.requests(customer_account_id,market_id,location_id,service_entity_id,problem_entity_id,outcome_entity_id,state,need_text,source,locale,timezone,idempotency_key)
 values(acct,p_market_id,p_location_id,p_service_entity_id,p_problem_entity_id,p_outcome_entity_id,'submitted',trim(p_need_text),'web',p_locale,p_timezone,p_idempotency_key) returning id into request_id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','REQUEST_CREATED','request',request_id,'participant_private',jsonb_build_object('account_id',acct));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('request',request_id,'REQUEST_CREATED',jsonb_build_object('request_id',request_id,'customer_account_id',acct),'request-created:'||p_idempotency_key);
 return request_id;
end $$;
revoke all on function public.create_request_command(uuid,text,text,uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.create_request_command(uuid,text,text,uuid,uuid,uuid,uuid,text,text) to authenticated;

insert into public.indexability_policies(market_id,entity_kind,minimum_supply,minimum_quality_score,require_unique_content,require_public_summary)
values(null,'service',3,70,true,true) on conflict(market_id,entity_kind) do nothing;
