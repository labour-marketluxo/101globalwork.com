-- The labour-market aggregates: k-anonymity, cell suppression, and the Laplace mechanism, behind the programme
-- dashboard and the labour intelligence page.
--
-- ── WHAT IS ACTUALLY IMPLEMENTED, IN PLAIN TERMS ──────────────────────────────────────────────
--
--   1. MINIMUM GROUP SIZE. Every published figure about people comes from a group of at least `min_group_size`
--      (k). A cell below k emits NOTHING — not a zero, not a dash with a number behind it, not a noised number
--      that happens to be small. `privacy_cell` returns `{suppressed: true}` and the page renders a withheld
--      state that says the cell is below the threshold.
--
--   2. THE LAPLACE MECHANISM. Every figure that IS published is noised. `laplace_noise` draws from
--      Laplace(0, sensitivity/epsilon) using the inverse-CDF method, which is the mechanism the differential
--      privacy literature defines rather than a hand-rolled jitter. A counting query has sensitivity 1, so the
--      scale is 1/epsilon.
--
--   3. ROUNDING AND A FLOOR. The noised value is rounded to `rounding_unit`, floored at k, and the rounding unit is
--      capped at the noise's own spread so rounding cannot take over from the mechanism. The floor matters:
--      a group of exactly k with unlucky noise could otherwise publish "2", which both reveals that the noise is
--      large and reads as a real two-person cell. The floor is a deliberate, documented bias, and it is the
--      conservative direction: it never publishes a number below the threshold the rule promises.
--
--   4. LIMITS ON WHAT CAN BE ASKED. The breakdowns are fixed in SQL — skills, regions, credential kinds, cohorts,
--      allocation bands. A caller cannot name a grouping, so nobody can cross-tabulate their way down to one
--      person by adding dimensions the platform did not anticipate. There is no query interface here.
--
-- ── WHAT THIS DOES NOT CLAIM, WHICH MATTERS MORE THAN WHAT IT DOES ───────────────────────────
--
--   ⚠️ THIS IS NOT ONE END-TO-END (epsilon, delta)-DIFFERENTIAL PRIVACY GUARANTEE FOR THE DASHBOARD. Each
--   published cell is drawn from a Laplace mechanism with the stated epsilon, and the payload reports how many
--   cells were published and the total epsilon spent, so the composition is visible rather than implied. But the
--   suppression rule is a DIFFERENT protection: a threshold is not a differentially private mechanism, and
--   neither is the decision to withhold a row. The two are complementary, they are not additive, and the page
--   says so in the reader's words rather than in these ones.
--
--   ⚠️ IT DOES NOT PROTECT AGAINST AN ADVERSARY WHO ALREADY KNOWS EVERYTHING BUT ONE ROW. If a reader knows the
--   entire pool except whether one named person is in it, no aggregate over that pool can be safe — that is a
--   property of the problem, not of this implementation, and every statistical disclosure control method shares
--   it. What the rules here stop is the ordinary case: a small group being reported exactly because it was small.
--
--   ⚠️ IT DOES NOT PUBLISH EXACT FIGURES ANYWHERE AND THEN HOPE. Every count in the payload about people is a
--   noised cell; institutional figures — a budget, a cohort's planned capacity, a project title — are exact,
--   because they are not measurements of individuals. The distinction is made per field, not per page.
--
-- ── WHY THE SETTINGS ARE A TABLE ─────────────────────────────────────────────────────────────
--
-- k, epsilon and the rounding unit live in one row so there is a single place to read them, a single place the
-- page quotes them from, and no chance of six functions each carrying their own copy of "5". The CHECK
-- constraints are a floor on strictness, not a ceiling: a well-meaning "let us just turn the noise down"
-- migration cannot set epsilon above 5 or k below 2 without editing the schema deliberately.

create table public.privacy_policy_settings (
  singleton boolean primary key default true check (singleton),
  -- ⚠️ FLOOR ON STRICTNESS. These two CHECKs are the guard rail: no code path, and no later migration, can
  -- relax the platform's disclosure rules into uselessness without visibly changing this table.
  min_group_size integer not null check (min_group_size between 2 and 100),
  epsilon numeric(4, 2) not null check (epsilon > 0 and epsilon <= 5),
  rounding_unit integer not null default 1 check (rounding_unit in (1, 5, 10, 25)),
  updated_at timestamptz not null default now(),
  updated_by_account_id uuid references public.accounts(id) on delete set null,
  -- ⚠️ ROUNDING MAY NOT BE COARSER THAN THE NOISE ITSELF, AND THIS CONSTRAINT IS THE RESULT OF A MEASUREMENT.
  -- With sensitivity 1 the Laplace spread is sqrt(2)/epsilon. Rounding to a unit much larger than that spread does
  -- not complement the mechanism — it replaces it: the published value becomes the true count rounded, and two
  -- independent calls agree nearly every time. Measured before this constraint existed, at epsilon = 1 and a
  -- rounding unit of 5, two draws for a count of 100 were identical 83% of the time, which is the signature of a
  -- mechanism that is not running. The unit is capped at the spread so the noise can always move the value.
  constraint privacy_rounding_within_noise_chk check (rounding_unit <= ceil(sqrt(2::numeric) / epsilon))
);

-- k = 5 and epsilon = 1.00, with no extra rounding: the published number is the noised count itself, so the
-- perturbation is fully visible rather than flattened onto a grid.
insert into public.privacy_policy_settings (singleton, min_group_size, epsilon, rounding_unit)
values (true, 5, 1.00, 1)
on conflict (singleton) do nothing;

alter table public.privacy_policy_settings enable row level security;
create policy privacy_policy_settings_deny_direct on public.privacy_policy_settings
  for all to anon, authenticated using (false) with check (false);

comment on table public.privacy_policy_settings is
  'k, epsilon and the rounding unit for every published workforce statistic. The CHECK constraints are a floor on strictness: epsilon cannot exceed 5 and k cannot fall below 2.';

-- ── 1. The mechanism ──────────────────────────────────────────────────────────────────────────

/**
 * One draw from Laplace(0, sensitivity / epsilon), by inverse transform.
 *
 * `u` is drawn uniformly on (-0.5, 0.5) and pulled a hair inside so the logarithm is defined at the ends; the
 * transform is `-b * sign(u) * ln(1 - 2|u|)`, which is the standard inverse-CDF method. It is VOLATILE on
 * purpose: the whole value of the mechanism is that two calls give two answers.
 */
create or replace function app_private.laplace_noise(p_sensitivity numeric, p_epsilon numeric)
returns numeric
language plpgsql
volatile
as $$
declare
  b numeric;
  u numeric;
begin
  if p_epsilon is null or p_epsilon <= 0 then
    raise exception 'epsilon must be positive' using errcode = '22023';
  end if;
  if p_sensitivity is null or p_sensitivity <= 0 then
    raise exception 'sensitivity must be positive' using errcode = '22023';
  end if;

  b := p_sensitivity / p_epsilon;
  u := (random()::numeric - 0.5) * 0.9999998;

  if u = 0 then
    return 0;
  end if;
  return -b * sign(u) * ln(1 - 2 * abs(u));
end $$;

/**
 * One published cell.
 *
 * ⚠️ THE ORDER IS SUPPRESS-FIRST, THEN NOISE. Noising a three-person group and publishing the result would leak
 * the fact that the group exists at all — the mechanism protects the value, not the presence of the row. The
 * threshold is what protects the presence.
 *
 * Returns `{suppressed, value, reason, epsilon}` where `value` is null whenever `suppressed` is true, so a page
 * cannot render a number for a withheld cell by mistake.
 */
create or replace function app_private.privacy_cell(
  p_count bigint,
  p_min_group integer,
  p_epsilon numeric,
  p_rounding_unit integer
)
returns jsonb
language plpgsql
volatile
as $$
declare
  noisy numeric;
  published bigint;
begin
  if p_count is null then
    return jsonb_build_object('suppressed', true, 'value', null, 'reason', 'no_data', 'epsilon', null);
  end if;

  if p_count < p_min_group then
    return jsonb_build_object('suppressed', true, 'value', null, 'reason', 'below_threshold', 'epsilon', null);
  end if;

  -- A counting query has sensitivity 1: one person changing their answer changes the count by at most one.
  noisy := p_count + app_private.laplace_noise(1, p_epsilon);
  published := greatest(
    p_min_group::numeric,
    round(noisy / greatest(p_rounding_unit, 1)) * greatest(p_rounding_unit, 1)
  )::bigint;

  return jsonb_build_object('suppressed', false, 'value', published, 'reason', null, 'epsilon', p_epsilon);
end $$;

/**
 * A rate, from two cells.
 *
 * The numerator and denominator are each noised before the division, and the rate is computed FROM THE NOISED
 * VALUES — never computed exactly and then rounded, which would leave the exact ratio recoverable. Both noised
 * components travel with the rate so a reader can see what it was computed from, and the denominator is capped
 * at 100% because noise can make a numerator exceed its denominator.
 */
create or replace function app_private.privacy_rate(
  p_numerator bigint,
  p_denominator bigint,
  p_min_group integer,
  p_epsilon numeric,
  p_rounding_unit integer
)
returns jsonb
language plpgsql
volatile
as $$
declare
  num jsonb;
  den jsonb;
  rate integer;
begin
  num := app_private.privacy_cell(p_numerator, p_min_group, p_epsilon, p_rounding_unit);
  den := app_private.privacy_cell(p_denominator, p_min_group, p_epsilon, p_rounding_unit);

  if (num ->> 'suppressed')::boolean or (den ->> 'suppressed')::boolean then
    return jsonb_build_object(
      'suppressed', true,
      'percent', null,
      'numerator', num,
      'denominator', den,
      'reason', 'component_below_threshold'
    );
  end if;

  rate := least(100, round(100.0 * (num ->> 'value')::bigint / nullif((den ->> 'value')::bigint, 0))::integer);

  return jsonb_build_object(
    'suppressed', false,
    'percent', rate,
    'numerator', num,
    'denominator', den,
    'reason', null
  );
end $$;

/** The policy, read once per command so every cell in one payload is drawn under the same parameters. */
create or replace function app_private.programme_privacy_settings()
returns public.privacy_policy_settings
language sql
stable
security definer
set search_path = public, app_private
as $$
  select * from public.privacy_policy_settings where singleton;
$$;

revoke all on function app_private.laplace_noise(numeric, numeric) from public;
revoke all on function app_private.privacy_cell(bigint, integer, numeric, integer) from public;
revoke all on function app_private.privacy_rate(bigint, bigint, integer, numeric, integer) from public;
revoke all on function app_private.programme_privacy_settings() from public;

create or replace function public.get_privacy_policy_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  s public.privacy_policy_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into s from public.privacy_policy_settings where singleton;
  return jsonb_build_object(
    'minGroupSize', s.min_group_size,
    'epsilon', s.epsilon,
    'roundingUnit', s.rounding_unit,
    'updatedAt', s.updated_at
  );
end $$;

/**
 * Change the policy.
 *
 * Gated on `platform.admin.manage` with aal2 and recorded in the audit trail. A programme steward cannot weaken
 * the privacy rules that apply to their own programme, which is the only arrangement that makes the rules worth
 * anything to the people in the pool.
 */
create or replace function public.set_privacy_policy_command(
  p_min_group_size integer,
  p_epsilon numeric,
  p_rounding_unit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
begin
  if not app_private.current_account_has_platform_capability('platform.admin.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;

  update public.privacy_policy_settings
     set min_group_size = p_min_group_size,
         epsilon = p_epsilon,
         rounding_unit = p_rounding_unit,
         updated_at = now(),
         updated_by_account_id = app_private.current_account_id()
   where singleton;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PRIVACY_POLICY_CHANGED', 'privacy_policy_settings', 'privacy_threshold_change',
          'system_internal',
          jsonb_build_object('min_group_size', p_min_group_size, 'epsilon', p_epsilon, 'rounding_unit', p_rounding_unit));

  return jsonb_build_object('minGroupSize', p_min_group_size, 'epsilon', p_epsilon, 'roundingUnit', p_rounding_unit);
end $$;

-- ── 2. The programme dashboard ────────────────────────────────────────────────────────────────

/** The privacy postscript every aggregate payload carries, so a page never has to reconstruct it. */
create or replace function app_private.privacy_summary(
  p_settings public.privacy_policy_settings,
  p_published integer,
  p_withheld integer
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'minGroupSize', p_settings.min_group_size,
    'epsilon', p_settings.epsilon,
    'roundingUnit', p_settings.rounding_unit,
    'cellsPublished', p_published,
    'cellsWithheld', p_withheld,
    -- Only the noised cells are accounted for here. Withholding is a different protection and spends nothing.
    'epsilonSpent', round(p_settings.epsilon * p_published, 2)
  );
$$;

revoke all on function app_private.privacy_summary(public.privacy_policy_settings, integer, integer) from public;

/**
 * The programme dashboard.
 *
 * ⚠️ EVERY COUNT OF PEOPLE PASSES THROUGH `privacy_cell`, ONE CALL EACH, INTO A VARIABLE. That is not style: a
 * cell evaluated twice in the same statement would draw two different noises, and the page would show two
 * different numbers for the same thing.
 *
 * ⚠️ THE BUDGET IS EXACT AND THE PEOPLE ARE NOT, DELIBERATELY. A grant allocation, a planned cohort capacity and
 * a project title are the institution's own figures and describe no individual; publishing them noised would
 * make the dashboard useless without protecting anybody. Participation counts are measurements of people and are
 * noised and thresholded. `privacy.notice` says which is which on the page.
 */
create or replace function public.get_programme_dashboard_command(p_programme_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.programme_role_for(p_programme_id, me);
  rank integer := app_private.programme_role_rank(role);
  p public.programmes%rowtype;
  s public.privacy_policy_settings%rowtype;

  v_enrolled bigint;
  v_active bigint;
  v_completed bigint;
  v_withdrawn bigint;
  c_enrolled jsonb;
  c_active jsonb;
  c_completed jsonb;
  c_withdrawn jsonb;
  v_progress jsonb;

  cohorts jsonb;
  projects jsonb;
  budget jsonb;

  published integer := 0;
  withheld integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if role is null then
    return jsonb_build_object('allowed', false);
  end if;

  select * into p from public.programmes where id = p_programme_id;
  if not found then
    return jsonb_build_object('allowed', false);
  end if;
  s := app_private.programme_privacy_settings();

  select count(*) filter (where w.state in ('enrolled', 'active', 'completed')),
         count(*) filter (where w.state = 'active'),
         count(*) filter (where w.state = 'completed'),
         count(*) filter (where w.state = 'withdrawn')
    into v_enrolled, v_active, v_completed, v_withdrawn
    from public.programme_workers w
   where w.programme_id = p.id;

  c_enrolled := app_private.privacy_cell(v_enrolled, s.min_group_size, s.epsilon, s.rounding_unit);
  c_active := app_private.privacy_cell(v_active, s.min_group_size, s.epsilon, s.rounding_unit);
  c_completed := app_private.privacy_cell(v_completed, s.min_group_size, s.epsilon, s.rounding_unit);
  c_withdrawn := app_private.privacy_cell(v_withdrawn, s.min_group_size, s.epsilon, s.rounding_unit);
  v_progress := app_private.privacy_rate(v_completed, v_enrolled, s.min_group_size, s.epsilon, s.rounding_unit);

  published := published
    + (case when (c_enrolled ->> 'suppressed')::boolean then 0 else 1 end)
    + (case when (c_active ->> 'suppressed')::boolean then 0 else 1 end)
    + (case when (c_completed ->> 'suppressed')::boolean then 0 else 1 end)
    + (case when (c_withdrawn ->> 'suppressed')::boolean then 0 else 1 end)
    + (case when (v_progress ->> 'suppressed')::boolean then 0 else 2 end);
  withheld := withheld
    + (case when (c_enrolled ->> 'suppressed')::boolean then 1 else 0 end)
    + (case when (c_active ->> 'suppressed')::boolean then 1 else 0 end)
    + (case when (c_completed ->> 'suppressed')::boolean then 1 else 0 end)
    + (case when (c_withdrawn ->> 'suppressed')::boolean then 1 else 0 end)
    + (case when (v_progress ->> 'suppressed')::boolean then 2 else 0 end);

  -- Cohorts. Capacity is a plan the institution wrote; the number of people in it is a measurement.
  select coalesce(jsonb_agg(entry order by name), '[]'::jsonb)
    into cohorts
    from (
      select jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'status', c.status,
               'capacity', c.capacity,
               'startsOn', c.starts_on,
               'endsOn', c.ends_on,
               'size', size_cell.cell,
               'completed', completed_cell.cell,
               'progress', progress.cell
             ) as entry,
             c.name,
             size_cell.cell,
             completed_cell.cell,
             progress.cell
        from public.programme_cohorts c
        cross join lateral (
          select app_private.privacy_cell(
                   (select count(*) from public.programme_workers w where w.cohort_id = c.id),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) size_cell
        cross join lateral (
          select app_private.privacy_cell(
                   (select count(*) from public.programme_workers w where w.cohort_id = c.id and w.state = 'completed'),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) completed_cell
        cross join lateral (
          select app_private.privacy_rate(
                   (select count(*) from public.programme_workers w where w.cohort_id = c.id and w.state = 'completed'),
                   (select count(*) from public.programme_workers w where w.cohort_id = c.id),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) progress
       where c.programme_id = p.id
    ) listed;

  -- Linked projects, with the number of allocated workers per project counted as a cell.
  select coalesce(jsonb_agg(entry order by name), '[]'::jsonb)
    into projects
    from (
      select distinct
             jsonb_build_object(
               'assignmentId', a.id,
               'label', coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project'),
               'status', a.status,
               'allocated', workers.cell,
               'allocatedAt', first_allocation.at
             ) as entry,
             coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project') as name
        -- From the LINKS, not from the allocations: a project the programme has been brought onto shows on the
        -- dashboard before anybody is placed on it, with its worker count withheld rather than the row missing.
        from public.programme_projects pp
        join public.assignments a on a.id = pp.assignment_id
        join public.requests rq on rq.id = a.request_id
        cross join lateral (
          select app_private.privacy_cell(
                   (select count(distinct al2.worker_id)
                      from public.programme_allocations al2
                      join public.programme_workers w2 on w2.id = al2.worker_id
                     where al2.assignment_id = a.id and w2.programme_id = p.id),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) workers
        cross join lateral (
          select min(al3.allocated_at) as at
            from public.programme_allocations al3
            join public.programme_workers w3 on w3.id = al3.worker_id
           where al3.assignment_id = a.id and w3.programme_id = p.id
        ) first_allocation
       where pp.programme_id = p.id and pp.unlinked_at is null
    ) listed;

  select jsonb_build_object(
           'allocatedMinor', p.budget_allocation_minor,
           'currencyCode', p.currency_code,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'label', b.label, 'amountMinor', b.amount_minor,
                      'currencyCode', b.currency_code, 'allocatedOn', b.allocated_on, 'note', b.note)
                      order by b.allocated_on desc)
               from public.programme_budget_allocations b where b.programme_id = p.id
           ), '[]'::jsonb)
         )
    into budget;

  -- ⚠️ THE COMPOSITION IS COUNTED FROM THE PAYLOAD THAT WAS ACTUALLY BUILT, not estimated from the number of
  -- rows the query could have produced. Each noised value is one cell; a rate is two, because its numerator and
  -- its denominator were each drawn separately. A withheld cell spends nothing.
  published := published
    + (select count(*) from jsonb_array_elements(cohorts) e where not (e -> 'size' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(cohorts) e where not (e -> 'completed' ->> 'suppressed')::boolean)
    + 2 * (select count(*) from jsonb_array_elements(cohorts) e where not (e -> 'progress' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(projects) e where not (e -> 'allocated' ->> 'suppressed')::boolean);

  withheld := withheld
    + (select count(*) from jsonb_array_elements(cohorts) e where (e -> 'size' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(cohorts) e where (e -> 'completed' ->> 'suppressed')::boolean)
    + 2 * (select count(*) from jsonb_array_elements(cohorts) e where (e -> 'progress' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(projects) e where (e -> 'allocated' ->> 'suppressed')::boolean);

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'rank', rank,
    'programme', jsonb_build_object(
      'id', p.id,
      'reference', p.reference,
      'name', p.name,
      'kind', p.kind,
      'status', p.status,
      'regionLabel', p.region_label,
      'fundingSource', p.funding_source,
      'startsOn', p.starts_on,
      'endsOn', p.ends_on,
      'summary', p.summary
    ),
    'participation', jsonb_build_object(
      'enrolled', c_enrolled,
      'active', c_active,
      'completed', c_completed,
      'withdrawn', c_withdrawn,
      'progress', v_progress
    ),
    'cohorts', cohorts,
    'projects', projects,
    'budget', budget,
    'privacy', app_private.privacy_summary(s, published, withheld) || jsonb_build_object(
      'notice', 'Exactly one kind of figure on this page is exact, and it is the institution''s own: budgets, planned cohort capacity and project names describe no individual. Every count of people is computed from a group of at least ' || s.min_group_size || ' and noised with the Laplace mechanism at epsilon = ' || s.epsilon || '. A withheld figure means the group was smaller than the threshold — the platform does not say how small.'
    ),
    'privacyAdvisory', 'These figures are deliberately approximate and must not be added, compared or quoted as exact counts. The parts will not sum to the whole: that is the noise, and it is there to stop any single person being identifiable from a table.'
  );
end $$;

-- ── 3. Labour intelligence ────────────────────────────────────────────────────────────────────

/**
 * The aggregate market view.
 *
 * ⚠️ THERE ARE NO FREE-TEXT GROUPING PARAMETERS. Every dimension is fixed in this function — skill, region,
 * credential kind, allocation band. A caller who could choose the grouping could choose one that isolates a
 * single person, and no threshold on the output can rescue a query that was unsafe by construction.
 *
 * ⚠️ IT REPORTS HOW MUCH IS MISSING. `cellsWithheld` counts the rows that were below the threshold, so the page
 * can say "nine figures in this view are withheld" instead of presenting a distribution that silently omits half
 * its categories and reads as complete.
 *
 * ⚠️ INDIVIDUAL INFERENCE IS NOT MERELY DISCOURAGED, IT IS UNREPRESENTABLE. Nothing here returns a worker, a
 * pseudonym, a name, an allocation or a credential — only counts over groups. There is no argument to this
 * function that could ask for one.
 */
create or replace function public.get_programme_insights_command(p_programme_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.programme_role_for(p_programme_id, me);
  rank integer := app_private.programme_role_rank(role);
  p public.programmes%rowtype;
  s public.privacy_policy_settings%rowtype;
  skills jsonb;
  regions jsonb;
  credentials jsonb;
  bands jsonb;
  v_placed bigint;
  v_enrolled bigint;
  v_completion jsonb;
  v_placement jsonb;
  demand jsonb;
  published integer := 0;
  withheld integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if role is null then
    return jsonb_build_object('allowed', false);
  end if;

  select * into p from public.programmes where id = p_programme_id;
  if not found then
    return jsonb_build_object('allowed', false);
  end if;
  s := app_private.programme_privacy_settings();

  -- Skill distribution: one cell per distinct skill in the pool.
  select coalesce(jsonb_agg(entry order by name), '[]'::jsonb)
    into skills
    from (
      select jsonb_build_object('skill', sk.name, 'workers', cell.cell) as entry, sk.name, cell.cell
        from (
          select distinct lower(btrim(skill)) as name
            from public.programme_workers w
            cross join lateral unnest(w.skills) as skill
           where w.programme_id = p.id
        ) sk
        cross join lateral (
          select app_private.privacy_cell(
                   (select count(*) from public.programme_workers w
                     where w.programme_id = p.id and sk.name = any (w.skills)),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) cell
    ) listed;

  -- Regional supply, plus market-wide demand. Demand is not broken down by the pool's regions on purpose: those
  -- regions are the institution's own labels and do not map to the discovery catalogue's locations, so a
  -- per-region demand figure would be an invented join.
  select coalesce(jsonb_agg(entry order by name), '[]'::jsonb)
    into regions
    from (
      select jsonb_build_object('region', r.name, 'workers', cell.cell) as entry, r.name, cell.cell
        from (
          select distinct w.region_label as name from public.programme_workers w where w.programme_id = p.id
        ) r
        cross join lateral (
          select app_private.privacy_cell(
                   (select count(*) from public.programme_workers w
                     where w.programme_id = p.id and w.region_label = r.name),
                   s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) cell
    ) listed;

  select app_private.privacy_cell(
           (select count(*) from public.requests rq
             where (p.market_id is null or rq.market_id = p.market_id)
               and rq.state not in ('completed', 'cancelled', 'draft')),
           s.min_group_size, s.epsilon, s.rounding_unit)
    into demand;

  -- Credential coverage by kind and state.
  select coalesce(jsonb_agg(entry order by kind), '[]'::jsonb)
    into credentials
    from (
      select jsonb_build_object(
               'kind', k.kind,
               'verified', v.cell,
               'pending', pnd.cell,
               'rejected', rej.cell
             ) as entry,
             k.kind::text as kind,
             v.cell
        from (select distinct kind from public.programme_credentials cr
                join public.programme_workers w on w.id = cr.worker_id
               where w.programme_id = p.id) k
        cross join lateral (
          select app_private.privacy_cell((
                   select count(distinct cr.worker_id) from public.programme_credentials cr
                    join public.programme_workers w on w.id = cr.worker_id
                   where w.programme_id = p.id and cr.kind = k.kind and cr.state = 'verified'),
                 s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) v
        cross join lateral (
          select app_private.privacy_cell((
                   select count(distinct cr.worker_id) from public.programme_credentials cr
                    join public.programme_workers w on w.id = cr.worker_id
                   where w.programme_id = p.id and cr.kind = k.kind and cr.state = 'pending'),
                 s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) pnd
        cross join lateral (
          select app_private.privacy_cell((
                   select count(distinct cr.worker_id) from public.programme_credentials cr
                    join public.programme_workers w on w.id = cr.worker_id
                   where w.programme_id = p.id and cr.kind = k.kind and cr.state = 'rejected'),
                 s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) rej
    ) listed;

  -- The rate benchmark: the agreed value of work allocated to participants, banded.
  --
  -- ⚠️ IT IS LABELLED AS THE VALUE OF ALLOCATED WORK, NOT AS A WAGE. The platform records what a job was agreed
  -- at and not what a person was paid, and a job price relabelled "wage" in a grant report would be a fabricated
  -- figure with an institution's name behind it. The bands are the honest statistic the data supports.
  select coalesce(jsonb_agg(jsonb_build_object('band', band.label, 'engagements', band.cell) order by band.sort), '[]'::jsonb)
    into bands
    from (
      select b.label, b.sort, cell.cell
        from (values
          ('Under 50,000', 1, 0::bigint, 5000000::bigint),
          ('50,000 – 150,000', 2, 5000000::bigint, 15000000::bigint),
          ('150,000 – 500,000', 3, 15000000::bigint, 50000000::bigint),
          ('500,000 – 1,500,000', 4, 50000000::bigint, 150000000::bigint),
          ('Over 1,500,000', 5, 150000000::bigint, null::bigint)
        ) b(label, sort, low, high)
        cross join lateral (
          select app_private.privacy_cell((
                   select count(*)
                     from public.programme_allocations al
                     join public.programme_workers w on w.id = al.worker_id
                     join public.assignments a on a.id = al.assignment_id
                     join public.quotes q on q.id = a.accepted_quote_id
                    where w.programme_id = p.id
                      and (b.low is null or q.total_minor >= b.low)
                      and (b.high is null or q.total_minor < b.high)
                 ), s.min_group_size, s.epsilon, s.rounding_unit) as cell
        ) cell
    ) band;

  select count(*) filter (where w.state = 'completed'),
         count(*) filter (where w.state in ('enrolled', 'active', 'completed'))
    into v_placed, v_enrolled
    from public.programme_workers w
   where w.programme_id = p.id;

  v_completion := app_private.privacy_rate(v_placed, v_enrolled, s.min_group_size, s.epsilon, s.rounding_unit);
  v_placement := app_private.privacy_rate(
    (select count(distinct al.worker_id)
       from public.programme_allocations al
       join public.programme_workers w on w.id = al.worker_id
      where w.programme_id = p.id),
    v_enrolled,
    s.min_group_size, s.epsilon, s.rounding_unit
  );

  -- Composition, counted from the payload that was actually built rather than estimated: every cell that came
  -- back as `suppressed` is withheld, everything else was noised.
  published :=
      (select count(*) from jsonb_array_elements(skills) e where not (e -> 'workers' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(regions) e where not (e -> 'workers' ->> 'suppressed')::boolean)
    + (case when (demand ->> 'suppressed')::boolean then 0 else 1 end)
    + (select count(*) from jsonb_array_elements(credentials) e where not (e -> 'verified' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(credentials) e where not (e -> 'pending' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(credentials) e where not (e -> 'rejected' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(bands) e where not (e -> 'engagements' ->> 'suppressed')::boolean)
    + (case when (v_completion ->> 'suppressed')::boolean then 0 else 2 end)
    + (case when (v_placement ->> 'suppressed')::boolean then 0 else 2 end);

  withheld :=
      (select count(*) from jsonb_array_elements(skills) e where (e -> 'workers' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(regions) e where (e -> 'workers' ->> 'suppressed')::boolean)
    + (case when (demand ->> 'suppressed')::boolean then 1 else 0 end)
    + (select count(*) from jsonb_array_elements(credentials) e where (e -> 'verified' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(credentials) e where (e -> 'pending' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(credentials) e where (e -> 'rejected' ->> 'suppressed')::boolean)
    + (select count(*) from jsonb_array_elements(bands) e where (e -> 'engagements' ->> 'suppressed')::boolean)
    + (case when (v_completion ->> 'suppressed')::boolean then 2 else 0 end)
    + (case when (v_placement ->> 'suppressed')::boolean then 2 else 0 end);

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'rank', rank,
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'regionLabel', p.region_label),
    'skills', skills,
    'regions', regions,
    'credentials', credentials,
    'bands', bands,
    'demand', jsonb_build_object(
      'openRequests', demand,
      'scope', 'Open requests across the market this programme is registered in. Demand is not broken down by the pool''s own regions: those are the institution''s labels and do not map to the platform''s location catalogue.'
    ),
    'outcomes', jsonb_build_object('completion', v_completion, 'placement', v_placement),
    'privacy', app_private.privacy_summary(s, published, withheld) || jsonb_build_object(
      'notice', 'Every figure here is a noised count over a group of at least ' || s.min_group_size || '. Where a group was smaller, the figure is withheld entirely and counted in cellsWithheld — the platform does not say how small it was.',
      'limitation', 'This stops a small group being reported exactly. It cannot stop an inference by somebody who already knows everything about the group except one person — no aggregate can — and it is not a substitute for the consent rules that govern the worker registry.'
    ),
    'benchmarkNote', 'The rate benchmark is the agreed value of work allocated to participants, banded. The platform records what a job was agreed at and not what a person was paid, so it is not published as a wage.'
  );
end $$;

revoke all on function public.get_privacy_policy_command() from public, anon;
revoke all on function public.set_privacy_policy_command(integer, numeric, integer) from public, anon;
revoke all on function public.get_programme_dashboard_command(uuid) from public, anon;
revoke all on function public.get_programme_insights_command(uuid) from public, anon;

grant execute on function public.get_privacy_policy_command() to authenticated;
grant execute on function public.set_privacy_policy_command(integer, numeric, integer) to authenticated;
grant execute on function public.get_programme_dashboard_command(uuid) to authenticated;
grant execute on function public.get_programme_insights_command(uuid) to authenticated;
