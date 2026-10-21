-- Admin money operations: the payment and reconciliation monitor, the ledger inspector, payout operations, and
-- the refund and chargeback queue.
--
-- ── FOUR RULES THIS MIGRATION EXISTS TO ENFORCE ────────────────────────────────────────────────
--
-- 1. THE LEDGER IS APPEND-ONLY, AND THERE IS NOTHING TO EDIT WITH. `ledger_entries` has no insert, update or
--    delete grant for an authenticated caller, and no function here ever updates one. A correction is a NEW
--    balanced transaction — `post_ledger_adjustment_command` below is the only way an operator can move a
--    number, and it has to balance.
--
-- 2. RECONCILIATION IS THE PROVIDER'S, NOT OURS. An event that the provider signed and that matches the
--    attempt is canonically true; a mismatch is recorded as a mismatch and no ledger entry is written. The
--    retry command re-runs that same comparison — it does not decide that a mismatch is acceptable.
--
-- 3. A HOLD IS A ROW WITH A REASON, NOT A FLAG SOMEBODY SET. `platform_payout_holds` carries who placed it, on
--    what policy reason, with what support reference, and who released it and why. The payout row mirrors the
--    live hold so execution is actually blocked, and the mirror is derived from the holds table, never typed.
--
-- 4. EVERY DECISION HERE NEEDS A REASON CODE, A NOTE AND A SECOND FACTOR. Money is the one domain where
--    "somebody clicked something" is never an acceptable record.

-- ── The reason vocabulary, extended ────────────────────────────────────────────────────────────

/**
 * Redefined with the money scopes added.
 *
 * ⚠️ THE WHOLE FUNCTION IS REPEATED, as in the two migrations before this one: it is the single list the
 * database validates against, and a partial definition would silently drop scopes other consoles offer.
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
    )
  );
$$;

-- ── Payout holds ───────────────────────────────────────────────────────────────────────────────

/**
 * A policy hold on one payout, and the record of it being released.
 *
 * ⚠️ THE PAYOUT ROW MIRRORS THE LIVE HOLD RATHER THAN HOLDING THE TRUTH. `payouts.status` and `block_reason` are
 * what the execution path reads, so a hold has to reach them; but the sentence "we stopped this because a
 * compliance check was running, on this date, with this reference" lives here, where it can be released
 * properly instead of being overwritten by the next eligibility refresh.
 */
create table public.platform_payout_holds (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 3 and 200),
  placed_by_account_id uuid not null references public.accounts(id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_at timestamptz,
  released_by_account_id uuid references public.accounts(id) on delete restrict,
  release_reason_code text,
  release_note text check (release_note is null or char_length(btrim(release_note)) between 1 and 2000),
  check (released_at is null or released_at >= placed_at),
  check ((released_at is null) = (released_by_account_id is null))
);

create index platform_payout_holds_live_idx on public.platform_payout_holds(payout_id) where released_at is null;
-- One live hold per payout. A second concurrent reason is a correction to the first, and two live rows would
-- leave the payout page unable to say why the money is stopped.
create unique index platform_payout_holds_one_live_uq on public.platform_payout_holds(payout_id) where released_at is null;

alter table public.platform_payout_holds enable row level security;
create policy platform_payout_holds_finance_read on public.platform_payout_holds
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.payout')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_payout_holds from anon;
revoke insert, update, delete on public.platform_payout_holds from authenticated;
grant select on public.platform_payout_holds to authenticated;

comment on table public.platform_payout_holds is
  'A policy hold on a payout with its reason code, support reference, author and release. The live row is mirrored onto payouts.status/block_reason so execution is genuinely blocked.';

-- ── Approved offset entries ────────────────────────────────────────────────────────────────────

/**
 * The record of a correction, pointing at the ledger transaction it posted.
 *
 * ⚠️ IT STORES THE TRANSACTION ID, WHICH IS THE WHOLE POINT. The correction is in the ledger, balanced and
 * append-only; this row is the narrative beside it — why, on whose authority, with what reference. Nothing here
 * touches an existing entry.
 */
create table public.platform_ledger_adjustments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.payment_obligations(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  direction text not null check (direction in ('reduce_provider_payable', 'increase_provider_payable')),
  ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 3 and 200),
  executed_by_account_id uuid not null references public.accounts(id) on delete restrict,
  executed_at timestamptz not null default now()
);

create index platform_ledger_adjustments_obligation_idx on public.platform_ledger_adjustments(obligation_id, executed_at desc);

alter table public.platform_ledger_adjustments enable row level security;
create policy platform_ledger_adjustments_finance_read on public.platform_ledger_adjustments
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.reconcile')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_ledger_adjustments from anon;
revoke insert, update, delete on public.platform_ledger_adjustments from authenticated;
grant select on public.platform_ledger_adjustments to authenticated;

comment on table public.platform_ledger_adjustments is
  'Approved offset entries: the narrative beside a balanced ledger transaction that corrects an obligation, with the reason code, the support reference and the operator.';

-- ── Money case decisions ───────────────────────────────────────────────────────────────────────

/**
 * A decision on a customer refund or dispute request, or on a provider chargeback.
 *
 * ⚠️ THE CASE ROW IS UPDATED AND THE DECISION IS APPENDED. The customer's request has a status because people
 * need to see where it stands; what an auditor reads later is this table, which keeps every decision with its
 * reason rather than the last one that happened to overwrite the row.
 */
create table public.platform_money_case_decisions (
  id uuid primary key default gen_random_uuid(),
  case_kind text not null check (case_kind in ('customer_request', 'provider_dispute')),
  case_id uuid not null,
  obligation_id uuid not null references public.payment_obligations(id) on delete restrict,
  action text not null check (action in ('approve_refund', 'reject_claim', 'request_evidence', 'record_chargeback_result')),
  amount_minor bigint,
  resolution text,
  reason_code text not null,
  note text not null check (char_length(btrim(note)) between 10 and 2000),
  evidence_reference text check (evidence_reference is null or char_length(btrim(evidence_reference)) between 3 and 200),
  refund_id uuid references public.payment_refunds(id) on delete set null,
  decided_by_account_id uuid not null references public.accounts(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create index platform_money_case_decisions_case_idx on public.platform_money_case_decisions(case_kind, case_id, decided_at desc);

alter table public.platform_money_case_decisions enable row level security;
create policy platform_money_case_decisions_finance_read on public.platform_money_case_decisions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.dispute_manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.platform_money_case_decisions from anon;
revoke insert, update, delete on public.platform_money_case_decisions from authenticated;
grant select on public.platform_money_case_decisions to authenticated;

-- ── Money case queue columns ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ "REQUEST ADDITIONAL EVIDENCE" NEEDS SOMEWHERE TO LIVE, AND IT IS NOT A NEW STATUS. The customer request
 * table has a status check of open/withdrawn/reviewed, and widening a check constraint on an existing table to
 * add `awaiting_evidence` would be a schema change for a state the participants do not need to see. Recording
 * when we asked keeps the request open — which is true, we are still working it — and lets the queue show
 * which ones are waiting on somebody else.
 */
alter table public.payment_dispute_requests
  add column if not exists evidence_requested_at timestamptz,
  add column if not exists evidence_request_note text;

-- ── The payment and reconciliation monitor ─────────────────────────────────────────────────────

/**
 * Every payment attempt with the state of its provider events and its reconciliation.
 *
 * ⚠️ THE UNIT IS THE ATTEMPT, NOT THE OBLIGATION. An obligation can be attempted more than once — a customer
 * whose first checkout failed — and "which attempt is the provider actually talking about" is the first
 * question anybody investigating a payment asks. The obligation's attempt count is carried alongside so
 * repeated attempts are visible without opening the record.
 *
 * ⚠️ THE ANOMALIES ARE DISAGREEMENTS BETWEEN THREE RECORDS: our attempt, the provider's event, and the ledger.
 * `unreconciled_event` means the provider told us something we have not acted on; `mismatch` means we looked and
 * refused it; `rejected_event` means the event failed its integrity check; `missing_event` means we consider the
 * attempt successful and the provider has never confirmed it. Each is a fact about those three rows, not a
 * judgement about the customer.
 */
create or replace function public.admin_payment_operations_command(
  p_status text default null,
  p_anomaly text default null,
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
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.reconcile')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_anomaly is not null and p_anomaly <> '' and
     p_anomaly not in ('any','unreconciled','mismatch','rejected','missing_event','stuck_funding','multiple_attempts') then
    raise exception 'unknown payment anomaly' using errcode = '22023';
  end if;

  with attempts as (
    select
      a.id as attempt_id,
      a.status::text as status,
      a.provider_adapter,
      a.provider_reference,
      a.checkout_reference,
      a.amount_minor,
      a.currency_code,
      a.created_at,
      a.updated_at,
      o.id as obligation_id,
      o.status::text as obligation_status,
      r.id as request_id,
      coalesce(nullif(btrim(r.need_text), ''), 'Request') as request_title,
      r.state::text as request_state,
      pr.id as provider_id,
      pr.display_name as provider_name,
      (select count(*) from public.payment_attempts a2 where a2.obligation_id = o.id) as attempt_count,
      ev.event_count,
      ev.last_event_type,
      ev.last_event_status,
      ev.unreconciled_count,
      rec.result as reconciliation_result,
      rec.reconciled_at,
      rec.details as reconciliation_details,
      array_remove(array[
        case when coalesce(ev.unreconciled_count, 0) > 0 then 'unreconciled_event' end,
        case when rec.result = 'mismatch' then 'mismatch' end,
        case when ev.rejected_count is not null and ev.rejected_count > 0 then 'rejected_event' end,
        case when a.status = 'succeeded' and rec.result is null then 'missing_event' end,
        case when o.status = 'funding' and a.created_at < now() - interval '1 hour' then 'stuck_funding' end,
        case when (select count(*) from public.payment_attempts a2 where a2.obligation_id = o.id) > 1 then 'multiple_attempts' end
      ], null) as anomalies
    from public.payment_attempts a
    join public.payment_obligations o on o.id = a.obligation_id
    join public.requests r on r.id = o.request_id
    left join public.providers pr on pr.id = o.provider_id
    left join lateral (
      select count(*) as event_count,
             (count(*) filter (where e.status in ('received','verified'))) as unreconciled_count,
             (count(*) filter (where e.status = 'rejected')) as rejected_count,
             (array_agg(e.event_type order by e.received_at desc))[1] as last_event_type,
             (array_agg(e.status::text order by e.received_at desc))[1] as last_event_status
      from public.payment_provider_events e
      where e.payment_attempt_id = a.id
    ) ev on true
    left join lateral (
      select rc.result, rc.reconciled_at, rc.details
      from public.payment_reconciliations rc
      where rc.payment_attempt_id = a.id
      order by rc.reconciled_at desc
      limit 1
    ) rec on true
    where (p_status is null or p_status = '' or p_status = 'any' or a.status::text = p_status)
      and (
        needle = ''
        or lower(coalesce(a.checkout_reference, '')) like '%' || needle || '%'
        or lower(coalesce(a.provider_reference, '')) like '%' || needle || '%'
        or lower(coalesce(r.need_text, '')) like '%' || needle || '%'
        or lower(coalesce(pr.display_name, '')) like '%' || needle || '%'
      )
  ),
  filtered as (
    select a.* from attempts a
    where p_anomaly is null or p_anomaly = '' or p_anomaly = 'any'
      or (p_anomaly = 'unreconciled' and a.anomalies && array['unreconciled_event']::text[])
      or (p_anomaly = 'mismatch' and a.anomalies && array['mismatch']::text[])
      or (p_anomaly = 'rejected' and a.anomalies && array['rejected_event']::text[])
      or (p_anomaly = 'missing_event' and a.anomalies && array['missing_event']::text[])
      or (p_anomaly = 'stuck_funding' and a.anomalies && array['stuck_funding']::text[])
      or (p_anomaly = 'multiple_attempts' and a.anomalies && array['multiple_attempts']::text[])
    order by array_length(a.anomalies, 1) desc nulls last, a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'attempt_id', f.attempt_id,
      'status', f.status,
      'provider_adapter', f.provider_adapter,
      'provider_reference', f.provider_reference,
      'checkout_reference', f.checkout_reference,
      'amount_minor', f.amount_minor,
      'currency_code', f.currency_code,
      'created_at', f.created_at,
      'updated_at', f.updated_at,
      'attempt_count', f.attempt_count,
      'obligation_id', f.obligation_id,
      'obligation_status', f.obligation_status,
      'project', jsonb_build_object('request_id', f.request_id, 'title', f.request_title, 'state', f.request_state),
      'provider', case when f.provider_id is null then null else jsonb_build_object('provider_id', f.provider_id, 'name', f.provider_name) end,
      'events', jsonb_build_object(
        'count', coalesce(f.event_count, 0),
        'last_event_type', f.last_event_type,
        'last_event_status', f.last_event_status,
        'unreconciled', coalesce(f.unreconciled_count, 0)
      ),
      'reconciliation', case when f.reconciliation_result is null then null else jsonb_build_object(
        'result', f.reconciliation_result,
        'reconciled_at', f.reconciled_at,
        'details', f.reconciliation_details
      ) end,
      'anomalies', to_jsonb(f.anomalies)
    ) order by array_length(f.anomalies, 1) desc nulls last, f.created_at desc), '[]'::jsonb),
    jsonb_build_object(
      'attempts', (select count(*) from attempts),
      'unreconciled', (select count(*) from attempts where anomalies && array['unreconciled_event']::text[]),
      'mismatched', (select count(*) from attempts where anomalies && array['mismatch']::text[]),
      'rejected', (select count(*) from attempts where anomalies && array['rejected_event']::text[]),
      'missing_event', (select count(*) from attempts where anomalies && array['missing_event']::text[]),
      'stuck_funding', (select count(*) from attempts where anomalies && array['stuck_funding']::text[])
    )
    into result, summary
  from filtered f;

  return jsonb_build_object('allowed', true, 'payments', result, 'counts', summary,
                            'status', p_status, 'anomaly', p_anomaly, 'search', p_search);
end $$;

revoke all on function public.admin_payment_operations_command(text, text, text, integer) from public, anon;
grant execute on function public.admin_payment_operations_command(text, text, text, integer) to authenticated;

comment on function public.admin_payment_operations_command(text, text, text, integer) is
  'Payment and reconciliation monitor: every attempt with its provider events, its reconciliation result and the disagreements between our record, the provider''s and the ledger.';

-- ── The immutable ledger inspector ─────────────────────────────────────────────────────────────

/**
 * One payment, from the provider's raw events through to the ledger lines they produced.
 *
 * ⚠️ THE LEDGER LINES ARE PRINTED AS THEY WERE WRITTEN, WITH THE TRANSACTION THEY BELONG TO. The page has no
 * control that edits or removes one, because no such path exists in the database: `ledger_entries` carries no
 * writable grant for an authenticated caller. A correction is a new balanced transaction, and the adjustments
 * listed here are exactly that.
 *
 * ⚠️ EVERY TRANSACTION IS CHECKED FOR BALANCE IN THE READ. A journal that does not sum to zero is not an
 * accounting record, so the inspector computes each transaction's net per currency and shows it rather than
 * leaving the reader to add up the lines.
 */
create or replace function public.admin_payment_ledger_command(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  a public.payment_attempts%rowtype;
  o public.payment_obligations%rowtype;
  r public.requests%rowtype;
  result jsonb;
  entries jsonb := '[]'::jsonb;
  balances jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.reconcile')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into a from public.payment_attempts where id = p_attempt_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;
  select * into o from public.payment_obligations where id = a.obligation_id;
  select * into r from public.requests where id = o.request_id;

  -- Every entry written against this obligation, with its transaction and account, in ledger order.
  select coalesce(jsonb_agg(entry order by entry ->> 'created_at', entry ->> 'entry_id'), '[]'::jsonb)
    into entries
  from (
    select jsonb_build_object(
      'entry_id', le.id,
      'transaction_id', le.transaction_id,
      'transaction_type', t.transaction_type,
      'idempotency_key', t.idempotency_key,
      'external_reference', t.external_reference,
      'account_id', le.ledger_account_id,
      'account_code', la.account_code,
      'account_kind', la.account_kind::text,
      'account_owner_kind', la.owner_kind::text,
      'amount_minor', le.amount_minor,
      'currency_code', le.currency_code,
      'created_at', le.created_at
    ) as entry
    from public.ledger_entries le
    join public.ledger_transactions t on t.id = le.transaction_id
    join public.ledger_accounts la on la.id = le.ledger_account_id
    where le.obligation_id = o.id
  ) e;

  select coalesce(jsonb_agg(entry order by entry ->> 'account_code'), '[]'::jsonb)
    into balances
  from (
    select jsonb_build_object(
      'account_code', la.account_code,
      'account_kind', la.account_kind::text,
      'currency_code', la.currency_code,
      'net_minor', sum(le.amount_minor),
      'entry_count', count(*)
    ) as entry
    from public.ledger_entries le
    join public.ledger_accounts la on la.id = le.ledger_account_id
    where le.obligation_id = o.id
    group by la.account_code, la.account_kind, la.currency_code
  ) b;

  select jsonb_build_object(
    'allowed', true,
    'found', true,
    'attempt', jsonb_build_object(
      'id', a.id,
      'status', a.status::text,
      'provider_adapter', a.provider_adapter,
      'provider_reference', a.provider_reference,
      'checkout_reference', a.checkout_reference,
      'amount_minor', a.amount_minor,
      'currency_code', a.currency_code,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    ),
    'obligation', jsonb_build_object(
      'id', o.id,
      'status', o.status::text,
      'amount_minor', o.amount_minor,
      'currency_code', o.currency_code,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'customer_account_id', o.customer_account_id,
      'provider_id', o.provider_id
    ),
    'project', jsonb_build_object(
      'request_id', r.id,
      'title', coalesce(nullif(btrim(r.need_text), ''), 'Request'),
      'state', r.state::text,
      'market_code', (select mc.code from public.public_market_catalog mc where mc.market_id = r.market_id)
    ),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a2.id, 'status', a2.status::text, 'provider_adapter', a2.provider_adapter,
               'checkout_reference', a2.checkout_reference, 'provider_reference', a2.provider_reference,
               'created_at', a2.created_at
             ) order by a2.created_at)
      from public.payment_attempts a2 where a2.obligation_id = o.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'provider_event_id', e.provider_event_id,
               'event_type', e.event_type,
               'status', e.status::text,
               'signature_verified', e.signature_verified,
               'payload_sha256', e.payload_sha256,
               'received_at', e.received_at,
               'verified_at', e.verified_at,
               'reconciled_at', e.reconciled_at,
               'rejection_reason', e.rejection_reason
             ) order by e.received_at desc)
      from public.payment_provider_events e where e.payment_attempt_id = a.id
    ), '[]'::jsonb),
    'reconciliations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', rc.id, 'result', rc.result, 'details', rc.details,
               'reconciled_at', rc.reconciled_at, 'ledger_transaction_id', rc.ledger_transaction_id
             ) order by rc.reconciled_at desc)
      from public.payment_reconciliations rc where rc.payment_attempt_id = a.id
    ), '[]'::jsonb),
    'entries', entries,
    'balances', balances,
    'transaction_balance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'transaction_id', b.transaction_id,
               'transaction_type', b.transaction_type,
               'currency_code', b.currency_code,
               'net_minor', b.net_minor,
               'balanced', b.net_minor = 0
             ) order by b.transaction_id)
      from (
        select le.transaction_id, t.transaction_type, le.currency_code, sum(le.amount_minor) as net_minor
        from public.ledger_entries le
        join public.ledger_transactions t on t.id = le.transaction_id
        where le.obligation_id = o.id
        group by le.transaction_id, t.transaction_type, le.currency_code
      ) b
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status::text, 'amount_minor', p.amount_minor, 'currency_code', p.currency_code,
               'provider_reference', p.provider_reference, 'block_reason', p.block_reason, 'created_at', p.created_at
             ) order by p.created_at desc)
      from public.payouts p where p.obligation_id = o.id
    ), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'status', f.status, 'amount_minor', f.amount_minor, 'currency_code', f.currency_code,
               'reason', f.reason, 'provider_reference', f.provider_reference, 'created_at', f.created_at,
               'updated_at', f.updated_at
             ) order by f.created_at desc)
      from public.payment_refunds f where f.obligation_id = o.id
    ), '[]'::jsonb),
    'disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'provider_dispute_id', d.provider_dispute_id, 'status', d.status,
               'amount_minor', d.amount_minor, 'currency_code', d.currency_code, 'reason', d.reason,
               'due_at', d.due_at, 'resolution', d.resolution, 'created_at', d.created_at
             ) order by d.created_at desc)
      from public.payment_disputes d where d.obligation_id = o.id
    ), '[]'::jsonb),
    'customer_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'kind', q.kind, 'message', q.message, 'status', q.status,
               'created_at', q.created_at, 'resolved_at', q.resolved_at,
               'evidence_requested_at', q.evidence_requested_at
             ) order by q.created_at desc)
      from public.payment_dispute_requests q where q.obligation_id = o.id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', adj.id, 'direction', adj.direction, 'amount_minor', adj.amount_minor,
               'currency_code', adj.currency_code, 'reason_code', adj.reason_code, 'note', adj.note,
               'evidence_reference', adj.evidence_reference, 'ledger_transaction_id', adj.ledger_transaction_id,
               'executed_at', adj.executed_at,
               'executed_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = adj.executed_by_account_id)), ''), 'An operator')
             ) order by adj.executed_at desc)
      from public.platform_ledger_adjustments adj where adj.obligation_id = o.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.admin_payment_ledger_command(uuid) from public, anon;
grant execute on function public.admin_payment_ledger_command(uuid) to authenticated;

comment on function public.admin_payment_ledger_command(uuid) is
  'One payment in full: attempt, obligation, project, every provider event, the reconciliation results, the immutable ledger entries with their balances and per-transaction balance check, and the refunds, disputes and adjustments around them.';

-- ── Payout operations ──────────────────────────────────────────────────────────────────────────

/**
 * Provider earnings, what is stopping each transfer, and where it would go.
 *
 * ⚠️ THE BLOCK REASON COMES FROM THE PLATFORM'S OWN ELIGIBILITY FUNCTION. `payout_execution_block_reason` is the
 * same check the execution path runs, so the queue cannot say "eligible" about a payout the submission step
 * would refuse. A policy hold appears here as its own reason, with the row behind it.
 *
 * ⚠️ THE DESTINATION IS SHOWN MASKED. The platform stores a settlement token and the last four digits; the
 * token is summarised (its first eight characters) rather than printed, because it is a credential for moving
 * money even though it is not the account number itself.
 */
create or replace function public.admin_payout_operations_command(
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
  summary jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.payout')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  with payout_rows as (
    select
      p.id as payout_id,
      p.status::text as status,
      p.amount_minor,
      p.currency_code,
      p.provider_adapter,
      p.provider_reference,
      p.block_reason,
      p.created_at,
      p.updated_at,
      p.last_validated_at,
      o.id as obligation_id,
      o.status::text as obligation_status,
      r.id as request_id,
      coalesce(nullif(btrim(r.need_text), ''), 'Request') as request_title,
      r.state::text as request_state,
      r.completed_at,
      pr.id as provider_id,
      pr.display_name as provider_name,
      pr.status::text as provider_status,
      app_private.payout_execution_block_reason(p.id) as eligibility_block,
      hold.id as hold_id,
      hold.reason_code as hold_reason,
      hold.note as hold_note,
      hold.evidence_reference as hold_reference,
      hold.placed_at as hold_placed_at,
      (select coalesce(nullif(btrim(hp.display_name), ''), 'An operator') from public.profiles hp where hp.account_id = hold.placed_by_account_id) as hold_placed_by,
      dest.destination_type,
      dest.account_last4,
      dest.bank_code,
      dest.verification_status,
      left(coalesce(dest.provider_recipient_code, ''), 8) as recipient_reference
    from public.payouts p
    join public.payment_obligations o on o.id = p.obligation_id
    join public.requests r on r.id = o.request_id
    join public.providers pr on pr.id = p.provider_id
    left join public.platform_payout_holds hold on hold.payout_id = p.id and hold.released_at is null
    left join lateral (
      select d.destination_type, d.account_last4, d.bank_code, d.verification_status, d.provider_recipient_code
      from public.provider_payout_destinations d
      where d.provider_id = p.provider_id and d.adapter_key = coalesce(p.provider_adapter, 'paystack')
        and d.currency_code = p.currency_code and d.is_default
      order by d.verification_status = 'verified' desc, d.updated_at desc
      limit 1
    ) dest on true
    where (p_status is null or p_status = '' or p_status = 'any' or p.status::text = p_status)
      and (
        needle = ''
        or lower(coalesce(p.provider_reference, '')) like '%' || needle || '%'
        or lower(pr.display_name) like '%' || needle || '%'
        or lower(coalesce(r.need_text, '')) like '%' || needle || '%'
      )
    order by p.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'payout_id', x.payout_id,
      'status', x.status,
      'amount_minor', x.amount_minor,
      'currency_code', x.currency_code,
      'provider_adapter', x.provider_adapter,
      'provider_reference', x.provider_reference,
      'block_reason', x.block_reason,
      'eligibility_block', x.eligibility_block,
      'created_at', x.created_at,
      'updated_at', x.updated_at,
      'last_validated_at', x.last_validated_at,
      'obligation_id', x.obligation_id,
      'obligation_status', x.obligation_status,
      'project', jsonb_build_object('request_id', x.request_id, 'title', x.request_title, 'state', x.request_state, 'completed_at', x.completed_at),
      'provider', jsonb_build_object('provider_id', x.provider_id, 'name', x.provider_name, 'status', x.provider_status),
      'destination', case when x.destination_type is null then null else jsonb_build_object(
        'destination_type', x.destination_type,
        'account_last4', x.account_last4,
        'bank_code', x.bank_code,
        'verification_status', x.verification_status,
        'recipient_reference', nullif(x.recipient_reference, '')
      ) end,
      'hold', case when x.hold_id is null then null else jsonb_build_object(
        'id', x.hold_id,
        'reason_code', x.hold_reason,
        'note', x.hold_note,
        'evidence_reference', x.hold_reference,
        'placed_at', x.hold_placed_at,
        'placed_by', x.hold_placed_by
      ) end,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action', ae.action, 'occurred_at', ae.occurred_at, 'reason_code', ae.reason_code,
                 'actor', coalesce(nullif(btrim((select p2.display_name from public.profiles p2 where p2.account_id = (select acc.id from public.accounts acc where acc.auth_user_id = ae.actor_user_id))), ''), ae.actor_type)
               ) order by ae.occurred_at desc)
        from (
          select * from public.audit_events
          where resource_type = 'payout' and resource_id = x.payout_id
          order by occurred_at desc limit 12
        ) ae
      ), '[]'::jsonb)
    ) order by x.updated_at desc), '[]'::jsonb),
    jsonb_build_object(
      'total', (select count(*) from payout_rows),
      'eligible', (select count(*) from payout_rows where status = 'eligible'),
      'held', (select count(*) from payout_rows where hold_id is not null),
      'failed', (select count(*) from payout_rows where status = 'failed'),
      'processing', (select count(*) from payout_rows where status in ('queued','processing')),
      'paid', (select count(*) from payout_rows where status = 'paid'),
      'blocked_by_record', (select count(*) from payout_rows where hold_id is null and eligibility_block is not null)
    )
    into result, summary
  from payout_rows x;

  return jsonb_build_object('allowed', true, 'payouts', result, 'counts', summary, 'status', p_status, 'search', p_search);
end $$;

revoke all on function public.admin_payout_operations_command(text, text, integer) from public, anon;
grant execute on function public.admin_payout_operations_command(text, text, integer) to authenticated;

comment on function public.admin_payout_operations_command(text, text, integer) is
  'Payout operations: provider earnings behind each transfer, the platform''s own eligibility verdict, the masked destination, any live policy hold and the payout''s audit history.';

-- ── Refunds and chargebacks ────────────────────────────────────────────────────────────────────

/**
 * The two kinds of money case, in one queue.
 *
 * ⚠️ THEY ARE DIFFERENT THINGS AND THE QUEUE DOES NOT BLUR THEM. A `payment_dispute_requests` row is a customer
 * asking the platform to look at a payment — it holds no money and decides nothing. A `payment_disputes` row is
 * the provider's own chargeback, with a due date and a resolution the platform must answer. Both are returned
 * with their kind, and the controls offered differ.
 *
 * ⚠️ THE ACTIVE HOLD IS COMPUTED, NOT STORED. Money is held when a refund is in flight or a chargeback is
 * unresolved — the same conditions `payout_execution_block_reason` refuses a payout on — so the queue shows the
 * reason the provider cannot be paid rather than a flag somebody forgot to clear.
 */
create or replace function public.admin_money_cases_command(
  p_kind text default null,
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
  customer jsonb := '[]'::jsonb;
  provider_cases jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.read')
    or app_private.current_account_has_platform_capability('platform.money.dispute_manage')
    or app_private.current_account_has_platform_capability('platform.money.refund')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_kind is not null and p_kind <> '' and p_kind not in ('any','customer_request','provider_dispute') then
    raise exception 'unknown money case kind' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'created_at' desc), '[]'::jsonb)
    into customer
  from (
    select jsonb_build_object(
      'kind', 'customer_request',
      'id', q.id,
      'obligation_id', q.obligation_id,
      'request_id', q.request_id,
      'request_title', coalesce(nullif(btrim(r.need_text), ''), 'Request'),
      'claim_kind', q.kind,
      'status', q.status,
      'message', q.message,
      'created_at', q.created_at,
      'resolved_at', q.resolved_at,
      'evidence_requested_at', q.evidence_requested_at,
      'evidence_request_note', q.evidence_request_note,
      'amount_minor', o.amount_minor,
      'currency_code', o.currency_code,
      'obligation_status', o.status::text,
      'payment_reference', (select a.checkout_reference from public.payment_attempts a where a.obligation_id = q.obligation_id order by a.created_at desc limit 1),
      'provider', jsonb_build_object('provider_id', pr.id, 'name', pr.display_name),
      'customer', jsonb_build_object(
        'account_id', q.customer_account_id,
        'name', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = q.customer_account_id)), ''), 'Account holder'),
        'contact_masked', app_private.mask_email((select u.email from auth.users u join public.accounts ac on ac.auth_user_id = u.id where ac.id = q.customer_account_id))
      ),
      'hold_reason', case
        when exists (select 1 from public.payment_refunds f where f.obligation_id = q.obligation_id and f.status not in ('failed','cancelled'))
          then 'a refund is in flight'
        else null
      end,
      'decisions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action', d.action, 'amount_minor', d.amount_minor, 'resolution', d.resolution,
                 'reason_code', d.reason_code, 'note', d.note, 'evidence_reference', d.evidence_reference,
                 'decided_at', d.decided_at, 'refund_id', d.refund_id,
                 'decided_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = d.decided_by_account_id)), ''), 'An operator')
               ) order by d.decided_at desc)
        from public.platform_money_case_decisions d
        where d.case_kind = 'customer_request' and d.case_id = q.id
      ), '[]'::jsonb)
    ) as entry
    from public.payment_dispute_requests q
    join public.payment_obligations o on o.id = q.obligation_id
    join public.requests r on r.id = q.request_id
    left join public.providers pr on pr.id = q.provider_id
    where (p_kind is null or p_kind = '' or p_kind in ('any','customer_request'))
      and (p_status is null or p_status = '' or p_status = 'any' or q.status = p_status)
      and (
        needle = ''
        or lower(q.message) like '%' || needle || '%'
        or lower(coalesce(r.need_text, '')) like '%' || needle || '%'
        or lower(coalesce(pr.display_name, '')) like '%' || needle || '%'
      )
    order by q.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) c;

  select coalesce(jsonb_agg(entry order by entry ->> 'due_at' nulls last, entry ->> 'created_at' desc), '[]'::jsonb)
    into provider_cases
  from (
    select jsonb_build_object(
      'kind', 'provider_dispute',
      'id', d.id,
      'obligation_id', d.obligation_id,
      'request_id', o.request_id,
      'request_title', coalesce(nullif(btrim(r.need_text), ''), 'Request'),
      'provider_dispute_id', d.provider_dispute_id,
      'provider_transaction_reference', d.provider_transaction_reference,
      'status', d.status,
      'amount_minor', d.amount_minor,
      'currency_code', d.currency_code,
      'reason', d.reason,
      'due_at', d.due_at,
      'resolution', d.resolution,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'claim_kind', null,
      'obligation_status', o.status::text,
      'payment_reference', (select a.checkout_reference from public.payment_attempts a where a.obligation_id = o.id order by a.created_at desc limit 1),
      'provider', jsonb_build_object('provider_id', pr.id, 'name', pr.display_name),
      'customer', null,
      'hold_reason', case when coalesce(d.resolution, '') <> 'cleared_for_payout' then 'the chargeback is unresolved' else null end,
      'decisions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action', dd.action, 'amount_minor', dd.amount_minor, 'resolution', dd.resolution,
                 'reason_code', dd.reason_code, 'note', dd.note, 'evidence_reference', dd.evidence_reference,
                 'decided_at', dd.decided_at,
                 'decided_by', coalesce(nullif(btrim((select p.display_name from public.profiles p where p.account_id = dd.decided_by_account_id)), ''), 'An operator')
               ) order by dd.decided_at desc)
        from public.platform_money_case_decisions dd
        where dd.case_kind = 'provider_dispute' and dd.case_id = d.id
      ), '[]'::jsonb)
    ) as entry
    from public.payment_disputes d
    join public.payment_obligations o on o.id = d.obligation_id
    join public.requests r on r.id = o.request_id
    join public.providers pr on pr.id = o.provider_id
    where (p_kind is null or p_kind = '' or p_kind in ('any','provider_dispute'))
      and (p_status is null or p_status = '' or p_status = 'any' or d.status = p_status)
      and (
        needle = ''
        or lower(coalesce(d.provider_dispute_id, '')) like '%' || needle || '%'
        or lower(coalesce(d.reason, '')) like '%' || needle || '%'
        or lower(coalesce(pr.display_name, '')) like '%' || needle || '%'
      )
    order by d.due_at nulls last, d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) pd;

  return jsonb_build_object(
    'allowed', true,
    'cases', customer || provider_cases,
    'counts', jsonb_build_object(
      'customer_open', (select count(*) from public.payment_dispute_requests where status = 'open'),
      'awaiting_evidence', (select count(*) from public.payment_dispute_requests where status = 'open' and evidence_requested_at is not null),
      'provider_open', (select count(*) from public.payment_disputes where coalesce(resolution, '') <> 'cleared_for_payout'),
      'refunds_in_flight', (select count(*) from public.payment_refunds where status in ('requested','submitted','processing','needs_attention'))
    ),
    'kind', p_kind, 'status', p_status, 'search', p_search
  );
end $$;

revoke all on function public.admin_money_cases_command(text, text, text, integer) from public, anon;
grant execute on function public.admin_money_cases_command(text, text, text, integer) to authenticated;

comment on function public.admin_money_cases_command(text, text, text, integer) is
  'Refund requests and provider chargebacks in one queue, each with its payment reference, masked customer, the hold it creates, and every decision recorded against it.';

-- ── Retrying a reconciliation ──────────────────────────────────────────────────────────────────

/**
 * Re-run the provider-event comparison for one event.
 *
 * ⚠️ IT RE-RUNS THE SAME CHECK, IT DOES NOT OVERRIDE IT. The comparison is adapter, amount and currency between
 * the attempt and its obligation, exactly as `ingest_payment_provider_event_command` performs it. If they still
 * disagree, this returns `mismatch` and writes nothing to the ledger — a retry is not a way to make an anomaly
 * disappear, and a command that could do that would make the reconciliation record worthless.
 *
 * ⚠️ RE-RUNNING IS SAFE BECAUSE THE LEDGER POSTING IS IDEMPOTENT. The funding transaction's key is derived from
 * the provider event, so a second successful pass returns the transaction that already exists rather than
 * posting a second one.
 */
create or replace function public.retry_payment_reconciliation_command(
  p_provider_event_id uuid,
  p_reason_code text,
  p_note text,
  p_evidence_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  ev public.payment_provider_events%rowtype;
  a public.payment_attempts%rowtype;
  o public.payment_obligations%rowtype;
  note_text text := btrim(coalesce(p_note, ''));
  evidence text := btrim(coalesce(p_evidence_reference, ''));
  cash_id uuid;
  payable_id uuid;
  tx uuid;
  outcome text;
  detail jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.reconcile')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to reconcile payments' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('reconciliation_retry', p_reason_code) then
    raise exception 'choose a reason for re-running the reconciliation' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if char_length(evidence) < 3 then
    raise exception 'a support ticket or case reference is required' using errcode = '22023';
  end if;

  select * into ev from public.payment_provider_events where id = p_provider_event_id for update;
  if not found then raise exception 'provider event not found' using errcode = 'P0002'; end if;
  if ev.payment_attempt_id is null then
    raise exception 'this event is not attached to a payment attempt' using errcode = '22023';
  end if;
  select * into a from public.payment_attempts where id = ev.payment_attempt_id for update;
  select * into o from public.payment_obligations where id = a.obligation_id for update;

  if lower(btrim(coalesce(a.provider_adapter, ''))) <> lower(btrim(coalesce(ev.provider_adapter, ''))) then
    outcome := 'mismatch';
    detail := jsonb_build_object('reason', 'provider_adapter_mismatch', 'checked_at', now(), 'retry_reason', p_reason_code);
  elsif a.amount_minor <> o.amount_minor or a.currency_code <> o.currency_code then
    outcome := 'mismatch';
    detail := jsonb_build_object('reason', 'amount_or_currency_mismatch', 'checked_at', now(),
                                 'attempt_amount_minor', a.amount_minor, 'obligation_amount_minor', o.amount_minor,
                                 'retry_reason', p_reason_code);
  elsif ev.event_type = 'payment_succeeded' then
    cash_id := app_private.ensure_ledger_account('provider_clearing:' || a.provider_adapter || ':' || o.currency_code, 'asset', 'system', null, o.currency_code);
    payable_id := app_private.ensure_ledger_account('provider_payable:' || o.provider_id::text || ':' || o.currency_code, 'liability', 'provider', o.provider_id, o.currency_code);
    tx := app_private.post_balanced_ledger_transaction(
      'payment_funded',
      'provider-event:' || lower(btrim(a.provider_adapter)) || ':' || ev.provider_event_id,
      ev.provider_event_id,
      jsonb_build_object('obligation_id', o.id, 'attempt_id', a.id, 'reconciliation_retry', true),
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', cash_id, 'currency_code', o.currency_code, 'amount_minor', o.amount_minor, 'obligation_id', o.id),
        jsonb_build_object('ledger_account_id', payable_id, 'currency_code', o.currency_code, 'amount_minor', -o.amount_minor, 'obligation_id', o.id)
      )
    );
    update public.payment_attempts set status = 'succeeded', provider_reference = coalesce(provider_reference, ev.provider_event_id), updated_at = now() where id = a.id;
    update public.payment_obligations set status = 'funded', updated_at = now() where id = o.id;
    outcome := 'matched';
    detail := jsonb_build_object('outcome', 'funded', 'ledger_transaction_id', tx, 'checked_at', now(), 'retry_reason', p_reason_code);
    perform app_private.refresh_payout_eligibility(o.id);
  elsif ev.event_type = 'payment_failed' then
    update public.payment_attempts set status = 'failed', updated_at = now() where id = a.id;
    update public.payment_obligations set status = 'pending', updated_at = now() where id = o.id and status = 'funding';
    outcome := 'matched';
    detail := jsonb_build_object('outcome', 'failed', 'checked_at', now(), 'retry_reason', p_reason_code);
  else
    outcome := 'ignored';
    detail := jsonb_build_object('event_type', ev.event_type, 'checked_at', now(), 'retry_reason', p_reason_code);
  end if;

  if outcome in ('matched','ignored') then
    update public.payment_provider_events set status = 'reconciled', reconciled_at = now() where id = ev.id;
  end if;

  insert into public.payment_reconciliations(provider_event_id, payment_attempt_id, obligation_id, ledger_transaction_id, result, details)
  values (ev.id, a.id, o.id, case when outcome = 'matched' then tx else null end, outcome, detail)
  on conflict (provider_event_id) do update
    set result = excluded.result,
        details = excluded.details,
        ledger_transaction_id = excluded.ledger_transaction_id,
        reconciled_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PAYMENT_RECONCILIATION_RETRIED', 'payment_obligation', o.id, p_reason_code, 'restricted',
          jsonb_build_object('provider_event_id', ev.id, 'result', outcome, 'note', note_text,
                             'evidence_reference', evidence, 'ledger_transaction_id', tx));

  return jsonb_build_object('result', outcome, 'obligation_id', o.id, 'attempt_id', a.id,
                            'provider_event_id', ev.id, 'ledger_transaction_id', tx, 'details', detail);
end $$;

revoke all on function public.retry_payment_reconciliation_command(uuid, text, text, text) from public, anon;
grant execute on function public.retry_payment_reconciliation_command(uuid, text, text, text) to authenticated;

comment on function public.retry_payment_reconciliation_command(uuid, text, text, text) is
  'Re-runs the reconciliation comparison for one provider event with a second factor, a reason code, a note and a support reference. It re-checks rather than overrides: a mismatch stays a mismatch and nothing is posted.';

-- ── Approved offset entries ────────────────────────────────────────────────────────────────────

/**
 * The only way an operator moves a ledger balance.
 *
 * ⚠️ IT POSTS A NEW BALANCED TRANSACTION AND NOTHING ELSE. Two entries, one on the provider's payable account
 * and one on the platform's own adjustment account for that currency, summing to zero — the same
 * `post_balanced_ledger_transaction` the funding path uses, which refuses an unbalanced set outright. No
 * existing entry is touched, which is what "immutable" has to mean if it means anything.
 *
 * ⚠️ THE BOUNDS ARE THE POINT OF HAVING THIS AT ALL. An adjustment cannot exceed the obligation, cannot drive
 * the provider's payable below zero, and cannot be posted once money has actually left (a paid payout) — those
 * are refunds, chargebacks and payouts, and each has its own command with its own evidence. A general-purpose
 * "adjust anything" control is how a ledger stops being a record.
 */
create or replace function public.post_ledger_adjustment_command(
  p_obligation_id uuid,
  p_amount_minor bigint,
  p_direction text,
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
  o public.payment_obligations%rowtype;
  payable_id uuid;
  adjustment_id uuid;
  payable_balance bigint;
  tx uuid;
  adjustment_id_row uuid;
  note_text text := btrim(coalesce(p_note, ''));
  evidence text := btrim(coalesce(p_evidence_reference, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.reconcile')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to post a ledger adjustment' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_direction not in ('reduce_provider_payable', 'increase_provider_payable') then
    raise exception 'unknown adjustment direction' using errcode = '22023';
  end if;
  if coalesce(p_amount_minor, 0) <= 0 then
    raise exception 'an adjustment has to be a positive amount with a direction' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('ledger_adjustment', p_reason_code) then
    raise exception 'choose a reason for this adjustment' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if char_length(evidence) < 3 then
    raise exception 'a support ticket or case reference is required' using errcode = '22023';
  end if;

  select * into o from public.payment_obligations where id = p_obligation_id for update;
  if not found then raise exception 'obligation not found' using errcode = 'P0002'; end if;
  if p_amount_minor > o.amount_minor then
    raise exception 'an adjustment cannot exceed the obligation it corrects' using errcode = '22023';
  end if;
  if exists (select 1 from public.payouts p where p.obligation_id = o.id and p.status = 'paid') then
    raise exception 'money has already left on this obligation: correct it with a refund or a chargeback, not an adjustment' using errcode = '22023';
  end if;

  payable_id := app_private.ensure_ledger_account('provider_payable:' || o.provider_id::text || ':' || o.currency_code, 'liability', 'provider', o.provider_id, o.currency_code);
  select coalesce(sum(le.amount_minor), 0) into payable_balance
  from public.ledger_entries le where le.ledger_account_id = payable_id;

  if p_direction = 'reduce_provider_payable' and payable_balance - p_amount_minor < 0 then
    raise exception 'that would take the provider''s payable below zero' using errcode = '22023';
  end if;

  adjustment_id := app_private.ensure_ledger_account('platform_adjustment:' || o.currency_code, 'expense', 'platform', null, o.currency_code);

  -- `reduce_provider_payable` credits the liability (a negative entry) and debits the platform's adjustment
  -- account; `increase_provider_payable` is the same movement the other way. Both balance by construction.
  if p_direction = 'reduce_provider_payable' then
    tx := app_private.post_balanced_ledger_transaction(
      'ledger_adjustment',
      'ledger-adjustment:' || gen_random_uuid()::text,
      null,
      jsonb_build_object('obligation_id', o.id, 'direction', p_direction, 'reason_code', p_reason_code, 'evidence_reference', evidence),
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', payable_id, 'currency_code', o.currency_code, 'amount_minor', p_amount_minor, 'obligation_id', o.id),
        jsonb_build_object('ledger_account_id', adjustment_id, 'currency_code', o.currency_code, 'amount_minor', -p_amount_minor, 'obligation_id', o.id)
      )
    );
  else
    tx := app_private.post_balanced_ledger_transaction(
      'ledger_adjustment',
      'ledger-adjustment:' || gen_random_uuid()::text,
      null,
      jsonb_build_object('obligation_id', o.id, 'direction', p_direction, 'reason_code', p_reason_code, 'evidence_reference', evidence),
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', payable_id, 'currency_code', o.currency_code, 'amount_minor', -p_amount_minor, 'obligation_id', o.id),
        jsonb_build_object('ledger_account_id', adjustment_id, 'currency_code', o.currency_code, 'amount_minor', p_amount_minor, 'obligation_id', o.id)
      )
    );
  end if;

  insert into public.platform_ledger_adjustments(
    obligation_id, provider_id, currency_code, amount_minor, direction, ledger_transaction_id,
    reason_code, note, evidence_reference, executed_by_account_id
  ) values (
    o.id, o.provider_id, o.currency_code, p_amount_minor, p_direction, tx,
    p_reason_code, note_text, evidence, me
  ) returning id into adjustment_id_row;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'LEDGER_ADJUSTMENT_POSTED', 'payment_obligation', o.id, p_reason_code, 'restricted',
          jsonb_build_object('adjustment_id', adjustment_id_row, 'direction', p_direction, 'amount_minor', p_amount_minor,
                             'currency_code', o.currency_code, 'ledger_transaction_id', tx,
                             'note', note_text, 'evidence_reference', evidence));

  return adjustment_id_row;
end $$;

revoke all on function public.post_ledger_adjustment_command(uuid, bigint, text, text, text, text) from public, anon;
grant execute on function public.post_ledger_adjustment_command(uuid, bigint, text, text, text, text) to authenticated;

comment on function public.post_ledger_adjustment_command(uuid, bigint, text, text, text, text) is
  'Posts a balanced offset transaction against an obligation''s provider payable account, with a second factor, a reason code, a note and a support reference. Refuses amounts above the obligation, balances below zero, and any obligation whose money has already been paid out.';

-- ── Payout holds ───────────────────────────────────────────────────────────────────────────────

/**
 * Stop a payout, on the record.
 *
 * ⚠️ THE HOLD REACHES THE EXECUTION PATH BY MIRRORING ITSELF ONTO THE PAYOUT ROW. `status = 'blocked'` with a
 * `policy_hold` reason is what the submission step refuses on; the row in `platform_payout_holds` is what says
 * why, by whom and under which reference. `refresh_payout_eligibility` deliberately leaves unknown block reasons
 * alone, so a later eligibility pass cannot quietly release a policy hold.
 */
create or replace function public.place_payout_hold_command(
  p_payout_id uuid,
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
  p public.payouts%rowtype;
  hold_id uuid;
  note_text text := btrim(coalesce(p_note, ''));
  evidence text := btrim(coalesce(p_evidence_reference, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.payout')
    or app_private.current_account_has_platform_capability('platform.money.dispute_manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to hold a payout' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('payout_hold', p_reason_code) then
    raise exception 'choose a reason for holding this payout' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if char_length(evidence) < 3 then
    raise exception 'a support ticket or case reference is required' using errcode = '22023';
  end if;

  select * into p from public.payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  if p.status = 'paid' then
    raise exception 'this payout has already been paid' using errcode = '22023';
  end if;
  if exists (select 1 from public.platform_payout_holds h where h.payout_id = p.id and h.released_at is null) then
    raise exception 'this payout already has a live hold' using errcode = '22023';
  end if;

  insert into public.platform_payout_holds(payout_id, provider_id, reason_code, note, evidence_reference, placed_by_account_id)
  values (p.id, p.provider_id, p_reason_code, note_text, evidence, me)
  returning id into hold_id;

  update public.payouts
     set status = 'blocked',
         block_reason = 'policy_hold',
         updated_at = now()
   where id = p.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PAYOUT_HOLD_PLACED', 'payout', p.id, p_reason_code, 'restricted',
          jsonb_build_object('hold_id', hold_id, 'provider_id', p.provider_id, 'note', note_text, 'evidence_reference', evidence));

  return hold_id;
end $$;

revoke all on function public.place_payout_hold_command(uuid, text, text, text) from public, anon;
grant execute on function public.place_payout_hold_command(uuid, text, text, text) to authenticated;

/**
 * Release a hold, and let the platform's own eligibility check decide what happens next.
 *
 * ⚠️ RELEASING IS NOT THE SAME AS MAKING IT ELIGIBLE. Clearing the policy block hands the payout back to
 * `refresh_payout_eligibility` and `payout_execution_block_reason`: if a refund is still in flight or a
 * chargeback is unresolved, the payout stays blocked, with that reason instead. The alternative — setting it
 * eligible because somebody lifted their own hold — is how a payout slips past a dispute.
 */
create or replace function public.release_payout_hold_command(
  p_hold_id uuid,
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
  h public.platform_payout_holds%rowtype;
  remaining text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.payout')
    or app_private.current_account_has_platform_capability('platform.money.dispute_manage')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to release a payout hold' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('payout_hold_release', p_reason_code) then
    raise exception 'choose a reason for releasing this hold' using errcode = '22023';
  end if;

  select * into h from public.platform_payout_holds where id = p_hold_id for update;
  if not found then raise exception 'payout hold not found' using errcode = 'P0002'; end if;
  if h.released_at is not null then
    raise exception 'that hold has already been released' using errcode = '22023';
  end if;

  update public.platform_payout_holds
     set released_at = now(),
         released_by_account_id = me,
         release_reason_code = p_reason_code,
         release_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = h.id;

  remaining := app_private.payout_execution_block_reason(h.payout_id);
  update public.payouts
     set status = case when remaining is null then 'eligible' else 'blocked' end,
         block_reason = remaining,
         last_validated_at = now(),
         updated_at = now()
   where id = h.payout_id;

  perform app_private.refresh_payout_eligibility((select obligation_id from public.payouts where id = h.payout_id));

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PAYOUT_HOLD_RELEASED', 'payout', h.payout_id, p_reason_code, 'restricted',
          jsonb_build_object('hold_id', h.id, 'remaining_block_reason', remaining,
                             'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

revoke all on function public.release_payout_hold_command(uuid, text, text) from public, anon;
grant execute on function public.release_payout_hold_command(uuid, text, text) to authenticated;

-- ── Refund and chargeback decisions ────────────────────────────────────────────────────────────

/**
 * The missing public refund wrapper.
 *
 * ⚠️ THE ADMIN REFUND CONTROL HAS BEEN CALLING A FUNCTION THAT DOES NOT EXIST. `app_private.request_refund_authoritatively`
 * is the implementation, and the money console's action calls `request_refund_command` — which was never created,
 * so that button could only ever fail. The gap is closed here rather than worked around, because the refund
 * decision in the case queue needs the same entry point and two refund paths would be one too many.
 */
create or replace function public.request_refund_command(
  p_obligation_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.request_refund_authoritatively(p_obligation_id, p_amount_minor, p_reason, p_idempotency_key) $$;

revoke all on function public.request_refund_command(uuid, bigint, text, text) from public, anon;
grant execute on function public.request_refund_command(uuid, bigint, text, text) to authenticated;

/**
 * Decide a money case.
 *
 * ⚠️ APPROVING A REFUND GOES THROUGH THE EXISTING REFUND COMMAND. `request_refund_command` already owns the
 * capability check, the obligation's state rules and the idempotency key, so this calls it rather than writing a
 * second refund path — the key is derived from the case, so pressing the button twice produces one refund.
 *
 * ⚠️ REJECTING A CLAIM MOVES NO MONEY, AND THE TWO ARE LOGGED THE SAME WAY. Both append a decision row with a
 * reason code, a note and the operator; one of them happens to create a refund first, and its id is stored on
 * the decision so the refusal and the refund are equally explainable later.
 */
create or replace function public.decide_money_case_command(
  p_case_kind text,
  p_case_id uuid,
  p_action text,
  p_amount_minor bigint,
  p_resolution text,
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
  obligation uuid;
  refund uuid;
  decision_id uuid;
  note_text text := btrim(coalesce(p_note, ''));
  evidence text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.money.dispute_manage')
    or app_private.current_account_has_platform_capability('platform.money.refund')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to decide a money case' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_case_kind not in ('customer_request','provider_dispute') then
    raise exception 'unknown money case kind' using errcode = '22023';
  end if;
  if p_action not in ('approve_refund','reject_claim','request_evidence','record_chargeback_result') then
    raise exception 'that is not an action this queue records' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('money_case_decision', p_reason_code) then
    raise exception 'choose a reason for this decision' using errcode = '22023';
  end if;
  if char_length(note_text) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if p_action = 'approve_refund' and coalesce(p_amount_minor, 0) <= 0 then
    raise exception 'a refund needs a positive amount' using errcode = '22023';
  end if;
  if p_action = 'record_chargeback_result' and p_resolution is null then
    raise exception 'a chargeback result needs a resolution' using errcode = '22023';
  end if;
  if p_action = 'record_chargeback_result'
     and p_resolution not in ('cleared_for_payout','provider_liable','customer_liable','pending_further_evidence') then
    raise exception 'unknown chargeback resolution' using errcode = '22023';
  end if;
  -- A chargeback is the provider's own case: it is answered with a result the platform records against it. The
  -- "reject" verb belongs to the customer's request, where nothing has been asserted by a bank yet.
  if p_case_kind = 'provider_dispute' and p_action = 'reject_claim' then
    raise exception 'a provider chargeback is answered with a result, not rejected' using errcode = '22023';
  end if;

  if p_case_kind = 'customer_request' then
    select q.obligation_id into obligation from public.payment_dispute_requests q where q.id = p_case_id for update;
    if obligation is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  else
    select d.obligation_id into obligation from public.payment_disputes d where d.id = p_case_id for update;
    if obligation is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  end if;

  if p_action = 'approve_refund' then
    refund := public.request_refund_command(
      obligation,
      p_amount_minor,
      left(note_text, 200),
      'money-case-refund:' || p_case_id::text
    );
    if p_case_kind = 'customer_request' then
      update public.payment_dispute_requests
         set status = 'reviewed', resolved_at = now()
       where id = p_case_id;
    end if;
  elsif p_action = 'reject_claim' then
    update public.payment_dispute_requests
       set status = 'reviewed', resolved_at = now()
     where id = p_case_id;
  elsif p_action = 'request_evidence' then
    if p_case_kind = 'customer_request' then
      update public.payment_dispute_requests
         set evidence_requested_at = now(), evidence_request_note = note_text
       where id = p_case_id;
    end if;
  else
    update public.payment_disputes
       set resolution = p_resolution,
           updated_at = now()
     where id = p_case_id;
  end if;

  insert into public.platform_money_case_decisions(
    case_kind, case_id, obligation_id, action, amount_minor, resolution, reason_code, note, evidence_reference, refund_id, decided_by_account_id
  ) values (
    p_case_kind, p_case_id, obligation, p_action,
    case when p_action = 'approve_refund' then p_amount_minor else null end,
    p_resolution, p_reason_code, note_text, evidence, refund, me
  ) returning id into decision_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user',
          case p_action
            when 'approve_refund' then 'MONEY_CASE_REFUND_APPROVED'
            when 'reject_claim' then 'MONEY_CASE_CLAIM_REJECTED'
            when 'request_evidence' then 'MONEY_CASE_EVIDENCE_REQUESTED'
            else 'MONEY_CASE_CHARGEBACK_RECORDED'
          end,
          'payment_obligation', obligation, p_reason_code, 'restricted',
          jsonb_build_object('case_kind', p_case_kind, 'case_id', p_case_id, 'action', p_action,
                             'amount_minor', p_amount_minor, 'resolution', p_resolution,
                             'note', note_text, 'evidence_reference', evidence, 'refund_id', refund,
                             'decision_id', decision_id));

  return decision_id;
end $$;

revoke all on function public.decide_money_case_command(text, uuid, text, bigint, text, text, text, text) from public, anon;
grant execute on function public.decide_money_case_command(text, uuid, text, bigint, text, text, text, text) to authenticated;

comment on function public.decide_money_case_command(text, uuid, text, bigint, text, text, text, text) is
  'Decides a customer refund or dispute request, or records a provider chargeback result. Requires a second factor, a reason code and a note; approving a refund goes through the platform''s existing refund command with a case-derived idempotency key.';
