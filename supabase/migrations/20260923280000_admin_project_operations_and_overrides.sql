-- Admin project operations: the exception directory, the diagnostics read, and the override console.
--
-- ── FOUR RULES THIS MIGRATION EXISTS TO ENFORCE ────────────────────────────────────────────────
--
-- 1. NO DIRECT MUTATION, AND THAT IS ENFORCED BY THERE BEING NOTHING ELSE TO CALL. Every intervention on
--    these two screens runs through `run_project_override_command`. There is no update path on the admin
--    tables, no writable grant, and the pages render only forms that post to commands. A console that can
--    `update requests set state = ...` is a console with no state machine in it.
--
-- 2. THE STATE MACHINE IS BYPASSED, NOT DELETED. `enforce_request_state_transition` keeps refusing illegal
--    transitions; the override sets a transaction-local flag AND re-checks the caller's capability inside the
--    trigger, so an illegal move happens only inside one transaction, only for a caller holding
--    `platform.projects.intervene`, and never because somebody found a way to set a setting.
--
-- 3. AN OVERRIDE IS EVIDENCE-BACKED AND APPEND-ONLY. Reason code, note, a support-ticket or case reference,
--    the state it moved from and to, and who did it — in `platform_project_overrides` and in the audit
--    stream. There is no way to record an override without all of it.
--
-- 4. AN OVERRIDE MOVES ONE THING. Forcing a request's state does not fund, release, refund or notify
--    anything. The directory's financial-inconsistency check exists because the honest consequence of
--    forcing `completed` without the completion approval is an obligation that is still funded — and the
--    console shows that rather than tidying it away.

-- ── The reason vocabulary, extended ────────────────────────────────────────────────────────────

/**
 * Redefined with the two operator scopes added.
 *
 * ⚠️ THE WHOLE FUNCTION IS REPEATED, as it was when the trust scopes were added: it is the single list the
 * database validates against, and a partial definition would silently drop the scopes the other consoles
 * already offer.
 */
create or replace function public.admin_reason_codes_command()
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  select jsonb_build_object(
    'account_standing', jsonb_build_array(
      jsonb_build_object('code', 'customer_request', 'label', 'The account holder asked us to'),
      jsonb_build_object('code', 'suspected_compromise', 'label', 'Suspected account compromise'),
      jsonb_build_object('code', 'policy_violation', 'label', 'Policy or terms violation'),
      jsonb_build_object('code', 'investigation', 'label', 'Under investigation'),
      jsonb_build_object('code', 'support_recovery', 'label', 'Support recovery completed'),
      jsonb_build_object('code', 'mistaken_suspension', 'label', 'Previous suspension was a mistake'),
      jsonb_build_object('code', 'safety_case', 'label', 'A safety or abuse case is open')
    ),
    'session_revocation', jsonb_build_array(
      jsonb_build_object('code', 'suspected_compromise', 'label', 'Suspected account compromise'),
      jsonb_build_object('code', 'device_lost', 'label', 'The account holder lost a device'),
      jsonb_build_object('code', 'customer_request', 'label', 'The account holder asked us to'),
      jsonb_build_object('code', 'security_review', 'label', 'Security review'),
      jsonb_build_object('code', 'support_recovery', 'label', 'Support recovery in progress')
    ),
    'contact_reveal', jsonb_build_array(
      jsonb_build_object('code', 'support_ticket', 'label', 'Support ticket needs the address'),
      jsonb_build_object('code', 'verification_review', 'label', 'Verification review'),
      jsonb_build_object('code', 'fraud_investigation', 'label', 'Fraud investigation'),
      jsonb_build_object('code', 'legal_request', 'label', 'Legal or regulatory request')
    ),
    'provider_restriction', jsonb_build_array(
      jsonb_build_object('code', 'credential_expired', 'label', 'A required credential has expired'),
      jsonb_build_object('code', 'verification_failed', 'label', 'Verification was not accepted'),
      jsonb_build_object('code', 'policy_violation', 'label', 'Policy or terms violation'),
      jsonb_build_object('code', 'safety_concern', 'label', 'A safety concern was raised'),
      jsonb_build_object('code', 'customer_complaint', 'label', 'An open customer complaint'),
      jsonb_build_object('code', 'incomplete_information', 'label', 'Information needed before review')
    ),
    'restriction_lift', jsonb_build_array(
      jsonb_build_object('code', 'resolved', 'label', 'The cause was resolved'),
      jsonb_build_object('code', 'appeal_upheld', 'label', 'An appeal was upheld'),
      jsonb_build_object('code', 'expired', 'label', 'The restriction expired'),
      jsonb_build_object('code', 'mistaken_restriction', 'label', 'The restriction was a mistake')
    ),
    'incident_ack', jsonb_build_array(
      jsonb_build_object('code', 'reviewed', 'label', 'Reviewed, no action needed'),
      jsonb_build_object('code', 'mitigated', 'label', 'Mitigated'),
      jsonb_build_object('code', 'monitoring', 'label', 'Monitoring'),
      jsonb_build_object('code', 'false_positive', 'label', 'False positive'),
      jsonb_build_object('code', 'escalated', 'label', 'Escalated elsewhere')
    ),
    'verification_decision', jsonb_build_array(
      jsonb_build_object('code', 'document_matches_claim', 'label', 'The document matches the claim'),
      jsonb_build_object('code', 'registry_confirmed', 'label', 'Confirmed against the registry outside the platform'),
      jsonb_build_object('code', 'document_unreadable', 'label', 'The document cannot be read'),
      jsonb_build_object('code', 'document_mismatch', 'label', 'The document does not match the claim'),
      jsonb_build_object('code', 'incomplete_submission', 'label', 'The submission is incomplete'),
      jsonb_build_object('code', 'duplicate_claim', 'label', 'That reference is claimed elsewhere'),
      jsonb_build_object('code', 'jurisdiction_mismatch', 'label', 'The jurisdiction does not match the market'),
      jsonb_build_object('code', 'policy_exception', 'label', 'A policy exception applies'),
      jsonb_build_object('code', 'needs_trust_lead', 'label', 'Needs a trust lead')
    ),
    'credential_decision', jsonb_build_array(
      jsonb_build_object('code', 'issuer_confirmed', 'label', 'The issuing body confirms the credential'),
      jsonb_build_object('code', 'jurisdiction_confirmed', 'label', 'The jurisdiction is right for this work'),
      jsonb_build_object('code', 'expired_document', 'label', 'The document has expired'),
      jsonb_build_object('code', 'issuer_not_recognised', 'label', 'The issuing body is not recognised'),
      jsonb_build_object('code', 'document_unreadable', 'label', 'The uploaded document cannot be read'),
      jsonb_build_object('code', 'scope_changed', 'label', 'The services it covers have changed'),
      jsonb_build_object('code', 'issuer_revoked', 'label', 'The issuer has withdrawn it'),
      jsonb_build_object('code', 'provider_request', 'label', 'The provider asked us to'),
      jsonb_build_object('code', 'policy_exception', 'label', 'A policy exception applies')
    ),
    'trust_case_action', jsonb_build_array(
      jsonb_build_object('code', 'assigned_for_review', 'label', 'Assigned for review'),
      jsonb_build_object('code', 'reassigned', 'label', 'Reassigned to a different reviewer'),
      jsonb_build_object('code', 'risk_assessment', 'label', 'Risk assessed'),
      jsonb_build_object('code', 'safety_concern', 'label', 'A safety concern was raised'),
      jsonb_build_object('code', 'legal_advice_sought', 'label', 'Legal advice sought'),
      jsonb_build_object('code', 'escalated', 'label', 'Escalated')
    ),
    'trust_case_hold', jsonb_build_array(
      jsonb_build_object('code', 'litigation', 'label', 'Litigation is expected or underway'),
      jsonb_build_object('code', 'regulatory_request', 'label', 'A regulator has asked us to preserve this'),
      jsonb_build_object('code', 'law_enforcement', 'label', 'Law enforcement has asked us to preserve this'),
      jsonb_build_object('code', 'serious_safety_incident', 'label', 'A serious safety incident')
    ),
    'trust_case_hold_lift', jsonb_build_array(
      jsonb_build_object('code', 'matter_concluded', 'label', 'The matter has concluded'),
      jsonb_build_object('code', 'regulatory_clearance', 'label', 'The regulator has released us'),
      jsonb_build_object('code', 'mistaken_hold', 'label', 'The hold was applied in error'),
      jsonb_build_object('code', 'preservation_complete', 'label', 'Preservation is complete and exported')
    ),
    'trust_case_closure', jsonb_build_array(
      jsonb_build_object('code', 'no_breach_found', 'label', 'No breach of policy was found'),
      jsonb_build_object('code', 'warning_issued', 'label', 'A warning was issued'),
      jsonb_build_object('code', 'account_restricted', 'label', 'The account was restricted'),
      jsonb_build_object('code', 'provider_restricted', 'label', 'The provider was restricted'),
      jsonb_build_object('code', 'resolved_between_parties', 'label', 'Resolved between the parties'),
      jsonb_build_object('code', 'duplicate_report', 'label', 'Duplicate of another case'),
      jsonb_build_object('code', 'insufficient_evidence', 'label', 'Not enough evidence to decide'),
      jsonb_build_object('code', 'referred_elsewhere', 'label', 'Referred to another authority')
    ),
    'project_override', jsonb_build_array(
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket established the correct state'),
      jsonb_build_object('code', 'command_failed', 'label', 'The domain command failed and left the record wrong'),
      jsonb_build_object('code', 'migration_repair', 'label', 'Repairing data from an earlier migration'),
      jsonb_build_object('code', 'legal_direction', 'label', 'Legal or regulatory direction'),
      jsonb_build_object('code', 'duplicate_transition', 'label', 'A transition was applied twice'),
      jsonb_build_object('code', 'test_cleanup', 'label', 'Cleaning up a test record')
    ),
    'job_retry', jsonb_build_array(
      jsonb_build_object('code', 'transient_failure', 'label', 'The delivery failure looked transient'),
      jsonb_build_object('code', 'dependency_restored', 'label', 'The downstream dependency is back'),
      jsonb_build_object('code', 'credentials_rotated', 'label', 'Credentials were rotated after the failures'),
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket asked for the retry'),
      jsonb_build_object('code', 'manual_verification', 'label', 'Somebody verified the effect never landed')
    )
  );
$$;

-- ── The override log ───────────────────────────────────────────────────────────────────────────

/**
 * Every operator intervention against a project, append-only.
 *
 * ⚠️ IT STORES WHAT THE COMMAND DID, NOT WHAT IT INTENDED. `from_state` and `to_state` are read from the row
 * before and after the update rather than taken from the caller's request, so the log cannot say a request
 * moved somewhere it did not. `result` distinguishes a change that happened from one that was already true.
 */
create table public.platform_project_overrides (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  command_key text not null check (command_key in ('force_state', 'retry_delivery')),
  target_id uuid,
  from_state text,
  to_state text,
  from_detail text,
  to_detail text,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 3 and 200),
  result text not null check (result in ('applied', 'no_change')),
  executed_by_account_id uuid not null references public.accounts(id) on delete restrict,
  executed_at timestamptz not null default now(),
  -- A forced transition has to say where it moved to; a retry has to name what was retried.
  constraint platform_project_overrides_target_chk check (
    (command_key = 'force_state' and to_state is not null and target_id is null)
    or (command_key = 'retry_delivery' and target_id is not null and to_state is null)
  )
);

create index platform_project_overrides_request_idx on public.platform_project_overrides(request_id, executed_at desc);
create index platform_project_overrides_executor_idx on public.platform_project_overrides(executed_by_account_id, executed_at desc);

alter table public.platform_project_overrides enable row level security;
create policy platform_project_overrides_operator_read on public.platform_project_overrides
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.projects.read')
    or app_private.current_account_has_platform_capability('platform.projects.intervene')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_project_overrides from anon;
revoke insert, update, delete on public.platform_project_overrides from authenticated;
grant select on public.platform_project_overrides to authenticated;

comment on table public.platform_project_overrides is
  'Append-only log of platform overrides against a project: a forced state transition or a delivery retry, with the reason code, the support reference and the state it actually moved between.';

-- ── The state machine, bypassable only inside one transaction by a capable caller ──────────────

/**
 * Redefined: the transition guard now recognises an explicit, capability-checked override.
 *
 * ⚠️ BOTH CONDITIONS ARE REQUIRED. The transaction-local flag is set by `run_project_override_command`
 * immediately around its own update; the capability is re-checked here, inside the trigger, rather than
 * trusted from the caller. So the bypass exists for exactly one statement of one transaction, and a caller
 * who somehow set the flag without the capability still meets the state machine.
 *
 * ⚠️ EVERYTHING ELSE IN THIS TRIGGER IS UNCHANGED, including the timestamps it fills in. An override moves the
 * state; it does not change what `submitted_at`, `completed_at` or `cancelled_at` mean.
 */
create or replace function app_private.enforce_request_state_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app_private.validate_request_transition(old.state, new.state) then
    if not (
      coalesce(current_setting('app.state_override', true), '') = 'on'
      and app_private.current_account_has_platform_capability('platform.projects.intervene')
    ) then
      raise exception 'invalid request state transition: % -> %', old.state, new.state using errcode = '23514';
    end if;
  end if;
  if old.state <> new.state then
    if new.state = 'submitted' and new.submitted_at is null then new.submitted_at := now(); end if;
    if new.state = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    if new.state = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

comment on function app_private.enforce_request_state_transition() is
  'Refuses an illegal request state transition unless the transaction has explicitly set app.state_override and the caller holds platform.projects.intervene. The override is set only by run_project_override_command.';

-- ── The exception directory ────────────────────────────────────────────────────────────────────

/**
 * Projects that need somebody, ordered by how badly.
 *
 * ⚠️ EVERY EXCEPTION IS A PREDICATE OVER ROWS, AND EACH ROW CARRIES WHICH ONES FIRED. "Stale" is a state plus
 * an age; "blocked" is a hold, an open issue or a task marked blocked; "financially inconsistent" is a list of
 * specific disagreements between the request's state and its money. A filter is only trustworthy when it is
 * the same expression the row displays.
 *
 * ⚠️ THE FINANCIAL CHECK IS A DISAGREEMENT, NOT A JUDGEMENT. Each tag below names two facts that cannot both
 * be true — money paid out for work that is not complete, funds held for a cancelled job, a dispute with
 * nothing holding the money. It does not decide which of the two is wrong; that is the operator's job, and
 * the diagnostics page hands them the records.
 */
create or replace function public.admin_project_operations_command(
  p_state text default null,
  p_market_id uuid default null,
  p_exception text default null,
  p_search text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  needle text := lower(btrim(coalesce(p_search, '')));
  result jsonb;
  summary jsonb;
  blocked_tags text[] := array['legal_hold','open_issue','blocked_task'];
  disputed_tags text[] := array['disputed','dispute_without_hold'];
  money_tags text[] := array['completed_without_release','cancelled_with_funds_held','paid_before_completion','dispute_without_hold','work_without_funding'];
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.projects.read')
    or app_private.current_account_has_platform_capability('platform.projects.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_exception is not null and p_exception <> '' and p_exception not in ('any','blocked','disputed','stale','financially_inconsistent') then
    raise exception 'unknown project exception' using errcode = '22023';
  end if;

  with projects as (
    select
      r.id as request_id,
      coalesce(nullif(btrim(r.need_text), ''), 'Request') as title,
      r.state::text as state,
      r.created_at,
      r.updated_at,
      r.completed_at,
      r.customer_account_id,
      r.organisation_id,
      mc.display_name as market_name,
      mc.code as market_code,
      a.id as assignment_id,
      a.status::text as assignment_status,
      a.provider_id,
      pr.display_name as provider_name,
      o.id as obligation_id,
      o.status::text as obligation_status,
      o.amount_minor,
      o.currency_code,
      pay.status::text as payout_status,
      issue.issue_kind,
      issue.issue_status,
      issue.issue_hold,
      issue.issue_summary,
      case_row.case_id as trust_case_id,
      case_row.case_state as trust_case_state,
      case_row.case_severity as trust_case_severity,
      case_row.case_hold as trust_case_hold,
      coalesce(blocked.count, 0) as blocked_tasks,
      array_remove(array[
        case when issue.issue_hold then 'legal_hold' end,
        case when issue.issue_status in ('open','investigation','escalated') then 'open_issue' end,
        case when coalesce(blocked.count, 0) > 0 then 'blocked_task' end,
        case when case_row.case_hold then 'trust_case_hold' end,
        case when r.state = 'disputed' then 'disputed' end,
        case when r.state in ('accepted','scheduled','in_progress','submitted_for_approval')
                  and r.updated_at < now() - interval '14 days' then 'stale' end,
        case when r.state = 'completed' and o.id is not null and o.status in ('pending','funding','funded') then 'completed_without_release' end,
        case when r.state = 'cancelled' and o.id is not null and o.status = 'funded' then 'cancelled_with_funds_held' end,
        case when pay.status = 'paid' and r.state <> 'completed' then 'paid_before_completion' end,
        case when r.state = 'disputed' and not coalesce(issue.issue_hold, false) and not coalesce(case_row.case_hold, false) then 'dispute_without_hold' end,
        case when a.id is not null and r.state in ('scheduled','in_progress','submitted_for_approval','completed')
                  and (o.id is null or o.status in ('pending','funding')) then 'work_without_funding' end
      ], null) as exceptions
    from public.requests r
    left join public.public_market_catalog mc on mc.market_id = r.market_id
    left join public.assignments a on a.request_id = r.id and a.status = 'active'
    left join public.providers pr on pr.id = a.provider_id
    left join public.payment_obligations o on o.assignment_id = a.id
    left join public.payouts pay on pay.obligation_id = o.id
    left join lateral (
      select i.kind as issue_kind, i.status as issue_status, i.legal_hold as issue_hold, i.summary as issue_summary
      from public.project_issues i
      where i.assignment_id = a.id and i.status in ('open','investigation','escalated')
      order by i.legal_hold desc, i.created_at desc
      limit 1
    ) issue on true
    left join lateral (
      select c.id as case_id, c.state as case_state, c.severity as case_severity, c.legal_hold as case_hold
      from public.platform_trust_cases c
      where c.subject_request_id = r.id and c.state not in ('resolved','closed')
      order by c.legal_hold desc, c.created_at desc
      limit 1
    ) case_row on true
    left join lateral (
      select count(*) as count from public.project_tasks t
      where t.assignment_id = a.id and t.status = 'blocked'
    ) blocked on true
    where (p_state is null or p_state = '' or p_state = 'any' or r.state::text = p_state)
      and (p_market_id is null or r.market_id = p_market_id)
      and (
        needle = ''
        or lower(coalesce(r.need_text, '')) like '%' || needle || '%'
        or lower(coalesce(pr.display_name, '')) like '%' || needle || '%'
        or lower(coalesce((select p.display_name from public.profiles p where p.account_id = r.customer_account_id), '')) like '%' || needle || '%'
      )
  ),
  filtered as (
    select p.*, case
      when p.exceptions && array['legal_hold','paid_before_completion','completed_without_release','cancelled_with_funds_held','trust_case_hold']::text[] then 1
      when p.exceptions && array['open_issue','disputed','blocked_task']::text[] then 2
      when p.exceptions && array['dispute_without_hold','work_without_funding']::text[] then 3
      when array_length(p.exceptions, 1) is not null then 4
      else 5
    end as severity_rank
    from projects p
    where p_exception is null or p_exception = '' or p_exception = 'any'
      or (p_exception = 'blocked' and p.exceptions && blocked_tags)
      or (p_exception = 'disputed' and p.exceptions && disputed_tags)
      or (p_exception = 'stale' and p.exceptions && array['stale']::text[])
      or (p_exception = 'financially_inconsistent' and p.exceptions && money_tags)
    order by severity_rank, p.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select
    coalesce(jsonb_agg(entry order by (entry ->> 'severity_rank')::int, entry ->> 'updated_at' desc nulls last), '[]'::jsonb),
    jsonb_build_object(
      'total', (select count(*) from projects),
      'blocked', (select count(*) from projects where exceptions && blocked_tags),
      'disputed', (select count(*) from projects where exceptions && disputed_tags),
      'stale', (select count(*) from projects where exceptions && array['stale']::text[]),
      'financially_inconsistent', (select count(*) from projects where exceptions && money_tags)
    )
    into result, summary
  from (
    select jsonb_build_object(
      'request_id', f.request_id,
      'title', f.title,
      'state', f.state,
      'phase', case
        when f.state in ('draft','submitted','matching','quoted') then 'pre_work'
        when f.state in ('accepted','scheduled','in_progress','submitted_for_approval') then 'contracted'
        when f.state = 'completed' then 'closed'
        when f.state = 'cancelled' then 'cancelled'
        else 'exception'
      end,
      'severity_rank', f.severity_rank,
      'created_at', f.created_at,
      'updated_at', f.updated_at,
      'completed_at', f.completed_at,
      'exceptions', to_jsonb(f.exceptions),
      'market_name', f.market_name,
      'market_code', f.market_code,
      'customer', jsonb_build_object(
        'account_id', f.customer_account_id,
        'name', coalesce(nullif(btrim((select pr2.display_name from public.profiles pr2 where pr2.account_id = f.customer_account_id)), ''), 'Account holder'),
        'contact_masked', app_private.mask_email((select u.email from auth.users u join public.accounts ac on ac.auth_user_id = u.id where ac.id = f.customer_account_id)),
        'organisation_id', f.organisation_id
      ),
      'provider', case when f.provider_id is null then null else jsonb_build_object(
        'provider_id', f.provider_id,
        'name', f.provider_name,
        'assignment_id', f.assignment_id,
        'assignment_status', f.assignment_status
      ) end,
      'issue', case when f.issue_status is null and f.trust_case_id is null then null else jsonb_build_object(
        'kind', f.issue_kind,
        'status', f.issue_status,
        'legal_hold', coalesce(f.issue_hold, false),
        'summary', f.issue_summary,
        'trust_case_id', f.trust_case_id,
        'trust_case_state', f.trust_case_state,
        'trust_case_severity', f.trust_case_severity,
        'trust_case_hold', coalesce(f.trust_case_hold, false)
      ) end,
      'blocked_tasks', f.blocked_tasks,
      'money', jsonb_build_object(
        'obligation_id', f.obligation_id,
        'obligation_status', f.obligation_status,
        'amount_minor', f.amount_minor,
        'currency_code', f.currency_code,
        'payout_status', f.payout_status
      )
    ) as entry
    from filtered f
  ) e;

  return jsonb_build_object('allowed', true, 'projects', result, 'counts', summary,
                            'state', p_state, 'market_id', p_market_id, 'exception', p_exception, 'search', p_search);
end $$;

revoke all on function public.admin_project_operations_command(text, uuid, text, text, integer) from public, anon;
grant execute on function public.admin_project_operations_command(text, uuid, text, text, integer) to authenticated;

comment on function public.admin_project_operations_command(text, uuid, text, text, integer) is
  'Project exception directory: blocked, disputed, stale and financially inconsistent projects with masked party references, the state machine phase, the active issue or case, and the obligation to link to.';

-- ── The diagnostics read ───────────────────────────────────────────────────────────────────────

/**
 * One project, everything an operator needs to explain what happened to it, and nothing they can change by
 * looking.
 *
 * ⚠️ IT IS KEYED BY REQUEST, NOT BY ASSIGNMENT. A project exists before it has a provider: a request that is
 * still being quoted has a state machine, a customer and a history, and an operator investigating a stuck one
 * needs the screen to open whether or not anybody was ever assigned. The assignment is resolved here and
 * returned when it exists.
 *
 * ⚠️ THE TIMELINE IS THE AUDIT STREAM, PROJECTED. It is the same source the participant-facing timeline reads,
 * so an operator and a party cannot be shown different histories of one project. Nothing here derives events
 * from the current state, which is how a timeline starts agreeing with whatever the row says today.
 *
 * ⚠️ THE MONEY SECTION REPORTS WHAT THE LEDGER SAYS. The obligation, its payouts and refunds and the ledger
 * entries written against it are printed with their own statuses; the authoritative financial console stays
 * /admin/money/<obligation>, and this page links to it.
 */
create or replace function public.admin_project_diagnostics_command(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  r public.requests%rowtype;
  a public.assignments%rowtype;
  has_assignment boolean := false;
  obligation public.payment_obligations%rowtype;
  has_obligation boolean := false;
  timeline jsonb := '[]'::jsonb;
  stages jsonb := '[]'::jsonb;
  issues jsonb := '[]'::jsonb;
  changes jsonb := '[]'::jsonb;
  overrides jsonb := '[]'::jsonb;
  jobs jsonb := '[]'::jsonb;
  payouts jsonb := '[]'::jsonb;
  refunds jsonb := '[]'::jsonb;
  ledger jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.projects.read')
    or app_private.current_account_has_platform_capability('platform.projects.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into r from public.requests where id = p_request_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;

  select * into a from public.assignments where request_id = r.id and status in ('active','completed') order by assigned_at desc limit 1;
  has_assignment := found;
  if has_assignment then
    select * into obligation from public.payment_obligations where assignment_id = a.id;
    has_obligation := found;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'action', e.action,
           'occurred_at', e.occurred_at,
           'actor', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = (select acc.id from public.accounts acc where acc.auth_user_id = e.actor_user_id))), ''), e.actor_type),
           'actor_type', e.actor_type,
           'resource_type', e.resource_type,
           'resource_id', e.resource_id,
           'reason_code', e.reason_code
         ) order by e.occurred_at desc), '[]'::jsonb)
    into timeline
  from (
    select ae.* from public.audit_events ae
    where (ae.resource_type = 'request' and ae.resource_id = r.id)
       or (has_assignment and ae.resource_type = 'assignment' and ae.resource_id = a.id)
       or (has_assignment and ae.resource_type in ('project_issue','project_task','project_stage','project_change_request','project_document','work_evidence')
           and ae.resource_id in (
             select i.id from public.project_issues i where i.assignment_id = a.id
             union all select t.id from public.project_tasks t where t.assignment_id = a.id
             union all select s.id from public.project_stages s where s.assignment_id = a.id
             union all select c.id from public.project_change_requests c where c.assignment_id = a.id
           ))
    order by ae.occurred_at desc
    limit 60
  ) e;

  if has_assignment then
    select coalesce(jsonb_agg(jsonb_build_object(
             'stage_id', s.id,
             'ordinal', s.ordinal,
             'title', s.title,
             'tasks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', t.id,
                        'title', t.title,
                        'status', t.status::text,
                        'ordinal', t.ordinal,
                        'assignee', nullif(btrim((select p.display_name from public.profiles p where p.account_id = t.assignee_account_id)), '')
                      ) order by t.ordinal)
               from public.project_tasks t where t.stage_id = s.id
             ), '[]'::jsonb)
           ) order by s.ordinal), '[]'::jsonb)
      into stages
    from public.project_stages s where s.assignment_id = a.id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'kind', i.kind, 'status', i.status, 'summary', i.summary,
             'legal_hold', i.legal_hold, 'response_due_at', i.response_due_at,
             'resolution', i.resolution, 'created_at', i.created_at, 'resolved_at', i.resolved_at
           ) order by i.created_at desc), '[]'::jsonb)
      into issues
    from public.project_issues i where i.assignment_id = a.id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'title', c.title, 'status', c.status, 'change_kind', c.change_kind,
             'baseline_total_minor', c.baseline_total_minor, 'proposed_total_minor', c.proposed_total_minor,
             'currency_code', coalesce(c.proposed_currency_code, c.baseline_currency_code), 'created_at', c.created_at
           ) order by c.created_at desc), '[]'::jsonb)
      into changes
    from public.project_change_requests c where c.assignment_id = a.id;
  end if;

  if has_obligation then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'status', p.status::text, 'amount_minor', p.amount_minor,
             'currency_code', p.currency_code, 'provider_reference', p.provider_reference
           ) order by p.created_at desc), '[]'::jsonb)
      into payouts
    from public.payouts p where p.obligation_id = obligation.id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id, 'status', f.status, 'amount_minor', f.amount_minor, 'reason', f.reason, 'created_at', f.created_at
           ) order by f.created_at desc), '[]'::jsonb)
      into refunds
    from public.payment_refunds f where f.obligation_id = obligation.id;

    select jsonb_build_object(
      'entry_count', (select count(*) from public.ledger_entries le where le.obligation_id = obligation.id),
      'by_account_kind', coalesce((
        select jsonb_object_agg(k.kind, k.total) from (
          select la.account_kind::text as kind, sum(le.amount_minor) as total
          from public.ledger_entries le
          join public.ledger_accounts la on la.id = le.ledger_account_id
          where le.obligation_id = obligation.id
          group by la.account_kind
        ) k
      ), '{}'::jsonb),
      'last_entry_at', (select max(le.created_at) from public.ledger_entries le where le.obligation_id = obligation.id)
    )
      into ledger;
  end if;

  -- The delivery jobs that belong to this project: the outbox rows for its own aggregates. These are the
  -- targets of the retry override, and nothing else on the platform is.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'aggregate_type', o.aggregate_type,
           'aggregate_id', o.aggregate_id,
           'event_type', o.event_type,
           'occurred_at', o.occurred_at,
           'published_at', o.published_at,
           'attempt_count', o.attempt_count,
           'last_error', o.last_error
         ) order by o.occurred_at desc), '[]'::jsonb)
    into jobs
  from public.outbox_events o
  where (o.aggregate_type = 'request' and o.aggregate_id = r.id)
     or (has_assignment and o.aggregate_type = 'assignment' and o.aggregate_id = a.id)
     or (has_obligation and o.aggregate_type = 'payment_obligation' and o.aggregate_id = obligation.id)
     or (has_obligation and o.aggregate_type = 'payout' and o.aggregate_id in (select p.id from public.payouts p where p.obligation_id = obligation.id));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'command_key', v.command_key,
           'from_state', v.from_state,
           'to_state', v.to_state,
           'from_detail', v.from_detail,
           'to_detail', v.to_detail,
           'reason_code', v.reason_code,
           'note', v.note,
           'evidence_reference', v.evidence_reference,
           'result', v.result,
           'executed_at', v.executed_at,
           'executed_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = v.executed_by_account_id)), ''), 'An operator'),
           'target_id', v.target_id
         ) order by v.executed_at desc), '[]'::jsonb)
    into overrides
  from (
    select * from public.platform_project_overrides where request_id = r.id order by executed_at desc limit 25
  ) v;

  return jsonb_build_object(
    'allowed', true,
    'found', true,
    'project', jsonb_build_object(
      'request_id', r.id,
      'title', coalesce(nullif(btrim(r.need_text), ''), 'Request'),
      'state', r.state::text,
      'urgency', r.urgency::text,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'submitted_at', r.submitted_at,
      'completed_at', r.completed_at,
      'cancelled_at', r.cancelled_at,
      'market_name', (select mc.display_name from public.public_market_catalog mc where mc.market_id = r.market_id),
      'market_code', (select mc.code from public.public_market_catalog mc where mc.market_id = r.market_id),
      'service_name', (select sc.display_name from public.public_service_catalog sc where sc.service_entity_id = r.service_entity_id),
      'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
      'organisation_id', r.organisation_id,
      'organisation_name', (select o.display_name from public.organisations o where o.id = r.organisation_id)
    ),
    'customer', jsonb_build_object(
      'account_id', r.customer_account_id,
      'name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = r.customer_account_id)), ''), 'Account holder'),
      'contact_masked', app_private.mask_email((select u.email from auth.users u join public.accounts ac on ac.auth_user_id = u.id where ac.id = r.customer_account_id)),
      'account_status', (select ac.status::text from public.accounts ac where ac.id = r.customer_account_id)
    ),
    'provider', case when not has_assignment then null else jsonb_build_object(
      'provider_id', a.provider_id,
      'name', (select pr.display_name from public.providers pr where pr.id = a.provider_id),
      'status', (select pr.status::text from public.providers pr where pr.id = a.provider_id),
      'assignment_id', a.id,
      'assignment_status', a.status::text,
      'assigned_at', a.assigned_at,
      'accepted_quote_id', a.accepted_quote_id
    ) end,
    'schedule', case when not has_assignment then null else (
      select jsonb_build_object('scheduled_start', s.scheduled_start, 'scheduled_end', s.scheduled_end, 'timezone', s.timezone, 'note', s.note)
      from public.assignment_schedules s where s.assignment_id = a.id
    ) end,
    'accepted_scope', (
      select jsonb_build_object('version', sc.version, 'scope', sc.scope_json, 'accepted_at', sc.accepted_at)
      from public.request_scopes sc
      where sc.request_id = r.id and sc.status = 'accepted'
      order by sc.version desc limit 1
    ),
    'accepted_quote', case when not has_assignment then null else (
      select jsonb_build_object(
               'id', q.id, 'status', q.status::text, 'total_minor', q.total_minor, 'currency_code', q.currency_code,
               'summary', q.summary, 'valid_until', q.valid_until, 'provider_id', q.provider_id
             )
      from public.quotes q where q.id = a.accepted_quote_id
    ) end,
    'stages', stages,
    'issues', issues,
    'changes', changes,
    'evidence_count', case when not has_assignment then 0 else (select count(*) from public.work_evidence w where w.assignment_id = a.id) end,
    'document_count', case when not has_assignment then 0 else (select count(*) from public.project_documents d where d.assignment_id = a.id) end,
    'timeline', timeline,
    'money', case when not has_obligation then null else jsonb_build_object(
      'obligation_id', obligation.id,
      'status', obligation.status::text,
      'amount_minor', obligation.amount_minor,
      'currency_code', obligation.currency_code,
      'created_at', obligation.created_at,
      'updated_at', obligation.updated_at,
      'quote_id', obligation.quote_id,
      'payouts', payouts,
      'refunds', refunds,
      'ledger', ledger
    ) end,
    'jobs', jobs,
    'overrides', overrides,
    'legal_transitions', (
      select coalesce(jsonb_object_agg(lt.state, lt.to_states), '{}'::jsonb)
      from (
        select s.state::text as state,
               coalesce(jsonb_agg(t.candidate::text order by t.candidate::text), '[]'::jsonb) as to_states
        from unnest(enum_range(null::public.request_state)) as s(state)
        cross join lateral (
          select e.candidate
          from unnest(enum_range(null::public.request_state)) as e(candidate)
          where app_private.validate_request_transition(s.state, e.candidate)
            and e.candidate <> s.state
        ) t
        group by s.state
      ) lt
    )
  );
end $$;

revoke all on function public.admin_project_diagnostics_command(uuid) from public, anon;
grant execute on function public.admin_project_diagnostics_command(uuid) to authenticated;

comment on function public.admin_project_diagnostics_command(uuid) is
  'One project for an operator: masked parties, accepted scope and quote, stages and tasks, issues and changes, the audit-projected timeline, the money chain with its ledger entries, the delivery jobs that can be retried, the override history and the state machine''s own legal transitions.';

-- ── The override command ───────────────────────────────────────────────────────────────────────

/**
 * The only way an operator changes anything about a project.
 *
 * ⚠️ TWO COMMANDS, WHICH IS THE WHOLE ALLOW-LIST. `force_state` moves a request's state machine;
 * `retry_delivery` resets the delivery bookkeeping on one outbox event. Anything else an operator wants is a
 * domain command or a support conversation, and this function deliberately offers no general-purpose
 * "run this SQL" door — the brief's zero-direct-mutation rule is only real if the console has nothing else
 * to call.
 *
 * ⚠️ THE STATE OVERRIDE IS SCOPED TO ONE TRANSACTION. The transaction-local flag is set immediately before
 * the update and cleared immediately after it, and the trigger independently re-checks
 * `platform.projects.intervene`. A caller who found another way to set that setting still meets the state
 * machine, and nothing else in the same transaction inherits the bypass.
 *
 * ⚠️ A FORCED TRANSITION MOVES THE STATE AND NOTHING ELSE. It does not fund, release, refund or notify
 * anybody, and the page says so before the button. The consequence an operator can create — a completed
 * request whose obligation is still funded — is exactly what the exception directory reports, and the
 * override row is why it can be explained later.
 */
create or replace function public.run_project_override_command(
  p_request_id uuid,
  p_command_key text,
  p_target_state text,
  p_target_id uuid,
  p_reason_code text,
  p_note text,
  p_evidence_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  r public.requests%rowtype;
  a public.assignments%rowtype;
  job public.outbox_events%rowtype;
  state_before text;
  state_after text;
  detail_before text;
  detail_after text;
  applied boolean := false;
  override_id uuid;
  note_text text := btrim(coalesce(p_note, ''));
  evidence text := btrim(coalesce(p_evidence_reference, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.projects.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to override a project' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_command_key not in ('force_state', 'retry_delivery') then
    raise exception 'that is not a command this console may run' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if char_length(evidence) < 3 then
    raise exception 'a support ticket or case reference is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid(
       case when p_command_key = 'force_state' then 'project_override' else 'job_retry' end, p_reason_code) then
    raise exception 'choose a reason for this override' using errcode = '22023';
  end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
  select * into a from public.assignments where request_id = r.id order by assigned_at desc limit 1;

  if p_command_key = 'force_state' then
    if p_target_state is null or btrim(p_target_state) = '' then
      raise exception 'a target state is required' using errcode = '22023';
    end if;
    if p_target_state not in (select unnest(enum_range(null::public.request_state))::text) then
      raise exception 'that is not a state this platform records' using errcode = '22023';
    end if;
    state_before := r.state::text;
    if state_before = p_target_state then
      raise exception 'the project is already in that state' using errcode = '22023';
    end if;

    -- The bypass, for exactly one statement.
    perform set_config('app.state_override', 'on', true);
    update public.requests set state = p_target_state::public.request_state where id = r.id;
    perform set_config('app.state_override', 'off', true);

    select state::text into state_after from public.requests where id = r.id;
    applied := state_after is distinct from state_before;
  else
    if p_target_id is null then
      raise exception 'a delivery job is required' using errcode = '22023';
    end if;
    select * into job from public.outbox_events where id = p_target_id for update;
    if not found then raise exception 'delivery job not found' using errcode = 'P0002'; end if;
    -- The job has to belong to this project, or the override would record a retry against the wrong record.
    if not (
      (job.aggregate_type = 'request' and job.aggregate_id = r.id)
      or (a.id is not null and job.aggregate_type = 'assignment' and job.aggregate_id = a.id)
      or (job.aggregate_type = 'payment_obligation' and job.aggregate_id in (
            select o.id from public.payment_obligations o where o.assignment_id = a.id))
      or (job.aggregate_type = 'payout' and job.aggregate_id in (
            select p.id from public.payouts p
            join public.payment_obligations o2 on o2.id = p.obligation_id
            where o2.assignment_id = a.id))
    ) then
      raise exception 'that job does not belong to this project' using errcode = '22023';
    end if;
    if job.published_at is not null then
      raise exception 'that event has already been delivered' using errcode = '22023';
    end if;

    detail_before := format('attempts %s%s', job.attempt_count, coalesce(' · last error: ' || job.last_error, ''));
    update public.outbox_events
       set attempt_count = 0,
           last_error = null
     where id = job.id;
    detail_after := 'awaiting delivery · attempts reset to 0';
    applied := true;
  end if;

  insert into public.platform_project_overrides(
    request_id, assignment_id, command_key, target_id, from_state, to_state, from_detail, to_detail,
    reason_code, note, evidence_reference, result, executed_by_account_id
  ) values (
    r.id, a.id, p_command_key, p_target_id, state_before, state_after, detail_before, detail_after,
    p_reason_code, note_text, evidence, case when applied then 'applied' else 'no_change' end, me
  ) returning id into override_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user',
          case when p_command_key = 'force_state' then 'PROJECT_STATE_FORCED' else 'PROJECT_DELIVERY_RETRIED' end,
          'request', r.id, p_reason_code, 'restricted',
          jsonb_build_object(
            'override_id', override_id,
            'command_key', p_command_key,
            'from_state', state_before,
            'to_state', state_after,
            'target_id', p_target_id,
            'note', note_text,
            'evidence_reference', evidence
          ));

  return override_id;
end $$;

revoke all on function public.run_project_override_command(uuid, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.run_project_override_command(uuid, text, text, uuid, text, text, text) to authenticated;

comment on function public.run_project_override_command(uuid, text, text, uuid, text, text, text) is
  'The only operator intervention on a project: force a request state transition, or retry one undelivered outbox event. Requires a second factor, a reason code, a note and a support reference, and appends to platform_project_overrides and the audit stream.';
