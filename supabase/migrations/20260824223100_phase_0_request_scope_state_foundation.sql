create type public.request_state as enum ('draft','submitted','matching','quoted','accepted','scheduled','in_progress','submitted_for_approval','completed','cancelled','disputed');
create type public.request_urgency as enum ('normal','soon','urgent','emergency_redirect');

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.accounts(id),
  organisation_id uuid references public.organisations(id),
  market_id uuid not null references public.markets(id),
  location_id uuid references public.locations(id),
  service_entity_id uuid references public.taxonomy_entities(id),
  problem_entity_id uuid references public.taxonomy_entities(id),
  outcome_entity_id uuid references public.taxonomy_entities(id),
  state public.request_state not null default 'draft',
  urgency public.request_urgency not null default 'normal',
  title text,
  need_text text not null,
  source text not null default 'web',
  locale text,
  timezone text,
  idempotency_key text not null unique,
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.requests is 'Authoritative request record. AI may suggest classifications/scope but may not directly mutate authoritative state.';

create index requests_customer_idx on public.requests(customer_account_id, created_at desc);
create index requests_org_idx on public.requests(organisation_id) where organisation_id is not null;
create index requests_market_state_idx on public.requests(market_id, state, created_at desc);
create index requests_location_idx on public.requests(location_id) where location_id is not null;
create index requests_service_idx on public.requests(service_entity_id) where service_entity_id is not null;
create index requests_problem_idx on public.requests(problem_entity_id) where problem_entity_id is not null;
create index requests_outcome_idx on public.requests(outcome_entity_id) where outcome_entity_id is not null;

create table public.request_scopes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft','proposed','accepted','superseded')),
  scope_json jsonb not null default '{}'::jsonb,
  created_by_account_id uuid references public.accounts(id),
  accepted_by_account_id uuid references public.accounts(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id, version),
  constraint accepted_scope_fields check ((status <> 'accepted') or (accepted_by_account_id is not null and accepted_at is not null))
);

comment on table public.request_scopes is 'Versioned structured scope. Accepted records are authority; prior versions are preserved.';
create index request_scopes_request_idx on public.request_scopes(request_id, version desc);
create index request_scopes_creator_idx on public.request_scopes(created_by_account_id) where created_by_account_id is not null;
create index request_scopes_acceptor_idx on public.request_scopes(accepted_by_account_id) where accepted_by_account_id is not null;

create or replace function app_private.validate_request_transition(old_state public.request_state, new_state public.request_state)
returns boolean language sql immutable set search_path = '' as $$
select old_state = new_state or case old_state
  when 'draft' then new_state in ('submitted','cancelled')
  when 'submitted' then new_state in ('matching','cancelled')
  when 'matching' then new_state in ('quoted','cancelled')
  when 'quoted' then new_state in ('accepted','matching','cancelled')
  when 'accepted' then new_state in ('scheduled','cancelled','disputed')
  when 'scheduled' then new_state in ('in_progress','cancelled','disputed')
  when 'in_progress' then new_state in ('submitted_for_approval','disputed','cancelled')
  when 'submitted_for_approval' then new_state in ('completed','in_progress','disputed')
  when 'completed' then new_state in ('disputed')
  when 'cancelled' then false
  when 'disputed' then new_state in ('in_progress','submitted_for_approval','completed','cancelled')
  else false end;
$$;

create or replace function app_private.enforce_request_state_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app_private.validate_request_transition(old.state, new.state) then
    raise exception 'invalid request state transition: % -> %', old.state, new.state using errcode = '23514';
  end if;
  if old.state <> new.state then
    if new.state = 'submitted' and new.submitted_at is null then new.submitted_at := now(); end if;
    if new.state = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    if new.state = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_state_guard before update on public.requests for each row execute function app_private.enforce_request_state_transition();

alter table public.requests enable row level security;
alter table public.request_scopes enable row level security;

create policy requests_owner_select on public.requests for select to authenticated
using (customer_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id)));
create policy requests_owner_insert on public.requests for insert to authenticated
with check (customer_account_id = app_private.current_account_id() and (organisation_id is null or app_private.is_active_org_member(organisation_id)));
create policy requests_owner_update on public.requests for update to authenticated
using (customer_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id)))
with check (customer_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id)));

create policy request_scopes_participant_select on public.request_scopes for select to authenticated
using (exists (select 1 from public.requests r where r.id=request_id and (r.customer_account_id=app_private.current_account_id() or (r.organisation_id is not null and app_private.is_active_org_member(r.organisation_id)))));
create policy request_scopes_participant_insert on public.request_scopes for insert to authenticated
with check (exists (select 1 from public.requests r where r.id=request_id and (r.customer_account_id=app_private.current_account_id() or (r.organisation_id is not null and app_private.is_active_org_member(r.organisation_id)))));
create policy request_scopes_participant_update on public.request_scopes for update to authenticated
using (exists (select 1 from public.requests r where r.id=request_id and (r.customer_account_id=app_private.current_account_id() or (r.organisation_id is not null and app_private.is_active_org_member(r.organisation_id)))))
with check (exists (select 1 from public.requests r where r.id=request_id and (r.customer_account_id=app_private.current_account_id() or (r.organisation_id is not null and app_private.is_active_org_member(r.organisation_id)))));

revoke all on public.requests from anon;
revoke all on public.request_scopes from anon;
grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.request_scopes to authenticated;
