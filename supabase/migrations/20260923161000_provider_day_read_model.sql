-- The provider's day, as one document.
--
-- ── WHY ONE COMMAND RETURNING jsonb, RATHER THAN SIX ROUND TRIPS ───────────────────────────────
--
-- /provider is the page a provider opens on a phone, on site, on a bad connection. Its widgets are
-- the schedule, the invitations, the action list, the money and the availability state — five
-- independent reads that a dashboard would normally issue in parallel and then reconcile in the
-- browser. Issuing them as one statement means one request, one consistent snapshot (a quote cannot
-- arrive between the count and the list that describes it), and no chance of the widgets disagreeing
-- about how many jobs are active.
--
-- The shape is documented in features/provider-workspace/day.ts, which is the only module that reads
-- it, and it is built with jsonb_strip_nulls-equivalent care: a field the database does not have is
-- absent rather than a plausible-looking zero, so the UI can tell "none" from "not known".
--
-- ── WHAT IS DERIVED AND WHY IT MATTERS ────────────────────────────────────────────────────────
--
-- Nothing here is a stored total that could drift from the rows behind it. `earnings` is summed from
-- `payouts` — the money the platform has actually decided it owes, in its own lifecycle — and not
-- from quotes or obligations, which are promises. `start_allowed` is the same rule the assignment
-- command enforces, written where the dashboard can read it rather than re-invented in TypeScript.
--
-- ⚠️ INVITATIONS. This platform has no separate invitation inbox: a request becomes work a provider
-- can answer by passing the same eligibility rules that decide matching, and
-- `list_my_provider_opportunities_command` is that list. The day document therefore reports
-- `unanswered_opportunities` — requests this provider is eligible to quote and has not quoted — and
-- the workspace calls it "invitations to quote" rather than inventing an inbox nobody can fill.

create or replace function public.get_my_provider_day_command(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  prof public.provider_public_profiles%rowtype;
  readiness public.provider_search_readiness%rowtype;
  schedule jsonb := '[]'::jsonb;
  opportunities jsonb := '[]'::jsonb;
  actions jsonb := '[]'::jsonb;
  earnings jsonb := '[]'::jsonb;
  awaiting_funding jsonb := '[]'::jsonb;
  payout_verified boolean := false;
  opportunity_count integer := 0;
  unanswered_count integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  -- Ownership is established from the row, never from the caller's word for it.
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into prof from public.provider_public_profiles where provider_id = p_provider_id;
  select * into readiness from public.provider_search_readiness where provider_id = p_provider_id;

  select exists (
    select 1 from public.provider_payout_destinations d
    where d.provider_id = p_provider_id and d.verification_status = 'verified'
  ) into payout_verified;

  -- ── Today's schedule and active jobs ────────────────────────────────────────────────────────
  -- Active assignments only: a completed job is history and a cancelled one is not work, and both
  -- would push the job the provider is about to drive to off a phone screen.
  select coalesce(jsonb_agg(entry order by (entry ->> 'scheduled_start') nulls last, entry ->> 'assigned_at' desc), '[]'::jsonb)
    into schedule
    from (
      select jsonb_build_object(
        'assignment_id', a.id,
        'request_id', r.id,
        'need_text', coalesce(nullif(btrim(r.need_text), ''), 'Assigned work'),
        'request_state', r.state::text,
        'urgency', r.urgency::text,
        'location_name', lc.display_name,
        'landmark', nullif(btrim(coalesce(sc.scope_json ->> 'landmark', '')), ''),
        'access_notes', nullif(btrim(coalesce(sc.scope_json ->> 'access_notes', '')), ''),
        'assigned_at', a.assigned_at,
        'scheduled_start', s.scheduled_start,
        'scheduled_end', s.scheduled_end,
        'schedule_timezone', s.timezone,
        'schedule_status', coalesce(s.customer_status, 'unscheduled'),
        'confirmed_at', s.confirmed_at,
        'field_state', fp.state::text,
        'field_state_at', fp.recorded_at,
        'open_proposal', (t.id is not null),
        'evidence_count', (select count(*) from public.work_evidence w where w.assignment_id = a.id),
        'obligation_status', ob.status::text,
        'amount_minor', ob.amount_minor,
        'currency_code', ob.currency_code,
        -- The assignment command's own start rule, so the dashboard cannot offer a button the
        -- command would refuse.
        'start_allowed', (r.state = 'scheduled' and (ob.id is null or ob.status = 'funded'))
      ) as entry
      from public.assignments a
      join public.requests r on r.id = a.request_id
      left join public.public_location_catalog lc on lc.location_id = r.location_id
      left join public.assignment_schedules s on s.assignment_id = a.id
      left join public.assignment_field_progress fp on fp.assignment_id = a.id
      left join public.payment_obligations ob on ob.assignment_id = a.id
      left join public.appointment_time_proposals t on t.assignment_id = a.id and t.status = 'open'
      -- The newest scope version is what the provider is working to, so it is the one whose access
      -- notes belong beside the job. There is no address book here; this and the area are all the
      -- platform holds about where the work happens.
      left join lateral (
        select rs.scope_json
        from public.request_scopes rs
        where rs.request_id = r.id
        order by rs.version desc
        limit 1
      ) sc on true
      where a.provider_id = p_provider_id and a.status = 'active'
      order by s.scheduled_start nulls last, a.assigned_at desc
      limit 25
      -- `rows` is a keyword in Postgres (as in FETCH FIRST n ROWS ONLY), so the alias is spelled out.
    ) schedule_rows;

  -- ── Invitations to quote ────────────────────────────────────────────────────────────────────
  -- Reusing the eligibility command rather than repeating its rules: if matching changes, this
  -- widget changes with it and cannot start advertising requests the quote form would reject.
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'request_id', o.request_id,
        'need_text', o.need_text,
        'request_state', o.request_state,
        'service_name', sc.display_name,
        'location_name', lc.display_name,
        'created_at', o.request_created_at,
        'quote_id', o.quote_id,
        'quote_status', o.quote_status
      ) order by o.request_created_at desc
    ) filter (where o.rn <= 6), '[]'::jsonb),
    count(*)::integer,
    (count(*) filter (where o.quote_id is null or o.quote_status = 'withdrawn'))::integer
    into opportunities, opportunity_count, unanswered_count
    from (
      select o0.*, row_number() over (order by o0.request_created_at desc) as rn
      from public.list_my_provider_opportunities_command(50) o0
      where o0.provider_id = p_provider_id
    ) o
    left join public.public_service_catalog sc on sc.service_entity_id = o.service_entity_id
    left join public.public_location_catalog lc on lc.location_id = o.location_id;

  -- ── Action required ─────────────────────────────────────────────────────────────────────────
  -- Structured facts, not sentences: the copy and the links belong in the component, where they can
  -- be read and changed without a migration. `rank` orders the list by what actually blocks money or
  -- a customer's answer first.
  -- The rows are named `action_rows` rather than `t`, because each branch below has a table alias of
  -- its own and a shadowed alias in a two-hundred-line statement is a bug waiting to be introduced.
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'kind', action_rows.kind,
        'assignment_id', action_rows.assignment_id,
        'request_id', action_rows.request_id,
        'credential_id', action_rows.credential_id,
        'detail', action_rows.detail,
        'due_at', action_rows.due_at
      ) order by action_rows.rank, action_rows.due_at nulls last
    ), '[]'::jsonb)
    into actions
    from (
      select 'appointment_proposal'::text as kind, t.assignment_id, t.request_id, null::uuid as credential_id,
             t.message as detail, t.proposed_start as due_at, 1 as rank
      from public.appointment_time_proposals t
      join public.assignments a on a.id = t.assignment_id and a.provider_id = p_provider_id and a.status = 'active'
      where t.status = 'open'
      union all
      select 'completion_correction', c.assignment_id, c.request_id, null::uuid, c.message, c.created_at, 1
      from public.completion_correction_requests c
      join public.assignments a on a.id = c.assignment_id and a.provider_id = p_provider_id and a.status = 'active'
      where c.status = 'open'
      union all
      select 'quote_change', null::uuid, q.request_id, null::uuid, q.message, q.created_at, 2
      from public.quote_change_requests q
      where q.provider_id = p_provider_id and q.status = 'open'
      union all
      select 'completion_evidence', a.id, a.request_id, null::uuid, null::text, null::timestamptz, 2
      from public.assignments a
      join public.requests r on r.id = a.request_id
      where a.provider_id = p_provider_id and a.status = 'active' and r.state = 'in_progress'
      union all
      select 'credential_expiring', null::uuid, null::uuid, c.id, c.issuing_body, (c.expires_at)::timestamptz, 3
      from public.provider_credentials c
      where c.provider_id = p_provider_id
        and c.expires_at is not null
        and c.expires_at <= current_date + 60
      union all
      select 'identity_verification', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 2
      where not exists (
        select 1 from public.provider_verifications v
        where v.provider_id = p_provider_id and v.kind = 'identity' and v.status = 'verified'
          and (v.expires_at is null or v.expires_at > now())
      )
      union all
      select 'payout_account', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 3
      where not exists (
        select 1 from public.provider_payout_destinations d
        where d.provider_id = p_provider_id and d.verification_status = 'verified'
      )
      union all
      select 'profile_not_published', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 4
      where not (coalesce(prof.is_public, false) and prof.published_at is not null)
    ) action_rows;

  -- ── Money ───────────────────────────────────────────────────────────────────────────────────
  -- `payouts` is the platform's own decision about what it owes this provider, so it is the only
  -- source used for "cleared" and "pending payout". Money a customer has not funded yet is reported
  -- separately and is never counted as earned.
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'currency_code', e.currency_code,
        'cleared_minor', e.cleared_minor,
        'pending_minor', e.pending_minor,
        'blocked_minor', e.blocked_minor
      ) order by e.currency_code
    ), '[]'::jsonb)
    into earnings
    from (
      select p0.currency_code,
             coalesce(sum(p0.amount_minor) filter (where p0.status = 'paid'), 0)::bigint as cleared_minor,
             coalesce(sum(p0.amount_minor) filter (where p0.status in ('eligible','queued','processing')), 0)::bigint as pending_minor,
             coalesce(sum(p0.amount_minor) filter (where p0.status in ('failed','blocked')), 0)::bigint as blocked_minor
      from public.payouts p0
      where p0.provider_id = p_provider_id
      group by p0.currency_code
    ) e;

  select coalesce(jsonb_agg(
      jsonb_build_object('currency_code', o.currency_code, 'amount_minor', o.amount_minor) order by o.currency_code
    ), '[]'::jsonb)
    into awaiting_funding
    from (
      select ob.currency_code, sum(ob.amount_minor)::bigint as amount_minor
      from public.payment_obligations ob
      where ob.provider_id = p_provider_id and ob.status in ('pending','funding')
      group by ob.currency_code
    ) o;

  return jsonb_build_object(
    'provider', jsonb_build_object(
      'id', prov.id,
      'display_name', prov.display_name,
      'status', prov.status::text,
      'is_public', coalesce(prof.is_public, false) and prof.published_at is not null,
      'slug', prof.slug,
      'accepts_new_work', coalesce(prof.accepts_new_work, true),
      'payout_verified', payout_verified
    ),
    'readiness', jsonb_build_object(
      'total_score', coalesce(readiness.total_score, 0),
      'readiness', coalesce(readiness.readiness::text, 'not_ready'),
      'reasons', coalesce(readiness.reasons, '[]'::jsonb),
      'evaluated_at', readiness.evaluated_at
    ),
    'counts', jsonb_build_object(
      'active_jobs', jsonb_array_length(schedule),
      'opportunities', opportunity_count,
      'unanswered_opportunities', unanswered_count,
      'actions', jsonb_array_length(actions)
    ),
    'schedule', schedule,
    'opportunities', opportunities,
    'actions', actions,
    'earnings', earnings,
    'awaiting_funding', awaiting_funding
  );
end $$;

revoke all on function public.get_my_provider_day_command(uuid) from public, anon;
grant execute on function public.get_my_provider_day_command(uuid) to authenticated;

comment on function public.get_my_provider_day_command(uuid) is
  'The signed-in provider''s own day: schedule, invitations to quote, action list, money and availability. One document, one round trip.';
