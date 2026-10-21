-- The approvals inbox, cost centres with anchored money, and the analytics read.
--
-- ── THREE RULES THIS MIGRATION EXISTS TO ENFORCE ───────────────────────────────────────────────
--
-- 1. SEPARATION OF DUTIES. The person who asked for the spend does not approve it, and an approval above the
--    organisation's own threshold needs a role that is allowed to give it. Both are checked in SQL, against the
--    request's own commissioning account, so a page cannot talk its way around them.
--
-- 2. MONEY IS ANCHORED TO ROWS. A cost centre's "spend" is not a number somebody typed: it is the sum of funded
--    obligations on the projects linked to that centre, and its "paid" figure is the sum of the payouts the ledger
--    actually sent. The allocation is the only typed figure, and the variance is computed from the two.
--
-- 3. AGGREGATES THAT CANNOT SINGLE SOMEBODY OUT. The reports read suppresses any group with fewer than
--    `aggregation_threshold` rows, and says so, because a "per-site" average over one project is that project
--    wearing a disguise.

create table public.organisation_cost_centres (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  allocated_minor bigint not null default 0 check (allocated_minor >= 0),
  location_id uuid references public.locations(id) on delete set null,
  is_active boolean not null default true,
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, code)
);

create index organisation_cost_centres_idx on public.organisation_cost_centres(organisation_id, is_active);

-- Which projects a cost centre is paying for. This link is what makes a cost centre's spend a row rather than a claim.
create table public.organisation_project_cost_centres (
  request_id uuid primary key references public.requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  cost_centre_id uuid not null references public.organisation_cost_centres(id) on delete restrict,
  assigned_by_account_id uuid not null references public.accounts(id),
  assigned_at timestamptz not null default now()
);

create index organisation_project_cost_centres_idx on public.organisation_project_cost_centres(cost_centre_id);

/**
 * The organisation's own decision on something awaiting it.
 *
 * ⚠️ THIS IS NOT THE PLATFORM'S DECISION, AND THE PAGE SAYS SO. Accepting a quote and approving completed work are
 * platform commands that bind to the ONE account that commissioned the request; this table records what the
 * organisation decided, who decided it and under which threshold, so a delegated approver's decision is a row the
 * requester can act on rather than a conversation.
 */
create table public.organisation_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  kind text not null check (kind in ('quote','completion','change')),
  decision text not null check (decision in ('approved','rejected','information_requested','delegated')),
  amount_minor bigint,
  currency_code text,
  threshold_minor bigint,
  note text check (note is null or char_length(btrim(note)) between 1 and 2000),
  delegate_account_id uuid references public.accounts(id),
  decided_by_account_id uuid not null references public.accounts(id),
  decided_at timestamptz not null default now(),
  -- One live decision per request per kind: a second is a correction, and it replaces the first below.
  unique (organisation_id, request_id, kind)
);

alter table public.organisation_cost_centres enable row level security;
alter table public.organisation_project_cost_centres enable row level security;
alter table public.organisation_approval_decisions enable row level security;
create policy organisation_cost_centres_member_read on public.organisation_cost_centres
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy organisation_project_cost_centres_member_read on public.organisation_project_cost_centres
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy organisation_approval_decisions_member_read on public.organisation_approval_decisions
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
revoke all on public.organisation_cost_centres, public.organisation_project_cost_centres, public.organisation_approval_decisions from anon;
revoke insert, update, delete on public.organisation_cost_centres, public.organisation_project_cost_centres, public.organisation_approval_decisions from authenticated;
grant select on public.organisation_cost_centres, public.organisation_project_cost_centres, public.organisation_approval_decisions to authenticated;

comment on table public.organisation_cost_centres is
  'A department, site or cost centre with an allocation. Its committed and paid figures are computed from the funded obligations and payouts of the projects linked to it, never typed in.';

create or replace function public.create_organisation_cost_centre_command(
  p_organisation_id uuid,
  p_name text,
  p_code text,
  p_currency_code text,
  p_allocated_minor bigint,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  centre_id uuid;
  code text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator of the organisation manages cost centres' using errcode = '42501'; end if;
  if upper(coalesce(p_currency_code, '')) !~ '^[A-Z]{3}$' then
    raise exception 'the currency must be a three-letter code' using errcode = '22023';
  end if;
  if code !~ '^[A-Z0-9][A-Z0-9-]{1,15}$' then
    raise exception 'a cost centre code is 2 to 16 letters, digits or dashes' using errcode = '22023';
  end if;
  if coalesce(p_allocated_minor, 0) < 0 then
    raise exception 'an allocation cannot be negative' using errcode = '22023';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.organisation_locations l
    where l.organisation_id = p_organisation_id and l.location_id = p_location_id
  ) then
    raise exception 'that site is not one of this organisation''s' using errcode = '22023';
  end if;

  insert into public.organisation_cost_centres(
    organisation_id, name, code, currency_code, allocated_minor, location_id, created_by_account_id
  ) values (
    p_organisation_id, btrim(p_name), code, upper(p_currency_code), greatest(coalesce(p_allocated_minor, 0), 0),
    p_location_id, app_private.current_account_id()
  ) returning id into centre_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_COST_CENTRE_CREATED', 'organisation', p_organisation_id, 'organisation_confidential',
          jsonb_build_object('cost_centre_id', centre_id, 'code', code, 'allocated_minor', p_allocated_minor));

  return centre_id;
end $$;

revoke all on function public.create_organisation_cost_centre_command(uuid, text, text, text, bigint, uuid) from public, anon;
grant execute on function public.create_organisation_cost_centre_command(uuid, text, text, text, bigint, uuid) to authenticated;

/** Adjust an allocation. The only typed money figure on the budget pages, and every adjustment is an audit row. */
create or replace function public.adjust_organisation_cost_centre_command(
  p_cost_centre_id uuid,
  p_allocated_minor bigint,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  centre public.organisation_cost_centres%rowtype;
  role text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into centre from public.organisation_cost_centres where id = p_cost_centre_id for update;
  if not found then raise exception 'cost centre not found' using errcode = 'P0002'; end if;
  role := app_private.organisation_role_for(centre.organisation_id);
  if role <> 'admin' then raise exception 'only an owner or administrator adjusts an allocation' using errcode = '42501'; end if;
  if coalesce(p_allocated_minor, 0) < 0 then
    raise exception 'an allocation cannot be negative' using errcode = '22023';
  end if;

  update public.organisation_cost_centres
     set allocated_minor = coalesce(p_allocated_minor, allocated_minor), updated_at = now()
   where id = p_cost_centre_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_COST_CENTRE_ADJUSTED', 'organisation', centre.organisation_id, 'budget_adjustment', 'organisation_confidential',
          jsonb_build_object('cost_centre_id', p_cost_centre_id, 'from_minor', centre.allocated_minor, 'to_minor', p_allocated_minor, 'reason', p_reason));
end $$;

revoke all on function public.adjust_organisation_cost_centre_command(uuid, bigint, text) from public, anon;
grant execute on function public.adjust_organisation_cost_centre_command(uuid, bigint, text) to authenticated;

/** Link a project to a cost centre, which is what anchors that centre's spend to real rows. */
create or replace function public.assign_project_cost_centre_command(
  p_organisation_id uuid,
  p_request_id uuid,
  p_cost_centre_id uuid
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
  if role <> 'admin' then raise exception 'only an owner or administrator assigns a cost centre' using errcode = '42501'; end if;
  if not exists (select 1 from public.requests r where r.id = p_request_id and r.organisation_id = p_organisation_id) then
    raise exception 'that project is not this organisation''s' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organisation_cost_centres c
    where c.id = p_cost_centre_id and c.organisation_id = p_organisation_id
  ) then
    raise exception 'that cost centre is not this organisation''s' using errcode = '22023';
  end if;

  insert into public.organisation_project_cost_centres(request_id, organisation_id, cost_centre_id, assigned_by_account_id)
  values (p_request_id, p_organisation_id, p_cost_centre_id, app_private.current_account_id())
  on conflict (request_id) do update
    set cost_centre_id = excluded.cost_centre_id,
        assigned_by_account_id = excluded.assigned_by_account_id,
        assigned_at = now();
end $$;

revoke all on function public.assign_project_cost_centre_command(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_project_cost_centre_command(uuid, uuid, uuid) to authenticated;

/**
 * Record the organisation's decision on something awaiting it.
 *
 * ⚠️ SEPARATION OF DUTIES IS CHECKED HERE. The decider must be an active member, must not be the account that
 * commissioned the request, and for an amount at or above the organisation's policy threshold must hold an owner,
 * admin or finance-approver role. A rejection needs no threshold but the same bar on who may make it.
 *
 * ⚠️ AND A DELEGATION IS A DECISION, NOT A NOTE. Passing it to somebody else is recorded against the delegate, and the
 * inbox stops showing it to everyone else.
 */
create or replace function public.decide_organisation_approval_command(
  p_organisation_id uuid,
  p_request_id uuid,
  p_kind text,
  p_decision text,
  p_note text default null,
  p_delegate_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  role text := app_private.organisation_role_for(p_organisation_id);
  member public.organisation_members%rowtype;
  r public.requests%rowtype;
  obligation public.payment_obligations%rowtype;
  quote public.quotes%rowtype;
  amount bigint;
  currency text;
  threshold bigint;
  decision_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_kind not in ('quote','completion','change') then raise exception 'invalid approval kind' using errcode = '22023'; end if;
  if p_decision not in ('approved','rejected','information_requested','delegated') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into member from public.organisation_members
  where organisation_id = p_organisation_id and account_id = acct and removed_at is null;
  if not found or member.status <> 'active' then
    raise exception 'only an active member of the organisation decides its approvals' using errcode = '42501';
  end if;

  select * into r from public.requests where id = p_request_id and organisation_id = p_organisation_id;
  if not found then raise exception 'that project is not this organisation''s' using errcode = '22023'; end if;

  -- The requester cannot approve: not the commissioning account, and not the internal owner either.
  if r.customer_account_id = acct or exists (
    select 1 from public.organisation_project_owners o
    where o.request_id = p_request_id and o.owner_account_id = acct
  ) then
    raise exception 'the person who asked for this cannot approve it' using errcode = '42501';
  end if;

  select * into obligation from public.payment_obligations where assignment_id in (
    select a.id from public.assignments a where a.request_id = p_request_id
  );
  select * into quote from public.quotes
  where request_id = p_request_id and status = 'submitted'
  order by submitted_at desc limit 1;

  if p_kind = 'completion' then
    amount := obligation.amount_minor;
    currency := obligation.currency_code;
  else
    amount := coalesce(obligation.amount_minor, quote.total_minor);
    currency := coalesce(obligation.currency_code, quote.currency_code);
  end if;

  select coalesce(nullif(((o.operational_policies ->> 'approvals_above_minor')::numeric), 0), 0)::bigint into threshold
  from public.organisations o where o.id = p_organisation_id;
  threshold := coalesce(threshold, 0);

  if amount is not null and threshold > 0 and amount >= threshold
     and member.role not in ('owner','admin','finance_approver') then
    raise exception 'an approval of % or more needs an owner, an administrator or an approver', threshold using errcode = '42501';
  end if;
  if p_decision = 'delegated' then
    if p_delegate_account_id is null then
      raise exception 'a delegation needs the member it goes to' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.organisation_members m
      where m.organisation_id = p_organisation_id and m.account_id = p_delegate_account_id
        and m.removed_at is null and m.status = 'active'
    ) then
      raise exception 'the delegate must be an active member' using errcode = '22023';
    end if;
    if p_delegate_account_id = acct then
      raise exception 'a delegation goes to somebody else' using errcode = '22023';
    end if;
  end if;

  insert into public.organisation_approval_decisions(
    organisation_id, request_id, kind, decision, amount_minor, currency_code, threshold_minor, note, delegate_account_id, decided_by_account_id, decided_at
  ) values (
    p_organisation_id, p_request_id, p_kind, p_decision, amount, currency, threshold,
    nullif(btrim(coalesce(p_note, '')), ''), p_delegate_account_id, acct, now()
  )
  on conflict (organisation_id, request_id, kind) do update
    set decision = excluded.decision,
        amount_minor = excluded.amount_minor,
        currency_code = excluded.currency_code,
        threshold_minor = excluded.threshold_minor,
        note = excluded.note,
        delegate_account_id = excluded.delegate_account_id,
        decided_by_account_id = excluded.decided_by_account_id,
        decided_at = now()
  returning id into decision_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_APPROVAL_' || upper(p_decision), 'organisation', p_organisation_id, 'approval_decision', 'organisation_confidential',
          jsonb_build_object('request_id', p_request_id, 'kind', p_kind, 'amount_minor', amount, 'threshold_minor', threshold, 'role', member.role));

  return decision_id;
end $$;

revoke all on function public.decide_organisation_approval_command(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.decide_organisation_approval_command(uuid, uuid, text, text, text, uuid) to authenticated;

-- ── Readers ───────────────────────────────────────────────────────────────────────────────────

/**
 * The approvals inbox.
 *
 * ⚠️ THE ITEMS ARE DERIVED, THE DECISIONS ARE STORED. What is awaiting the organisation is computed from the request
 * states it commissions; what the organisation decided about each is a row in
 * `organisation_approval_decisions`. An item stays on the list only while no live decision covers it, so the inbox
 * cannot show something that was already decided.
 */
create or replace function public.get_organisation_approvals_command(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  threshold bigint := 0;
  my_role text;
  items jsonb := '[]'::jsonb;
  history jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select coalesce(nullif(((o.operational_policies ->> 'approvals_above_minor')::numeric), 0), 0)::bigint into threshold
  from public.organisations o where o.id = p_organisation_id;
  threshold := coalesce(threshold, 0);
  select m.role::text into my_role from public.organisation_members m
  where m.organisation_id = p_organisation_id and m.account_id = app_private.current_account_id() and m.removed_at is null;

  select coalesce(jsonb_agg(entry order by entry ->> 'amount_minor' desc nulls last), '[]'::jsonb)
    into items
    from (
      select jsonb_build_object(
        'request_id', r.id,
        'title', coalesce(nullif(btrim(r.need_text), ''), 'Organisation request'),
        'state', r.state::text,
        'kind', case when r.state = 'submitted_for_approval' then 'completion' else 'quote' end,
        'amount_minor', coalesce(ob.amount_minor, q.total_minor),
        'currency_code', coalesce(ob.currency_code, q.currency_code),
        'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
        'requester_account_id', r.customer_account_id,
        'requester_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = r.customer_account_id limit 1), 'A member'),
        'owner_account_id', owner.owner_account_id,
        'owner_name', (select pr.display_name from public.profiles pr where pr.account_id = owner.owner_account_id limit 1),
        'provider_name', (select p.display_name from public.providers p where p.id = coalesce(a.provider_id, q.provider_id)),
        'evidence_count', (
          select count(*)::integer from public.work_evidence w
          join public.assignments aw on aw.id = w.assignment_id
          where aw.request_id = r.id
        ),
        'age_days', greatest(0, floor(extract(epoch from (now() - r.created_at)) / 86400))::integer,
        'threshold_minor', threshold,
        'requires_senior_role', threshold > 0 and coalesce(ob.amount_minor, q.total_minor) >= threshold,
        'decided', decision.id is not null
      ) as entry
      from public.requests r
      left join public.assignments a on a.request_id = r.id and a.status = 'active'
      left join public.payment_obligations ob on ob.assignment_id = a.id
      left join public.organisation_project_owners owner on owner.request_id = r.id
      left join public.organisation_approval_decisions decision
        on decision.request_id = r.id and decision.organisation_id = p_organisation_id
      left join lateral (
        select q0.total_minor, q0.currency_code, q0.provider_id
        from public.quotes q0
        where q0.request_id = r.id and q0.status = 'submitted'
        order by q0.submitted_at desc limit 1
      ) q on true
      where r.organisation_id = p_organisation_id
        and r.state in ('quoted','submitted_for_approval')
        and decision.id is null
        -- Only work whose requester, or whose internal owner, is somebody else: your own request is not yours to approve.
        and r.customer_account_id <> app_private.current_account_id()
        and (owner.owner_account_id is null or owner.owner_account_id <> app_private.current_account_id())
    ) approval_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'request_id', d.request_id,
           'kind', d.kind,
           'decision', d.decision,
           'amount_minor', d.amount_minor,
           'currency_code', d.currency_code,
           'threshold_minor', d.threshold_minor,
           'note', d.note,
           'delegate_name', (select pr.display_name from public.profiles pr where pr.account_id = d.delegate_account_id limit 1),
           'decided_by_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = d.decided_by_account_id limit 1), 'A member'),
           'decided_at', d.decided_at,
           'title', coalesce(nullif(btrim(r.need_text), ''), 'Organisation request')
         ) order by d.decided_at desc), '[]'::jsonb)
    into history
    from public.organisation_approval_decisions d
    join public.requests r on r.id = d.request_id
   where d.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'my_role', my_role,
    'threshold_minor', threshold,
    'items', items,
    'history', history,
    'threshold_source', 'The organisation''s own operational policy. It decides which role may approve, not whether
       the platform will accept the decision: accepting a quote and approving completion remain platform commands.'
  );
end $$;

revoke all on function public.get_organisation_approvals_command(uuid) from public, anon;
grant execute on function public.get_organisation_approvals_command(uuid) to authenticated;

/**
 * Cost centres with their money anchored to rows.
 *
 * ⚠️ EVERY FIGURE BESIDES THE ALLOCATION IS COMPUTED. `committed_minor` is the sum of FUNDED obligations on the
 * projects linked to the centre — money the platform holds — and `paid_minor` is the sum of payouts it actually sent.
 * `variance_minor` is allocation minus committed, and the percentage is returned only when there is an allocation to
 * divide by, so a centre with no budget shows "no allocation" instead of a division by zero dressed up as infinity.
 */
create or replace function public.get_organisation_budgets_command(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  centres jsonb := '[]'::jsonb;
  periods jsonb := '[]'::jsonb;
  transactions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'name'), '[]'::jsonb)
    into centres
    from (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'code', c.code,
        'currency_code', c.currency_code,
        'allocated_minor', c.allocated_minor,
        'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = c.location_id),
        'is_active', c.is_active,
        'committed_minor', coalesce(agg.committed_minor, 0),
        'paid_minor', coalesce(agg.paid_minor, 0),
        'variance_minor', c.allocated_minor - coalesce(agg.committed_minor, 0),
        'variance_percent', case
          when c.allocated_minor > 0
          then round(((c.allocated_minor - coalesce(agg.committed_minor, 0))::numeric * 100) / c.allocated_minor, 1)
          else null
        end,
        'project_count', coalesce(agg.projects, 0),
        'active_project_count', coalesce(agg.active_projects, 0)
      ) as entry
      from public.organisation_cost_centres c
      left join (
        select link.cost_centre_id,
               count(*)::integer as projects,
               (count(*) filter (where r.state not in ('completed','cancelled')))::integer as active_projects,
               coalesce(sum(ob.amount_minor) filter (where ob.status = 'funded'), 0)::bigint as committed_minor,
               coalesce(sum(pay.amount_minor) filter (where pay.status = 'paid'), 0)::bigint as paid_minor
        from public.organisation_project_cost_centres link
        join public.requests r on r.id = link.request_id
        left join public.assignments a on a.request_id = r.id and a.status = 'active'
        left join public.payment_obligations ob on ob.assignment_id = a.id
        left join public.payouts pay on pay.obligation_id = ob.id
        where link.organisation_id = p_organisation_id
        group by link.cost_centre_id
      ) agg on agg.cost_centre_id = c.id
      where c.organisation_id = p_organisation_id
    ) centre_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = b.location_id),
           'period_start', b.period_start, 'period_end', b.period_end, 'currency_code', b.currency_code,
           'committed_minor', b.committed_minor, 'actual_minor', b.actual_minor,
           'remaining_minor', greatest(0, b.committed_minor - b.actual_minor)
         ) order by b.period_start desc), '[]'::jsonb)
    into periods
    from public.organisation_budgets b where b.organisation_id = p_organisation_id;

  -- The transaction log: one line per obligation behind these figures, with the payout beside it.
  select coalesce(jsonb_agg(entry order by entry ->> 'at' desc nulls last), '[]'::jsonb)
    into transactions
    from (
      select jsonb_build_object(
        'request_id', r.id,
        'reference', '#' || left(r.id::text, 8),
        'title', coalesce(nullif(btrim(r.need_text), ''), 'Organisation request'),
        'cost_centre', c.name,
        'state', r.state::text,
        'obligation_status', ob.status::text,
        'amount_minor', ob.amount_minor,
        'currency_code', ob.currency_code,
        'payout_status', pay.status::text,
        'paid_minor', case when pay.status = 'paid' then pay.amount_minor else null end,
        'at', coalesce(ob.updated_at, r.created_at)
      ) as entry
      from public.requests r
      join public.organisation_cost_centres c on c.organisation_id = p_organisation_id
      join public.organisation_project_cost_centres link on link.request_id = r.id and link.cost_centre_id = c.id
      left join public.assignments a on a.request_id = r.id and a.status = 'active'
      left join public.payment_obligations ob on ob.assignment_id = a.id
      left join public.payouts pay on pay.obligation_id = ob.id
      where r.organisation_id = p_organisation_id and ob.id is not null
    ) transaction_rows;

  return jsonb_build_object('allowed', true, 'role', role, 'centres', centres, 'periods', periods, 'transactions', transactions);
end $$;

revoke all on function public.get_organisation_budgets_command(uuid) from public, anon;
grant execute on function public.get_organisation_budgets_command(uuid) to authenticated;

/**
 * Operational analytics, with an aggregation floor.
 *
 * ⚠️ GROUPS BELOW THE THRESHOLD ARE SUPPRESSED, NOT SHOWN SMALL. A per-site average over a single project is that
 * project with its name filed off; the read returns the threshold it applied and how many groups were withheld, so a
 * missing row is explained rather than looking like an oversight.
 *
 * ⚠️ `generated_at` IS THE READ, AND `data_as_of` IS THE NEWEST ROW BEHIND IT. A dashboard that says "updated just
 * now" while the newest obligation is a week old is a dashboard that lies about two different things.
 */
create or replace function public.get_organisation_reports_command(
  p_organisation_id uuid,
  p_from date default null,
  p_to date default null,
  p_location_id uuid default null,
  p_service_entity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  threshold integer := 3;
  from_ts timestamptz;
  to_ts timestamptz;
  completion jsonb;
  sla jsonb;
  spend_by_site jsonb := '[]'::jsonb;
  spend_by_service jsonb := '[]'::jsonb;
  reliability jsonb := '[]'::jsonb;
  withheld integer := 0;
  data_as_of timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;
  from_ts := case when p_from is null then now() - interval '365 days' else p_from::timestamptz end;
  to_ts := case when p_to is null then now() + interval '1 day' else (p_to + 1)::timestamptz end;

  select
    count(*)::integer as projects,
    (count(*) filter (where r.state = 'completed'))::integer as completed,
    (count(*) filter (where r.state in ('cancelled','disputed')))::integer as ended_badly,
    coalesce(avg(extract(epoch from (r.completed_at - r.created_at)) / 86400), 0)::numeric(10,1) as avg_days
    into completion
    from public.requests r
   where r.organisation_id = p_organisation_id
     and r.created_at >= from_ts and r.created_at < to_ts
     and (p_location_id is null or r.location_id = p_location_id)
     and (p_service_entity_id is null or r.service_entity_id = p_service_entity_id);

  select
    (count(*) filter (where s.scheduled_end is not null and r.completed_at is not null and r.completed_at <= s.scheduled_end))::integer as on_time,
    (count(*) filter (where s.scheduled_end is not null and r.completed_at is not null and r.completed_at > s.scheduled_end))::integer as late,
    (count(*) filter (where s.scheduled_end is not null and r.completed_at is null and r.state <> 'cancelled' and s.scheduled_end < now()))::integer as currently_overdue,
    (count(*) filter (where s.scheduled_end is null))::integer as no_date
    into sla
    from public.requests r
    join public.assignments a on a.request_id = r.id
    left join public.assignment_schedules s on s.assignment_id = a.id
   where r.organisation_id = p_organisation_id
     and r.created_at >= from_ts and r.created_at < to_ts
     and (p_location_id is null or r.location_id = p_location_id)
     and (p_service_entity_id is null or r.service_entity_id = p_service_entity_id);

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into spend_by_site
  from (
    select jsonb_build_object(
      'label', coalesce(lc.display_name, 'No site recorded'),
      'projects', count(*)::integer,
      'funded_minor', coalesce(sum(ob.amount_minor) filter (where ob.status = 'funded'), 0)::bigint,
      'paid_minor', coalesce(sum(pay.amount_minor) filter (where pay.status = 'paid'), 0)::bigint
    ) as entry
    from public.requests r
    left join public.public_location_catalog lc on lc.location_id = r.location_id
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.payment_obligations ob on ob.assignment_id = a.id
    left join public.payouts pay on pay.obligation_id = ob.id
    where r.organisation_id = p_organisation_id
      and r.created_at >= from_ts and r.created_at < to_ts
      and (p_location_id is null or r.location_id = p_location_id)
      and (p_service_entity_id is null or r.service_entity_id = p_service_entity_id)
    group by lc.display_name
    having count(*) >= threshold
    order by coalesce(sum(ob.amount_minor) filter (where ob.status = 'funded'), 0) desc
  ) site_rows;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into spend_by_service
  from (
    select jsonb_build_object(
      'label', coalesce(sc.display_name, 'Uncategorised'),
      'projects', count(*)::integer,
      'funded_minor', coalesce(sum(ob.amount_minor) filter (where ob.status = 'funded'), 0)::bigint,
      'paid_minor', coalesce(sum(pay.amount_minor) filter (where pay.status = 'paid'), 0)::bigint
    ) as entry
    from public.requests r
    left join public.public_service_catalog sc on sc.service_entity_id = r.service_entity_id
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.payment_obligations ob on ob.assignment_id = a.id
    left join public.payouts pay on pay.obligation_id = ob.id
    where r.organisation_id = p_organisation_id
      and r.created_at >= from_ts and r.created_at < to_ts
      and (p_location_id is null or r.location_id = p_location_id)
      and (p_service_entity_id is null or r.service_entity_id = p_service_entity_id)
    group by sc.display_name
    having count(*) >= threshold
    order by count(*) desc
  ) service_rows;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into reliability
  from (
    select jsonb_build_object(
      'provider_id', p.id,
      'name', p.display_name,
      'jobs', count(*)::integer,
      'completed', (count(*) filter (where r.state = 'completed'))::integer,
      'on_time', (count(*) filter (where r.state = 'completed' and (s.scheduled_end is null or r.completed_at <= s.scheduled_end)))::integer,
      'late', (count(*) filter (where r.state = 'completed' and s.scheduled_end is not null and r.completed_at > s.scheduled_end))::integer,
      'disputed', (count(*) filter (where r.state = 'disputed'))::integer
    ) as entry
    from public.assignments a
    join public.requests r on r.id = a.request_id
    join public.providers p on p.id = a.provider_id
    left join public.assignment_schedules s on s.assignment_id = a.id
    where r.organisation_id = p_organisation_id
      and r.created_at >= from_ts and r.created_at < to_ts
      and (p_location_id is null or r.location_id = p_location_id)
      and (p_service_entity_id is null or r.service_entity_id = p_service_entity_id)
    group by p.id, p.display_name
    having count(*) >= threshold
    order by count(*) desc
  ) reliability_rows;

  -- How many groups the floor hid, so an empty chart is explained rather than silent.
  select
    (select count(*) from (
       select 1 from public.requests r
       where r.organisation_id = p_organisation_id and r.created_at >= from_ts and r.created_at < to_ts
       group by r.location_id having count(*) < threshold
     ) hidden)::integer
    into withheld;

  select greatest(
    coalesce((select max(ob.updated_at) from public.payment_obligations ob
              join public.assignments a on a.id = ob.assignment_id
              join public.requests r on r.id = a.request_id
              where r.organisation_id = p_organisation_id), 'epoch'::timestamptz),
    coalesce((select max(r.completed_at) from public.requests r where r.organisation_id = p_organisation_id), 'epoch'::timestamptz)
  ) into data_as_of;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'generated_at', now(),
    'data_as_of', case when data_as_of = 'epoch'::timestamptz then null else data_as_of end,
    'aggregation_threshold', threshold,
    'suppressed_groups', withheld,
    'window', jsonb_build_object('from', from_ts, 'to', to_ts),
    'completion', completion,
    'sla', sla,
    'spend_by_site', spend_by_site,
    'spend_by_service', spend_by_service,
    'provider_reliability', reliability
  );
end $$;

revoke all on function public.get_organisation_reports_command(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.get_organisation_reports_command(uuid, date, date, uuid, uuid) to authenticated;

comment on function public.get_organisation_reports_command(uuid, date, date, uuid, uuid) is
  'Operational analytics for one organisation: completion, SLA compliance, spend distribution and provider reliability, with an aggregation floor of three rows per group and the freshness of the newest row behind the figures.';
