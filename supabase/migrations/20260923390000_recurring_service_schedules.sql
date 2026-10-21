-- Recurring service agreements: the standing arrangements and their scheduled visits, behind /recurring.
--
-- ── WHAT "AUTOMATED" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────────
--
-- The scheduler maintains the calendar: it generates the visit dates forward from the cadence, keeps the
-- next one ahead of today, and regenerates the future set when a cadence change is agreed. What it does NOT
-- do is bill. There is no card on file, no mandate table and no charging job in this platform, and inventing
-- one inside a scheduler would be a recurring charge nobody authorised.
--
-- So `amount_minor` and `billing_basis` are the AGREED PRICE RECORD — what the two sides agreed a visit or a
-- period costs — and the page states that plainly next to them. The money for work that is actually carried
-- out still moves the way every other job on this platform moves: through an agreement and a funded payment
-- obligation on the project. A plan is a commitment to turn up; it is not a payment instrument.
--
-- ── WHO A PLAN CAN BE WITH, AND WHY THE LIST IS SHORT ─────────────────────────────────────────
--
-- A plan can only name a provider this customer has already worked with on the platform — there is at least
-- one assignment between the two accounts. That is not a limitation invented for convenience: a standing
-- arrangement is the one thing on this platform that keeps acting without anybody looking at it, and the
-- platform will not create one with a provider it has no record of the two accounts ever working together.
-- The command enforces it, and the page says why the picker is short.
--
-- ── A VISIT IS A DATE, NOT PROOF OF WORK ─────────────────────────────────────────────────────
--
-- `recurring_visits` is a calendar. A visit being "scheduled" says the two sides agreed a slot, and
-- `completed` is set by somebody recording that the visit happened — it is not derived from an assignment,
-- because the platform does not yet reconcile a recurring visit to the work done on it. The page says so
-- rather than letting a green tick imply verification.

create type public.recurring_cadence as enum ('weekly', 'monthly', 'quarterly');
create type public.recurring_plan_status as enum ('active', 'paused', 'ended');
create type public.recurring_billing_basis as enum ('per_visit', 'per_period');
create type public.recurring_visit_state as enum ('scheduled', 'completed', 'skipped', 'cancelled');
create type public.recurring_cadence_request_state as enum ('requested', 'accepted', 'declined');

create table public.recurring_plans (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^REC-[0-9A-F]{10}$'),
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  -- Optional: the project this arrangement grew out of, so a plan can point at the work that started it.
  assignment_id uuid references public.assignments(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 4 and 160),
  cadence public.recurring_cadence not null,
  -- Per visit or per billing period. Both are legitimate; they are different agreements and the page shows
  -- which one was made rather than guessing from the amount.
  billing_basis public.recurring_billing_basis not null default 'per_visit',
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Where the visits happen, and what they are for. `location_label` is free text: the discovery location
  -- catalogue describes service areas, not somebody's building, and a plan needs the actual site.
  location_label text not null check (char_length(btrim(location_label)) between 2 and 200),
  -- Optional links into the customer's own asset register and into the project this came from.
  asset_id uuid references public.customer_assets(id) on delete set null,
  status public.recurring_plan_status not null default 'active',
  starts_on date not null,
  next_execution_on date not null,
  paused_at timestamptz,
  pause_reason text check (pause_reason is null or char_length(btrim(pause_reason)) between 1 and 500),
  ended_on date,
  end_reason text check (end_reason is null or char_length(btrim(end_reason)) between 1 and 500),
  notes text check (notes is null or char_length(btrim(notes)) between 1 and 2000),
  created_by_account_id uuid not null references public.accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Paused and paused_at are one fact, not two.
  constraint recurring_plans_pause_shape check ((status = 'paused') = (paused_at is not null)),
  constraint recurring_plans_end_shape check ((status = 'ended') = (ended_on is not null)),
  constraint recurring_plans_next_execution_chk check (next_execution_on >= starts_on)
);

create index recurring_plans_customer_idx on public.recurring_plans(customer_account_id, status);
create index recurring_plans_provider_idx on public.recurring_plans(provider_id, status);
create index recurring_plans_assignment_idx on public.recurring_plans(assignment_id) where assignment_id is not null;

create table public.recurring_visits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.recurring_plans(id) on delete cascade,
  -- Position in the plan's sequence, regenerated wholesale when the cadence changes so the numbering stays
  -- 1..n from the current next_execution_on rather than accumulating gaps.
  sequence integer not null check (sequence between 1 and 500),
  scheduled_for date not null,
  state public.recurring_visit_state not null default 'scheduled',
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  recorded_by_account_id uuid references public.accounts(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, sequence),
  -- A visit that is not recorded as done cannot carry a completion time, and one that is done must.
  constraint recurring_visits_completion_shape check (
    (state = 'completed') = (completed_at is not null)
  )
);

create index recurring_visits_plan_idx on public.recurring_visits(plan_id, scheduled_for);
create index recurring_visits_calendar_idx on public.recurring_visits(scheduled_for) where state = 'scheduled';

/**
 * A cadence change asked for by one side and decided by the other.
 *
 * The plan's cadence only changes when the request is ACCEPTED, and acceptance regenerates the future
 * schedule in the same transaction — so there is never a moment where the plan claims one cadence and its
 * visits are on another.
 */
create table public.recurring_cadence_requests (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.recurring_plans(id) on delete cascade,
  requested_cadence public.recurring_cadence not null,
  requested_start_on date,
  reason text not null check (char_length(btrim(reason)) between 4 and 1000),
  state public.recurring_cadence_request_state not null default 'requested',
  requested_by_account_id uuid not null references public.accounts(id) on delete restrict,
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint recurring_cadence_requests_decision_shape check (
    (state = 'requested') = (decided_at is null)
  )
);

-- One open request per plan: a second "please move me to monthly" while the first is unanswered would let a
-- decision arrive against the wrong row.
create unique index recurring_cadence_requests_one_open_idx
  on public.recurring_cadence_requests(plan_id) where state = 'requested';
create index recurring_cadence_requests_plan_idx on public.recurring_cadence_requests(plan_id, created_at desc);

alter table public.recurring_plans enable row level security;
alter table public.recurring_visits enable row level security;
alter table public.recurring_cadence_requests enable row level security;

-- Denied through the Data API: every path is a command that re-derives the caller.
create policy recurring_plans_deny_direct on public.recurring_plans for all to authenticated using (false) with check (false);
create policy recurring_visits_deny_direct on public.recurring_visits for all to authenticated using (false) with check (false);
create policy recurring_cadence_requests_deny_direct on public.recurring_cadence_requests for all to authenticated using (false) with check (false);

comment on table public.recurring_plans is
  'A standing arrangement between one customer account and one provider. The agreed price is recorded here; the platform does not charge it automatically.';

-- ── Helpers ───────────────────────────────────────────────────────────────────────────────────

create or replace function app_private.recurring_cadence_interval(p_cadence public.recurring_cadence)
returns interval
language sql
immutable
as $$
  select case p_cadence
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
    else interval '3 months'
  end;
$$;

/**
 * The single definition of "I am part of this plan", in either role.
 *
 * Returns 'customer' or 'provider', or null. Every read and write uses it, so no command can disagree with
 * another about who is allowed to see or change a standing arrangement.
 */
create or replace function app_private.recurring_plan_role(p_plan_id uuid, p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = public, app_private
as $$
  select case
    when p.customer_account_id = p_account_id then 'customer'
    when exists (
      select 1 from public.providers pr
       where pr.id = p.provider_id
         and (pr.owner_account_id = p_account_id
              or (pr.organisation_id is not null and app_private.is_active_org_member(pr.organisation_id)))
    ) then 'provider'
    else null
  end
    from public.recurring_plans p
   where p.id = p_plan_id;
$$;

/**
 * Rebuild the forward calendar.
 *
 * Deletes only visits that are still `scheduled` — a completed or skipped visit is a record of something that
 * happened, and regenerating must not erase it — then writes six from the plan's next execution date.
 *
 * ⚠️ SIX IS A NUMBER, NOT A POLICY: it is enough that the next visit is always visible on a quarterly plan
 * without a background job, and small enough that changing a cadence does not rewrite years of dates a
 * provider has already planned around.
 */
create or replace function app_private.regenerate_recurring_visits(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  p public.recurring_plans%rowtype;
  step interval;
  i integer;
begin
  select * into p from public.recurring_plans where id = p_plan_id;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  step := app_private.recurring_cadence_interval(p.cadence);

  delete from public.recurring_visits where plan_id = p.id and state = 'scheduled';

  for i in 0..5 loop
    insert into public.recurring_visits (plan_id, sequence, scheduled_for)
    values (p.id, i + 1, (p.next_execution_on + (i * step))::date)
    on conflict (plan_id, sequence) do update
      set scheduled_for = excluded.scheduled_for,
          state = 'scheduled',
          note = null,
          completed_at = null,
          recorded_by_account_id = null;
  end loop;
end $$;

/** The next date on or after today that the cadence lands on, stepping from a starting point. */
create or replace function app_private.next_recurring_date(
  p_from date,
  p_cadence public.recurring_cadence,
  p_today date
)
returns date
language plpgsql
immutable
as $$
declare
  step interval := app_private.recurring_cadence_interval(p_cadence);
  candidate date := p_from;
  guard integer := 0;
begin
  while candidate < p_today and guard < 1000 loop
    candidate := (candidate + step)::date;
    guard := guard + 1;
  end loop;
  return candidate;
end $$;

revoke all on function app_private.recurring_cadence_interval(public.recurring_cadence) from public;
revoke all on function app_private.recurring_plan_role(uuid, uuid) from public;
revoke all on function app_private.regenerate_recurring_visits(uuid) from public;
revoke all on function app_private.next_recurring_date(date, public.recurring_cadence, date) from public;

-- ── Reads ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_recurring_plans_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  plans jsonb;
  providers jsonb;
  assets jsonb;
  projects jsonb;
  today date := current_date;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  -- Active work first, then paused, then ended; within a group the soonest visit is first, and a plan with
  -- no date of its own (a paused or ended one) falls back to when it was created.
  select coalesce(jsonb_agg(entry order by group_order, group_date nulls last, sort_key desc), '[]'::jsonb)
    into plans
    from (
      select jsonb_build_object(
               'id', p.id,
               'reference', p.reference,
               'role', app_private.recurring_plan_role(p.id, me),
               'title', p.title,
               'cadence', p.cadence,
               'billingBasis', p.billing_basis,
               'amountMinor', p.amount_minor,
               'currencyCode', p.currency_code,
               'locationLabel', p.location_label,
               'assetLabel', a.name,
               'status', p.status,
               'startsOn', p.starts_on,
               'nextExecutionOn', p.next_execution_on,
               'daysUntilNext', (p.next_execution_on - today),
               'pausedAt', p.paused_at,
               'pauseReason', p.pause_reason,
               'endedOn', p.ended_on,
               'endReason', p.end_reason,
               'notes', p.notes,
               'providerName', pr.display_name,
               'providerId', pr.id,
               'projectLabel', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), '')),
               'projectHref', case when p.assignment_id is not null then '/projects/' || p.assignment_id else null end,
               -- Only visits that have not been called off are worth showing on a schedule.
               'visits', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'sequence', v.sequence,
                          'scheduledFor', v.scheduled_for,
                          'state', v.state,
                          'note', v.note
                        ) order by v.sequence)
                   from public.recurring_visits v
                  where v.plan_id = p.id and v.state <> 'cancelled'
               ), '[]'::jsonb),
               'completedVisits', (select count(*) from public.recurring_visits v where v.plan_id = p.id and v.state = 'completed'),
               'openRequest', (
                 select jsonb_build_object(
                          'id', c.id,
                          'requestedCadence', c.requested_cadence,
                          'requestedStartOn', c.requested_start_on,
                          'reason', c.reason,
                          'requestedByRole', case when c.requested_by_account_id = p.customer_account_id then 'customer' else 'provider' end,
                          'requestedAt', c.created_at
                        )
                   from public.recurring_cadence_requests c
                  where c.plan_id = p.id and c.state = 'requested'
                  limit 1
               )
             ) as entry,
             case p.status when 'active' then 0 when 'paused' then 1 else 2 end as group_order,
             case p.status when 'active' then p.next_execution_on else null end as group_date,
             p.created_at as sort_key
        from public.recurring_plans p
        join public.providers pr on pr.id = p.provider_id
        left join public.customer_assets a on a.id = p.asset_id
        left join public.assignments asg on asg.id = p.assignment_id
        left join public.requests r on r.id = asg.request_id
       where app_private.recurring_plan_role(p.id, me) is not null
    ) listed;

  -- The provider picker: only providers this account has actually worked with on the platform. See the file
  -- header — a standing arrangement is not something to start with a stranger.
  select coalesce(jsonb_agg(entry order by entry ->> 'label'), '[]'::jsonb)
    into providers
    from (
      select distinct jsonb_build_object(
               'id', p.id,
               'label', p.display_name,
               'detail', 'You have worked together on this platform'
             ) as entry
        from public.assignments asg
        join public.requests r on r.id = asg.request_id
        join public.providers p on p.id = asg.provider_id
       where r.customer_account_id = me
    ) listed;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'label', a.name, 'detail', a.category) order by a.name), '[]'::jsonb)
    into assets
    from public.customer_assets a
   where a.customer_account_id = me;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'label', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'A request')) order by r.created_at desc), '[]'::jsonb)
    into projects
    from public.requests r
   where r.customer_account_id = me
     and r.state not in ('cancelled', 'draft');

  return jsonb_build_object(
    'allowed', true,
    'plans', plans,
    'providers', providers,
    'assets', assets,
    'projects', projects,
    'defaultCurrency', coalesce(
      (select m.default_currency_code from public.markets m where m.code = 'NG' and m.is_active limit 1),
      'NGN'
    ),
    -- Said once, in the payload, so the page and any future surface describe the money the same way.
    'billingNote', 'The agreed price is recorded on the plan. The platform does not charge it automatically: work that is carried out is funded on its project through the normal agreement and payment path.'
  );
end $$;

-- ── Writes ────────────────────────────────────────────────────────────────────────────────────

create or replace function public.create_recurring_plan_command(
  p_provider_id uuid,
  p_title text,
  p_cadence text,
  p_billing_basis text,
  p_amount_minor bigint,
  p_currency_code text,
  p_starts_on date,
  p_location_label text,
  p_asset_id uuid default null,
  p_notes text default null,
  p_assignment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  cadence public.recurring_cadence;
  basis public.recurring_billing_basis;
  title text := btrim(coalesce(p_title, ''));
  site text := btrim(coalesce(p_location_label, ''));
  currency text := upper(btrim(coalesce(p_currency_code, '')));
  plan_id uuid;
  reference_code text;
  start_date date := coalesce(p_starts_on, current_date);
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  cadence := p_cadence::public.recurring_cadence;
  basis := coalesce(nullif(btrim(coalesce(p_billing_basis, '')), ''), 'per_visit')::public.recurring_billing_basis;

  if char_length(title) < 4 or char_length(title) > 160 then
    raise exception 'a plan title of 4 to 160 characters is required' using errcode = '22023';
  end if;
  if char_length(site) < 2 or char_length(site) > 200 then
    raise exception 'describe where the visits happen' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'an agreed amount is required' using errcode = '22023';
  end if;
  if currency !~ '^[A-Z]{3}$' then
    raise exception 'a three-letter currency code is required' using errcode = '22023';
  end if;
  if start_date < current_date then
    raise exception 'the first visit cannot be in the past' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 2000 then
    raise exception 'notes of at most 2000 characters' using errcode = '22023';
  end if;

  -- ⚠️ THE PROVIDER HAS TO BE ONE THIS ACCOUNT HAS WORKED WITH. See the file header: a plan is the only thing
  -- here that keeps acting unattended, so the platform refuses to create one between accounts with no history.
  if not exists (
    select 1
      from public.assignments asg
      join public.requests r on r.id = asg.request_id
     where asg.provider_id = p_provider_id
       and r.customer_account_id = me
  ) then
    raise exception 'a recurring plan can only be created with a provider you have worked with' using errcode = '42501';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from public.customer_assets a where a.id = p_asset_id and a.customer_account_id = me
  ) then
    raise exception 'that asset is not on this account' using errcode = '42501';
  end if;

  -- ⚠️ A LINKED PROJECT HAS TO INVOLVE BOTH PARTIES OF THE PLAN. Pointing a plan at a project with a different
  -- provider, or at somebody else's job, would put an arrangement in the record next to work it has nothing to
  -- do with — and would tell the customer that a project they are not part of exists.
  if p_assignment_id is not null and not exists (
    select 1
      from public.assignments asg
      join public.requests r on r.id = asg.request_id
     where asg.id = p_assignment_id
       and asg.provider_id = p_provider_id
       and r.customer_account_id = me
  ) then
    raise exception 'that project is not one you share with this provider' using errcode = '42501';
  end if;

  reference_code := 'REC-' || upper(encode(gen_random_bytes(5), 'hex'));

  insert into public.recurring_plans (
    reference, customer_account_id, provider_id, assignment_id, title, cadence, billing_basis,
    amount_minor, currency_code, location_label, asset_id, starts_on, next_execution_on,
    notes, created_by_account_id
  )
  values (
    reference_code, me, p_provider_id, p_assignment_id, title, cadence, basis,
    p_amount_minor, currency, site, p_asset_id, start_date, start_date,
    nullif(btrim(coalesce(p_notes, '')), ''), me
  )
  returning id into plan_id;

  perform app_private.regenerate_recurring_visits(plan_id);

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'RECURRING_PLAN_CREATED', 'recurring_plan', plan_id, 'participant_private',
          jsonb_build_object('cadence', cadence, 'billing_basis', basis, 'currency', currency));

  return jsonb_build_object('id', plan_id, 'reference', reference_code, 'nextExecutionOn', start_date);
end $$;

create or replace function public.pause_my_recurring_plan_command(p_plan_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  p public.recurring_plans%rowtype;
  role text := app_private.recurring_plan_role(p_plan_id, me);
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or role is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'a pause note of at most 500 characters' using errcode = '22023';
  end if;

  select * into p from public.recurring_plans where id = p_plan_id for update;
  if p.status = 'ended' then
    raise exception 'this plan has ended' using errcode = '22023';
  end if;
  if p.status = 'paused' then
    return jsonb_build_object('status', 'paused', 'alreadyPaused', true);
  end if;

  update public.recurring_plans
     set status = 'paused', paused_at = now(), pause_reason = reason, updated_at = now()
   where id = p.id;

  -- The calendar keeps its dates: a paused plan is one whose visits are on hold, not one whose schedule is
  -- thrown away, so resuming does not silently move everything by however long the pause lasted.
  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'RECURRING_PLAN_PAUSED', 'recurring_plan', p.id, 'participant_private',
          jsonb_build_object('by_role', role));

  return jsonb_build_object('status', 'paused', 'alreadyPaused', false);
end $$;

/**
 * Resume, with the next visit moved to the first cadence date that is not in the past.
 *
 * A plan paused in March and resumed in September cannot simply keep its March date: the whole point of
 * resuming is that the next visit is ahead. The requested start is honoured when one is given, and otherwise
 * the cadence is stepped forward from where it stopped until it lands on or after today.
 */
create or replace function public.resume_my_recurring_plan_command(p_plan_id uuid, p_next_execution_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  p public.recurring_plans%rowtype;
  role text := app_private.recurring_plan_role(p_plan_id, me);
  next_date date;
begin
  if me is null or role is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  select * into p from public.recurring_plans where id = p_plan_id for update;
  if p.status = 'ended' then
    raise exception 'this plan has ended' using errcode = '22023';
  end if;
  if p.status = 'active' then
    return jsonb_build_object('status', 'active', 'nextExecutionOn', p.next_execution_on, 'alreadyActive', true);
  end if;

  next_date := coalesce(p_next_execution_on, app_private.next_recurring_date(p.next_execution_on, p.cadence, current_date));
  if next_date < current_date then
    raise exception 'the next visit cannot be in the past' using errcode = '22023';
  end if;

  update public.recurring_plans
     set status = 'active', paused_at = null, pause_reason = null,
         next_execution_on = next_date, updated_at = now()
   where id = p.id;

  perform app_private.regenerate_recurring_visits(p.id);

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'RECURRING_PLAN_RESUMED', 'recurring_plan', p.id, 'participant_private',
          jsonb_build_object('next_execution_on', next_date, 'by_role', role));

  return jsonb_build_object('status', 'active', 'nextExecutionOn', next_date, 'alreadyActive', false);
end $$;

create or replace function public.end_my_recurring_plan_command(p_plan_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  p public.recurring_plans%rowtype;
  role text := app_private.recurring_plan_role(p_plan_id, me);
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or role is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'a closing note of at most 500 characters' using errcode = '22023';
  end if;

  select * into p from public.recurring_plans where id = p_plan_id for update;
  if p.status = 'ended' then
    return jsonb_build_object('status', 'ended', 'alreadyEnded', true);
  end if;

  update public.recurring_plans
     set status = 'ended', ended_on = current_date, end_reason = reason,
         paused_at = null, pause_reason = null, updated_at = now()
   where id = p.id;

  -- Ends the calendar with the plan. A cancelled visit stays on the row for the record; the upcoming ones are
  -- removed because they are no longer an agreement to attend.
  delete from public.recurring_visits where plan_id = p.id and state = 'scheduled';
  update public.recurring_cadence_requests set state = 'declined', decided_at = now(),
         decision_note = 'The plan ended.' where plan_id = p.id and state = 'requested';

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'RECURRING_PLAN_ENDED', 'recurring_plan', p.id, 'participant_private',
          jsonb_build_object('by_role', role));

  return jsonb_build_object('status', 'ended', 'alreadyEnded', false);
end $$;

create or replace function public.request_recurring_cadence_change_command(
  p_plan_id uuid,
  p_requested_cadence text,
  p_requested_start_on date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  p public.recurring_plans%rowtype;
  role text := app_private.recurring_plan_role(p_plan_id, me);
  requested public.recurring_cadence;
  reason text := btrim(coalesce(p_reason, ''));
  request_id uuid;
begin
  if me is null or role is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  requested := p_requested_cadence::public.recurring_cadence;
  if char_length(reason) < 4 or char_length(reason) > 1000 then
    raise exception 'say why the cadence should change (4 to 1000 characters)' using errcode = '22023';
  end if;
  if p_requested_start_on is not null and p_requested_start_on < current_date then
    raise exception 'a requested start cannot be in the past' using errcode = '22023';
  end if;

  select * into p from public.recurring_plans where id = p_plan_id;
  if p.status = 'ended' then
    raise exception 'this plan has ended' using errcode = '22023';
  end if;
  if p.cadence = requested and p_requested_start_on is null then
    raise exception 'that is already the cadence' using errcode = '22023';
  end if;

  -- The pending request does not change anything yet: the cadence in force stays in force until the other
  -- side answers, which is what makes the request a request.
  insert into public.recurring_cadence_requests (plan_id, requested_cadence, requested_start_on, reason, requested_by_account_id)
  values (p.id, requested, p_requested_start_on, reason, me)
  returning id into request_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'RECURRING_CADENCE_REQUESTED', 'recurring_plan', p.id, 'participant_private',
          jsonb_build_object('requested_cadence', requested, 'by_role', role));

  return jsonb_build_object('id', request_id, 'requestedCadence', requested);
end $$;

/**
 * Decide a cadence request.
 *
 * ⚠️ THE ASKER CANNOT ANSWER THEIR OWN REQUEST. Acceptance has to come from the other side of the plan, or
 * from platform support — otherwise a cadence change is a one-sided edit with extra steps. The check is the
 * requester's account against the caller's, and the role that decides is recorded.
 */
create or replace function public.decide_recurring_cadence_change_command(
  p_request_id uuid,
  p_accept boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.recurring_cadence_requests%rowtype;
  p public.recurring_plans%rowtype;
  role text;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  next_date date;
  is_platform boolean;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'a decision is required' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'a note of at most 500 characters' using errcode = '22023';
  end if;

  select * into c from public.recurring_cadence_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if c.state <> 'requested' then
    raise exception 'that request has already been decided' using errcode = '22023';
  end if;

  select * into p from public.recurring_plans where id = c.plan_id for update;
  role := app_private.recurring_plan_role(p.id, me);
  is_platform := app_private.current_account_has_platform_capability('platform.support.intervene');

  if role is null and not is_platform then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if me = c.requested_by_account_id then
    raise exception 'the side that asked cannot decide' using errcode = '42501';
  end if;
  if p.status = 'ended' then
    raise exception 'this plan has ended' using errcode = '22023';
  end if;

  if p_accept then
    next_date := coalesce(c.requested_start_on, app_private.next_recurring_date(p.next_execution_on, c.requested_cadence, current_date));
    update public.recurring_plans
       set cadence = c.requested_cadence,
           next_execution_on = next_date,
           updated_at = now()
     where id = p.id;
    perform app_private.regenerate_recurring_visits(p.id);
  end if;

  update public.recurring_cadence_requests
     set state = case when p_accept then 'accepted' else 'declined' end,
         decided_by_account_id = me,
         decided_at = now(),
         decision_note = note
   where id = c.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user',
          case when p_accept then 'RECURRING_CADENCE_ACCEPTED' else 'RECURRING_CADENCE_DECLINED' end,
          'recurring_plan', p.id, 'participant_private',
          jsonb_build_object('requested_cadence', c.requested_cadence, 'decided_as', coalesce(role, 'platform')));

  return jsonb_build_object(
    'accepted', p_accept,
    'cadence', case when p_accept then c.requested_cadence else p.cadence end,
    'nextExecutionOn', case when p_accept then next_date else p.next_execution_on end
  );
end $$;

revoke all on function public.get_my_recurring_plans_command() from public, anon;
revoke all on function public.create_recurring_plan_command(uuid, text, text, text, bigint, text, date, text, uuid, text, uuid) from public, anon;
revoke all on function public.pause_my_recurring_plan_command(uuid, text) from public, anon;
revoke all on function public.resume_my_recurring_plan_command(uuid, date) from public, anon;
revoke all on function public.end_my_recurring_plan_command(uuid, text) from public, anon;
revoke all on function public.request_recurring_cadence_change_command(uuid, text, date, text) from public, anon;
revoke all on function public.decide_recurring_cadence_change_command(uuid, boolean, text) from public, anon;

grant execute on function public.get_my_recurring_plans_command() to authenticated;
grant execute on function public.create_recurring_plan_command(uuid, text, text, text, bigint, text, date, text, uuid, text, uuid) to authenticated;
grant execute on function public.pause_my_recurring_plan_command(uuid, text) to authenticated;
grant execute on function public.resume_my_recurring_plan_command(uuid, date) to authenticated;
grant execute on function public.end_my_recurring_plan_command(uuid, text) to authenticated;
grant execute on function public.request_recurring_cadence_change_command(uuid, text, date, text) to authenticated;
grant execute on function public.decide_recurring_cadence_change_command(uuid, boolean, text) to authenticated;
