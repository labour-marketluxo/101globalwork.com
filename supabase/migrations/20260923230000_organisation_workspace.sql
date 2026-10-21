-- The organisation workspace: setup, the executive dashboard, and the portfolio.
--
-- ⚠️ ORGANISATIONS ALREADY EXISTED; WHAT THEY COULD NOT DO WAS CARRY A BUSINESS. The table has a type, a legal name,
-- a display name and a market, and nothing else: no currency, no branches, no budget, no contact, no plan. This adds
-- the columns and the three small tables the wizard and the dashboard need, and nothing that belongs to a project.
--
-- ⚠️ AN ORGANISATION'S PROJECTS ARE ITS REQUESTS. `requests.organisation_id` already exists and org members can
-- already read them through the policy on that table, so the portfolio is a view of requests — not a second kind of
-- project, and not a copy of the assignments behind them.
--
-- ⚠️ EVERY READ IS ONE OF TWO ROLES: a member of the organisation, or platform staff with `platform.projects.read`.
-- Budgets and money are NOT readable through RLS by a member who did not commission the work, so the dashboard read
-- is a definer function that checks membership itself rather than widening a policy on a financial table.

alter table public.organisations
  add column if not exists currency_code text,
  add column if not exists timezone text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text,
  add column if not exists subscription_plan text not null default 'standard',
  add column if not exists operational_policies jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'active',
  -- The wizard's Save Draft: one payload, owned by one account, deleted when the organisation is created.
  add column if not exists draft_payload jsonb;

alter table public.organisations
  add constraint organisations_status_chk check (status in ('draft','active','suspended'));

create table public.organisation_locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  kind text not null default 'site' check (kind in ('branch','site')),
  label text,
  is_primary boolean not null default false,
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, location_id)
);

create index organisation_locations_org_idx on public.organisation_locations(organisation_id, kind);

create table public.organisation_budgets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- Null means the budget is the whole organisation's; a branch or site budget is scoped to that location.
  location_id uuid references public.locations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  committed_minor bigint not null default 0 check (committed_minor >= 0),
  actual_minor bigint not null default 0 check (actual_minor >= 0),
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_budget_period_chk check (period_end >= period_start)
);

-- One budget per organisation, location and period — including the organisation-wide row, which has no location. The
-- repo already uses `nulls not distinct` for exactly this shape (see indexability_policies).
create unique index organisation_budget_scope_idx
  on public.organisation_budgets(organisation_id, location_id, period_start) nulls not distinct;

create table public.organisation_project_owners (
  request_id uuid primary key references public.requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_account_id uuid not null references public.accounts(id) on delete restrict,
  assigned_by_account_id uuid not null references public.accounts(id),
  assigned_at timestamptz not null default now()
);

create index organisation_project_owners_org_idx on public.organisation_project_owners(organisation_id, owner_account_id);

alter table public.organisation_locations enable row level security;
alter table public.organisation_budgets enable row level security;
alter table public.organisation_project_owners enable row level security;

create policy organisation_locations_member_read on public.organisation_locations
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy organisation_budgets_member_read on public.organisation_budgets
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy organisation_project_owners_member_read on public.organisation_project_owners
  for select to authenticated using (app_private.is_active_org_member(organisation_id));

revoke all on public.organisation_locations, public.organisation_budgets, public.organisation_project_owners from anon;
revoke insert, update, delete on public.organisation_locations, public.organisation_budgets, public.organisation_project_owners from authenticated;
grant select on public.organisation_locations, public.organisation_budgets, public.organisation_project_owners to authenticated;

comment on table public.organisation_budgets is
  'Committed and actual spend per organisation, branch or site, per period. A budget is a plan; the actuals behind it are the funded obligations the dashboard reads separately.';
comment on table public.organisation_project_owners is
  'The internal owner of one organisation request. Internal means internal: the provider on the job never sees this.';

-- ── Commands ──────────────────────────────────────────────────────────────────────────────────

/** Who may run the organisation's work. One function, used by every command below. */
create or replace function app_private.organisation_role_for(p_organisation_id uuid)
returns text
language sql
stable
security definer
set search_path = public, app_private, auth
as $$
  select case
    when exists (
      select 1 from public.organisation_members m
      where m.organisation_id = p_organisation_id
        and m.account_id = app_private.current_account_id()
        and m.removed_at is null
        and m.role in ('owner','admin')
    ) then 'admin'
    when app_private.is_active_org_member(p_organisation_id) then 'member'
    when app_private.current_account_has_platform_capability('platform.projects.read') then 'platform'
    else null
  end;
$$;

revoke all on function app_private.organisation_role_for(uuid) from public, anon;
grant execute on function app_private.organisation_role_for(uuid) to authenticated;

/** Save the wizard's draft, or clear it when the payload is empty. */
create or replace function public.save_organisation_draft_command(p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'a draft payload must be an object' using errcode = '22023';
  end if;
  if pg_column_size(payload) > 32768 then
    raise exception 'draft payload is too large' using errcode = '22023';
  end if;

  if payload = '{}'::jsonb then
    update public.organisations
       set draft_payload = null, updated_at = now()
     where created_by_account_id = acct and status = 'draft';
    return false;
  end if;

  update public.organisations
     set draft_payload = payload, updated_at = now()
   where created_by_account_id = acct and status = 'draft';
  return true;
end $$;

revoke all on function public.save_organisation_draft_command(jsonb) from public, anon;
grant execute on function public.save_organisation_draft_command(jsonb) to authenticated;

/**
 * Create the organisation, with the checks the wizard promises.
 *
 * ⚠️ THE DUPLICATE CHECK IS ON THE DISPLAY NAME AND IT IS CASE-INSENSITIVE. Two organisations with the same name in
 * one market is how an invoice goes to the wrong company; the refusal says which name is taken rather than silently
 * creating a second one.
 *
 * ⚠️ THE MARKET AND THE LOCATIONS ARE VALIDATED AGAINST THE CATALOGS THE PLATFORM ACTUALLY MATCHES ON. A branch at a
 * place this platform has no row for would never match a provider, and the wizard would have accepted it.
 */
create or replace function public.create_organisation_workspace_command(
  p_display_name text,
  p_organisation_type text,
  p_legal_name text default null,
  p_market_id uuid default null,
  p_currency_code text default null,
  p_timezone text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_subscription_plan text default 'standard',
  p_policies jsonb default '{}'::jsonb,
  p_location_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  name text := btrim(coalesce(p_display_name, ''));
  org_id uuid;
  location uuid;
  first_location boolean := true;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if char_length(name) < 2 or char_length(name) > 160 then
    raise exception 'a display name of 2 to 160 characters is required' using errcode = '22023';
  end if;
  if p_organisation_type not in ('service_company','business_customer','merchant','institution') then
    raise exception 'invalid organisation type' using errcode = '22023';
  end if;
  if p_market_id is not null and not exists (select 1 from public.public_market_catalog m where m.market_id = p_market_id) then
    raise exception 'that market is not available on this platform' using errcode = '22023';
  end if;
  if coalesce(p_currency_code, '') <> '' and upper(p_currency_code) !~ '^[A-Z]{3}$' then
    raise exception 'the currency must be a three-letter code' using errcode = '22023';
  end if;
  if exists (select 1 from public.organisations o where lower(o.display_name) = lower(name) and o.status <> 'draft') then
    raise exception 'an organisation with that name already exists' using errcode = '23505';
  end if;
  if coalesce(trim(p_contact_email), '') <> '' and position('@' in p_contact_email) < 2 then
    raise exception 'that contact email is not an address' using errcode = '22023';
  end if;

  foreach location in array coalesce(p_location_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.public_location_catalog l where l.location_id = location) then
      raise exception 'that location is not in the platform catalog' using errcode = '22023';
    end if;
  end loop;

  insert into public.organisations(
    organisation_type, legal_name, display_name, primary_market_id, created_by_account_id,
    currency_code, timezone, primary_contact_name, primary_contact_email, primary_contact_phone,
    subscription_plan, operational_policies, status, draft_payload
  ) values (
    p_organisation_type::public.organisation_type,
    nullif(btrim(coalesce(p_legal_name, '')), ''), name, p_market_id, acct,
    nullif(upper(coalesce(p_currency_code, '')), ''), nullif(btrim(coalesce(p_timezone, '')), ''),
    nullif(btrim(coalesce(p_contact_name, '')), ''), nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    coalesce(nullif(btrim(coalesce(p_subscription_plan, '')), ''), 'standard'), coalesce(p_policies, '{}'::jsonb), 'active', null
  ) returning id into org_id;

  insert into public.organisation_members(organisation_id, account_id, role)
  values (org_id, acct, 'owner');

  foreach location in array coalesce(p_location_ids, '{}'::uuid[]) loop
    insert into public.organisation_locations(organisation_id, location_id, kind, is_primary, created_by_account_id)
    values (org_id, location, 'site', first_location, acct);
    first_location := false;
  end loop;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_CREATED', 'organisation', org_id, 'organisation_confidential',
          jsonb_build_object('locations', coalesce(array_length(p_location_ids, 1), 0), 'plan', p_subscription_plan));

  return org_id;
end $$;

revoke all on function public.create_organisation_workspace_command(text, text, text, uuid, text, text, text, text, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.create_organisation_workspace_command(text, text, text, uuid, text, text, text, text, text, text, jsonb, uuid[]) to authenticated;

create or replace function public.add_organisation_location_command(
  p_organisation_id uuid,
  p_location_id uuid,
  p_kind text default 'site',
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  location_row_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role <> 'admin' then
    raise exception 'only an owner or administrator of the organisation adds a location' using errcode = '42501';
  end if;
  if p_kind not in ('branch','site') then raise exception 'invalid location kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.public_location_catalog l where l.location_id = p_location_id) then
    raise exception 'that location is not in the platform catalog' using errcode = '22023';
  end if;

  insert into public.organisation_locations(organisation_id, location_id, kind, label, created_by_account_id)
  values (p_organisation_id, p_location_id, p_kind, nullif(btrim(coalesce(p_label, '')), ''), app_private.current_account_id())
  on conflict (organisation_id, location_id) do update
    set kind = excluded.kind, label = excluded.label
  returning id into location_row_id;

  return location_row_id;
end $$;

revoke all on function public.add_organisation_location_command(uuid, uuid, text, text) from public, anon;
grant execute on function public.add_organisation_location_command(uuid, uuid, text, text) to authenticated;

/** Set one budget row. Upsert on the same organisation, location and period, so a correction is a correction. */
create or replace function public.set_organisation_budget_command(
  p_organisation_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end date,
  p_currency_code text,
  p_committed_minor bigint,
  p_actual_minor bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  budget_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role <> 'admin' then
    raise exception 'only an owner or administrator sets a budget' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'a budget needs a period that ends on or after it starts' using errcode = '22023';
  end if;
  if upper(coalesce(p_currency_code, '')) !~ '^[A-Z]{3}$' then
    raise exception 'the currency must be a three-letter code' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.organisation_locations l
    where l.organisation_id = p_organisation_id and l.location_id = p_location_id
  ) then
    raise exception 'that location is not one of this organisation''s' using errcode = '22023';
  end if;
  if coalesce(p_committed_minor, 0) < coalesce(p_actual_minor, 0) then
    raise exception 'actual spend cannot be higher than the committed budget — raise the budget or correct the actuals' using errcode = '22023';
  end if;

  insert into public.organisation_budgets(
    organisation_id, location_id, period_start, period_end, currency_code, committed_minor, actual_minor, created_by_account_id
  ) values (
    p_organisation_id, p_location_id, p_period_start, p_period_end, upper(p_currency_code),
    greatest(coalesce(p_committed_minor, 0), 0), greatest(coalesce(p_actual_minor, 0), 0), app_private.current_account_id()
  )
  on conflict (organisation_id, location_id, period_start) do update
    set period_end = excluded.period_end,
        currency_code = excluded.currency_code,
        committed_minor = excluded.committed_minor,
        actual_minor = excluded.actual_minor,
        updated_at = now()
  returning id into budget_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_BUDGET_SET', 'organisation', p_organisation_id, 'organisation_confidential',
          jsonb_build_object('budget_id', budget_id, 'location_id', p_location_id, 'period_start', p_period_start));

  return budget_id;
end $$;

revoke all on function public.set_organisation_budget_command(uuid, uuid, date, date, text, bigint, bigint) from public, anon;
grant execute on function public.set_organisation_budget_command(uuid, uuid, date, date, text, bigint, bigint) to authenticated;

/**
 * Assign the internal owner of one of the organisation's projects.
 *
 * ⚠️ THE OWNER MUST BE AN ACTIVE MEMBER, and the project must belong to this organisation. An owner who cannot open
 * the job is a name in a column, and assigning one outside the organisation would leak the job to an account with no
 * relationship to it.
 */
create or replace function public.assign_organisation_project_owner_command(
  p_organisation_id uuid,
  p_request_id uuid,
  p_owner_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role <> 'admin' then
    raise exception 'only an owner or administrator assigns an owner' using errcode = '42501';
  end if;
  if not exists (select 1 from public.requests r where r.id = p_request_id and r.organisation_id = p_organisation_id) then
    raise exception 'that project is not this organisation''s' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organisation_members m
    where m.organisation_id = p_organisation_id and m.account_id = p_owner_account_id and m.removed_at is null
  ) then
    raise exception 'the owner must be an active member of the organisation' using errcode = '22023';
  end if;

  insert into public.organisation_project_owners(request_id, organisation_id, owner_account_id, assigned_by_account_id)
  values (p_request_id, p_organisation_id, p_owner_account_id, app_private.current_account_id())
  on conflict (request_id) do update
    set owner_account_id = excluded.owner_account_id,
        assigned_by_account_id = excluded.assigned_by_account_id,
        assigned_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_PROJECT_OWNER_ASSIGNED', 'organisation', p_organisation_id, 'organisation_confidential',
          jsonb_build_object('request_id', p_request_id, 'owner_account_id', p_owner_account_id));
end $$;

revoke all on function public.assign_organisation_project_owner_command(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_organisation_project_owner_command(uuid, uuid, uuid) to authenticated;

-- ── The read model: one document for the dashboard and the portfolio ──────────────────────────

/**
 * Everything the organisation's pages show, in one read.
 *
 * ⚠️ ONE DOCUMENT, SO THE WIDGETS AND THE TABLE CANNOT DISAGREE. The dashboard's counts and the portfolio's rows come
 * from the same query, which is the only arrangement where "3 awaiting your approval" and the three rows beneath it
 * are the same three things.
 *
 * ⚠️ MONEY COMES FROM THE OBLIGATIONS, NOT FROM THE BUDGET. A budget is a plan somebody typed; the amount behind a
 * project is the funded obligation the platform would pay against. Both are returned, and shown side by side, so the
 * gap between the plan and the commitment is visible rather than smoothed away.
 */
create or replace function public.get_organisation_command(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  o public.organisations%rowtype;
  locations jsonb := '[]'::jsonb;
  members jsonb := '[]'::jsonb;
  budgets jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  approvals jsonb := '[]'::jsonb;
  exceptions jsonb := '[]'::jsonb;
  providers jsonb := '[]'::jsonb;
  totals record;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into o from public.organisations where id = p_organisation_id;
  if not found then return jsonb_build_object('allowed', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'location_id', l.location_id, 'name', lc.display_name, 'kind', l.kind,
           'label', l.label, 'is_primary', l.is_primary
         ) order by l.is_primary desc, lc.display_name), '[]'::jsonb)
    into locations
    from public.organisation_locations l
    join public.public_location_catalog lc on lc.location_id = l.location_id
   where l.organisation_id = p_organisation_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', m.account_id,
           'name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = m.account_id limit 1), 'A member'),
           'role', m.role::text,
           'joined_at', m.joined_at
         ) order by m.joined_at), '[]'::jsonb)
    into members
    from public.organisation_members m
   where m.organisation_id = p_organisation_id and m.removed_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'location_id', b.location_id,
           'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = b.location_id),
           'period_start', b.period_start, 'period_end', b.period_end, 'currency_code', b.currency_code,
           'committed_minor', b.committed_minor, 'actual_minor', b.actual_minor
         ) order by b.period_start desc), '[]'::jsonb)
    into budgets
    from public.organisation_budgets b where b.organisation_id = p_organisation_id;

  -- The portfolio: every request this organisation commissioned, with its money and its assignment.
  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id,
           'title', coalesce(nullif(btrim(r.need_text), ''), 'Organisation request'),
           'state', r.state::text,
           'urgency', r.urgency::text,
           'created_at', r.created_at,
           'completed_at', r.completed_at,
           'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
           'service_name', (select sc.display_name from public.public_service_catalog sc where sc.service_entity_id = r.service_entity_id),
           'owner_account_id', owner.owner_account_id,
           'owner_name', (select pr.display_name from public.profiles pr where pr.account_id = owner.owner_account_id limit 1),
           'assignment_id', a.id,
           'assignment_status', a.status::text,
           'scheduled_end', s.scheduled_end,
           'obligation_status', ob.status::text,
           'amount_minor', ob.amount_minor,
           'currency_code', ob.currency_code,
           'budget_committed_minor', (
             select b.committed_minor from public.organisation_budgets b
             where b.organisation_id = p_organisation_id
               and (b.location_id = r.location_id or b.location_id is null)
             order by (b.location_id is not null) desc, b.period_start desc
             limit 1
           ),
           'provider_id', a.provider_id,
           'provider_name', (select p.display_name from public.providers p where p.id = a.provider_id),
           'blocked', exists (
             select 1 from public.assignment_blockers blk where blk.assignment_id = a.id and blk.resolved_at is null
           ),
           'open_case', exists (
             select 1 from public.project_issues i
             where i.assignment_id = a.id and i.status in ('open','investigation','escalated')
           ),
           'needs_org_approval', r.state in ('quoted','submitted_for_approval'),
           -- SLA health, from the window the provider agreed. A job with no window is not late: it has not agreed a
           -- date, and calling that a breach would make the indicator meaningless on the jobs that need setting up.
           'sla', case
             when r.state = 'completed' then 'complete'
             when exists (select 1 from public.assignment_blockers blk where blk.assignment_id = a.id and blk.resolved_at is null) then 'blocked'
             when s.scheduled_end is null then 'no_window'
             when s.scheduled_end < now() and r.state not in ('completed','submitted_for_approval') then 'late'
             else 'on_track'
           end,
           'next_action', case
             when r.state in ('quoted','submitted_for_approval') then 'organisation_decision'
             when r.state = 'accepted' then 'provider_schedule'
             when r.state = 'scheduled' then 'confirm_or_start'
             when r.state = 'in_progress' then 'provider_evidence'
             when r.state = 'completed' then 'none'
             else 'none'
           end
         ) order by r.created_at desc), '[]'::jsonb)
    into projects
    from public.requests r
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.assignment_schedules s on s.assignment_id = a.id
    left join public.payment_obligations ob on ob.assignment_id = a.id
    left join public.organisation_project_owners owner on owner.request_id = r.id
   where r.organisation_id = p_organisation_id;

  -- Anything the organisation itself has to decide, with the money attached.
  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id,
           'title', coalesce(nullif(btrim(r.need_text), ''), 'Organisation request'),
           'kind', case when r.state = 'submitted_for_approval' then 'completion' else 'quote' end,
           'amount_minor', coalesce(ob.amount_minor, q.total_minor),
           'currency_code', coalesce(ob.currency_code, q.currency_code),
           'state', r.state::text,
           'provider_name', (select p.display_name from public.providers p where p.id = coalesce(a.provider_id, q.provider_id))
         ) order by coalesce(ob.amount_minor, q.total_minor) desc nulls last), '[]'::jsonb)
    into approvals
    from public.requests r
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.payment_obligations ob on ob.assignment_id = a.id
    left join lateral (
      select q0.total_minor, q0.currency_code, q0.provider_id
      from public.quotes q0
      where q0.request_id = r.id and q0.status = 'submitted'
      order by q0.submitted_at desc limit 1
    ) q on true
   where r.organisation_id = p_organisation_id and r.state in ('quoted','submitted_for_approval');

  -- Critical exceptions: a stopped site, a case holding money, and work past its agreed finish.
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
    into exceptions
    from (
      select jsonb_build_object(
        'kind', 'blocked', 'severity', 'high',
        'label', 'A site is stopped: ' || coalesce(nullif(btrim(r.need_text), ''), 'a request'),
        'detail', blk.reason_code || coalesce(' — ' || blk.note, ''),
        'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id)
      ) as entry
      from public.assignment_blockers blk
      join public.assignments a on a.id = blk.assignment_id
      join public.requests r on r.id = a.request_id
      where r.organisation_id = p_organisation_id and blk.resolved_at is null
      union all
      select jsonb_build_object(
        'kind', 'case', 'severity', 'high',
        'label', 'An open case is holding a payout',
        'detail', i.kind || ' — ' || i.summary,
        'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id)
      )
      from public.project_issues i
      join public.assignments a on a.id = i.assignment_id
      join public.requests r on r.id = a.request_id
      where r.organisation_id = p_organisation_id
        and i.legal_hold and i.status in ('open','investigation','escalated')
      union all
      select jsonb_build_object(
        'kind', 'overdue', 'severity', 'medium',
        'label', 'Work is past its agreed finish',
        'detail', coalesce(nullif(btrim(r.need_text), ''), 'a request') || ' — due ' || to_char(s.scheduled_end, 'DD Mon'),
        'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id)
      )
      from public.assignment_schedules s
      join public.assignments a on a.id = s.assignment_id and a.status = 'active'
      join public.requests r on r.id = a.request_id
      where r.organisation_id = p_organisation_id
        and s.scheduled_end is not null and s.scheduled_end < now()
        and r.state not in ('completed','submitted_for_approval','cancelled')
        and not exists (select 1 from public.assignment_blockers blk where blk.assignment_id = a.id and blk.resolved_at is null)
    ) exception_rows;

  -- Provider performance across this organisation's work: counts of rows, not a score.
  select coalesce(jsonb_agg(jsonb_build_object(
           'provider_id', p.id, 'name', p.display_name,
           'jobs', agg.jobs, 'completed', agg.completed, 'on_time', agg.on_time, 'late', agg.late
         ) order by agg.jobs desc, p.display_name), '[]'::jsonb)
    into providers
    from (
      select a.provider_id,
             count(*)::integer as jobs,
             (count(*) filter (where r.state = 'completed'))::integer as completed,
             (count(*) filter (where r.state = 'completed' and (s.scheduled_end is null or r.completed_at <= s.scheduled_end)))::integer as on_time,
             (count(*) filter (where r.state = 'completed' and s.scheduled_end is not null and r.completed_at > s.scheduled_end))::integer as late
      from public.assignments a
      join public.requests r on r.id = a.request_id
      left join public.assignment_schedules s on s.assignment_id = a.id
      where r.organisation_id = p_organisation_id
      group by a.provider_id
    ) agg
    join public.providers p on p.id = agg.provider_id;

  select
    count(*)::integer as total,
    (count(*) filter (where r.state in ('accepted','scheduled','in_progress')))::integer as active,
    (count(*) filter (where r.state = 'completed'))::integer as completed,
    (count(*) filter (where r.state in ('draft','submitted','matching')))::integer as pre_work,
    coalesce(sum(ob.amount_minor) filter (where ob.status = 'funded' and r.state <> 'completed'), 0)::bigint as committed_funded
    into totals
    from public.requests r
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.payment_obligations ob on ob.assignment_id = a.id
   where r.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'organisation', jsonb_build_object(
      'id', o.id,
      'display_name', o.display_name,
      'legal_name', o.legal_name,
      'organisation_type', o.organisation_type::text,
      'currency_code', o.currency_code,
      'timezone', o.timezone,
      'subscription_plan', o.subscription_plan,
      'status', o.status,
      'primary_contact_name', o.primary_contact_name,
      'primary_contact_email', o.primary_contact_email,
      'primary_contact_phone', o.primary_contact_phone,
      'policies', o.operational_policies,
      'market_name', (select m.display_name from public.public_market_catalog m where m.market_id = o.primary_market_id)
    ),
    'locations', locations,
    'members', members,
    'budgets', budgets,
    'projects', projects,
    'approvals', approvals,
    'exceptions', exceptions,
    'providers', providers,
    'totals', jsonb_build_object(
      'projects', coalesce(totals.total, 0),
      'active', coalesce(totals.active, 0),
      'completed', coalesce(totals.completed, 0),
      'pre_work', coalesce(totals.pre_work, 0),
      'committed_funded_minor', coalesce(totals.committed_funded, 0),
      'approvals', jsonb_array_length(approvals),
      'exceptions', jsonb_array_length(exceptions)
    )
  );
end $$;

revoke all on function public.get_organisation_command(uuid) from public, anon;
grant execute on function public.get_organisation_command(uuid) to authenticated;

comment on function public.get_organisation_command(uuid) is
  'One organisation as its members see it: the entity, its locations, budgets, members, portfolio, approvals waiting on it, exceptions and provider counts.';
