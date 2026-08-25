create type public.quote_status as enum ('draft','submitted','withdrawn','accepted','declined','expired');
create type public.assignment_status as enum ('active','cancelled','completed');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id),
  provider_id uuid not null references public.providers(id),
  status public.quote_status not null default 'submitted',
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor >= 0),
  summary text,
  scope_snapshot jsonb not null default '{}'::jsonb,
  valid_until timestamptz,
  idempotency_key text not null,
  submitted_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id,idempotency_key)
);
create index quotes_request_status_idx on public.quotes(request_id,status);
create index quotes_provider_status_idx on public.quotes(provider_id,status);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id),
  provider_id uuid not null references public.providers(id),
  accepted_quote_id uuid not null references public.quotes(id),
  status public.assignment_status not null default 'active',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index assignments_one_active_per_request_idx on public.assignments(request_id) where status='active';
create index assignments_provider_status_idx on public.assignments(provider_id,status);

alter table public.quotes enable row level security;
alter table public.assignments enable row level security;

create policy quotes_customer_read on public.quotes for select to authenticated using (
  exists(select 1 from public.requests r where r.id=quotes.request_id and r.customer_account_id=app_private.current_account_id())
);
create policy quotes_provider_read on public.quotes for select to authenticated using (
  exists(select 1 from public.providers p where p.id=quotes.provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))))
);
create policy assignments_customer_read on public.assignments for select to authenticated using (
  exists(select 1 from public.requests r where r.id=assignments.request_id and r.customer_account_id=app_private.current_account_id())
);
create policy assignments_provider_read on public.assignments for select to authenticated using (
  exists(select 1 from public.providers p where p.id=assignments.provider_id and (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))))
);

grant select on public.quotes, public.assignments to authenticated;

create or replace function app_private.submit_quote_authoritatively(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text,
  p_scope_snapshot jsonb,
  p_valid_until timestamptz,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare
  qid uuid;
  r public.requests%rowtype;
  p public.providers%rowtype;
  existing uuid;
  identity_ok boolean;
  readiness numeric;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_total_minor < 0 then raise exception 'quote total must be non-negative' using errcode='22023'; end if;
  if p_currency_code !~ '^[A-Z]{3}$' then raise exception 'invalid currency code' using errcode='22023'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency key required' using errcode='22023'; end if;

  select id into existing from public.quotes where provider_id=p_provider_id and idempotency_key=p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into r from public.requests where id=p_request_id for update;
  if not found then raise exception 'request not found' using errcode='P0002'; end if;
  if r.state not in ('submitted','matching','quoted') then raise exception 'request is not open for quotes' using errcode='22023'; end if;
  if r.service_entity_id is null or r.location_id is null then raise exception 'request needs service and location before quoting' using errcode='22023'; end if;

  select * into p from public.providers where id=p_provider_id;
  if not found then raise exception 'provider not found' using errcode='P0002'; end if;
  if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
  if p.status <> 'active' then raise exception 'provider is not active' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_services ps where ps.provider_id=p_provider_id and ps.service_entity_id=r.service_entity_id and ps.is_active) then raise exception 'provider does not offer requested service' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_service_areas pa where pa.provider_id=p_provider_id and pa.location_id=r.location_id and pa.is_active) then raise exception 'request is outside provider service area' using errcode='22023'; end if;
  select exists(select 1 from public.provider_verifications v where v.provider_id=p_provider_id and v.kind='identity' and v.status='verified' and (v.expires_at is null or v.expires_at>now())) into identity_ok;
  if not identity_ok then raise exception 'verified identity required' using errcode='22023'; end if;
  select readiness_score into readiness from public.provider_public_profiles where provider_id=p_provider_id and is_public and published_at is not null and accepts_new_work;
  if coalesce(readiness,0) < 60 then raise exception 'provider is not eligible to quote' using errcode='22023'; end if;

  insert into public.quotes(request_id,provider_id,currency_code,total_minor,summary,scope_snapshot,valid_until,idempotency_key)
  values(p_request_id,p_provider_id,p_currency_code,p_total_minor,nullif(trim(p_summary),''),coalesce(p_scope_snapshot,'{}'::jsonb),p_valid_until,p_idempotency_key)
  returning id into qid;

  if r.state in ('submitted','matching') then update public.requests set state='quoted',updated_at=now() where id=p_request_id; end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','QUOTE_SUBMITTED','quote',qid,'participant_private',jsonb_build_object('request_id',p_request_id,'provider_id',p_provider_id,'currency_code',p_currency_code,'total_minor',p_total_minor));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('request',p_request_id,'QUOTE_SUBMITTED',jsonb_build_object('quote_id',qid,'provider_id',p_provider_id), 'quote-submitted:'||qid::text);
  return qid;
end $$;

create or replace function public.submit_quote_command(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text default null,
  p_scope_snapshot jsonb default '{}'::jsonb,
  p_valid_until timestamptz default null,
  p_idempotency_key text default null
) returns uuid language sql set search_path='app_private' as $$
  select app_private.submit_quote_authoritatively(p_request_id,p_provider_id,p_currency_code,p_total_minor,p_summary,p_scope_snapshot,p_valid_until,p_idempotency_key)
$$;

grant execute on function public.submit_quote_command(uuid,uuid,text,bigint,text,jsonb,timestamptz,text) to authenticated;
revoke all on function app_private.submit_quote_authoritatively(uuid,uuid,text,bigint,text,jsonb,timestamptz,text) from public, anon, authenticated;

create or replace function app_private.accept_quote_authoritatively(p_quote_id uuid) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare
  q public.quotes%rowtype;
  r public.requests%rowtype;
  aid uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode='P0002'; end if;
  select * into r from public.requests where id=q.request_id for update;
  if r.customer_account_id <> app_private.current_account_id() then raise exception 'forbidden' using errcode='42501'; end if;
  if q.status <> 'submitted' then raise exception 'quote is not available for acceptance' using errcode='22023'; end if;
  if q.valid_until is not null and q.valid_until <= now() then
    update public.quotes set status='expired',updated_at=now() where id=q.id;
    raise exception 'quote has expired' using errcode='22023';
  end if;
  if r.state not in ('quoted','matching','submitted') then raise exception 'request cannot accept a quote in current state' using errcode='22023'; end if;
  if exists(select 1 from public.assignments a where a.request_id=r.id and a.status='active') then raise exception 'request already has an active assignment' using errcode='23505'; end if;

  update public.quotes set status='accepted',accepted_at=now(),updated_at=now() where id=q.id;
  update public.quotes set status='declined',updated_at=now() where request_id=r.id and id<>q.id and status='submitted';
  insert into public.assignments(request_id,provider_id,accepted_quote_id) values(r.id,q.provider_id,q.id) returning id into aid;
  update public.requests set state='accepted',updated_at=now() where id=r.id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','QUOTE_ACCEPTED','assignment',aid,'participant_private',jsonb_build_object('request_id',r.id,'quote_id',q.id,'provider_id',q.provider_id));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('request',r.id,'QUOTE_ACCEPTED',jsonb_build_object('assignment_id',aid,'quote_id',q.id,'provider_id',q.provider_id), 'quote-accepted:'||q.id::text);
  return aid;
end $$;

create or replace function public.accept_quote_command(p_quote_id uuid) returns uuid language sql set search_path='app_private' as $$
  select app_private.accept_quote_authoritatively(p_quote_id)
$$;
grant execute on function public.accept_quote_command(uuid) to authenticated;
revoke all on function app_private.accept_quote_authoritatively(uuid) from public, anon, authenticated;
