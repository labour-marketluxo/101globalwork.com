-- Trust review: verification and credential decisions, and the platform's moderation case queue.
--
-- ── FIVE RULES THIS MIGRATION EXISTS TO ENFORCE ────────────────────────────────────────────────
--
-- 1. A DECISION IS A ROW, NOT AN EDIT. `provider_verifications` and `provider_credentials` carry a
--    current status, and that status has always been overwritten in place — which loses the fact that
--    something was rejected once, reworked, and verified later. Every decision now appends a row to
--    `provider_verification_decisions` / `provider_credential_decisions`, with the reason code, the note
--    and the POLICY VERSION it was decided under. The status column still says what is true now; the
--    decision rows say how it got that way, and they are never updated.
--
-- 2. ONE DECISION PATH PER RECORD. The old `review_provider_verification_command` took no reason code and
--    is revoked at the bottom of this file, so the only way to decide a verification is the command here
--    — which requires a reason code, a note and a second factor. Two live paths for one decision is how a
--    console acquires a way around its own controls.
--
-- 3. SAFETY CASES ARE ISOLATED BY CONSTRUCTION. `platform_trust_cases` has NO participant read policy at
--    all: only accounts holding platform trust, operations or administration capabilities can select a
--    row. A case about harassment is not a project conversation, and nothing here joins it to one.
--
-- 4. A LEGAL HOLD DOES SOMETHING. It refuses the closure of its own case, and — because the one action a
--    held case must stop is putting the subject back on the platform — it refuses the REINSTATEMENT of the
--    account the case is about until somebody lifts it with a reason.
--
-- 5. THE PLATFORM DOES NOT PRETEND TO AUTOMATE CREDENTIALS IT CANNOT CHECK. There is no business-registry
--    API in this codebase and no automated risk model. What the review hubs show are checks that run over
--    real columns — a missing document reference, a reference claim another provider is already using, a
--    jurisdiction that does not match the provider's market — and the page says which of those fired.

-- ── The reason-code vocabulary, extended ───────────────────────────────────────────────────────

/**
 * Redefined with the trust scopes added.
 *
 * ⚠️ THE WHOLE FUNCTION IS REPEATED RATHER THAN PATCHED, because it is the single list the database
 * validates against and a partial definition would silently drop the scopes the accounts console already
 * offers. The original scopes below are unchanged; the trust ones follow them.
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
    -- ⚠️ A SEPARATE VOCABULARY FOR LIFTING A HOLD. "Litigation" is a reason to keep something, not a reason
    -- to let it go, and a single list would let an operator record "regulatory request" as the reason they
    -- released a record a regulator had asked them to preserve.
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
    )
  );
$$;

/**
 * The policy labels a decision is recorded against.
 *
 * ⚠️ THESE ARE THE PLATFORM'S OWN LABELS, NOT AN EXTERNAL STANDARD. There is no external certification
 * this platform is assessed under, and inventing the name of one would put a claim in the audit log that
 * nobody could substantiate. The operator sees the current label, may change it, and whatever they leave
 * in the field is stored on the decision row — so a decision always says which internal policy wording
 * the reviewer was working to.
 */
create or replace function app_private.trust_policy_versions()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'verification', 'identity-and-business-v1',
    'credential', 'licence-and-insurance-v1',
    'moderation', 'safety-and-conduct-v1'
  );
$$;

revoke all on function app_private.trust_policy_versions() from public, anon, authenticated;

-- ── Append-only decision histories ─────────────────────────────────────────────────────────────

/**
 * One row per decision about a verification submission.
 *
 * ⚠️ `information_requested` AND `escalated` ARE DECISIONS TOO. The verification row keeps its `pending`
 * status in both cases — the submission has not been decided — but the platform did do something, and an
 * operator needs to see that somebody already asked for a better document before they ask again.
 */
create table public.provider_verification_decisions (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.provider_verifications(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  decision text not null check (decision in ('verified','rejected','information_requested','escalated')),
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  policy_version text not null check (char_length(btrim(policy_version)) between 2 and 60),
  expires_at timestamptz,
  assigned_to_account_id uuid references public.accounts(id) on delete set null,
  decided_by_account_id uuid not null references public.accounts(id) on delete restrict,
  decided_at timestamptz not null default now(),
  -- An escalation is the only decision that must name the person it went to.
  constraint provider_verification_escalation_chk check (
    decision <> 'escalated' or assigned_to_account_id is not null
  )
);

create index provider_verification_decisions_idx
  on public.provider_verification_decisions(verification_id, decided_at desc);

alter table public.provider_verification_decisions enable row level security;
create policy provider_verification_decisions_trust_read on public.provider_verification_decisions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.provider_verification_decisions from anon;
revoke insert, update, delete on public.provider_verification_decisions from authenticated;
grant select on public.provider_verification_decisions to authenticated;

comment on table public.provider_verification_decisions is
  'Append-only history of verification decisions, with the reason code, the note and the policy version each was made under. The verification row says what is true now; these rows say how it got there.';

/**
 * One row per decision about a credential.
 *
 * ⚠️ `revoked` IS ITS OWN DECISION BECAUSE IT IS NOT A REJECTION. A licence that was once accepted and is
 * now withdrawn has a different history from one that was never accepted, and that history is the thing an
 * operator is asked about later. `verification_status` has no `revoked` value, so the credential row is
 * marked rejected — see the note on `decide_provider_credential_command`.
 */
create table public.provider_credential_decisions (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.provider_credentials(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  decision text not null check (decision in ('verified','rejected','revoked','information_requested')),
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  policy_version text not null check (char_length(btrim(policy_version)) between 2 and 60),
  expires_at date,
  decided_by_account_id uuid not null references public.accounts(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create index provider_credential_decisions_idx
  on public.provider_credential_decisions(credential_id, decided_at desc);

alter table public.provider_credential_decisions enable row level security;
create policy provider_credential_decisions_trust_read on public.provider_credential_decisions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.provider_credential_decisions from anon;
revoke insert, update, delete on public.provider_credential_decisions from authenticated;
grant select on public.provider_credential_decisions to authenticated;

comment on table public.provider_credential_decisions is
  'Append-only history of credential decisions — verified, rejected, revoked or more information requested — with the reason code, note, policy version and any expiry date set.';

-- ── Platform moderation and safety cases ───────────────────────────────────────────────────────

/**
 * A platform-scoped case: a report, an incident, a policy question about a person or a business.
 *
 * ⚠️ THIS IS NOT `project_issues`, AND THE DIFFERENCE IS THE SUBJECT. A project issue belongs to an
 * assignment and is read by both parties to it; a trust case is about an account, a provider or a request
 * and is read by nobody but the platform. Keeping them apart is what lets the isolation rule be structural
 * rather than a promise: there is no participant read policy on this table at all.
 *
 * ⚠️ SEVERITY AND THE LEGAL HOLD ARE DIFFERENT FACTS. The brief lists "Legal Hold" among the severity
 * badges, and the badge does show it — but in the data a hold is a boolean with a reason and a date,
 * because a case can be critical WITHOUT a hold and held while only medium. Flattening the two would make
 * "was this preserved for litigation?" unanswerable.
 */
create table public.platform_trust_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null check (case_type in ('safety','abuse','harassment','policy_violation','fraud','dispute','other')),
  severity text not null check (severity in ('low','medium','critical')),
  state text not null default 'open' check (state in ('open','investigating','awaiting_response','escalated','resolved','closed')),
  summary text not null check (char_length(btrim(summary)) between 10 and 2000),
  source text not null default 'operator' check (source in ('report','operator','system')),
  reporter_account_id uuid references public.accounts(id) on delete set null,
  subject_account_id uuid references public.accounts(id) on delete set null,
  subject_provider_id uuid references public.providers(id) on delete set null,
  subject_request_id uuid references public.requests(id) on delete set null,
  -- Evidence the case points at. References, never copies: the evidence itself stays in the private
  -- store with its own provenance, and a case that duplicated it would be a second copy to keep.
  evidence_ids uuid[] not null default '{}'::uuid[],
  project_issue_id uuid references public.project_issues(id) on delete set null,
  assigned_account_id uuid references public.accounts(id) on delete set null,
  sla_due_at timestamptz,
  legal_hold boolean not null default false,
  legal_hold_reason text,
  legal_hold_at timestamptz,
  legal_hold_by_account_id uuid references public.accounts(id) on delete set null,
  resolution text,
  closed_by_account_id uuid references public.accounts(id) on delete set null,
  closed_at timestamptz,
  created_by_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A case has to be about something. An untethered report is a note, and this queue would fill with them.
  constraint platform_trust_case_subject_chk check (
    subject_account_id is not null or subject_provider_id is not null or subject_request_id is not null
  ),
  constraint platform_trust_case_closure_chk check (
    state not in ('resolved','closed') or (resolution is not null and closed_at is not null)
  ),
  constraint platform_trust_case_hold_chk check (
    (legal_hold = false and legal_hold_reason is null and legal_hold_at is null)
    or (legal_hold = true and legal_hold_reason is not null and legal_hold_at is not null)
  )
);

create index platform_trust_cases_queue_idx
  on public.platform_trust_cases(state, severity, created_at desc);
create index platform_trust_cases_sla_idx
  on public.platform_trust_cases(sla_due_at) where state not in ('resolved','closed');
create index platform_trust_cases_subject_account_idx
  on public.platform_trust_cases(subject_account_id) where subject_account_id is not null;

-- ⚠️ NO PARTICIPANT POLICY. The only select policy is for platform operators, which is what makes the
-- brief's isolation rule structural: a party to a project cannot read a case about themselves from here,
-- however the query is written, and no page in the participant workspace joins this table.
--
-- ⚠️ `platform.admin.view_audit` IS ON THE LIST, AND THAT IS NOT NEW EXPOSURE. The audit stream is already
-- readable by that capability (`audit_admin_read`), and every command here writes the note and the resolution
-- into its audit metadata — so an auditor could read the substance of a case either way. Excluding them from
-- the case itself would only mean the audit view and the case view disagreed about what a case says.
alter table public.platform_trust_cases enable row level security;
create policy platform_trust_cases_operator_read on public.platform_trust_cases
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_trust_cases from anon;
revoke insert, update, delete on public.platform_trust_cases from authenticated;
grant select on public.platform_trust_cases to authenticated;

comment on table public.platform_trust_cases is
  'Platform moderation and safety cases about an account, provider or request. Readable only by platform operators — there is deliberately no participant read policy, so safety cases cannot leak into project conversations.';

/** The append-only history of a case: who did what to it, when, and why. */
create table public.platform_trust_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.platform_trust_cases(id) on delete cascade,
  event_type text not null check (event_type in (
    'created','assigned','legal_hold_placed','legal_hold_lifted','account_restricted','account_reinstated','state_changed','note'
  )),
  reason_code text,
  note text check (note is null or char_length(btrim(note)) between 1 and 2000),
  actor_account_id uuid references public.accounts(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index platform_trust_case_events_idx on public.platform_trust_case_events(case_id, occurred_at);

alter table public.platform_trust_case_events enable row level security;
create policy platform_trust_case_events_operator_read on public.platform_trust_case_events
  for select to authenticated
  using (
    -- Stated here rather than inferred from the case policy: a policy that borrows another table's policy
    -- is a policy that changes meaning the day that one is edited.
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_trust_case_events from anon;
revoke insert, update, delete on public.platform_trust_case_events from authenticated;
grant select on public.platform_trust_case_events to authenticated;

comment on table public.platform_trust_case_events is
  'Append-only history of a trust case: assignment, legal hold, restrictions applied and the closure — each with the reason code and the operator who did it.';

-- ── Who can be given a case or an escalation ───────────────────────────────────────────────────

/**
 * The people a case or an escalation can be handed to.
 *
 * ⚠️ IT LISTS ACCOUNTS THAT HOLD A TRUST CAPABILITY, NOT "ADMINISTRATORS". Assigning an escalation to
 * somebody whose role cannot open the screen it points at produces a case nobody is working on while the
 * queue says it is assigned. The list is derived from the capability tables, the same ones every command
 * checks.
 */
create or replace function public.admin_trust_reviewers_command()
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
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'name'), '[]'::jsonb)
    into result
  from (
    select distinct on (m.account_id)
      jsonb_build_object(
        'account_id', m.account_id,
        'name', coalesce(nullif(btrim(p.display_name), ''), 'Administrator'),
        'role', r.display_name
      ) as entry
    from public.platform_admin_memberships m
    join public.platform_roles r on r.id = m.role_id
    join public.platform_role_capabilities rc on rc.role_id = m.role_id
    left join public.profiles p on p.account_id = m.account_id
    where m.status = 'active'
      and m.revoked_at is null
      and rc.capability in ('platform.trust.verify', 'platform.trust.moderate')
    order by m.account_id, r.display_name
  ) x;

  -- The platform owner holds every capability without a role row, so they are added separately rather than
  -- silently missing from a list an operator is choosing from.
  if app_private.current_account_is_owner() or exists (select 1 from public.platform_ownership) then
    result := result || coalesce((
      select jsonb_agg(jsonb_build_object('account_id', o.owner_account_id, 'name', coalesce(nullif(btrim(p.display_name), ''), 'Platform Owner'), 'role', 'Platform Owner'))
      from public.platform_ownership o
      left join public.profiles p on p.account_id = o.owner_account_id
      where not exists (
        select 1 from jsonb_array_elements(result) e where e ->> 'account_id' = o.owner_account_id::text
      )
    ), '[]'::jsonb);
  end if;

  return jsonb_build_object('allowed', true, 'reviewers', result);
end $$;

revoke all on function public.admin_trust_reviewers_command() from public, anon;
grant execute on function public.admin_trust_reviewers_command() to authenticated;

-- ── The verification review hub ────────────────────────────────────────────────────────────────

/**
 * Everything needed to decide one verification submission, and nothing else.
 *
 * ⚠️ THE "RISK SIGNALS" ARE CHECKS OVER REAL COLUMNS, AND THE PAGE SAYS SO. This platform has no automated
 * identity model and no business-registry API: the signals below are things a query can prove — the
 * submission carries no document reference, the reference it does carry is claimed by another provider,
 * the jurisdiction does not match the provider's market, the provider's account is not active. Calling them
 * "checks that fired" rather than a score is the difference between a review aid and a machine's opinion
 * presented as a finding.
 *
 * ⚠️ "HISTORICAL ATTEMPTS" ARE AUDIT EVENTS, BECAUSE THAT IS WHERE THEY ARE. The verification row is unique
 * per (provider, kind, jurisdiction), so a re-submission overwrites the state of the last one; the audit
 * stream keeps every submission and every decision, and reading it here is what makes the history visible
 * without inventing a second place to store it.
 */
create or replace function public.admin_verification_case_command(p_verification_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  v public.provider_verifications%rowtype;
  prov public.providers%rowtype;
  owner_account public.accounts%rowtype;
  result jsonb;
  signals jsonb := '[]'::jsonb;
  duplicate_owner text;
  market_code text;
  market_name text;
  rejections integer;
  resubmissions integer;
  expires_past boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into v from public.provider_verifications where id = p_verification_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;
  select * into prov from public.providers where id = v.provider_id;
  select * into owner_account from public.accounts where id = prov.owner_account_id;

  select mc.code, mc.display_name into market_code, market_name
  from public.public_market_catalog mc where mc.market_id = prov.primary_market_id;

  -- The same reference label on somebody else's submission of the same kind. This is the one signal here
  -- that can catch a copied claim, and it is a comparison of two rows rather than a judgement.
  select coalesce(nullif(btrim(p2.display_name), ''), 'another provider')
    into duplicate_owner
  from public.provider_verifications v2
  join public.providers p2 on p2.id = v2.provider_id
  where v2.id <> v.id
    and v2.kind = v.kind
    and v.reference_label is not null
    and lower(btrim(v2.reference_label)) = lower(btrim(v.reference_label))
  limit 1;

  select count(*) into resubmissions
  from public.audit_events ae
  where ae.resource_type = 'provider_verification' and ae.resource_id = v.id and ae.action = 'VERIFICATION_RESUBMITTED';

  select count(*) into rejections
  from public.provider_verification_decisions d
  where d.verification_id = v.id and d.decision = 'rejected';

  expires_past := v.expires_at is not null and v.expires_at < now();

  if coalesce(nullif(btrim(v.metadata ->> 'document_reference'), ''), '') = '' then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'no_document_reference', 'level', 'attention',
      'label', 'No document on the submission',
      'detail', 'The provider has not recorded a document reference for this claim, so there is nothing on file to check it against.'));
  end if;
  if v.jurisdiction_code is null or btrim(v.jurisdiction_code) = '' then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'missing_jurisdiction', 'level', 'attention',
      'label', 'No jurisdiction recorded',
      'detail', 'A licence, registration or identity claim without a jurisdiction cannot be checked against the right register.'));
  end if;
  if duplicate_owner is not null then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'duplicate_reference', 'level', 'critical',
      'label', 'The same reference is claimed elsewhere',
      'detail', 'The reference on this submission also appears on a submission from ' || duplicate_owner || '.'));
  end if;
  if resubmissions > 0 then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'resubmitted', 'level', 'info',
      'label', 'Re-submitted ' || resubmissions || ' time(s)',
      'detail', 'The submission has been replaced before. The history below lists every attempt.'));
  end if;
  if rejections > 0 then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'previously_rejected', 'level', 'attention',
      'label', 'Rejected before',
      'detail', 'A reviewer has already refused this submission ' || rejections || ' time(s). Read the earlier note before deciding again.'));
  end if;
  if prov.status <> 'active' then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'provider_not_active', 'level', 'attention',
      'label', 'The provider is not active',
      'detail', 'The provider record is ' || prov.status::text || '. A verification can still be assessed; publication depends on the provider being active.'));
  end if;
  if owner_account.id is not null and owner_account.status <> 'active' then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'owner_account_not_active', 'level', 'critical',
      'label', 'The owning account is not active',
      'detail', 'The account behind this provider is ' || owner_account.status::text || '. Review what has happened to it before verifying anything for it.'));
  end if;
  if v.jurisdiction_code is not null and market_code is not null
     and upper(btrim(v.jurisdiction_code)) <> upper(market_code) then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'jurisdiction_outside_market', 'level', 'attention',
      'label', 'Jurisdiction is outside the provider''s market',
      'detail', 'The claim is for ' || v.jurisdiction_code || ' while the provider''s market is ' || market_code || '. That can be legitimate; confirm it is intended.'));
  end if;
  if expires_past then
    signals := signals || jsonb_build_array(jsonb_build_object(
      'key', 'expired', 'level', 'critical',
      'label', 'The recorded expiry has passed',
      'detail', 'The expiry on this row is in the past (' || to_char(v.expires_at, 'YYYY-MM-DD') || ').'));
  end if;

  select jsonb_build_object(
    'allowed', true,
    'found', true,
    'policy_versions', app_private.trust_policy_versions(),
    'verification', jsonb_build_object(
      'id', v.id,
      'provider_id', v.provider_id,
      'kind', v.kind::text,
      'status', v.status::text,
      'jurisdiction_code', v.jurisdiction_code,
      'reference_label', v.reference_label,
      'document_reference', nullif(v.metadata ->> 'document_reference', ''),
      'document_attached_at', v.metadata ->> 'document_attached_at',
      'review_note', nullif(v.metadata ->> 'review_note', ''),
      'created_at', v.created_at,
      'updated_at', v.updated_at,
      'reviewed_at', v.reviewed_at,
      'verified_at', v.verified_at,
      'expires_at', v.expires_at
    ),
    'provider', jsonb_build_object(
      'id', prov.id,
      'display_name', prov.display_name,
      'status', prov.status::text,
      'is_public', coalesce((select pp.is_public from public.provider_public_profiles pp where pp.provider_id = prov.id), false),
      'public_slug', (select pp.slug from public.provider_public_profiles pp where pp.provider_id = prov.id),
      'market_code', market_code,
      'market_name', market_name,
      'created_at', prov.created_at
    ),
    -- ⚠️ MASKED, ALWAYS. This is the identity-review screen, which means it is a screen somebody shares;
    -- the raw address is one audited action away on the account page and nowhere else.
    'owner', jsonb_build_object(
      'account_id', owner_account.id,
      'display_name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = owner_account.id)), ''), 'Account holder'),
      'contact_masked', app_private.mask_email((select u.email from auth.users u where u.id = owner_account.auth_user_id)),
      'account_status', owner_account.status::text,
      'created_at', owner_account.created_at
    ),
    'signals', signals,
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'decision', d.decision,
               'reason_code', d.reason_code,
               'note', d.note,
               'policy_version', d.policy_version,
               'expires_at', d.expires_at,
               'decided_at', d.decided_at,
               'decided_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = d.decided_by_account_id)), ''), 'An operator'),
               'assigned_to', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = d.assigned_to_account_id)), ''), null)
             ) order by d.decided_at desc)
      from public.provider_verification_decisions d
      where d.verification_id = v.id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', ae.action,
               'occurred_at', ae.occurred_at,
               'actor_type', ae.actor_type,
               'actor', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = (select a.id from public.accounts a where a.auth_user_id = ae.actor_user_id))), ''), ae.actor_type),
               'reason_code', ae.reason_code
             ) order by ae.occurred_at desc)
      from (
        select * from public.audit_events
        where resource_type = 'provider_verification' and resource_id = v.id
        order by occurred_at desc limit 25
      ) ae
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.admin_verification_case_command(uuid) from public, anon;
grant execute on function public.admin_verification_case_command(uuid) to authenticated;

comment on function public.admin_verification_case_command(uuid) is
  'One verification submission in full for review: masked owner, document reference, checks derived from real columns, the append-only decision history and the audit attempts behind it.';

-- ── The credential review hub ──────────────────────────────────────────────────────────────────

/**
 * One credential, with the service categories it actually covers.
 *
 * ⚠️ THE COVERAGE LIST IS THE ANSWER TO "WHAT DOES DECIDING THIS CHANGE". A credential carries
 * `service_entity_ids` — the categories it is evidence for — and the platform can say, for each of them,
 * whether the provider still has verified coverage once this credential is revoked: either this credential
 * or another one that also covers that category. That is computed from real rows rather than asserted, and
 * it is what the review page prints before the operator decides.
 *
 * ⚠️ AND THE PAGE SAYS WHAT IT DOES NOT DO. Matching does not read credentials today: `provider_services`
 * is what makes a provider eligible for a category, and nothing withdraws it automatically. Approving or
 * revoking a credential therefore changes the platform's record of coverage and recomputes the provider's
 * readiness — it does not silently switch matching off, and claiming otherwise in the console would be the
 * console's lie rather than the platform's behaviour.
 */
create or replace function public.admin_credential_case_command(p_credential_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  c public.provider_credentials%rowtype;
  prov public.providers%rowtype;
  owner_account public.accounts%rowtype;
  services jsonb := '[]'::jsonb;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into c from public.provider_credentials where id = p_credential_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;
  select * into prov from public.providers where id = c.provider_id;
  select * into owner_account from public.accounts where id = prov.owner_account_id;

  select coalesce(jsonb_agg(entry order by entry ->> 'service_name'), '[]'::jsonb)
    into services
  from (
    select jsonb_build_object(
      'service_entity_id', s.service_entity_id,
      'service_name', s.display_name,
      'covered_by_this_credential', (c.status = 'verified' and (c.expires_at is null or c.expires_at >= current_date)),
      'covered_by_another_credential', exists (
        select 1
        from public.provider_credentials c2
        where c2.provider_id = c.provider_id
          and c2.id <> c.id
          and c2.status = 'verified'
          and (c2.expires_at is null or c2.expires_at >= current_date)
          and s.service_entity_id = any(c2.service_entity_ids)
      ),
      'provider_offers_it', exists (
        select 1 from public.provider_services ps
        where ps.provider_id = c.provider_id and ps.service_entity_id = s.service_entity_id and ps.is_active
      )
    ) as entry
    from public.public_service_catalog s
    where s.service_entity_id = any(c.service_entity_ids)
  ) x;

  select jsonb_build_object(
    'allowed', true,
    'found', true,
    'policy_versions', app_private.trust_policy_versions(),
    'credential', jsonb_build_object(
      'id', c.id,
      'provider_id', c.provider_id,
      'credential_type', c.credential_type,
      'issuing_body', c.issuing_body,
      'jurisdiction_code', c.jurisdiction_code,
      'reference_label', c.reference_label,
      'document_reference', c.document_reference,
      'expires_at', c.expires_at,
      'status', c.status::text,
      'submitted_at', c.submitted_at,
      'reviewed_at', c.reviewed_at,
      'review_note', c.review_note,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ),
    'provider', jsonb_build_object(
      'id', prov.id,
      'display_name', prov.display_name,
      'status', prov.status::text,
      'is_public', coalesce((select pp.is_public from public.provider_public_profiles pp where pp.provider_id = prov.id), false),
      'public_slug', (select pp.slug from public.provider_public_profiles pp where pp.provider_id = prov.id),
      'market_code', (select mc.code from public.public_market_catalog mc where mc.market_id = prov.primary_market_id),
      'market_name', (select mc.display_name from public.public_market_catalog mc where mc.market_id = prov.primary_market_id)
    ),
    'owner', jsonb_build_object(
      'account_id', owner_account.id,
      'display_name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = owner_account.id)), ''), 'Account holder'),
      'contact_masked', app_private.mask_email((select u.email from auth.users u where u.id = owner_account.auth_user_id)),
      'account_status', owner_account.status::text
    ),
    'services', services,
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'decision', d.decision,
               'reason_code', d.reason_code,
               'note', d.note,
               'policy_version', d.policy_version,
               'expires_at', d.expires_at,
               'decided_at', d.decided_at,
               'decided_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = d.decided_by_account_id)), ''), 'An operator')
             ) order by d.decided_at desc)
      from public.provider_credential_decisions d
      where d.credential_id = c.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.admin_credential_case_command(uuid) from public, anon;
grant execute on function public.admin_credential_case_command(uuid) to authenticated;

comment on function public.admin_credential_case_command(uuid) is
  'One credential in full: issuer, jurisdiction, document reference, expiry, the service categories it covers with whether something else still covers them, and the decision history.';

-- ── The credential queue ───────────────────────────────────────────────────────────────────────

create or replace function public.admin_credential_queue_command(
  p_status text default null,
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
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_status is not null and p_status <> '' and p_status not in ('all', 'pending', 'verified', 'rejected', 'expired', 'not_started') then
    raise exception 'unknown credential status' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc), '[]'::jsonb)
    into result
  from (
    select
      c.id as credential_id,
      c.provider_id,
      c.credential_type,
      c.issuing_body,
      c.jurisdiction_code,
      c.reference_label,
      c.expires_at,
      c.status::text as status,
      c.submitted_at,
      c.reviewed_at,
      c.review_note,
      pr.display_name as provider_name,
      pr.status::text as provider_status,
      (select count(*)::integer from public.provider_credential_decisions d where d.credential_id = c.id) as decision_count,
      (c.expires_at is not null and c.expires_at < current_date) as expired,
      (c.expires_at is not null and c.expires_at >= current_date and c.expires_at <= current_date + 30) as expiring_soon,
      cardinality(coalesce(c.service_entity_ids, '{}'::uuid[])) as service_count
    from public.provider_credentials c
    join public.providers pr on pr.id = c.provider_id
    where (p_status is null or p_status = '' or p_status = 'all' or c.status::text = p_status)
      and (needle = '' or lower(pr.display_name) like '%' || needle || '%' or lower(c.issuing_body) like '%' || needle || '%')
    order by c.submitted_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) x;

  return jsonb_build_object('allowed', true, 'credentials', result, 'status', p_status, 'search', p_search);
end $$;

revoke all on function public.admin_credential_queue_command(text, text, integer) from public, anon;
grant execute on function public.admin_credential_queue_command(text, text, integer) to authenticated;

comment on function public.admin_credential_queue_command(text, text, integer) is
  'Credential submissions with their provider, issuer, jurisdiction, expiry and how many decisions have been recorded against each.';

-- ── The moderation and safety queue ────────────────────────────────────────────────────────────

/**
 * The case queue, with its participants, evidence references and SLA.
 *
 * ⚠️ PARTICIPANTS ARE MASKED CONTACTS AND REAL NAMES, LIKE EVERYWHERE ELSE IN THIS CONSOLE. A moderator has
 * to know they are looking at the right person; they do not need the person's address on a screen they may
 * share, and the audited reveal on the account page is one link away.
 *
 * ⚠️ `overdue` IS COMPUTED, NOT ASSERTED. A case is over its SLA when its own deadline has passed and it is
 * not resolved. Nothing chases it on the platform's behalf, and the queue says so rather than implying a
 * notification went out.
 */
create or replace function public.admin_trust_cases_command(
  p_state text default null,
  p_severity text default null,
  p_case_type text default null,
  p_assignee_account_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  result jsonb;
  reviewers jsonb;
  counts jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by
           case entry ->> 'severity' when 'critical' then 1 when 'medium' then 2 else 3 end,
           entry ->> 'sla_due_at' nulls last,
           entry ->> 'created_at' desc), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'id', c.id,
      'case_type', c.case_type,
      'severity', c.severity,
      'state', c.state,
      'summary', c.summary,
      'source', c.source,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'sla_due_at', c.sla_due_at,
      'overdue', (c.sla_due_at is not null and c.sla_due_at < now() and c.state not in ('resolved','closed')),
      'legal_hold', c.legal_hold,
      'legal_hold_reason', c.legal_hold_reason,
      'legal_hold_at', c.legal_hold_at,
      'legal_hold_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = c.legal_hold_by_account_id)), ''), null),
      'resolution', c.resolution,
      'closed_at', c.closed_at,
      'assigned_account_id', c.assigned_account_id,
      'assigned_to', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = c.assigned_account_id)), ''), null),
      'reporter', case when c.reporter_account_id is null then null else jsonb_build_object(
        'account_id', c.reporter_account_id,
        'name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = c.reporter_account_id)), ''), 'Account holder'),
        'contact_masked', app_private.mask_email((select u.email from auth.users u join public.accounts a on a.auth_user_id = u.id where a.id = c.reporter_account_id))
      ) end,
      'subject_account', case when c.subject_account_id is null then null else jsonb_build_object(
        'account_id', c.subject_account_id,
        'name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = c.subject_account_id)), ''), 'Account holder'),
        'contact_masked', app_private.mask_email((select u.email from auth.users u join public.accounts a on a.auth_user_id = u.id where a.id = c.subject_account_id)),
        'account_status', (select a.status::text from public.accounts a where a.id = c.subject_account_id)
      ) end,
      'subject_provider', case when c.subject_provider_id is null then null else jsonb_build_object(
        'provider_id', c.subject_provider_id,
        'name', (select pr.display_name from public.providers pr where pr.id = c.subject_provider_id),
        'status', (select pr.status::text from public.providers pr where pr.id = c.subject_provider_id)
      ) end,
      'subject_request', case when c.subject_request_id is null then null else jsonb_build_object(
        'request_id', c.subject_request_id,
        'title', (select coalesce(nullif(btrim(r.need_text), ''), 'Request') from public.requests r where r.id = c.subject_request_id),
        'state', (select r.state::text from public.requests r where r.id = c.subject_request_id)
      ) end,
      'evidence', coalesce((
        select jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.kind::text, 'submitted_at', w.submitted_at, 'assignment_id', w.assignment_id) order by w.submitted_at desc)
        from public.work_evidence w
        where w.id = any(c.evidence_ids)
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'event_type', e.event_type,
                 'reason_code', e.reason_code,
                 'note', e.note,
                 'occurred_at', e.occurred_at,
                 'actor', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = e.actor_account_id)), ''), 'An operator')
               ) order by e.occurred_at desc)
        from (
          select * from public.platform_trust_case_events
          where case_id = c.id
          order by occurred_at desc limit 8
        ) e
      ), '[]'::jsonb)
    ) as entry
    from public.platform_trust_cases c
    where (p_state is null or p_state = '' or p_state = 'all' or c.state = p_state)
      and (p_severity is null or p_severity = '' or c.severity = p_severity)
      and (p_case_type is null or p_case_type = '' or c.case_type = p_case_type)
      and (p_assignee_account_id is null or c.assigned_account_id = p_assignee_account_id)
    order by
      case c.severity when 'critical' then 1 when 'medium' then 2 else 3 end,
      c.sla_due_at nulls last,
      c.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) x;

  select jsonb_build_object(
    'open', (select count(*) from public.platform_trust_cases where state = 'open'),
    'investigating', (select count(*) from public.platform_trust_cases where state = 'investigating'),
    'awaiting_response', (select count(*) from public.platform_trust_cases where state = 'awaiting_response'),
    'escalated', (select count(*) from public.platform_trust_cases where state = 'escalated'),
    'held', (select count(*) from public.platform_trust_cases where legal_hold and state not in ('resolved','closed')),
    'overdue', (select count(*) from public.platform_trust_cases where sla_due_at is not null and sla_due_at < now() and state not in ('resolved','closed')),
    'unassigned', (select count(*) from public.platform_trust_cases where assigned_account_id is null and state not in ('resolved','closed')),
    'closed', (select count(*) from public.platform_trust_cases where state in ('resolved','closed'))
  ) into counts;

  -- `distinct on` because a role may hold both trust capabilities, which would otherwise list the same
  -- person twice in a picker and make the queue look like it has more reviewers than it does.
  select coalesce(jsonb_agg(entry order by entry ->> 'name'), '[]'::jsonb)
    into reviewers
  from (
    select distinct on (m.account_id)
      jsonb_build_object('account_id', m.account_id, 'name', coalesce(nullif(btrim(p.display_name), ''), 'Administrator'), 'role', r.display_name) as entry
    from public.platform_admin_memberships m
    join public.platform_roles r on r.id = m.role_id
    join public.platform_role_capabilities rc on rc.role_id = m.role_id
    left join public.profiles p on p.account_id = m.account_id
    where m.status = 'active' and m.revoked_at is null and rc.capability in ('platform.trust.verify', 'platform.trust.moderate')
    order by m.account_id, r.display_name
  ) reviewers_x;

  return jsonb_build_object('allowed', true, 'cases', result, 'counts', counts, 'reviewers', reviewers);
end $$;

revoke all on function public.admin_trust_cases_command(text, text, text, uuid, integer) from public, anon;
grant execute on function public.admin_trust_cases_command(text, text, text, uuid, integer) to authenticated;

comment on function public.admin_trust_cases_command(text, text, text, uuid, integer) is
  'The moderation and safety queue: masked participants, evidence references, SLA state, assignee, legal hold and the append-only case history.';

-- ── Deciding a verification ────────────────────────────────────────────────────────────────────

/**
 * The one way a verification is decided.
 *
 * ⚠️ IT REPLACES THE REASON-LESS PATH RATHER THAN SITTING BESIDE IT. The old command wrote a status and an
 * optional note; this one requires a reason code from the platform's own vocabulary, a note of at least ten
 * characters, and a second factor on the session. `review_provider_verification_command` is revoked at the
 * bottom of this file, so there is no longer a way to decide a submission without saying why.
 *
 * ⚠️ TWO DECISIONS DO NOT MOVE THE STATUS, AND THAT IS DELIBERATE. "Request additional proof" and "escalate
 * to a trust lead" are things an operator did; the submission is still pending. Writing them into the
 * decision history — and, for a request, into the note the provider reads — keeps the case open while
 * making sure the next reviewer can see that somebody has already been here.
 */
create or replace function public.decide_provider_verification_command(
  p_verification_id uuid,
  p_decision text,
  p_reason_code text,
  p_note text,
  p_policy_version text,
  p_expires_at timestamptz default null,
  p_assignee_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  v public.provider_verifications%rowtype;
  decision_id uuid;
  -- ⚠️ `note_text` AND `policy_text`, NOT `note` AND `policy`: the decision tables have columns with those
  -- shorter names, and a PL/pgSQL variable that shadows a column makes the statement ambiguous — an error at
  -- the worst possible moment, on the write that records a decision.
  note_text text := btrim(coalesce(p_note, ''));
  policy_text text := nullif(btrim(coalesce(p_policy_version, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to review verifications' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected', 'information_requested', 'escalated') then
    raise exception 'that is not a verification decision this platform records' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('verification_decision', p_reason_code) then
    raise exception 'choose a reason for this decision' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if policy_text is null then
    raise exception 'the policy version this decision was made under is required' using errcode = '22023';
  end if;
  if p_decision = 'escalated' then
    if p_assignee_account_id is null then
      raise exception 'an escalation needs the person it goes to' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.platform_admin_memberships m
      join public.platform_role_capabilities rc on rc.role_id = m.role_id
      where m.account_id = p_assignee_account_id
        and m.status = 'active' and m.revoked_at is null
        and rc.capability in ('platform.trust.verify', 'platform.trust.moderate')
    ) and not exists (select 1 from public.platform_ownership o where o.owner_account_id = p_assignee_account_id) then
      raise exception 'that person cannot open a verification case' using errcode = '22023';
    end if;
  end if;

  select * into v from public.provider_verifications where id = p_verification_id for update;
  if not found then raise exception 'verification not found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then
    raise exception 'this submission is not awaiting review' using errcode = '22023';
  end if;

  if p_decision = 'verified' then
    update public.provider_verifications
       set status = 'verified',
           reviewed_at = now(),
           verified_at = now(),
           expires_at = p_expires_at,
           metadata = (coalesce(metadata, '{}'::jsonb) - 'review_note') || jsonb_build_object('review_note', note_text),
           updated_at = now()
     where id = v.id;
    perform app_private.refresh_provider_onboarding(v.provider_id);
    perform app_private.compute_provider_search_readiness(v.provider_id);
  elsif p_decision = 'rejected' then
    update public.provider_verifications
       set status = 'rejected',
           reviewed_at = now(),
           verified_at = null,
           expires_at = p_expires_at,
           metadata = (coalesce(metadata, '{}'::jsonb) - 'review_note') || jsonb_build_object('review_note', note_text),
           updated_at = now()
     where id = v.id;
    perform app_private.refresh_provider_onboarding(v.provider_id);
    perform app_private.compute_provider_search_readiness(v.provider_id);
  elsif p_decision = 'information_requested' then
    -- The provider reads `review_note` in their own workspace, which is how a request for proof reaches
    -- them: the platform sends no email, and this is the channel that exists.
    update public.provider_verifications
       set metadata = (coalesce(metadata, '{}'::jsonb) - 'review_note') || jsonb_build_object('review_note', note_text),
           updated_at = now()
     where id = v.id;
  end if;

  insert into public.provider_verification_decisions(
    verification_id, provider_id, decision, reason_code, note, policy_version, expires_at, assigned_to_account_id, decided_by_account_id
  ) values (
    v.id, v.provider_id, p_decision, p_reason_code, note_text, policy_text,
    case when p_decision in ('verified','rejected') then p_expires_at else null end,
    p_assignee_account_id, me
  ) returning id into decision_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user',
          case p_decision
            when 'verified' then 'PROVIDER_VERIFICATION_APPROVED'
            when 'rejected' then 'PROVIDER_VERIFICATION_REJECTED'
            when 'information_requested' then 'PROVIDER_VERIFICATION_PROOF_REQUESTED'
            else 'PROVIDER_VERIFICATION_ESCALATED'
          end,
          'provider_verification', v.id, p_reason_code, 'regulated_sensitive',
          jsonb_build_object('provider_id', v.provider_id, 'kind', v.kind, 'policy_version', policy_text,
                             'expires_at', p_expires_at, 'assigned_to', p_assignee_account_id,
                             'decision_id', decision_id));

  return decision_id;
end $$;

revoke all on function public.decide_provider_verification_command(uuid, text, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.decide_provider_verification_command(uuid, text, text, text, text, timestamptz, uuid) to authenticated;

comment on function public.decide_provider_verification_command(uuid, text, text, text, text, timestamptz, uuid) is
  'Decides a verification: verified, rejected, more proof requested or escalated to a trust lead. Requires a second factor, a reason code, a note and the policy version; appends an immutable decision row.';

-- ── Deciding a credential ──────────────────────────────────────────────────────────────────────

/**
 * Verify, reject, revoke or ask about a credential.
 *
 * ⚠️ A REVOCATION IS STORED AS A REJECTED STATUS WITH A `revoked` DECISION ROW, AND THE PAGE SAYS SO.
 * `verification_status` — the enum this column uses — has no `revoked` value, and adding one would need a
 * separate migration because the new value could not be used in the same transaction that created it. So
 * the credential reads "rejected" on the provider's own list while the decision history records that it was
 * withdrawn after being accepted, which is the distinction that actually matters to anybody asking later.
 *
 * ⚠️ THE READINESS RECOMPUTATION IS REAL AND ITS LIMIT IS STATED. Approving or revoking recomputes the
 * provider's onboarding progress and search readiness from their rows, so the provider's own workspace moves
 * with the decision. Matching itself still reads `provider_services`, not credentials — the review page says
 * that in as many words rather than implying this switches eligibility off.
 */
create or replace function public.decide_provider_credential_command(
  p_credential_id uuid,
  p_decision text,
  p_reason_code text,
  p_note text,
  p_policy_version text,
  p_expires_at date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.provider_credentials%rowtype;
  decision_id uuid;
  note_text text := btrim(coalesce(p_note, ''));
  policy_text text := nullif(btrim(coalesce(p_policy_version, '')), '');
  next_status public.verification_status;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to review credentials' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected', 'revoked', 'information_requested') then
    raise exception 'that is not a credential decision this platform records' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('credential_decision', p_reason_code) then
    raise exception 'choose a reason for this decision' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if policy_text is null then
    raise exception 'the policy version this decision was made under is required' using errcode = '22023';
  end if;
  select * into c from public.provider_credentials where id = p_credential_id for update;
  if not found then raise exception 'credential not found' using errcode = 'P0002'; end if;

  next_status := case
    when p_decision = 'verified' then 'verified'::public.verification_status
    when p_decision = 'information_requested' then 'pending'::public.verification_status
    else 'rejected'::public.verification_status
  end;

  update public.provider_credentials
     set status = next_status,
         expires_at = coalesce(p_expires_at, expires_at),
         reviewed_at = case when p_decision in ('verified','rejected','revoked') then now() else reviewed_at end,
         review_note = note_text,
         updated_at = now()
   where id = c.id;

  perform app_private.refresh_provider_onboarding(c.provider_id);
  perform app_private.compute_provider_search_readiness(c.provider_id);

  insert into public.provider_credential_decisions(
    credential_id, provider_id, decision, reason_code, note, policy_version, expires_at, decided_by_account_id
  ) values (
    c.id, c.provider_id, p_decision, p_reason_code, note_text, policy_text, coalesce(p_expires_at, c.expires_at), me
  ) returning id into decision_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user',
          case p_decision
            when 'verified' then 'PROVIDER_CREDENTIAL_VERIFIED'
            when 'rejected' then 'PROVIDER_CREDENTIAL_REJECTED'
            when 'revoked' then 'PROVIDER_CREDENTIAL_REVOKED'
            else 'PROVIDER_CREDENTIAL_INFORMATION_REQUESTED'
          end,
          'provider_credential', c.id, p_reason_code, 'regulated_sensitive',
          jsonb_build_object('provider_id', c.provider_id, 'credential_type', c.credential_type,
                             'policy_version', policy_text, 'expires_at', coalesce(p_expires_at, c.expires_at),
                             'service_entity_ids', to_jsonb(c.service_entity_ids), 'decision_id', decision_id));

  return decision_id;
end $$;

revoke all on function public.decide_provider_credential_command(uuid, text, text, text, text, date) from public, anon;
grant execute on function public.decide_provider_credential_command(uuid, text, text, text, text, date) to authenticated;

comment on function public.decide_provider_credential_command(uuid, text, text, text, text, date) is
  'Verifies, rejects, revokes or queries a credential with a second factor, a reason code, a note and the policy version; updates the credential, recomputes provider readiness and appends an immutable decision row.';

-- ── Case commands ──────────────────────────────────────────────────────────────────────────────

/**
 * Open a case.
 *
 * ⚠️ THIS IS THE INTAKE FOR REPORTS THAT ARRIVE OUTSIDE THE PLATFORM. There is no participant-facing report
 * form for an account-level complaint: the platform's own intake surfaces are evidence flags and project
 * issues, both of which stay where they are. Trust staff who receive something by email, by phone or from a
 * regulator need somewhere to put it, and "nowhere" is how a safety report becomes a memory.
 *
 * ⚠️ NO SECOND FACTOR HERE, AND THE REASON IS THE FAILURE MODE. Creating a case changes nothing about
 * anybody's access; refusing to record a safety report because the operator has not passed a prompt is the
 * one failure this queue cannot afford. The reason code is still required, and every state change that does
 * affect somebody keeps the factor.
 */
create or replace function public.create_trust_case_command(
  p_case_type text,
  p_severity text,
  p_summary text,
  p_source text,
  p_subject_account_id uuid,
  p_subject_provider_id uuid,
  p_subject_request_id uuid,
  p_evidence_ids uuid[],
  p_sla_due_at timestamptz,
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
  case_id uuid;
  summary_text text := btrim(coalesce(p_summary, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to open a trust case' using errcode = '42501';
  end if;
  if p_case_type not in ('safety','abuse','harassment','policy_violation','fraud','dispute','other') then
    raise exception 'unknown case type' using errcode = '22023';
  end if;
  if p_severity not in ('low','medium','critical') then
    raise exception 'unknown case severity' using errcode = '22023';
  end if;
  if p_source not in ('report','operator','system') then
    raise exception 'unknown case source' using errcode = '22023';
  end if;
  if char_length(summary_text) < 10 then
    raise exception 'a case summary of at least ten characters is required' using errcode = '22023';
  end if;
  if p_subject_account_id is null and p_subject_provider_id is null and p_subject_request_id is null then
    raise exception 'a case has to be about an account, a provider or a request' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('trust_case_action', p_reason_code) then
    raise exception 'choose a reason for opening this case' using errcode = '22023';
  end if;

  insert into public.platform_trust_cases(
    case_type, severity, state, summary, source, subject_account_id, subject_provider_id, subject_request_id,
    evidence_ids, sla_due_at, created_by_account_id
  ) values (
    p_case_type, p_severity, 'open', summary_text, p_source, p_subject_account_id, p_subject_provider_id, p_subject_request_id,
    coalesce(p_evidence_ids, '{}'::uuid[]), p_sla_due_at, me
  ) returning id into case_id;

  insert into public.platform_trust_case_events(case_id, event_type, reason_code, note, actor_account_id)
  values (case_id, 'created', p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), me);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'TRUST_CASE_OPENED', 'platform_trust_case', case_id, p_reason_code, 'restricted',
          jsonb_build_object('case_type', p_case_type, 'severity', p_severity, 'source', p_source,
                             'subject_account_id', p_subject_account_id, 'subject_provider_id', p_subject_provider_id,
                             'subject_request_id', p_subject_request_id));

  return case_id;
end $$;

revoke all on function public.create_trust_case_command(text, text, text, text, uuid, uuid, uuid, uuid[], timestamptz, text, text) from public, anon;
grant execute on function public.create_trust_case_command(text, text, text, text, uuid, uuid, uuid, uuid[], timestamptz, text, text) to authenticated;

/**
 * Assign or reassign a case.
 *
 * ⚠️ THE ASSIGNEE HAS TO BE ABLE TO OPEN IT. Assigning to somebody without a trust capability produces a
 * queue that says "assigned" while nobody is working, which is worse than leaving it unassigned where the
 * unassigned count would have caught it.
 */
create or replace function public.assign_trust_case_command(
  p_case_id uuid,
  p_assignee_account_id uuid,
  p_state text,
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
  c public.platform_trust_cases%rowtype;
  next_state text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.verify')
    or app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to assign a trust case' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('trust_case_action', p_reason_code) then
    raise exception 'choose a reason for this assignment' using errcode = '22023';
  end if;

  select * into c from public.platform_trust_cases where id = p_case_id for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if c.state in ('resolved','closed') then
    raise exception 'this case is closed; open a new one rather than reopening it' using errcode = '22023';
  end if;
  if p_assignee_account_id is not null then
    if not exists (
      select 1
      from public.platform_admin_memberships m
      join public.platform_role_capabilities rc on rc.role_id = m.role_id
      where m.account_id = p_assignee_account_id
        and m.status = 'active' and m.revoked_at is null
        and rc.capability in ('platform.trust.verify', 'platform.trust.moderate')
    ) and not exists (select 1 from public.platform_ownership o where o.owner_account_id = p_assignee_account_id) then
      raise exception 'that person cannot open a trust case' using errcode = '22023';
    end if;
  end if;
  next_state := coalesce(nullif(btrim(coalesce(p_state, '')), ''), case when c.assigned_account_id is null then 'investigating' else c.state end);
  if next_state not in ('open','investigating','awaiting_response','escalated') then
    raise exception 'that is not a state an open case can be moved to' using errcode = '22023';
  end if;

  update public.platform_trust_cases
     set assigned_account_id = p_assignee_account_id,
         state = next_state,
         updated_at = now()
   where id = c.id;

  insert into public.platform_trust_case_events(case_id, event_type, reason_code, note, actor_account_id)
  values (c.id, 'assigned', p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), me);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'TRUST_CASE_ASSIGNED', 'platform_trust_case', c.id, p_reason_code, 'restricted',
          jsonb_build_object('from_state', c.state, 'to_state', next_state,
                             'from_assignee', c.assigned_account_id, 'to_assignee', p_assignee_account_id,
                             'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

revoke all on function public.assign_trust_case_command(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.assign_trust_case_command(uuid, uuid, text, text, text) to authenticated;

/**
 * Place or lift a legal hold.
 *
 * ⚠️ THE HOLD IS ENFORCED WHERE IT BITES, AND THE PLACE IS STATED. It refuses the closure of this case while
 * it is on, and it refuses the REINSTATEMENT of the account the case is about — see
 * `change_account_standing_command` below. Both are rules in code rather than a note on a screen, because a
 * hold that nothing checks is a label.
 *
 * ⚠️ IT NEEDS A SECOND FACTOR AND A REASON CODE FROM THE HOLD VOCABULARY. Lifting one is as consequential
 * as placing it: it is the moment the platform says it is safe to move on.
 */
create or replace function public.set_trust_case_legal_hold_command(
  p_case_id uuid,
  p_hold boolean,
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
  c public.platform_trust_cases%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to hold a trust case' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid(
       case when p_hold then 'trust_case_hold' else 'trust_case_hold_lift' end, p_reason_code) then
    raise exception 'choose a reason for %', case when p_hold then 'this legal hold' else 'lifting this hold' end
      using errcode = '22023';
  end if;

  select * into c from public.platform_trust_cases where id = p_case_id for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if c.legal_hold = p_hold then
    raise exception 'that hold is already in that state' using errcode = '22023';
  end if;

  update public.platform_trust_cases
     set legal_hold = p_hold,
         legal_hold_reason = case when p_hold then p_reason_code else null end,
         legal_hold_at = case when p_hold then now() else null end,
         legal_hold_by_account_id = case when p_hold then me else null end,
         updated_at = now()
   where id = c.id;

  insert into public.platform_trust_case_events(case_id, event_type, reason_code, note, actor_account_id)
  values (c.id, case when p_hold then 'legal_hold_placed' else 'legal_hold_lifted' end, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), me);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', case when p_hold then 'TRUST_CASE_LEGAL_HOLD_PLACED' else 'TRUST_CASE_LEGAL_HOLD_LIFTED' end,
          'platform_trust_case', c.id, p_reason_code, 'restricted',
          jsonb_build_object('note', nullif(btrim(coalesce(p_note, '')), ''), 'subject_account_id', c.subject_account_id));
end $$;

revoke all on function public.set_trust_case_legal_hold_command(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_trust_case_legal_hold_command(uuid, boolean, text, text) to authenticated;

/**
 * Close a case with its resolution.
 *
 * ⚠️ A HELD CASE CANNOT BE CLOSED. The hold means "preserve this"; closing it would tidy away the record
 * somebody asked us to keep. The refusal names the way forward rather than being a wall.
 */
create or replace function public.close_trust_case_command(
  p_case_id uuid,
  p_resolution text,
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
  c public.platform_trust_cases%rowtype;
  resolution_text text := btrim(coalesce(p_resolution, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to close a trust case' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('trust_case_closure', p_reason_code) then
    raise exception 'choose a resolution code for this case' using errcode = '22023';
  end if;
  if char_length(resolution_text) < 10 then
    raise exception 'a resolution of at least ten characters is required' using errcode = '22023';
  end if;

  select * into c from public.platform_trust_cases where id = p_case_id for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if c.state in ('resolved','closed') then
    raise exception 'this case is already closed' using errcode = '22023';
  end if;
  if c.legal_hold then
    raise exception 'this case is under a legal hold: lift the hold before closing it' using errcode = '22023';
  end if;

  update public.platform_trust_cases
     set state = 'resolved',
         resolution = resolution_text,
         closed_by_account_id = me,
         closed_at = now(),
         updated_at = now()
   where id = c.id;

  insert into public.platform_trust_case_events(case_id, event_type, reason_code, note, actor_account_id)
  values (c.id, 'resolved', p_reason_code, resolution_text, me);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'TRUST_CASE_RESOLVED', 'platform_trust_case', c.id, p_reason_code, 'restricted',
          jsonb_build_object('resolution', resolution_text, 'note', nullif(btrim(coalesce(p_note, '')), ''),
                             'case_type', c.case_type, 'subject_account_id', c.subject_account_id));
end $$;

revoke all on function public.close_trust_case_command(uuid, text, text, text) from public, anon;
grant execute on function public.close_trust_case_command(uuid, text, text, text) to authenticated;

-- ── The legal hold, enforced where it bites ────────────────────────────────────────────────────

/**
 * Redefined: an account cannot be reinstated while a held case about it is open, and a standing change can
 * name the case that caused it.
 *
 * ⚠️ THE OLD FOUR-ARGUMENT SIGNATURE IS DROPPED, NOT LEFT BESIDE THIS ONE. Two live versions of a command
 * that suspends people is two decision paths, and the older one would keep working from any caller that
 * still knew its shape. Everything in the body is the version this replaces, plus the two additions.
 *
 * ⚠️ WHY THIS IS WHERE A HOLD BITES. The platform freezes payouts for a project case (see
 * `request_my_payout_command`), which needs an assignment to hang the hold on. A trust case may have no
 * assignment at all, so the interlock that always exists is this one: while the case is held, the account it
 * is about cannot be put back into service. Lifting the hold is the operator's deliberate act, with a reason
 * code, and it is what makes the hold a control rather than a label.
 */
drop function if exists public.change_account_standing_command(uuid, text, text, text);

create or replace function public.change_account_standing_command(
  p_account_id uuid,
  p_status text,
  p_reason_code text,
  p_note text,
  p_case_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  target public.accounts%rowtype;
  previous text;
  linked_case public.platform_trust_cases%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.support.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to change an account standing' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'closed') then
    raise exception 'that is not a standing this platform records' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('account_standing', p_reason_code) then
    raise exception 'choose a reason for changing this standing' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;

  select * into target from public.accounts where id = p_account_id for update;
  if not found then raise exception 'account not found' using errcode = 'P0002'; end if;
  if target.id = me then
    raise exception 'an operator cannot change their own account standing' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_ownership o where o.owner_account_id = target.id) then
    raise exception 'the platform owner account cannot be suspended or closed' using errcode = '42501';
  end if;

  previous := target.status::text;
  if previous = p_status then
    raise exception 'this account already has that standing' using errcode = '22023';
  end if;

  if p_case_id is not null then
    select * into linked_case from public.platform_trust_cases where id = p_case_id;
    if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
    if linked_case.subject_account_id is distinct from target.id then
      raise exception 'that case is not about this account' using errcode = '22023';
    end if;
  end if;

  -- The hold interlock, in the one direction that matters: back into service.
  if p_status = 'active' and exists (
    select 1 from public.platform_trust_cases c
    where c.subject_account_id = target.id
      and c.legal_hold
      and c.state not in ('resolved','closed')
  ) then
    raise exception 'a legal hold on a case about this account has to be lifted before it can be reinstated' using errcode = '22023';
  end if;

  update public.accounts set status = p_status::public.account_status where id = target.id;

  -- Ending the sessions is belt to the authority check's braces: the account is already refused by
  -- every policy, but a refresh would otherwise mint a token that still cannot read anything.
  if p_status <> 'active' then
    delete from auth.refresh_tokens
     where session_id in (select id from auth.sessions where user_id = target.auth_user_id);
    delete from auth.sessions where user_id = target.auth_user_id;
  end if;

  if p_case_id is not null then
    insert into public.platform_trust_case_events(case_id, event_type, reason_code, note, actor_account_id)
    values (
      p_case_id,
      case when p_status = 'active' then 'account_reinstated' else 'account_restricted' end,
      p_reason_code, btrim(p_note), me
    );
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'ACCOUNT_STANDING_CHANGED', 'account', target.id, p_reason_code, 'restricted',
          jsonb_build_object('from', previous, 'to', p_status, 'note', btrim(p_note),
                             'sessions_ended', p_status <> 'active', 'trust_case_id', p_case_id));
end $$;

revoke all on function public.change_account_standing_command(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.change_account_standing_command(uuid, text, text, text, uuid) to authenticated;

comment on function public.change_account_standing_command(uuid, text, text, text, uuid) is
  'Suspends, reactivates or closes an account. Requires a second factor, a reason code and a note; refuses the platform owner and the caller''s own account; refuses reinstatement while a held case about the account is open; optionally records the trust case that prompted it.';

-- ── One decision path for verifications ───────────────────────────────────────────────────────

/**
 * ⚠️ THE REASON-LESS REVIEW COMMAND IS WITHDRAWN. `review_provider_verification_command` took a decision and
 * an optional note and nothing else; leaving it callable would mean a verification could be approved without
 * a reason code, a policy version or a second factor, through the same door the console uses. Its wrapper is
 * revoked and the private implementation is left in place but unreachable from a client, so a rollback of
 * this file restores the old path rather than leaving a hole where it was.
 *
 * The admin queue page calls `decide_provider_verification_command` instead — one path, always reason-coded.
 */
revoke all on function public.review_provider_verification_command(uuid, public.verification_status, text) from public, anon, authenticated;
revoke all on function app_private.review_provider_verification_authoritatively(uuid, public.verification_status, text) from public, anon, authenticated;

comment on function public.review_provider_verification_command(uuid, public.verification_status, text) is
  'Withdrawn from clients in 20260923270000: use decide_provider_verification_command, which requires a reason code, a note, a policy version and a second factor.';
