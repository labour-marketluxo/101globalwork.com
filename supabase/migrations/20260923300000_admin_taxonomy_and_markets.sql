-- Admin service taxonomy, the intent/template graph, and market configuration.
--
-- ── FIVE RULES THIS MIGRATION EXISTS TO ENFORCE ────────────────────────────────────────────────
--
-- 1. THE ID IS THE IDENTITY. `taxonomy_entities.id` is generated once and never written again by any command
--    here. Editing a service changes its NAMES, its SYNONYMS and its credential rules — never its key, and never
--    by looking a service up through a display name. Everything else in the platform points at the id.
--
-- 2. A MERGE IS A MIGRATION, NOT A RENAME. Merging two services moves the rows that referenced the losing one
--    onto the winner (`provider_services`, `requests`, `public_routes`, credential rules), records the counts,
--    deprecates the loser and links it to its successor. The loser keeps its id, because ids are history.
--
-- 3. TEMPLATES ARE VERSIONED AND ONLY ONE VERSION IS LIVE. A published version is immutable; adapting a template
--    creates the next version, which is what makes "retrieve and adapt before generating" a rule the schema can
--    hold rather than a habit.
--
-- 4. MARKET CONFIGURATION IS DATA, NOT SCHEMA. `market_settings` carries the whole precedence chain
--    (global -> market -> region -> organisation -> project) as rows, so a market can have address rules, tax
--    adapters and payment routes without a migration per market.
--
-- 5. THE INTENT MAP IS A MATCH, NOT A MODEL. Testing a phrase matches `entity_names` and `entity_synonyms` and
--    returns the templates recorded for the resulting pair. There is no learned intent model here, and the
--    command's own answer says which of those two it was.

-- ── The reason vocabulary, extended ────────────────────────────────────────────────────────────

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
    )
  );
$$;

-- ── Mandatory credential rules per service ─────────────────────────────────────────────────────

/**
 * Which credentials a service requires, as rows rather than a column on the service.
 *
 * ⚠️ A RULE CAN BE SCOPED TO A JURISDICTION. What a plumber must hold differs between markets, so a rule with no
 * jurisdiction is universal and a rule with one applies where that jurisdiction is the provider's market. The
 * matching read applies the same rule, and the service page says which rules would apply to whom.
 */
create table public.service_credential_requirements (
  id uuid primary key default gen_random_uuid(),
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  credential_type text not null check (credential_type in ('licence','certification','insurance','trade_registration','other')),
  jurisdiction_code text check (jurisdiction_code is null or jurisdiction_code ~ '^[A-Z]{2}$'),
  is_mandatory boolean not null default true,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_entity_id, credential_type, jurisdiction_code)
);

create index service_credential_requirements_service_idx on public.service_credential_requirements(service_entity_id);

alter table public.service_credential_requirements enable row level security;
create policy service_credential_requirements_operator_read on public.service_credential_requirements
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.service_credential_requirements from anon;
revoke insert, update, delete on public.service_credential_requirements from authenticated;
grant select on public.service_credential_requirements to authenticated;

comment on table public.service_credential_requirements is
  'Credentials a canonical service requires, optionally scoped to a jurisdiction. Rows, not a column, because the requirement differs by market and because a rule change is a change to evidence.';

-- ── Templates, versioned ───────────────────────────────────────────────────────────────────────

/**
 * A validated request template for one problem/outcome pair.
 *
 * ⚠️ THE TEMPLATE IS THE PAIRING; THE VERSION IS THE CONTENT. Retiring the wording of a template must not
 * destroy the record that providers and customers were once asked for exactly that — so a new version is added
 * and the old one stays, deprecated.
 */
create table public.discovery_templates (
  id uuid primary key default gen_random_uuid(),
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete restrict,
  problem_entity_id uuid references public.taxonomy_entities(id) on delete set null,
  outcome_entity_id uuid references public.taxonomy_entities(id) on delete set null,
  status text not null default 'active' check (status in ('active','deprecated')),
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One template per intent pair, so "which template does this problem lead to" has one answer.
  unique (service_entity_id, problem_entity_id, outcome_entity_id)
);

create index discovery_templates_service_idx on public.discovery_templates(service_entity_id, status);

create table public.discovery_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.discovery_templates(id) on delete cascade,
  version integer not null check (version between 1 and 500),
  status text not null default 'draft' check (status in ('draft','published','deprecated')),
  -- The questions a request asks for this intent: field key, label, kind, whether it is required.
  fields jsonb not null default '[]'::jsonb,
  notes text check (notes is null or char_length(btrim(notes)) between 1 and 2000),
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by_account_id uuid references public.accounts(id) on delete set null,
  unique (template_id, version),
  constraint discovery_template_publish_chk check (status <> 'published' or published_at is not null)
);

create index discovery_template_versions_idx on public.discovery_template_versions(template_id, version desc);
create unique index discovery_template_one_published_idx
  on public.discovery_template_versions(template_id) where status = 'published';

alter table public.discovery_templates enable row level security;
alter table public.discovery_template_versions enable row level security;
create policy discovery_templates_operator_read on public.discovery_templates
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  );
create policy discovery_template_versions_operator_read on public.discovery_template_versions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  );
revoke all on public.discovery_templates, public.discovery_template_versions from anon;
revoke insert, update, delete on public.discovery_templates, public.discovery_template_versions from authenticated;
grant select on public.discovery_templates, public.discovery_template_versions to authenticated;

comment on table public.discovery_template_versions is
  'Versioned request templates. A published version is immutable; adapting one creates the next version, which is what makes "retrieve and adapt before generating" a rule the schema holds.';

-- ── Market settings, with the whole precedence chain ───────────────────────────────────────────

/**
 * Market-specific behaviour as configuration rows.
 *
 * ⚠️ THE SCOPE COLUMN IS THE PRECEDENCE CHAIN. One table carries global, market, region, organisation and project
 * settings; `market_setting_resolution_command` walks that chain in order and reports which row won and which
 * were shadowed. Adding a market does not add a column or a migration — which is the brief's "without modifying
 * core application schemas" taken literally.
 */
create table public.market_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','market','region','organisation','project')),
  scope_id uuid,
  setting_key text not null check (setting_key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  value jsonb not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  updated_by_account_id uuid references public.accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and scope_id is null) or (scope <> 'global' and scope_id is not null))
);

-- One value per key per scope: a second row is a correction, and the unique index makes that explicit.
create unique index market_settings_scope_key_uq on public.market_settings(scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), setting_key);
create index market_settings_key_idx on public.market_settings(setting_key);

alter table public.market_settings enable row level security;
create policy market_settings_operator_read on public.market_settings
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.markets.read')
    or app_private.current_account_has_platform_capability('platform.markets.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.market_settings from anon;
revoke insert, update, delete on public.market_settings from authenticated;
grant select on public.market_settings to authenticated;

comment on table public.market_settings is
  'Configuration by scope (global, market, region, organisation, project) resolved in that order. Market behaviour is data here, not schema.';

-- ── The service registry read ──────────────────────────────────────────────────────────────────

/**
 * Canonical services with their names, synonyms and credential rules.
 *
 * ⚠️ THE ROW IS KEYED BY THE CANONICAL ID, AND THE PAGE MUST NEVER LOOK ONE UP BY NAME. Both are returned, and
 * the id is what every control carries — a display name is a label somebody will change, and a slug is worse.
 */
create or replace function public.admin_service_taxonomy_command(
  p_search text default null,
  p_status text default null,
  p_limit integer default 200
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
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  with services as (
    select
      e.id,
      e.canonical_key,
      e.risk_level,
      e.is_active,
      e.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object('language_code', n.language_code, 'display_name', n.display_name, 'is_primary', n.is_primary) order by n.is_primary desc, n.language_code)
        from public.entity_names n where n.entity_id = e.id
      ), '[]'::jsonb) as names,
      coalesce((
        select jsonb_agg(jsonb_build_object('language_code', s.language_code, 'phrase', s.phrase) order by s.language_code, s.phrase)
        from public.entity_synonyms s where s.entity_id = e.id
      ), '[]'::jsonb) as synonyms,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', r.id, 'credential_type', r.credential_type, 'jurisdiction_code', r.jurisdiction_code,
                 'is_mandatory', r.is_mandatory, 'note', r.note
               ) order by r.credential_type)
        from public.service_credential_requirements r where r.service_entity_id = e.id
      ), '[]'::jsonb) as credential_rules,
      (select count(*) from public.provider_services ps where ps.service_entity_id = e.id and ps.is_active) as provider_count,
      (select count(*) from public.requests rq where rq.service_entity_id = e.id) as request_count,
      (select count(*) from public.discovery_templates t where t.service_entity_id = e.id and t.status = 'active') as template_count,
      (select count(*) from public.taxonomy_links l where l.from_entity_id = e.id and l.relation_type = 'merged_into') as merged_into_count
    from public.taxonomy_entities e
    where e.kind = 'service'
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'canonical_key', s.canonical_key,
      'risk_level', s.risk_level,
      'is_active', s.is_active,
      'created_at', s.created_at,
      'names', s.names,
      'synonyms', s.synonyms,
      'credential_rules', s.credential_rules,
      'provider_count', s.provider_count,
      'request_count', s.request_count,
      'template_count', s.template_count,
      'merged', s.merged_into_count > 0
    ) order by s.canonical_key), '[]'::jsonb),
    jsonb_build_object(
      'total', (select count(*) from services),
      'active', (select count(*) from services where is_active),
      'deprecated', (select count(*) from services where not is_active),
      'with_credential_rules', (select count(*) from services where jsonb_array_length(credential_rules) > 0),
      'without_primary_name', (select count(*) from services where jsonb_array_length(names) = 0)
    )
    into result, summary
  from services s
  where (p_status is null or p_status = '' or p_status = 'any'
         or (p_status = 'active' and s.is_active)
         or (p_status = 'deprecated' and not s.is_active))
    and (
      needle = ''
      or lower(s.canonical_key) like '%' || needle || '%'
      or exists (select 1 from jsonb_array_elements(s.names) n where lower(n ->> 'display_name') like '%' || needle || '%')
      or exists (select 1 from jsonb_array_elements(s.synonyms) y where lower(y ->> 'phrase') like '%' || needle || '%')
    )
  limit greatest(1, least(coalesce(p_limit, 200), 500));

  return jsonb_build_object('allowed', true, 'services', result, 'counts', summary, 'search', p_search, 'status', p_status);
end $$;

revoke all on function public.admin_service_taxonomy_command(text, text, integer) from public, anon;
grant execute on function public.admin_service_taxonomy_command(text, text, integer) to authenticated;

-- ── The discovery graph and templates ──────────────────────────────────────────────────────────

/**
 * Problems, outcomes and the templates connecting them to services.
 *
 * ⚠️ THE PAIRS COME FROM THE TEMPLATES, NOT FROM A SEPARATE GRAPH TABLE. What the platform can actually promise
 * is "for this problem and outcome there is a template, and here is its published version" — inventing an
 * additional edge list would be a second place for the same relationship to live.
 */
create or replace function public.admin_discovery_graph_command(p_service_id uuid default null)
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
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.seo.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'service_name', entry ->> 'problem_name' nulls first), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'template_id', t.id,
      'status', t.status,
      'created_at', t.created_at,
      'service_id', t.service_entity_id,
      'service_name', (select n.display_name from public.entity_names n where n.entity_id = t.service_entity_id order by n.is_primary desc limit 1),
      'service_key', (select e.canonical_key from public.taxonomy_entities e where e.id = t.service_entity_id),
      'problem_id', t.problem_entity_id,
      'problem_name', (select n.display_name from public.entity_names n where n.entity_id = t.problem_entity_id order by n.is_primary desc limit 1),
      'outcome_id', t.outcome_entity_id,
      'outcome_name', (select n.display_name from public.entity_names n where n.entity_id = t.outcome_entity_id order by n.is_primary desc limit 1),
      'published_version', (
        select jsonb_build_object('id', v.id, 'version', v.version, 'published_at', v.published_at, 'fields', v.fields, 'notes', v.notes)
        from public.discovery_template_versions v
        where v.template_id = t.id and v.status = 'published'
        limit 1
      ),
      'versions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.id, 'version', v.version, 'status', v.status, 'fields', v.fields, 'notes', v.notes,
                 'created_at', v.created_at, 'published_at', v.published_at
               ) order by v.version desc)
        from public.discovery_template_versions v where v.template_id = t.id
      ), '[]'::jsonb)
    ) as entry
    from public.discovery_templates t
    where p_service_id is null or t.service_entity_id = p_service_id
  ) g;

  return jsonb_build_object(
    'allowed', true,
    'templates', result,
    'counts', jsonb_build_object(
      'templates', (select count(*) from public.discovery_templates),
      'active', (select count(*) from public.discovery_templates where status = 'active'),
      'without_published_version', (select count(*) from public.discovery_templates t where not exists (
        select 1 from public.discovery_template_versions v where v.template_id = t.id and v.status = 'published')),
      'draft_versions', (select count(*) from public.discovery_template_versions where status = 'draft')
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'name', coalesce((select n.display_name from public.entity_names n where n.entity_id = e.id order by n.is_primary desc limit 1), e.canonical_key),
               'canonical_key', e.canonical_key,
               'is_active', e.is_active
             ) order by e.canonical_key)
      from public.taxonomy_entities e where e.kind = 'service' and e.is_active
    ), '[]'::jsonb),
    'intents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'kind', e.kind::text,
               'name', coalesce((select n.display_name from public.entity_names n where n.entity_id = e.id order by n.is_primary desc limit 1), e.canonical_key)
             ) order by e.kind, e.canonical_key)
      from public.taxonomy_entities e where e.kind in ('problem','outcome') and e.is_active
    ), '[]'::jsonb),
    'is_learned_model', false
  );
end $$;

revoke all on function public.admin_discovery_graph_command(uuid) from public, anon;
grant execute on function public.admin_discovery_graph_command(uuid) to authenticated;

-- ── Markets and the precedence chain ───────────────────────────────────────────────────────────

/**
 * Markets with what they carry: regions, languages, currency, and the settings rows that make them behave
 * differently from every other market.
 */
create or replace function public.admin_markets_command()
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
    app_private.current_account_has_platform_capability('platform.markets.read')
    or app_private.current_account_has_platform_capability('platform.markets.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'code'), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'id', m.id,
      'code', m.code,
      'display_name', coalesce((select c.display_name from public.public_market_catalog c where c.market_id = m.id), m.code),
      'default_language_code', m.default_language_code,
      'default_currency_code', m.default_currency_code,
      'is_active', m.is_active,
      'updated_at', m.updated_at,
      'regions', coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'name', coalesce((select c.display_name from public.public_location_catalog c where c.location_id = l.id), l.canonical_code), 'canonical_code', l.canonical_code, 'parent_id', l.parent_id, 'is_active', l.is_active) order by l.canonical_code)
        from public.locations l where l.market_id = m.id
      ), '[]'::jsonb),
      'settings', coalesce((
        select jsonb_agg(jsonb_build_object('key', s.setting_key, 'value', s.value, 'scope', s.scope, 'note', s.note, 'updated_at', s.updated_at) order by s.setting_key)
        from public.market_settings s where s.scope = 'market' and s.scope_id = m.id
      ), '[]'::jsonb),
      'active_providers', (select count(*) from public.providers p where p.primary_market_id = m.id and p.status = 'active'),
      'requests', (select count(*) from public.requests r where r.market_id = m.id)
    ) as entry
    from public.markets m
  ) x;

  return jsonb_build_object(
    'allowed', true,
    'markets', result,
    'counts', jsonb_build_object(
      'markets', (select count(*) from public.markets),
      'active', (select count(*) from public.markets where is_active),
      'settings_rows', (select count(*) from public.market_settings),
      'global_settings', (select count(*) from public.market_settings where scope = 'global')
    ),
    'precedence', jsonb_build_array('global','market','region','organisation','project')
  );
end $$;

revoke all on function public.admin_markets_command() from public, anon;
grant execute on function public.admin_markets_command() to authenticated;

/**
 * What a setting resolves to for one context, and what it shadowed on the way.
 *
 * ⚠️ THE CHAIN IS WALKED IN ORDER AND EVERY STEP IS REPORTED, INCLUDING THE LOSERS. "Preview inheritance" is only
 * useful if it shows that a market value exists and was overridden by an organisation one — otherwise an operator
 * editing the market value wonders why nothing changes.
 *
 * ⚠️ THERE IS NO PROJECT-LEVEL STORE YET, AND THE ANSWER SAYS SO. The chain stops at the organisation because the
 * platform has no per-project configuration table; inventing one here would be a place for settings to hide.
 */
create or replace function public.market_setting_resolution_command(
  p_setting_key text,
  p_market_id uuid default null,
  p_region_id uuid default null,
  p_organisation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  chain jsonb := '[]'::jsonb;
  step jsonb;
  winner jsonb := null;
  organisation_policies jsonb := null;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.markets.read')
    or app_private.current_account_has_platform_capability('platform.markets.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_setting_key is null or p_setting_key !~ '^[a-z][a-z0-9_.]{2,60}$' then
    raise exception 'that is not a setting key this platform records' using errcode = '22023';
  end if;

  select jsonb_build_object('scope', 'global', 'value', s.value, 'note', s.note, 'updated_at', s.updated_at)
    into step
  from public.market_settings s where s.scope = 'global' and s.setting_key = p_setting_key;
  chain := chain || jsonb_build_array(coalesce(step, jsonb_build_object('scope', 'global', 'value', null, 'note', 'not set')));
  if step is not null then winner := step; end if;
  step := null;

  if p_market_id is not null then
    select jsonb_build_object('scope', 'market', 'value', s.value, 'note', s.note, 'updated_at', s.updated_at)
      into step
    from public.market_settings s where s.scope = 'market' and s.scope_id = p_market_id and s.setting_key = p_setting_key;
    chain := chain || jsonb_build_array(coalesce(step, jsonb_build_object('scope', 'market', 'value', null, 'note', 'not set')));
    if step is not null then winner := step; end if;
    step := null;
  end if;

  if p_region_id is not null then
    select jsonb_build_object('scope', 'region', 'value', s.value, 'note', s.note, 'updated_at', s.updated_at)
      into step
    from public.market_settings s where s.scope = 'region' and s.scope_id = p_region_id and s.setting_key = p_setting_key;
    chain := chain || jsonb_build_array(coalesce(step, jsonb_build_object('scope', 'region', 'value', null, 'note', 'not set')));
    if step is not null then winner := step; end if;
    step := null;
  end if;

  if p_organisation_id is not null then
    select o.operational_policies into organisation_policies from public.organisations o where o.id = p_organisation_id;
    chain := chain || jsonb_build_array(jsonb_build_object(
      'scope', 'organisation',
      'value', case when organisation_policies ? p_setting_key then organisation_policies -> p_setting_key else null end,
      'note', 'read from the organisation''s own operational policies'
    ));
    if organisation_policies ? p_setting_key then
      winner := jsonb_build_object('scope', 'organisation', 'value', organisation_policies -> p_setting_key);
    end if;
  end if;

  chain := chain || jsonb_build_array(jsonb_build_object(
    'scope', 'project',
    'value', null,
    'note', 'the platform has no per-project configuration store yet'
  ));

  return jsonb_build_object(
    'allowed', true,
    'setting_key', p_setting_key,
    'chain', chain,
    'winner', winner,
    'resolved_value', case when winner is null then null else winner -> 'value' end,
    'winner_scope', case when winner is null then null else winner ->> 'scope' end
  );
end $$;

revoke all on function public.market_setting_resolution_command(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.market_setting_resolution_command(text, uuid, uuid, uuid) to authenticated;

-- ── Taxonomy commands ──────────────────────────────────────────────────────────────────────────

/**
 * Create a canonical service.
 *
 * ⚠️ THE KEY IS SET ONCE, HERE. It is the public catalog's join key and every future edit goes through the id, so
 * the only moment a key can be chosen is the moment the entity is created — and a duplicate key is refused by the
 * unique index rather than quietly producing a second service.
 */
create or replace function public.create_service_command(
  p_canonical_key text,
  p_display_name text,
  p_language_code text,
  p_reason_code text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  key text := lower(btrim(coalesce(p_canonical_key, '')));
  name text := btrim(coalesce(p_display_name, ''));
  service_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change the service taxonomy' using errcode = '42501';
  end if;
  if key !~ '^[a-z][a-z0-9_]{3,60}$' then
    raise exception 'a canonical key is lowercase letters, digits and underscores' using errcode = '22023';
  end if;
  if char_length(name) < 2 then
    raise exception 'a display name is required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for adding this service' using errcode = '22023';
  end if;
  if exists (select 1 from public.taxonomy_entities where kind = 'service' and canonical_key = key) then
    raise exception 'a service with that canonical key already exists' using errcode = '22023';
  end if;

  insert into public.taxonomy_entities(kind, canonical_key) values ('service', key) returning id into service_id;
  insert into public.entity_names(entity_id, language_code, display_name, is_primary)
  values (service_id, coalesce(nullif(btrim(coalesce(p_language_code, '')), ''), 'en'), name, true);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'SERVICE_TAXONOMY_CREATED', 'taxonomy_entity', service_id, p_reason_code, 'system_internal',
          jsonb_build_object('canonical_key', key, 'display_name', name, 'note', btrim(p_note)));

  return service_id;
end $$;

revoke all on function public.create_service_command(text, text, text, text, text) from public, anon;
grant execute on function public.create_service_command(text, text, text, text, text) to authenticated;

/**
 * Edit a service's definition: its name for one language, its synonyms, and its credential rules.
 *
 * ⚠️ IT CANNOT CHANGE THE ID OR THE KEY. Both are read from the row and never written, which is the invariant the
 * brief asks for expressed as the absence of an assignment rather than a promise in a comment.
 */
create or replace function public.update_service_definition_command(
  p_service_id uuid,
  p_display_name text,
  p_language_code text,
  p_synonyms text[],
  p_rules jsonb,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  entity public.taxonomy_entities%rowtype;
  language_code text := coalesce(nullif(btrim(coalesce(p_language_code, '')), ''), 'en');
  name text := btrim(coalesce(p_display_name, ''));
  phrase text;
  rule jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change the service taxonomy' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for this change' using errcode = '22023';
  end if;

  select * into entity from public.taxonomy_entities where id = p_service_id and kind = 'service' for update;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  if not entity.is_active then
    raise exception 'this service is deprecated; restore it before editing its definition' using errcode = '22023';
  end if;
  if char_length(name) < 2 then
    raise exception 'a display name is required' using errcode = '22023';
  end if;

  -- The name for this language is replaced, not appended to: two primary names in one language is not a
  -- translation, it is a disagreement.
  delete from public.entity_names where entity_id = entity.id and language_code = language_code;
  insert into public.entity_names(entity_id, language_code, display_name, is_primary) values (entity.id, language_code, name, true);

  if p_synonyms is not null then
    delete from public.entity_synonyms where entity_id = entity.id and language_code = language_code;
    foreach phrase in array p_synonyms loop
      if btrim(phrase) <> '' then
        insert into public.entity_synonyms(entity_id, language_code, phrase)
        values (entity.id, language_code, btrim(phrase))
        on conflict (entity_id, language_code, phrase) do nothing;
      end if;
    end loop;
  end if;

  if p_rules is not null and jsonb_typeof(p_rules) = 'array' then
    delete from public.service_credential_requirements
     where service_entity_id = entity.id and coalesce(jurisdiction_code, '') = '';
    for rule in select * from jsonb_array_elements(p_rules) loop
      if coalesce(rule ->> 'credential_type', '') in ('licence','certification','insurance','trade_registration','other') then
        insert into public.service_credential_requirements(service_entity_id, credential_type, jurisdiction_code, is_mandatory, note, created_by_account_id)
        values (
          entity.id,
          rule ->> 'credential_type',
          null,
          coalesce((rule ->> 'is_mandatory')::boolean, true),
          nullif(btrim(coalesce(rule ->> 'note', '')), ''),
          me
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'SERVICE_DEFINITION_UPDATED', 'taxonomy_entity', entity.id, p_reason_code, 'system_internal',
          jsonb_build_object('canonical_key', entity.canonical_key, 'language_code', language_code,
                             'display_name', name, 'synonym_count', coalesce(array_length(p_synonyms, 1), 0),
                             'note', btrim(p_note)));
end $$;

revoke all on function public.update_service_definition_command(uuid, text, text, text[], jsonb, text, text) from public, anon;
grant execute on function public.update_service_definition_command(uuid, text, text, text[], jsonb, text, text) to authenticated;

/**
 * Merge two canonical services.
 *
 * ⚠️ THIS IS THE ONLY COMMAND THAT MOVES OTHER TABLES' ROWS, AND IT SAYS WHAT IT MOVED. The loser's provider
 * links, requests, routes and credential rules are repointed at the winner inside one transaction, the counts are
 * returned and audited, and the loser is deprecated with a `merged_into` link. Nothing deletes the losing entity:
 * its id is history, and a request that once pointed at it can still be explained.
 */
create or replace function public.merge_services_command(
  p_source_id uuid,
  p_target_id uuid,
  p_reason_code text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  source public.taxonomy_entities%rowtype;
  target public.taxonomy_entities%rowtype;
  moved_providers integer := 0;
  moved_requests integer := 0;
  moved_routes integer := 0;
  moved_rules integer := 0;
  moved_templates integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to merge services' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_source_id = p_target_id then
    raise exception 'a service cannot be merged into itself' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for this merge' using errcode = '22023';
  end if;

  select * into source from public.taxonomy_entities where id = p_source_id and kind = 'service' for update;
  if not found then raise exception 'the service being merged was not found' using errcode = 'P0002'; end if;
  select * into target from public.taxonomy_entities where id = p_target_id and kind = 'service' for update;
  if not found then raise exception 'the service it merges into was not found' using errcode = 'P0002'; end if;
  if not target.is_active then
    raise exception 'the surviving service is deprecated' using errcode = '22023';
  end if;
  if exists (select 1 from public.taxonomy_links l where l.from_entity_id = source.id and l.relation_type = 'merged_into') then
    raise exception 'that service has already been merged' using errcode = '22023';
  end if;

  update public.provider_services set service_entity_id = target.id, updated_at = now()
   where service_entity_id = source.id and not exists (
     select 1 from public.provider_services p2 where p2.provider_id = public.provider_services.provider_id and p2.service_entity_id = target.id
   );
  get diagnostics moved_providers = row_count;
  -- A provider that already offers the surviving service keeps one row, not two: the duplicate link is removed.
  delete from public.provider_services ps
   where ps.service_entity_id = source.id
     and exists (select 1 from public.provider_services p2 where p2.provider_id = ps.provider_id and p2.service_entity_id = target.id);

  update public.requests set service_entity_id = target.id where service_entity_id = source.id;
  get diagnostics moved_requests = row_count;
  update public.public_routes set entity_id = target.id, updated_at = now() where entity_kind = 'service' and entity_id = source.id;
  get diagnostics moved_routes = row_count;
  update public.service_credential_requirements set service_entity_id = target.id where service_entity_id = source.id;
  get diagnostics moved_rules = row_count;
  update public.discovery_templates set service_entity_id = target.id, updated_at = now() where service_entity_id = source.id;
  get diagnostics moved_templates = row_count;

  insert into public.taxonomy_links(from_entity_id, to_entity_id, relation_type) values (source.id, target.id, 'merged_into')
  on conflict do nothing;
  update public.taxonomy_entities set is_active = false, updated_at = now() where id = source.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'SERVICE_TAXONOMY_MERGED', 'taxonomy_entity', target.id, p_reason_code, 'system_internal',
          jsonb_build_object('source_id', source.id, 'source_key', source.canonical_key, 'target_key', target.canonical_key,
                             'provider_links', moved_providers, 'requests', moved_requests, 'routes', moved_routes,
                             'credential_rules', moved_rules, 'templates', moved_templates, 'note', btrim(p_note)));

  return jsonb_build_object(
    'source_id', source.id, 'target_id', target.id,
    'moved', jsonb_build_object('provider_links', moved_providers, 'requests', moved_requests, 'routes', moved_routes,
                                'credential_rules', moved_rules, 'templates', moved_templates)
  );
end $$;

revoke all on function public.merge_services_command(uuid, uuid, text, text) from public, anon;
grant execute on function public.merge_services_command(uuid, uuid, text, text) to authenticated;

/** Deprecate a service. It keeps every row that points at it; it simply cannot be chosen again. */
create or replace function public.deprecate_service_command(
  p_service_id uuid,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  entity public.taxonomy_entities%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change the service taxonomy' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for deprecating this service' using errcode = '22023';
  end if;

  select * into entity from public.taxonomy_entities where id = p_service_id and kind = 'service' for update;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  if not entity.is_active then raise exception 'that service is already deprecated' using errcode = '22023'; end if;
  if exists (select 1 from public.requests r where r.service_entity_id = entity.id and r.state not in ('completed','cancelled')) then
    raise exception 'work is still open against this service; merge it into a live one instead of retiring it' using errcode = '22023';
  end if;

  update public.taxonomy_entities set is_active = false, updated_at = now() where id = entity.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'SERVICE_TAXONOMY_DEPRECATED', 'taxonomy_entity', entity.id, p_reason_code, 'system_internal',
          jsonb_build_object('canonical_key', entity.canonical_key, 'note', btrim(p_note)));
end $$;

revoke all on function public.deprecate_service_command(uuid, text, text) from public, anon;
grant execute on function public.deprecate_service_command(uuid, text, text) to authenticated;

-- ── Template and intent commands ───────────────────────────────────────────────────────────────

/**
 * Add the next version of a template.
 *
 * ⚠️ ADAPTING IS THE ONLY WAY TO CHANGE A TEMPLATE. This always writes a DRAFT; the version already published
 * stays live until somebody publishes the new one, so a half-written revision cannot reach a customer. If nobody
 * has built this intent pair yet, the template row is created first.
 */
create or replace function public.create_template_version_command(
  p_service_id uuid,
  p_problem_id uuid,
  p_outcome_id uuid,
  p_fields jsonb,
  p_notes text,
  p_reason_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  template_id uuid;
  next_version integer;
  version_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change templates' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) = 0 then
    raise exception 'a template version needs at least one field' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for this template version' using errcode = '22023';
  end if;
  if not exists (select 1 from public.taxonomy_entities where id = p_service_id and kind = 'service' and is_active) then
    raise exception 'that service is not an active canonical service' using errcode = '22023';
  end if;

  select id into template_id from public.discovery_templates
   where service_entity_id = p_service_id
     and problem_entity_id is not distinct from p_problem_id
     and outcome_entity_id is not distinct from p_outcome_id;

  if template_id is null then
    insert into public.discovery_templates(service_entity_id, problem_entity_id, outcome_entity_id, created_by_account_id)
    values (p_service_id, p_problem_id, p_outcome_id, me)
    returning id into template_id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.discovery_template_versions where template_id = template_id;

  insert into public.discovery_template_versions(template_id, version, status, fields, notes, created_by_account_id)
  values (template_id, next_version, 'draft', p_fields, nullif(btrim(coalesce(p_notes, '')), ''), me)
  returning id into version_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'DISCOVERY_TEMPLATE_VERSION_CREATED', 'discovery_template', template_id, p_reason_code, 'system_internal',
          jsonb_build_object('version', next_version, 'service_entity_id', p_service_id, 'field_count', jsonb_array_length(p_fields)));

  return version_id;
end $$;

revoke all on function public.create_template_version_command(uuid, uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_template_version_command(uuid, uuid, uuid, jsonb, text, text) to authenticated;

/**
 * Publish a draft version.
 *
 * ⚠️ PUBLISHING DEPRECATES THE PREVIOUS PUBLISHED VERSION IN THE SAME TRANSACTION. A partial unique index keeps
 * one live version per template, so "which template does a customer get" has exactly one answer.
 */
create or replace function public.publish_template_version_command(
  p_version_id uuid,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  version public.discovery_template_versions%rowtype;
  template public.discovery_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to publish templates' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for publishing this version' using errcode = '22023';
  end if;

  select * into version from public.discovery_template_versions where id = p_version_id for update;
  if not found then raise exception 'template version not found' using errcode = 'P0002'; end if;
  if version.status = 'published' then raise exception 'that version is already published' using errcode = '22023'; end if;
  if version.status = 'deprecated' then raise exception 'a deprecated version cannot be published' using errcode = '22023'; end if;

  select * into template from public.discovery_templates where id = version.template_id for update;
  if template.status = 'deprecated' then
    raise exception 'this template is deprecated; create a new one rather than reviving it' using errcode = '22023';
  end if;

  update public.discovery_template_versions
     set status = 'deprecated'
   where template_id = version.template_id and status = 'published' and id <> version.id;
  update public.discovery_template_versions
     set status = 'published', published_at = now(), published_by_account_id = me
   where id = version.id;
  update public.discovery_templates set updated_at = now() where id = version.template_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'DISCOVERY_TEMPLATE_PUBLISHED', 'discovery_template', version.template_id, p_reason_code, 'system_internal',
          jsonb_build_object('version', version.version, 'note', btrim(p_note)));
end $$;

revoke all on function public.publish_template_version_command(uuid, text, text) from public, anon;
grant execute on function public.publish_template_version_command(uuid, text, text) to authenticated;

/** Retire a template. Its published version stops being offered; every version stays readable. */
create or replace function public.deprecate_template_command(
  p_template_id uuid,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  template public.discovery_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to retire templates' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('taxonomy_change', p_reason_code) then
    raise exception 'choose a reason for retiring this template' using errcode = '22023';
  end if;

  select * into template from public.discovery_templates where id = p_template_id for update;
  if not found then raise exception 'template not found' using errcode = 'P0002'; end if;
  if template.status = 'deprecated' then raise exception 'that template is already retired' using errcode = '22023'; end if;

  update public.discovery_templates set status = 'deprecated', updated_at = now() where id = template.id;
  update public.discovery_template_versions set status = 'deprecated'
   where template_id = template.id and status = 'published';

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'DISCOVERY_TEMPLATE_DEPRECATED', 'discovery_template', template.id, p_reason_code, 'system_internal',
          jsonb_build_object('note', btrim(p_note)));
end $$;

revoke all on function public.deprecate_template_command(uuid, text, text) from public, anon;
grant execute on function public.deprecate_template_command(uuid, text, text) to authenticated;

/**
 * Test what a phrase would match.
 *
 * ⚠️ IT SAYS WHAT IT IS: A PHRASE MATCH, NOT A MODEL. The answer distinguishes a name match from a synonym match
 * and returns nothing when neither lands, because a confident-looking wrong mapping is worse than an empty one.
 */
create or replace function public.test_intent_mapping_command(p_phrase text, p_market_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  needle text := lower(btrim(coalesce(p_phrase, '')));
  matches jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.taxonomy.read')
    or app_private.current_account_has_platform_capability('platform.taxonomy.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if char_length(needle) < 2 then
    raise exception 'type at least two characters to test' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'service_name'), '[]'::jsonb)
    into matches
  from (
    select distinct on (e.id)
      jsonb_build_object(
        'service_id', e.id,
        'service_name', coalesce((select n.display_name from public.entity_names n where n.entity_id = e.id order by n.is_primary desc limit 1), e.canonical_key),
        'canonical_key', e.canonical_key,
        'is_active', e.is_active,
        'matched_on', case
          when exists (select 1 from public.entity_names n where n.entity_id = e.id and lower(n.display_name) = needle) then 'exact name'
          when exists (select 1 from public.entity_names n where n.entity_id = e.id and lower(n.display_name) like '%' || needle || '%') then 'name'
          when exists (select 1 from public.entity_synonyms s where s.entity_id = e.id and lower(s.phrase) = needle) then 'exact synonym'
          else 'synonym'
        end,
        'templates', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'template_id', t.id,
                   'status', t.status,
                   'problem_name', (select n.display_name from public.entity_names n where n.entity_id = t.problem_entity_id order by n.is_primary desc limit 1),
                   'outcome_name', (select n.display_name from public.entity_names n where n.entity_id = t.outcome_entity_id order by n.is_primary desc limit 1),
                   'published_version', (select v.version from public.discovery_template_versions v where v.template_id = t.id and v.status = 'published' limit 1)
                 ))
          from public.discovery_templates t
          where t.service_entity_id = e.id and t.status = 'active'
        ), '[]'::jsonb)
      ) as entry
    from public.taxonomy_entities e
    where e.kind = 'service'
      and (
        exists (select 1 from public.entity_names n where n.entity_id = e.id and lower(n.display_name) like '%' || needle || '%')
        or exists (select 1 from public.entity_synonyms s where s.entity_id = e.id and lower(s.phrase) like '%' || needle || '%')
      )
    order by e.id
  ) m;

  return jsonb_build_object(
    'allowed', true,
    'phrase', p_phrase,
    'matches', matches,
    'strategy', 'name and synonym matching over the canonical entities — the platform has no learned intent model',
    'market_id', p_market_id
  );
end $$;

revoke all on function public.test_intent_mapping_command(text, uuid) from public, anon;
grant execute on function public.test_intent_mapping_command(text, uuid) to authenticated;

-- ── Market commands ────────────────────────────────────────────────────────────────────────────

/**
 * Configure a market: its language, currency, display name and any settings rows.
 *
 * ⚠️ EVERYTHING BUT THE CORE COLUMNS GOES INTO `market_settings`. Address rules, tax adapters and payment routes
 * are rows, so launching a market is data entry rather than a migration — which is what keeps each new market
 * from touching the core schema.
 */
create or replace function public.configure_market_command(
  p_market_id uuid,
  p_default_language_code text,
  p_default_currency_code text,
  p_display_name text,
  p_settings jsonb,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  market public.markets%rowtype;
  item jsonb;
  written integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.markets.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to configure a market' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('market_change', p_reason_code) then
    raise exception 'choose a reason for this market change' using errcode = '22023';
  end if;

  select * into market from public.markets where id = p_market_id for update;
  if not found then raise exception 'market not found' using errcode = 'P0002'; end if;
  if upper(coalesce(nullif(btrim(coalesce(p_default_currency_code, '')), ''), market.default_currency_code)) !~ '^[A-Z]{3}$' then
    raise exception 'a market currency is a three-letter code' using errcode = '22023';
  end if;
  if coalesce(nullif(btrim(coalesce(p_default_language_code, '')), ''), market.default_language_code) !~ '^[a-zA-Z-]{2,10}$' then
    raise exception 'that is not a language code' using errcode = '22023';
  end if;

  update public.markets
     set default_language_code = coalesce(nullif(btrim(coalesce(p_default_language_code, '')), ''), default_language_code),
         default_currency_code = upper(coalesce(nullif(btrim(coalesce(p_default_currency_code, '')), ''), default_currency_code)),
         updated_at = now()
   where id = market.id;

  if p_settings is not null and jsonb_typeof(p_settings) = 'array' then
    for item in select * from jsonb_array_elements(p_settings) loop
      if coalesce(item ->> 'key', '') ~ '^[a-z][a-z0-9_.]{2,60}$' then
        insert into public.market_settings(scope, scope_id, setting_key, value, note, updated_by_account_id)
        values ('market', market.id, item ->> 'key', coalesce(item -> 'value', 'null'::jsonb), nullif(btrim(coalesce(item ->> 'note', '')), ''), me)
        on conflict (scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), setting_key)
        do update set value = excluded.value, note = excluded.note, updated_by_account_id = excluded.updated_by_account_id, updated_at = now();
        written := written + 1;
      end if;
    end loop;
  end if;

  -- The public catalog carries the display name the storefront shows, so a market rename is one update here
  -- rather than a rebuild of every page that reads the catalog.
  if nullif(btrim(coalesce(p_display_name, '')), '') is not null then
    update public.public_market_catalog set display_name = btrim(p_display_name) where market_id = market.id;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'MARKET_CONFIGURED', 'market', market.id, p_reason_code, 'system_internal',
          jsonb_build_object('language_code', p_default_language_code,
                             'currency_code', upper(coalesce(p_default_currency_code, market.default_currency_code)),
                             'display_name', nullif(btrim(coalesce(p_display_name, '')), ''),
                             'settings_written', written, 'note', btrim(p_note)));
end $$;

revoke all on function public.configure_market_command(uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.configure_market_command(uuid, text, text, text, jsonb, text, text) to authenticated;

/**
 * Activate or deactivate a market.
 *
 * ⚠️ DEACTIVATING IS REFUSED WHILE WORK IS OPEN IN IT. Turning a market off does not cancel anybody's job: existing
 * requests, assignments and payouts keep running, and what changes is whether new work can be created there. The
 * refusal is the platform declining to strand live work, not a rule about the market row.
 */
create or replace function public.set_market_active_command(
  p_market_id uuid,
  p_active boolean,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  market public.markets%rowtype;
  open_work integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.markets.manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change a market' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('market_change', p_reason_code) then
    raise exception 'choose a reason for this change' using errcode = '22023';
  end if;

  select * into market from public.markets where id = p_market_id for update;
  if not found then raise exception 'market not found' using errcode = 'P0002'; end if;
  if market.is_active = p_active then
    raise exception 'that market is already in that state' using errcode = '22023';
  end if;

  if not p_active then
    select count(*) into open_work from public.requests r
     where r.market_id = market.id and r.state not in ('completed','cancelled');
    if open_work > 0 then
      raise exception 'that market has % open request(s); finish or cancel them before deactivating it', open_work using errcode = '22023';
    end if;
  end if;

  update public.markets set is_active = p_active, updated_at = now() where id = market.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', case when p_active then 'MARKET_ACTIVATED' else 'MARKET_DEACTIVATED' end, 'market', market.id, p_reason_code, 'system_internal',
          jsonb_build_object('code', market.code, 'note', btrim(p_note)));
end $$;

revoke all on function public.set_market_active_command(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_market_active_command(uuid, boolean, text, text) to authenticated;
