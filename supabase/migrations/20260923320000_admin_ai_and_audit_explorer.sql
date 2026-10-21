-- AI operations and the audit explorer.
--
-- ── FOUR RULES ─────────────────────────────────────────────────────────────────────────────────
-- 1. AI PROPOSES; A PERSON DECIDES. AI output lands in `platform_ai_action_proposals` and can only be acted on by
--    `decide_ai_proposal_command`, which records which human accepted or refused it. Nothing in this migration gives
--    a model a path to a project, an account or money.
-- 2. TRACES ARE PRIVACY-SAFE BY CONSTRUCTION. `platform_ai_traces` has no column for a prompt or a completion —
--    only a hash, a length and a redacted summary — so a trace cannot leak what a customer typed, and "we did not
--    store the prompt" is a property of the table rather than a promise.
-- 3. READING THE AUDIT LOG IS ITSELF AN AUDITED ACT. Every search, view and export writes a row to
--    `platform_audit_access_log`, including the query and the reason code, before it returns anything.
-- 4. THE AUDIT STREAM IS APPEND-ONLY. There is no insert, update or delete grant on `audit_events` for an
--    authenticated caller, and no function here writes to it.

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
    ),
    'ai_change', jsonb_build_array(
      jsonb_build_object('code', 'cost_control', 'label', 'Controlling cost'),
      jsonb_build_object('code', 'quality_regression', 'label', 'Output quality regressed'),
      jsonb_build_object('code', 'provider_outage', 'label', 'A provider is degraded'),
      jsonb_build_object('code', 'policy_update', 'label', 'The policy wording changed'),
      jsonb_build_object('code', 'privacy_review', 'label', 'After a privacy review'),
      jsonb_build_object('code', 'experiment_finished', 'label', 'The experiment finished')
    ),
    'audit_access', jsonb_build_array(
      jsonb_build_object('code', 'support_ticket', 'label', 'A support ticket needs the history'),
      jsonb_build_object('code', 'incident_review', 'label', 'Reviewing an incident'),
      jsonb_build_object('code', 'legal_request', 'label', 'Legal or regulatory request'),
      jsonb_build_object('code', 'finance_review', 'label', 'A finance review'),
      jsonb_build_object('code', 'trust_review', 'label', 'A trust review'),
      jsonb_build_object('code', 'compliance_sample', 'label', 'A compliance sample')
    )
  );
$$;

-- ── AI routes, policies, traces and proposals ──────────────────────────────────────────────────

/** One provider route: which model, at what priority, with what quota and price. */
create table public.platform_ai_routes (
  id uuid primary key default gen_random_uuid(),
  route_key text not null unique check (route_key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  provider text not null,
  model text not null,
  purpose text not null check (char_length(btrim(purpose)) between 4 and 200),
  environment text not null default 'production' check (environment in ('development','preview','production')),
  status text not null default 'active' check (status in ('active','paused','retired')),
  -- Lower runs first; a paused route is skipped and the next priority is tried, which is the fallback chain.
  priority smallint not null default 10 check (priority between 1 and 100),
  monthly_quota_units integer check (monthly_quota_units is null or monthly_quota_units > 0),
  cost_per_1k_minor bigint check (cost_per_1k_minor is null or cost_per_1k_minor >= 0),
  paused_reason_code text,
  paused_note text,
  updated_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/** A policy version: the prompt shape and the constraints a run must satisfy. */
create table public.platform_ai_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  version integer not null check (version between 1 and 500),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  route_id uuid references public.platform_ai_routes(id) on delete set null,
  purpose text not null,
  -- The constraints a run is checked against: allowed purposes, whether human approval is required for a proposal,
  -- the model families permitted, and the maximum cost per call.
  constraints jsonb not null default '{}'::jsonb,
  notes text,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by_account_id uuid references public.accounts(id) on delete set null,
  unique (policy_key, version),
  constraint platform_ai_policy_active_chk check (status <> 'active' or activated_at is not null)
);

create unique index platform_ai_policy_one_active_idx on public.platform_ai_policy_versions(policy_key) where status = 'active';

/**
 * A trace of one AI run.
 *
 * ⚠️ THERE IS NO COLUMN FOR THE PROMPT OR THE COMPLETION, AND THAT IS THE POINT. A hash, a length and a redacted
 * summary are what an operator needs to see cost and quality; storing the text would put whatever a customer typed
 * into a table that exists to be read by staff.
 */
create table public.platform_ai_traces (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.platform_ai_routes(id) on delete set null,
  policy_version_id uuid references public.platform_ai_policy_versions(id) on delete set null,
  purpose text not null,
  model text,
  prompt_hash text not null,
  prompt_chars integer not null check (prompt_chars >= 0),
  redacted_summary text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  units integer check (units is null or units >= 0),
  outcome text not null check (outcome in ('accepted','rejected','error','dry_run')),
  actor_account_id uuid references public.accounts(id) on delete set null,
  subject_resource_type text,
  subject_resource_id uuid,
  created_at timestamptz not null default now()
);

create index platform_ai_traces_route_idx on public.platform_ai_traces(route_id, created_at desc);

/** What the model suggested. It is a suggestion until a person accepts it. */
create table public.platform_ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references public.platform_ai_traces(id) on delete set null,
  policy_version_id uuid references public.platform_ai_policy_versions(id) on delete set null,
  action_kind text not null,
  target_resource_type text not null,
  target_resource_id uuid,
  proposed_payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','expired')),
  decided_by_account_id uuid references public.accounts(id) on delete set null,
  decided_at timestamptz,
  decision_reason_code text,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint platform_ai_proposal_decision_chk check (
    status = 'proposed' or (decided_by_account_id is not null and decided_at is not null and decision_reason_code is not null)
  )
);

create index platform_ai_proposals_status_idx on public.platform_ai_action_proposals(status, created_at desc);

-- ── Audit access log ───────────────────────────────────────────────────────────────────────────

/**
 * Every read of the audit explorer, and the export that follows one.
 *
 * ⚠️ THE QUERY IS STORED, NOT THE RESULTS. What an investigator looked for is the useful part of "who read the audit
 * log"; storing the rows they saw would duplicate the audit stream into a second, less protected table.
 */
create table public.platform_audit_access_log (
  id uuid primary key default gen_random_uuid(),
  access_kind text not null check (access_kind in ('search','view','lineage','export')),
  query jsonb not null default '{}'::jsonb,
  resource_type text,
  resource_id uuid,
  rows_returned integer not null default 0 check (rows_returned >= 0),
  reason_code text not null,
  actor_account_id uuid not null references public.accounts(id) on delete restrict,
  occurred_at timestamptz not null default now()
);

create index platform_audit_access_log_actor_idx on public.platform_audit_access_log(actor_account_id, occurred_at desc);

alter table public.platform_ai_routes enable row level security;
alter table public.platform_ai_policy_versions enable row level security;
alter table public.platform_ai_traces enable row level security;
alter table public.platform_ai_action_proposals enable row level security;
alter table public.platform_audit_access_log enable row level security;

create policy platform_ai_routes_operator_read on public.platform_ai_routes
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.operations.feature_flags')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
create policy platform_ai_policy_versions_operator_read on public.platform_ai_policy_versions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
create policy platform_ai_traces_operator_read on public.platform_ai_traces
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
create policy platform_ai_action_proposals_operator_read on public.platform_ai_action_proposals
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.projects.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  );
create policy platform_audit_access_log_audit_read on public.platform_audit_access_log
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.admin.view_audit')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  );

revoke all on public.platform_ai_routes, public.platform_ai_policy_versions, public.platform_ai_traces,
  public.platform_ai_action_proposals, public.platform_audit_access_log from anon;
revoke insert, update, delete on public.platform_ai_routes, public.platform_ai_policy_versions, public.platform_ai_traces,
  public.platform_ai_action_proposals, public.platform_audit_access_log from authenticated;
grant select on public.platform_ai_routes, public.platform_ai_policy_versions, public.platform_ai_traces,
  public.platform_ai_action_proposals, public.platform_audit_access_log to authenticated;

comment on table public.platform_ai_action_proposals is
  'What a model suggested. A proposal has no effect until a human accepts it, and the acceptance records who and why — the rule that AI cannot move authoritative state on its own.';
