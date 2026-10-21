-- Admin search presence, redirects, sitemaps, feature flags and technical incidents.
--
-- ── FOUR RULES ─────────────────────────────────────────────────────────────────────────────────
-- 1. A CANONICAL PATH IS UNIQUE AND ONE ROUTE OWNS IT. Changing a live path appends a redirect from the old path
--    to the same entity's route, so equity and entity linkage survive the change.
-- 2. A REDIRECT MAY NOT LOOP OR CHAIN. Every hop is resolved inside `create_redirect_command` before the row is
--    written, and a chain is refused with the path it would have gone through.
-- 3. THE SITEMAP IS GENERATED, NOT STORED. This console recomputes the inputs the app's sitemap route reads; it
--    does not keep a second copy of the XML that could disagree with it.
-- 4. A FLAG CANNOT CHANGE AN OUTCOME. Flags gate exposure and rollout, never which write path a cohort takes —
--    `set_feature_flag_cohort_command` refuses a flag whose key is marked as affecting authoritative behaviour.

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
    ),
    'reconciliation_retry', jsonb_build_array(
      jsonb_build_object('code', 'amount_corrected', 'label', 'The internal record was corrected first'),
      jsonb_build_object('code', 'provider_corrected', 'label', 'The provider record was corrected first'),
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket asked for the re-check'),
      jsonb_build_object('code', 'provider_event_replayed', 'label', 'The provider replayed the event'),
      jsonb_build_object('code', 'false_alarm', 'label', 'The mismatch was a false alarm')
    ),
    'ledger_adjustment', jsonb_build_array(
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket established the correction'),
      jsonb_build_object('code', 'chargeback_loss', 'label', 'A chargeback we accepted'),
      jsonb_build_object('code', 'goodwill', 'label', 'A goodwill correction'),
      jsonb_build_object('code', 'fee_correction', 'label', 'A fee was applied incorrectly'),
      jsonb_build_object('code', 'legal_direction', 'label', 'Legal or regulatory direction'),
      jsonb_build_object('code', 'test_cleanup', 'label', 'Cleaning up a test obligation')
    ),
    'payout_hold', jsonb_build_array(
      jsonb_build_object('code', 'open_dispute', 'label', 'A dispute is open'),
      jsonb_build_object('code', 'refund_pending', 'label', 'A refund is in flight'),
      jsonb_build_object('code', 'destination_under_review', 'label', 'The destination account is under review'),
      jsonb_build_object('code', 'compliance_check', 'label', 'A compliance check is running'),
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket asked us to hold it'),
      jsonb_build_object('code', 'suspected_fraud', 'label', 'Suspected fraud')
    ),
    'payout_hold_release', jsonb_build_array(
      jsonb_build_object('code', 'check_complete', 'label', 'The check finished'),
      jsonb_build_object('code', 'dispute_resolved', 'label', 'The dispute was resolved'),
      jsonb_build_object('code', 'refund_settled', 'label', 'The refund settled'),
      jsonb_build_object('code', 'mistaken_hold', 'label', 'The hold was applied in error'),
      jsonb_build_object('code', 'legal_direction', 'label', 'Legal or regulatory direction')
    ),
    'money_case_decision', jsonb_build_array(
      jsonb_build_object('code', 'claim_upheld', 'label', 'The claim was upheld'),
      jsonb_build_object('code', 'claim_refused', 'label', 'The claim was refused on the evidence'),
      jsonb_build_object('code', 'evidence_insufficient', 'label', 'Not enough evidence to decide'),
      jsonb_build_object('code', 'provider_liability', 'label', 'The provider accepted liability'),
      jsonb_build_object('code', 'goodwill', 'label', 'A goodwill decision'),
      jsonb_build_object('code', 'duplicate_case', 'label', 'Duplicate of another case')
    ),
    'taxonomy_change', jsonb_build_array(
      jsonb_build_object('code', 'market_launch', 'label', 'A market is being launched'),
      jsonb_build_object('code', 'translation_fix', 'label', 'A translation or synonym was wrong'),
      jsonb_build_object('code', 'provider_feedback', 'label', 'Providers asked for this'),
      jsonb_build_object('code', 'duplicate_services', 'label', 'Two canonical entries meant one thing'),
      jsonb_build_object('code', 'legal_requirement', 'label', 'A legal or regulatory requirement'),
      jsonb_build_object('code', 'demand', 'label', 'Demand for a service that did not exist')
    ),
    'market_change', jsonb_build_array(
      jsonb_build_object('code', 'market_launch', 'label', 'Launching or re-launching a market'),
      jsonb_build_object('code', 'tax_rule_change', 'label', 'A tax rule changed'),
      jsonb_build_object('code', 'payment_route_change', 'label', 'A payment route changed'),
      jsonb_build_object('code', 'language_support', 'label', 'Language support changed'),
      jsonb_build_object('code', 'legal_requirement', 'label', 'A legal or regulatory requirement'),
      jsonb_build_object('code', 'market_pause', 'label', 'Pausing a market')
    ),
    'search_change', jsonb_build_array(
      jsonb_build_object('code', 'quality_gate', 'label', 'The page no longer meets the quality gate'),
      jsonb_build_object('code', 'insufficient_supply', 'label', 'Not enough providers for this page'),
      jsonb_build_object('code', 'duplicate_content', 'label', 'The page duplicates another one'),
      jsonb_build_object('code', 'canonical_fix', 'label', 'Fixing which URL is canonical'),
      jsonb_build_object('code', 'metadata_fix', 'label', 'Title, description or schema was wrong'),
      jsonb_build_object('code', 'entity_retired', 'label', 'The entity behind the page was retired'),
      jsonb_build_object('code', 'manual_request', 'label', 'Somebody asked for a recrawl')
    ),
    'release_change', jsonb_build_array(
      jsonb_build_object('code', 'staged_rollout', 'label', 'Staged rollout'),
      jsonb_build_object('code', 'beta_cohort', 'label', 'Beta cohort'),
      jsonb_build_object('code', 'incident_mitigation', 'label', 'Mitigating an incident'),
      jsonb_build_object('code', 'rollback', 'label', 'Rolling back'),
      jsonb_build_object('code', 'scheduled_maintenance', 'label', 'Scheduled maintenance'),
      jsonb_build_object('code', 'experiment_finished', 'label', 'The experiment finished')
    ),
    'incident_action', jsonb_build_array(
      jsonb_build_object('code', 'triaged', 'label', 'Triaged'),
      jsonb_build_object('code', 'monitoring', 'label', 'Monitoring'),
      jsonb_build_object('code', 'mitigated', 'label', 'Mitigated'),
      jsonb_build_object('code', 'resolved', 'label', 'Resolved'),
      jsonb_build_object('code', 'false_alarm', 'label', 'False alarm'),
      jsonb_build_object('code', 'third_party', 'label', 'Waiting on a third party'),
      jsonb_build_object('code', 'postmortem_due', 'label', 'A postmortem is due')
    )
  );
$$;

-- ── Feature flags ──────────────────────────────────────────────────────────────────────────────

/**
 * A flag, its rollout, and an append-only history of every change.
 *
 * ⚠️ `guards_authoritative_data` IS THE RELEASE-SAFETY RULE MADE CHECKABLE. A flag that would change what a cohort's
 * writes MEAN cannot be given a partial rollout: the command refuses it, so two cohorts cannot end up with different
 * truth about the same record.
 */
create table public.platform_feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null unique check (flag_key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  status text not null default 'paused' check (status in ('active','paused','rolled_back','retired')),
  cohort_percent smallint not null default 0 check (cohort_percent between 0 and 100),
  environment text not null default 'production' check (environment in ('development','preview','production')),
  -- True when this flag changes what a write means rather than how much of it is seen.
  guards_authoritative_data boolean not null default true,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_feature_flag_events (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.platform_feature_flags(id) on delete cascade,
  action text not null check (action in ('created','cohort_changed','paused','resumed','rolled_back','retired')),
  from_cohort_percent smallint,
  to_cohort_percent smallint,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  actor_account_id uuid references public.accounts(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index platform_feature_flag_events_idx on public.platform_feature_flag_events(flag_id, occurred_at desc);

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_events enable row level security;
create policy platform_feature_flags_operator_read on public.platform_feature_flags
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.operations.feature_flags')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
create policy platform_feature_flag_events_operator_read on public.platform_feature_flag_events
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.operations.feature_flags')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_feature_flags, public.platform_feature_flag_events from anon;
revoke insert, update, delete on public.platform_feature_flags, public.platform_feature_flag_events from authenticated;
grant select on public.platform_feature_flags, public.platform_feature_flag_events to authenticated;

comment on table public.platform_feature_flags is
  'Progressive delivery flags with a cohort percentage and an append-only change history. A flag marked as guarding authoritative data cannot be partially rolled out.';

-- ── Technical incidents ────────────────────────────────────────────────────────────────────────

/**
 * An operational incident: an outage, a degradation, a third-party disruption.
 *
 * ⚠️ THIS IS NOT THE DERIVED INCIDENT FEED. The overview's feed is computed from exception rows and has no identity;
 * this table is a thing people declare, own, and close, with a lead and a runbook. Linking the two is deliberate:
 * a case here can point at a trust or money case, and the feed's acknowledgements stay where they are.
 */
create table public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 4 and 200),
  area text not null check (area in ('platform','payments','search','trust','delivery','third_party','data')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  state text not null default 'open' check (state in ('open','investigating','mitigating','monitoring','resolved','closed')),
  summary text not null check (char_length(btrim(summary)) between 10 and 4000),
  runbook_reference text,
  third_party text,
  lead_account_id uuid references public.accounts(id) on delete set null,
  trust_case_id uuid references public.platform_trust_cases(id) on delete set null,
  money_case_id uuid,
  acknowledged_at timestamptz,
  acknowledged_by_account_id uuid references public.accounts(id) on delete set null,
  resolution text,
  closed_at timestamptz,
  closed_by_account_id uuid references public.accounts(id) on delete set null,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_incidents_closure_chk check (
    state not in ('resolved','closed') or (resolution is not null and closed_at is not null)
  )
);

create index platform_incidents_state_idx on public.platform_incidents(state, severity, created_at desc);

create table public.platform_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.platform_incidents(id) on delete cascade,
  action text not null check (action in ('created','acknowledged','lead_assigned','severity_changed','state_changed','case_linked','closed')),
  from_value text,
  to_value text,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 4000),
  actor_account_id uuid references public.accounts(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index platform_incident_events_idx on public.platform_incident_events(incident_id, occurred_at desc);

alter table public.platform_incidents enable row level security;
alter table public.platform_incident_events enable row level security;
create policy platform_incidents_operator_read on public.platform_incidents
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
create policy platform_incident_events_operator_read on public.platform_incident_events
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_incidents, public.platform_incident_events from anon;
revoke insert, update, delete on public.platform_incidents, public.platform_incident_events from authenticated;
grant select on public.platform_incidents, public.platform_incident_events to authenticated;

alter table public.route_redirects add column if not exists disabled_at timestamptz;
alter table public.route_redirects add column if not exists created_by_account_id uuid references public.accounts(id) on delete set null;
alter table public.route_redirects add column if not exists reason_code text;

-- ── Search presence reads ──────────────────────────────────────────────────────────────────────

/**
 * The SEO health dashboard.
 *
 * ⚠️ ORGANIC CONVERSION IS NOT COMPUTED, BECAUSE THE PLATFORM HAS NO ANALYTICS STORE. There is no table of visits,
 * referrers or sessions in this schema; the answer carries `analytics_available: false` with that reason rather
 * than a funnel assembled from numbers nobody collected.
 */
create or replace function public.admin_search_presence_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.seo.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select jsonb_build_object(
    'allowed', true,
    'analytics_available', false,
    'analytics_note', 'The platform stores no visit, referrer or session data, so there is no organic funnel to report. Everything below comes from the route table and its evaluations.',
    'counts', jsonb_build_object(
      'routes', (select count(*) from public.public_routes),
      'indexable', (select count(*) from public.public_routes where indexability = 'indexable'),
      'noindex', (select count(*) from public.public_routes where indexability <> 'indexable'),
      'with_supply_gap', (select count(*) from public.public_routes where indexability = 'insufficient_supply'),
      'with_content_gap', (select count(*) from public.public_routes where indexability = 'insufficient_content'),
      'canonical_missing', (select count(*) from public.public_routes where metadata -> 'canonical_url' is null),
      'canonical_pointer', (select count(*) from public.public_routes where canonical_route_id is not null),
      'schema_missing', (select count(*) from public.public_routes where indexability = 'indexable' and metadata -> 'structured_data' is null),
      'redirects', (select count(*) from public.route_redirects where disabled_at is null),
      'stale_evaluations', (select count(*) from public.public_routes r where not exists (
        select 1 from public.route_indexability_evaluations e
        where e.route_id = r.id and e.evaluated_at > now() - interval '30 days'))
    ),
    'markets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'market_id', m.id, 'code', m.code, 'name', coalesce(c.display_name, m.code),
               'routes', (select count(*) from public.public_routes r where r.market_id = m.id),
               'indexable', (select count(*) from public.public_routes r where r.market_id = m.id and r.indexability = 'indexable'),
               'last_evaluated_at', (select max(e.evaluated_at) from public.route_indexability_evaluations e join public.public_routes r on r.id = e.route_id where r.market_id = m.id)
             ) order by m.code)
      from public.markets m left join public.public_market_catalog c on c.market_id = m.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.admin_search_presence_command() from public, anon;
grant execute on function public.admin_search_presence_command() to authenticated;

/** One route in depth: canonical state, evaluations, redirects pointing at it, and its position in the tree. */
create or replace function public.admin_search_page_command(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  r public.public_routes%rowtype;
  latest public.route_indexability_evaluations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.seo.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into r from public.public_routes where id = p_route_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;
  select * into latest from public.route_indexability_evaluations where route_id = r.id order by evaluated_at desc limit 1;

  return jsonb_build_object(
    'allowed', true,
    'found', true,
    'route', jsonb_build_object(
      'id', r.id, 'canonical_path', r.canonical_path, 'slug', r.slug, 'entity_kind', r.entity_kind::text,
      'entity_id', r.entity_id, 'market_id', r.market_id, 'location_id', r.location_id,
      'indexability', r.indexability::text, 'quality_score', r.quality_score,
      'canonical_route_id', r.canonical_route_id,
      'canonical_of', (select c.canonical_path from public.public_routes c where c.id = r.canonical_route_id),
      'metadata', r.metadata, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'depth', array_length(string_to_array(btrim(both '/' from r.canonical_path), '/'), 1),
      'siblings', (select count(*) from public.public_routes s where s.market_id = r.market_id and s.entity_kind = r.entity_kind and s.id <> r.id)
    ),
    'latest_evaluation', case when latest.id is null then null else jsonb_build_object(
      'evaluated_state', latest.evaluated_state::text, 'supply_count', latest.supply_count,
      'quality_score', latest.quality_score, 'reasons', latest.reasons, 'evaluated_at', latest.evaluated_at
    ) end,
    'evaluations', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'state', e.evaluated_state::text, 'supply_count', e.supply_count,
                                          'quality_score', e.quality_score, 'reasons', e.reasons, 'evaluated_at', e.evaluated_at) order by e.evaluated_at desc)
      from (select * from public.route_indexability_evaluations where route_id = r.id order by evaluated_at desc limit 12) e
    ), '[]'::jsonb),
    'redirects', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'from_path', d.from_path, 'http_status', d.http_status,
                                          'disabled_at', d.disabled_at, 'reason_code', d.reason_code) order by d.from_path)
      from public.route_redirects d where d.to_route_id = r.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', doc.id, 'title', doc.title, 'indexability', doc.indexability::text,
                                          'published_at', doc.published_at, 'updated_at', doc.updated_at) order by doc.updated_at desc)
      from public.public_discovery_documents doc where doc.route_id = r.id
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_search_page_command(uuid) from public, anon;
grant execute on function public.admin_search_page_command(uuid) to authenticated;

/**
 * The redirect registry, with its chain analysis.
 *
 * ⚠️ A CHAIN IS DETECTED HERE AS WELL AS REFUSED ON WRITE. A row becomes a chain when somebody later redirects its
 * destination, so the read walks every hop rather than trusting the state at the moment it was created.
 */
create or replace function public.admin_redirects_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.seo.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'from_path'), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'id', d.id,
      'from_path', d.from_path,
      'http_status', d.http_status,
      'to_route_id', d.to_route_id,
      'to_path', r.canonical_path,
      'target_entity_id', r.entity_id,
      'target_entity_kind', r.entity_kind::text,
      'disabled_at', d.disabled_at,
      'reason_code', d.reason_code,
      'chains_into', (select d2.from_path from public.route_redirects d2 where d2.disabled_at is null and d2.from_path = r.canonical_path limit 1)
    ) as entry
    from public.route_redirects d
    join public.public_routes r on r.id = d.to_route_id
  ) x;

  return jsonb_build_object(
    'allowed', true,
    'redirects', result,
    'counts', jsonb_build_object(
      'active', (select count(*) from public.route_redirects where disabled_at is null),
      'disabled', (select count(*) from public.route_redirects where disabled_at is not null),
      'chained', (select count(*) from public.route_redirects d join public.public_routes r on r.id = d.to_route_id
                   where d.disabled_at is null and exists (select 1 from public.route_redirects d2 where d2.disabled_at is null and d2.from_path = r.canonical_path))
    ),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'canonical_path', r.canonical_path, 'indexability', r.indexability::text) order by r.canonical_path)
      from public.public_routes r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_redirects_command() from public, anon;
grant execute on function public.admin_redirects_command() to authenticated;

/** Sitemap inputs per market: what the application's sitemap route would emit, and how fresh it is. */
create or replace function public.admin_sitemaps_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.seo.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'code'), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'market_id', m.id,
      'code', m.code,
      'name', coalesce(c.display_name, m.code),
      'indexable_urls', (select count(*) from public.public_routes r where r.market_id = m.id and r.indexability = 'indexable'),
      'excluded_urls', (select count(*) from public.public_routes r where r.market_id = m.id and r.indexability <> 'indexable'),
      'last_route_change_at', (select max(r.updated_at) from public.public_routes r where r.market_id = m.id),
      'last_evaluation_at', (select max(e.evaluated_at) from public.route_indexability_evaluations e join public.public_routes r on r.id = e.route_id where r.market_id = m.id),
      'documents_without_schema', (select count(*) from public.public_discovery_documents doc join public.public_routes r on r.id = doc.route_id
                                   where r.market_id = m.id and r.indexability = 'indexable' and r.metadata -> 'structured_data' is null)
    ) as entry
    from public.markets m left join public.public_market_catalog c on c.market_id = m.id
  ) x;

  return jsonb_build_object(
    'allowed', true,
    'markets', result,
    'sitemap_route', '/sitemap.xml',
    'generated_by', 'The application generates the XML on request from these rows; this console deliberately stores no second copy of it.',
    'schema_source', 'Structured data is read from each route''s metadata under `structured_data`.'
  );
end $$;

revoke all on function public.admin_sitemaps_command() from public, anon;
grant execute on function public.admin_sitemaps_command() to authenticated;
