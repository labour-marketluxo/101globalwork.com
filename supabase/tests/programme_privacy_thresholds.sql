-- Prove the programme privacy rules hold: thresholds suppress, the mechanism perturbs, and no anonymous request
-- can reach the pool.
--
-- Rollback-safe: everything is inside `begin; … rollback;`, and the one worker it enrols is discarded with it.
--
-- WHAT IT ASSERTS, and why each assertion is a different kind of proof:
--
--   1. A CELL BELOW k EMITS NOTHING. Not a zero, not a small number, not a noised one. This is the rule the whole
--      feature rests on, so it is checked at k-1, at 0, and at k.
--
--   2. A PUBLISHED CELL IS NEVER BELOW k. The floor is deliberate and documented, and it is what stops a group of
--      exactly k being reported as "2" by an unlucky draw.
--
--   3. THE MECHANISM IS A MECHANISM. Two calls with identical arguments must differ — a "noise" function that
--      returns the same value every time would pass every other test in this file while protecting nothing.
--
--   4. THE SAMPLE IS CALIBRATED. Over a few thousand draws, the mean is near zero and the spread is near
--      sqrt(2)/epsilon for sensitivity 1, which is the Laplace distribution's standard deviation. The tolerance is
--      deliberately wide because this is a sanity check on the scale, not a statistical test.
--
--   4b. THE MECHANISM IS NOT CANCELLED BY ROUNDING, and the guard is structural: the schema refuses a rounding unit
--      coarser than the noise's own spread. The first version of the settings had exactly that flaw — rounding to 5
--      against a standard deviation of 1.4 — and it is invisible to every other check in this file.
--
--   5. THE THRESHOLDS CANNOT BE WEAKENED QUIETLY. The CHECK constraints refuse k below 2 and epsilon above 5.
--
--   6. THERE IS NO ANONYMOUS PATH TO THE POOL. `has_function_privilege('anon', …)` must be false for every
--      programme function, and the programme tables must carry no permissive policy for `anon`. This is the
--      "public worker registries are strictly forbidden by default" rule, asserted against the catalogue rather
--      than trusted.

begin;

do $$
declare
  v_settings public.privacy_policy_settings%rowtype;
  v_below jsonb;
  v_zero jsonb;
  v_at_k jsonb;
  v_noise_a numeric;
  v_noise_b numeric;
  v_mean numeric;
  v_std numeric;
  v_n integer := 4000;
  v_rate jsonb;
  v_leak integer := 0;
  v_anon_exec integer := 0;
  v_anon_policies integer := 0;
  v_sensitive boolean;
begin
  select * into v_settings from public.privacy_policy_settings where singleton;
  if v_settings.min_group_size < 2 then
    raise exception 'the minimum group size is below 2, which is not a threshold';
  end if;

  -- 1. Below k: nothing. At and above k: something.
  v_below := app_private.privacy_cell(v_settings.min_group_size - 1, v_settings.min_group_size, v_settings.epsilon, v_settings.rounding_unit);
  if (v_below ->> 'suppressed')::boolean is not true or (v_below -> 'value') <> 'null'::jsonb then
    raise exception 'a cell below k was not suppressed: %', v_below;
  end if;

  v_zero := app_private.privacy_cell(0, v_settings.min_group_size, v_settings.epsilon, v_settings.rounding_unit);
  if (v_zero ->> 'suppressed')::boolean is not true then
    raise exception 'a zero cell was published; a zero is a disclosure about a small group';
  end if;

  v_at_k := app_private.privacy_cell(v_settings.min_group_size, v_settings.min_group_size, v_settings.epsilon, v_settings.rounding_unit);
  if (v_at_k ->> 'suppressed')::boolean is true then
    raise exception 'a cell of exactly k was suppressed';
  end if;

  -- 2. The floor, over many draws: never below k, ever.
  for i in 1..200 loop
    if (app_private.privacy_cell(v_settings.min_group_size, v_settings.min_group_size, v_settings.epsilon, v_settings.rounding_unit) ->> 'value')::bigint < v_settings.min_group_size then
      raise exception 'a published cell fell below the minimum group size';
    end if;
  end loop;

  -- 3. Volatility.
  v_noise_a := app_private.laplace_noise(1, v_settings.epsilon);
  v_noise_b := app_private.laplace_noise(1, v_settings.epsilon);
  if v_noise_a = v_noise_b then
    raise exception 'the noise function returned the same value twice; it is not a mechanism';
  end if;

  -- 4. Scale, over a sample. Mean near 0, spread near sqrt(2)/epsilon.
  select avg(n), stddev_samp(n) into v_mean, v_std
    from (select app_private.laplace_noise(1, v_settings.epsilon) as n from generate_series(1, v_n)) draws;

  if abs(v_mean) > 0.25 then
    raise exception 'the noise sample mean is % away from zero', v_mean;
  end if;
  if v_std < 0.7 * sqrt(2) / v_settings.epsilon or v_std > 1.4 * sqrt(2) / v_settings.epsilon then
    raise exception 'the noise spread (%) is not near sqrt(2)/epsilon', v_std;
  end if;

  -- 4b. THE MECHANISM MUST NOT BE CANCELLED BY ROUNDING, and the guard for that is a CONSTRAINT rather than a
  -- statistical test. Coarser rounding than the noise's own spread flattens the perturbation — measured before the
  -- constraint existed: at epsilon = 1 with a rounding unit of 5, two draws for a count of 100 were identical 85%
  -- of the time, which is a page showing the true count with a tilde in front of it.
  --
  -- ⚠️ IT IS ASSERTED BY TRYING IT, NOT BY SAMPLING. A sampling threshold would either flake or be so loose it
  -- proved nothing; the schema refuses the setting outright, and that is checkable exactly.
  begin
    update public.privacy_policy_settings set rounding_unit = 5, epsilon = 1.00 where singleton;
    raise exception 'a rounding unit five times the noise spread was accepted';
  exception when check_violation then null;
  end;

  -- And it is accepted where the noise is wide enough to survive it, so the guard is a limit rather than a ban.
  begin
    update public.privacy_policy_settings set rounding_unit = 5, epsilon = 0.25 where singleton;
    update public.privacy_policy_settings set rounding_unit = 1, epsilon = 1.00 where singleton;
  exception when check_violation then
    raise exception 'a rounding unit inside the noise spread was refused';
  end;

  -- 5. A rate with a suppressed component is suppressed.
  v_rate := app_private.privacy_rate(1, 500, v_settings.min_group_size, v_settings.epsilon, v_settings.rounding_unit);
  if (v_rate ->> 'suppressed')::boolean is not true or (v_rate -> 'percent') <> 'null'::jsonb then
    raise exception 'a rate with a below-threshold numerator was published: %', v_rate;
  end if;

  -- 6. The thresholds cannot be loosened without a deliberate schema change.
  begin
    update public.privacy_policy_settings set min_group_size = 1 where singleton;
    raise exception 'the minimum group size was lowered to 1';
  exception when check_violation then null;
  end;
  begin
    update public.privacy_policy_settings set epsilon = 9 where singleton;
    raise exception 'epsilon was raised above the ceiling';
  exception when check_violation then null;
  end;

  -- 7. No anonymous path to the pool, checked against the catalogue rather than assumed.
  select count(*) into v_anon_exec
    from unnest(array[
      'public.get_programme_context_command(uuid)',
      'public.get_programme_workers_command(uuid)',
      'public.get_programme_dashboard_command(uuid)',
      'public.get_programme_insights_command(uuid)',
      'public.enrol_programme_worker_command(uuid,text,text,text,text[],uuid,uuid)',
      'public.record_programme_credential_command(uuid,uuid,text,text,date,date,text,text)',
      'public.assign_programme_worker_command(uuid,uuid,uuid,text)',
      'public.record_programme_consent_command(uuid,uuid,text,uuid,text,boolean)',
      'public.link_programme_project_command(uuid,uuid,text)',
      'public.unlink_programme_project_command(uuid,uuid)'
    ]) as f(signature)
   where has_function_privilege('anon', f.signature, 'EXECUTE');
  if v_anon_exec <> 0 then
    raise exception '% programme functions are executable by an anonymous caller', v_anon_exec;
  end if;

  select count(*) into v_anon_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in (
       'programmes','programme_stewards','programme_cohorts','programme_projects',
       'programme_workers','programme_credentials','programme_allocations',
       'programme_worker_consents','programme_budget_allocations','privacy_policy_settings')
     and 'anon' = any (roles)
     and cmd in ('SELECT', 'ALL')
     and coalesce(qual, 'false') not in ('false');
  if v_anon_policies <> 0 then
    raise exception '% programme tables have a permissive policy for anon', v_anon_policies;
  end if;

  -- The registry command must refuse without a session rather than return an empty list.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_programme_workers_command(gen_random_uuid());
    raise exception 'the registry answered without a session';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'programme_privacy_thresholds' as suite, 'passed' as result;

rollback;
