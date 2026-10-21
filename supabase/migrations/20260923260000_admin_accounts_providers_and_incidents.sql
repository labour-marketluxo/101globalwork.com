-- Admin accounts, providers and the incident feed behind /admin and its children.
--
-- ── FOUR RULES THIS MIGRATION EXISTS TO ENFORCE ───────────────────────────────────────────────
--
-- 1. PII IS MASKED IN THE DATABASE, NOT IN THE VIEW. The directory and detail readers return a mask
--    for an email, a phone number and an address; the raw value is not in the payload at all. The one
--    way to obtain it is `reveal_admin_account_contact_command`, which writes an audit row BEFORE it
--    returns anything. A mask that only exists in a template is a mask any future page can forget.
--
-- 2. CONSEQUENTIAL WRITES NEED A REASON AND A SECOND FACTOR. Suspending an account, ending its
--    sessions and restricting a provider all require `app_private.current_auth_is_aal2()` and a reason
--    code drawn from the platform's own vocabulary (`admin_reason_codes_command`), so the audit row
--    says WHY and not merely WHO. The vocabulary is served from here rather than duplicated in the
--    app, because a code the interface offers and the database rejects is a broken control.
--
-- 3. AN OPERATOR CANNOT LOCK THEMSELVES OR THE OWNER OUT. Standing changes refuse the platform owner
--    account and refuse the caller's own account; session revocation refuses the caller's own account
--    as well, and points at /settings/security/sessions, which is the surface built for that.
--
-- 4. AN INCIDENT IS DERIVED, AND AN ACKNOWLEDGEMENT IS STORED. What needs attention is computed from
--    the tables that already carry the exceptions; acknowledging it records who looked, why, and HOW
--    MANY items were outstanding at that moment — so a queue that grows afterwards reads as recurred
--    rather than as already reviewed.

-- ── Masking helpers ────────────────────────────────────────────────────────────────────────────

/**
 * Keep enough of an address to recognise it and no more.
 *
 * ⚠️ THE SHAPE MATCHES `maskContact` IN features/auth/post-auth.ts. Two implementations of one rule is
 * one too many, but the split is forced: that one runs in TypeScript on values the app already holds,
 * this one runs in the database on values the app must never hold. If the shape changes, both change —
 * which is why each names the other.
 */
create or replace function app_private.mask_email(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    when position('@' in p_value) <= 1 then null
    else left(split_part(p_value, '@', 1), 1)
      || '***'
      || case when char_length(split_part(p_value, '@', 1)) > 2
              then right(split_part(p_value, '@', 1), 1)
              else '' end
      || '@' || split_part(p_value, '@', 2)
  end
$$;

/** Country prefix and last two digits, as maskContact renders a number. */
create or replace function app_private.mask_phone(p_value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(p_value, ''), '[^0-9+]', '', 'g') as digits
  )
  select case
    when char_length(regexp_replace(digits, '[^0-9]', '', 'g')) < 6 then null
    when left(digits, 1) = '+' then left(digits, 4) || ' *** **** ' || right(digits, 2)
    else left(digits, 2) || ' *** **** ' || right(digits, 2)
  end
  from cleaned
$$;

/**
 * A network address reduced to the network.
 *
 * ⚠️ TWO OCTETS, AND THAT IS THE POINT. The operator looking at another person's sessions is comparing
 * devices for an anomaly — "is one of these from somewhere this person has never been" — and the first
 * two octets answer that. The full address identifies a household or a café, which is more than the
 * question needs, so the last two parts never leave the database.
 */
create or replace function app_private.mask_ip(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    when position('.' in p_value) > 0 then
      split_part(p_value, '.', 1) || '.' || split_part(p_value, '.', 2) || '.*.*'
    when position(':' in p_value) > 0 then split_part(p_value, ':', 1) || ':****'
    else null
  end
$$;

-- ── The reason-code vocabulary, served once ────────────────────────────────────────────────────

/**
 * The reason codes an operator may choose, by the kind of decision they are recording.
 *
 * ⚠️ THIS IS THE SINGLE SOURCE OF TRUTH. The interface renders this list and the commands below
 * validate against it, so a code offered on screen is always a code the write will accept — and a
 * hand-crafted form post cannot invent one that reads plausibly in the audit log later.
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
      jsonb_build_object('code', 'mistaken_suspension', 'label', 'Previous suspension was a mistake')
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
    )
  );
$$;

/** The per-scope validator both the reads and the commands use. */
create or replace function app_private.admin_reason_code_valid(p_scope text, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.admin_reason_codes_command() -> p_scope) entry
    where entry ->> 'code' = p_code
  );
$$;

/**
 * ⚠️ THE HELPERS ARE NOT FOR CALLERS. `app_private` is where the masking rules and the reason-code
 * vocabulary live, and `authenticated` holds USAGE on the schema for the other helpers this project
 * already exposes. Executing these directly would let a caller mask anything they liked — harmless in
 * itself, but it is also how a "helper" quietly becomes an interface. The `security definer` functions
 * below are owned by the migration runner and keep working.
 */
revoke all on function app_private.mask_email(text) from public, anon, authenticated;
revoke all on function app_private.mask_phone(text) from public, anon, authenticated;
revoke all on function app_private.mask_ip(text) from public, anon, authenticated;
revoke all on function app_private.admin_reason_code_valid(text, text) from public, anon, authenticated;

revoke all on function public.admin_reason_codes_command() from anon;
grant execute on function public.admin_reason_codes_command() to authenticated;
revoke all on function public.admin_reason_codes_command() from public;

-- ── Incident acknowledgements ──────────────────────────────────────────────────────────────────

/**
 * What an operator has already looked at, and against how much.
 *
 * ⚠️ `acknowledged_count` IS WHAT MAKES THIS HONEST. An incident is derived, so it has no row to mark.
 * Storing the count at acknowledgement time lets the feed answer the question that actually matters
 * later: "did somebody review THIS backlog, or an older, smaller one?" Without it, an acknowledgement
 * would silently bless everything that arrived afterwards.
 */
create table public.admin_incident_acknowledgements (
  incident_key text primary key check (char_length(btrim(incident_key)) between 3 and 80),
  area text not null check (area in ('trust', 'financials', 'projects', 'operations', 'accounts')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  acknowledged_count integer not null check (acknowledged_count >= 0),
  reason_code text not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 2000),
  acknowledged_by_account_id uuid not null references public.accounts(id) on delete restrict,
  acknowledged_at timestamptz not null default now()
);

alter table public.admin_incident_acknowledgements enable row level security;
create policy admin_incident_acknowledgements_operator_read on public.admin_incident_acknowledgements
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  );
revoke all on public.admin_incident_acknowledgements from anon;
revoke insert, update, delete on public.admin_incident_acknowledgements from authenticated;
grant select on public.admin_incident_acknowledgements to authenticated;

comment on table public.admin_incident_acknowledgements is
  'Operator acknowledgement of a derived incident, with the item count at the moment it was acknowledged so later growth reads as recurred rather than reviewed.';

-- ── Operational restrictions on a provider ─────────────────────────────────────────────────────

/**
 * A hold the platform places on a provider's operation, and the record of it being lifted.
 *
 * ⚠️ IT RECORDS A DECISION; IT DOES NOT ITSELF CHANGE MATCHING. Nothing in this migration rewrites
 * `providers.status` or the readiness scores: an entitlement that a restriction should remove is
 * removed by the command that owns that entitlement. What this table does is make "we have paused this
 * provider, for this reason, on this date" a row the supply directory can show — including the row for
 * a restriction nobody has lifted, which is precisely the state that goes unnoticed when it lives in
 * somebody's memory.
 */
create table public.admin_provider_restrictions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  kind text not null check (kind in ('information_required', 'credential_hold', 'availability_paused', 'suspended')),
  severity text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  reason_code text not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 2000),
  applied_by_account_id uuid not null references public.accounts(id) on delete restrict,
  applied_at timestamptz not null default now(),
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by_account_id uuid references public.accounts(id) on delete restrict,
  lift_reason_code text,
  lift_note text check (lift_note is null or char_length(btrim(lift_note)) between 1 and 2000),
  check (lifted_at is null or lifted_at >= applied_at),
  check ((lifted_at is null) = (lifted_by_account_id is null))
);

create index admin_provider_restrictions_provider_idx on public.admin_provider_restrictions(provider_id, applied_at desc);
-- One live restriction per provider: a second concurrent hold is a correction to the first, not a
-- second fact, and two live rows would leave the directory unable to say which one is in force.
create unique index admin_provider_restrictions_live_ux on public.admin_provider_restrictions(provider_id) where lifted_at is null;

alter table public.admin_provider_restrictions enable row level security;
create policy admin_provider_restrictions_operator_read on public.admin_provider_restrictions
  for select to authenticated
  using (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.operations.read')
  );
revoke all on public.admin_provider_restrictions from anon;
revoke insert, update, delete on public.admin_provider_restrictions from authenticated;
grant select on public.admin_provider_restrictions to authenticated;

comment on table public.admin_provider_restrictions is
  'A platform operator''s hold on a provider — information requested, credential hold, availability pause or suspension — with the reason code and the record of it being lifted.';

-- ── The incident feed ──────────────────────────────────────────────────────────────────────────

/**
 * What needs attention, derived from the tables that already carry the exception.
 *
 * ⚠️ EVERY INCIDENT IS A REAL QUERY, NOT A CONFIGURED THRESHOLD. A count with no query behind it is a
 * dashboard that drifts from the platform the first time somebody changes a state machine. Each row
 * below names the table it counts, the column its window is measured on (`window_basis`), and whether
 * a market filter narrows it (`market_scoped`) — because an operator filtering by market deserves to
 * know which numbers moved and which could not.
 *
 * ⚠️ ZERO-COUNT INCIDENTS ARE RETURNED. The page shows them as "clear", which is how an operator
 * knows the check ran at all; omitting them makes an empty board indistinguishable from a broken one.
 */
create or replace function public.admin_incident_feed_command(
  p_market_id uuid default null,
  p_window_hours integer default 24,
  p_severity text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  window_hours integer := greatest(1, least(coalesce(p_window_hours, 24), 720));
  since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_window_hours, 24), 720)));
  viewer_role text;
  items jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.operations.read')
    or app_private.current_account_has_platform_capability('platform.admin.view_audit')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_severity is not null and p_severity not in ('critical', 'high', 'medium', 'low') then
    raise exception 'unknown severity' using errcode = '22023';
  end if;

  viewer_role := case
    when app_private.current_account_is_owner() then 'owner'
    else coalesce((select r.role_key from public.platform_admin_memberships m
                    join public.platform_roles r on r.id = m.role_id
                   where m.account_id = app_private.current_account_id()
                     and m.status = 'active' and m.revoked_at is null
                   order by r.display_name limit 1), 'administrator')
  end;

  with incidents as (
    select
      'money.disputed_obligations'::text as incident_key,
      'financials'::text as area,
      'critical'::text as severity,
      'Payment obligations in dispute'::text as title,
      'Money is funded and held while a dispute is unresolved. The obligation cannot be paid out until it clears.'::text as detail,
      coalesce((
        select count(*) from public.payment_obligations ob
         where ob.status = 'disputed'
           and ob.updated_at >= since
           and (p_market_id is null or exists (
                 select 1 from public.requests r where r.id = ob.request_id and r.market_id = p_market_id))
      ), 0)::integer as item_count,
      (select min(ob.updated_at) from public.payment_obligations ob
        where ob.status = 'disputed' and ob.updated_at >= since
          and (p_market_id is null or exists (
                select 1 from public.requests r where r.id = ob.request_id and r.market_id = p_market_id))) as oldest_at,
      'obligation updated_at'::text as window_basis,
      true as market_scoped,
      '/admin/money'::text as deep_link,
      'Open the financial record'::text as action_label
    union all
    select
      'money.refund_attention', 'financials', 'high',
      'Refunds needing attention',
      'A refund is requested or marked as needing attention. Nothing further will happen to it without an operator.',
      coalesce((
        select count(*) from public.payment_refunds rf
         where rf.status in ('requested', 'needs_attention')
           and rf.created_at >= since
           and (p_market_id is null or exists (
                 select 1 from public.payment_obligations ob
                  join public.requests r on r.id = ob.request_id
                 where ob.id = rf.obligation_id and r.market_id = p_market_id))
      ), 0)::integer,
      (select min(rf.created_at) from public.payment_refunds rf
        where rf.status in ('requested', 'needs_attention') and rf.created_at >= since
          and (p_market_id is null or exists (
                select 1 from public.payment_obligations ob
                 join public.requests r on r.id = ob.request_id
                where ob.id = rf.obligation_id and r.market_id = p_market_id))),
      'refund created_at', true,
      '/admin/money', 'Open the refund queue'
    union all
    select
      'trust.pending_verifications', 'trust', 'high',
      'Verifications awaiting review',
      'A provider cannot be published or take certain work until an operator decides. Nothing moves on its own.',
      coalesce((
        select count(*) from public.provider_verifications v
         join public.providers pr on pr.id = v.provider_id
         where v.status = 'pending' and v.created_at >= since
           and (p_market_id is null or pr.primary_market_id = p_market_id)
      ), 0)::integer,
      (select min(v.created_at) from public.provider_verifications v
        join public.providers pr on pr.id = v.provider_id
        where v.status = 'pending' and v.created_at >= since
          and (p_market_id is null or pr.primary_market_id = p_market_id)),
      'verification created_at', true,
      '/admin/verifications', 'Open the verification queue'
    union all
    select
      'trust.expiring_credentials', 'trust', 'medium',
      'Credentials expiring within 30 days',
      'A licence, certification or insurance policy on file expires soon. The platform does not chase these on its own.',
      coalesce((
        select count(*) from public.provider_credentials c
         join public.providers pr on pr.id = c.provider_id
         where c.expires_at is not null
           and c.expires_at >= current_date
           and c.expires_at <= current_date + 30
           and (p_market_id is null or pr.primary_market_id = p_market_id)
      ), 0)::integer,
      (select min(c.expires_at)::timestamptz from public.provider_credentials c
        join public.providers pr on pr.id = c.provider_id
        where c.expires_at is not null and c.expires_at >= current_date and c.expires_at <= current_date + 30
          and (p_market_id is null or pr.primary_market_id = p_market_id)),
      'credential expiry date', true,
      '/admin/providers', 'Open the supply directory'
    union all
    select
      'projects.disputed_requests', 'projects', 'high',
      'Projects in dispute',
      'A request has entered dispute. The normal state machine is suspended for it until a case is resolved.',
      coalesce((
        select count(*) from public.requests r
         where r.state = 'disputed' and r.created_at >= since
           and (p_market_id is null or r.market_id = p_market_id)
      ), 0)::integer,
      (select min(r.created_at) from public.requests r
        where r.state = 'disputed' and r.created_at >= since
          and (p_market_id is null or r.market_id = p_market_id)),
      'request created_at', true,
      '/admin/work', 'Open the work register'
    union all
    select
      'operations.rejected_provider_events', 'operations', 'high',
      'Rejected payment provider events',
      'An event from the payment provider failed an integrity check. It was not reconciled into the ledger.',
      coalesce((
        select count(*) from public.payment_provider_events e
         where e.status = 'rejected' and e.received_at >= since
      ), 0)::integer,
      (select min(e.received_at) from public.payment_provider_events e
        where e.status = 'rejected' and e.received_at >= since),
      'event received_at', false,
      '/admin/operations', 'Open operations'
    union all
    select
      'operations.outbox_backlog', 'operations', 'medium',
      'Domain events waiting for delivery',
      'Transactional outbox events have not been published. Until one is delivered, nothing downstream has seen it.',
      coalesce((
        select count(*) from public.outbox_events o
         where o.published_at is null and o.occurred_at >= since
      ), 0)::integer,
      (select min(o.occurred_at) from public.outbox_events o
        where o.published_at is null and o.occurred_at >= since),
      'event occurred_at', false,
      '/admin/operations', 'Open operations'
    union all
    select
      'accounts.suspended', 'accounts', 'low',
      'Accounts currently suspended',
      'A suspended account is refused by the database on its next request — the standing is checked on every read and write, not only at sign-in.',
      coalesce((
        select count(*) from public.accounts a
         where a.status = 'suspended' and a.created_at >= since
      ), 0)::integer,
      (select min(a.created_at) from public.accounts a
        where a.status = 'suspended' and a.created_at >= since),
      'account created_at', false,
      '/admin/accounts?standing=suspended', 'Open the accounts directory'
    union all
    select
      'supply.active_restrictions', 'trust', 'medium',
      'Providers under an active restriction',
      'An operator has placed a hold — information requested, a credential hold, a pause or a suspension — that nobody has lifted.',
      coalesce((
        select count(*) from public.admin_provider_restrictions x
         join public.providers pr on pr.id = x.provider_id
         where x.lifted_at is null
           and (p_market_id is null or pr.primary_market_id = p_market_id)
      ), 0)::integer,
      (select min(x.applied_at) from public.admin_provider_restrictions x
        join public.providers pr on pr.id = x.provider_id
        where x.lifted_at is null and (p_market_id is null or pr.primary_market_id = p_market_id)),
      'restriction applied_at', true,
      '/admin/providers', 'Open the supply directory'
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'key', i.incident_key,
             'area', i.area,
             'severity', i.severity,
             'title', i.title,
             'detail', i.detail,
             'count', i.item_count,
             'oldest_at', i.oldest_at,
             'window_basis', i.window_basis,
             'market_scoped', i.market_scoped,
             'deep_link', i.deep_link,
             'action_label', i.action_label,
             'acknowledged', (ack.incident_key is not null),
             'acknowledged_at', ack.acknowledged_at,
             'acknowledged_count', ack.acknowledged_count,
             'acknowledged_by', (select p2.display_name from public.profiles p2 where p2.account_id = ack.acknowledged_by_account_id),
             'acknowledgement_note', ack.note,
             'recurred', (ack.incident_key is not null and i.item_count > ack.acknowledged_count)
           )
           order by case i.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
                    i.item_count desc, i.incident_key
         ), '[]'::jsonb)
    into items
  from incidents i
  left join public.admin_incident_acknowledgements ack on ack.incident_key = i.incident_key
  where p_severity is null or i.severity = p_severity;

  return jsonb_build_object(
    'allowed', true,
    'role', viewer_role,
    'generated_at', now(),
    'window_hours', window_hours,
    'since', since,
    'market_id', p_market_id,
    'severity', p_severity,
    'counts', jsonb_build_object(
      'critical', (select count(*) from jsonb_array_elements(items) e where e ->> 'severity' = 'critical' and (e ->> 'count')::int > 0 and coalesce((e ->> 'recurred')::boolean, (e ->> 'acknowledged')::boolean = false)),
      'high', (select count(*) from jsonb_array_elements(items) e where e ->> 'severity' = 'high' and (e ->> 'count')::int > 0 and coalesce((e ->> 'recurred')::boolean, (e ->> 'acknowledged')::boolean = false)),
      'medium', (select count(*) from jsonb_array_elements(items) e where e ->> 'severity' = 'medium' and (e ->> 'count')::int > 0 and coalesce((e ->> 'recurred')::boolean, (e ->> 'acknowledged')::boolean = false)),
      'low', (select count(*) from jsonb_array_elements(items) e where e ->> 'severity' = 'low' and (e ->> 'count')::int > 0 and coalesce((e ->> 'recurred')::boolean, (e ->> 'acknowledged')::boolean = false)),
      'unacknowledged', (select count(*) from jsonb_array_elements(items) e where (e ->> 'count')::int > 0 and not coalesce((e ->> 'acknowledged')::boolean, false)),
      'recurred', (select count(*) from jsonb_array_elements(items) e where coalesce((e ->> 'recurred')::boolean, false)),
      'outstanding', (select count(*) from jsonb_array_elements(items) e where (e ->> 'count')::int > 0)
    ),
    'items', items
  );
end $$;

revoke all on function public.admin_incident_feed_command(uuid, integer, text) from public, anon;
grant execute on function public.admin_incident_feed_command(uuid, integer, text) to authenticated;

comment on function public.admin_incident_feed_command(uuid, integer, text) is
  'Derived operational incidents across trust, financials, projects, operations and accounts, with the window each count was measured over, whether a market filter applies, and the acknowledgement state of the queue.';

-- ── Acknowledging an incident ──────────────────────────────────────────────────────────────────

create or replace function public.acknowledge_admin_incident_command(
  p_incident_key text,
  p_area text,
  p_severity text,
  p_acknowledged_count integer,
  p_reason_code text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not app_private.current_account_has_platform_capability('platform.admin.manage') then
    raise exception 'only an administrator may acknowledge a platform incident' using errcode = '42501';
  end if;
  if p_incident_key is null or char_length(btrim(p_incident_key)) < 3 then
    raise exception 'an incident key is required' using errcode = '22023';
  end if;
  if p_area not in ('trust', 'financials', 'projects', 'operations', 'accounts') then
    raise exception 'unknown incident area' using errcode = '22023';
  end if;
  if p_severity not in ('critical', 'high', 'medium', 'low') then
    raise exception 'unknown severity' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('incident_ack', p_reason_code) then
    raise exception 'choose a reason for acknowledging this incident' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 2000 then
    raise exception 'that note is too long' using errcode = '22023';
  end if;

  insert into public.admin_incident_acknowledgements(
    incident_key, area, severity, acknowledged_count, reason_code, note, acknowledged_by_account_id
  ) values (
    btrim(p_incident_key), p_area, p_severity, greatest(coalesce(p_acknowledged_count, 0), 0),
    p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), app_private.current_account_id()
  )
  on conflict (incident_key) do update
    set area = excluded.area,
        severity = excluded.severity,
        acknowledged_count = excluded.acknowledged_count,
        reason_code = excluded.reason_code,
        note = excluded.note,
        acknowledged_by_account_id = excluded.acknowledged_by_account_id,
        acknowledged_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'ADMIN_INCIDENT_ACKNOWLEDGED', 'platform_incident', null, p_reason_code, 'system_internal',
          jsonb_build_object('incident_key', p_incident_key, 'area', p_area, 'severity', p_severity,
                             'acknowledged_count', p_acknowledged_count, 'note', p_note));
end $$;

revoke all on function public.acknowledge_admin_incident_command(text, text, text, integer, text, text) from public, anon;
grant execute on function public.acknowledge_admin_incident_command(text, text, text, integer, text, text) to authenticated;

-- ── The accounts directory ─────────────────────────────────────────────────────────────────────

/**
 * Human accounts, searchable by the address the person gives support and displayed masked.
 *
 * ⚠️ THE SEARCH RUNS ON THE RAW VALUE AND ONLY THE MASK IS RETURNED. Support is handed an email
 * address by somebody on a call; refusing to find it would make the directory useless, and returning
 * it would put a page of addresses one screenshot away from a leak. So the `where` clause sees the raw
 * column and the `select` list does not.
 *
 * ⚠️ STANDING HAS THREE VALUES BECAUSE THE PLATFORM HAS THREE. `account_status` is
 * active/suspended/closed. "Under review" is not a state this platform records, so it is not offered
 * here — an invented fourth option would filter to nothing and read as a bug.
 */
create or replace function public.admin_account_directory_command(
  p_search text default null,
  p_standing text default null,
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
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.support.read')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_standing is not null and p_standing <> '' and p_standing not in ('active', 'suspended', 'closed') then
    raise exception 'unknown account standing' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_sign_in_at desc nulls last, x.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      a.id as account_id,
      coalesce(nullif(btrim(p.display_name), ''), 'Profile not completed') as display_name,
      -- The mask, never the value. `contact_kind` tells the operator which of the two they are reading
      -- so the masked string is never mistaken for a malformed address.
      case
        when u.email is not null and btrim(u.email) <> '' then app_private.mask_email(u.email)
        when u.phone is not null and btrim(u.phone) <> '' then app_private.mask_phone(u.phone)
        else null
      end as contact_masked,
      case
        when u.email is not null and btrim(u.email) <> '' then 'email'
        when u.phone is not null and btrim(u.phone) <> '' then 'phone'
        else 'none'
      end as contact_kind,
      (u.email_confirmed_at is not null) as contact_confirmed,
      u.last_sign_in_at,
      a.status::text as account_status,
      a.created_at,
      (select count(*) from public.providers pr where pr.owner_account_id = a.id)::integer as provider_count,
      (select count(*) from public.requests rq where rq.customer_account_id = a.id)::integer as request_count,
      coalesce((
        select jsonb_agg(jsonb_build_object('key', r.role_key, 'name', r.display_name, 'status', m.status::text) order by r.display_name)
        from public.platform_admin_memberships m
        join public.platform_roles r on r.id = m.role_id
        where m.account_id = a.id and m.revoked_at is null
      ), '[]'::jsonb) as admin_roles,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'organisation_id', o.id,
                 'name', o.display_name,
                 'role', om.role::text,
                 'status', om.status::text
               ) order by o.display_name)
        from public.organisation_members om
        join public.organisations o on o.id = om.organisation_id
        where om.account_id = a.id and om.removed_at is null
      ), '[]'::jsonb) as organisations,
      coalesce((
        select jsonb_build_object(
                 'pending', (count(*) filter (where v.status = 'pending'))::integer,
                 'verified', (count(*) filter (where v.status = 'verified'))::integer,
                 'other', (count(*) filter (where v.status not in ('pending', 'verified')))::integer
               )
        from public.provider_verifications v
        join public.providers pr on pr.id = v.provider_id
        where pr.owner_account_id = a.id
      ), jsonb_build_object('pending', 0, 'verified', 0, 'other', 0)) as verification_summary
    from public.accounts a
    join auth.users u on u.id = a.auth_user_id
    left join public.profiles p on p.account_id = a.id
    where (p_standing is null or p_standing = '' or a.status::text = p_standing)
      and (
        needle = ''
        or lower(coalesce(p.display_name, '')) like '%' || needle || '%'
        or lower(coalesce(u.email, '')) like '%' || needle || '%'
        -- The digit comparison only applies when the search itself carries digits. Without the guard a
        -- search for "john" would become `like '%%'` and match every account with a phone number.
        or (
          regexp_replace(needle, '[^0-9]', '', 'g') <> ''
          and regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') like '%' || regexp_replace(needle, '[^0-9]', '', 'g') || '%'
        )
        or a.id::text like needle || '%'
      )
    order by u.last_sign_in_at desc nulls last, a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) x;

  return jsonb_build_object('allowed', true, 'accounts', result, 'search', p_search, 'standing', p_standing);
end $$;

revoke all on function public.admin_account_directory_command(text, text, integer) from public, anon;
grant execute on function public.admin_account_directory_command(text, text, integer) to authenticated;

comment on function public.admin_account_directory_command(text, text, integer) is
  'Searchable human-account directory. Searches raw contact values and returns only masks, standing, roles, organisation memberships and verification state.';

-- ── One account, in depth ──────────────────────────────────────────────────────────────────────

/**
 * Everything an operator needs to investigate one account, with the PII still masked.
 *
 * ⚠️ SESSIONS ARE SUMMARISED, NOT REPRODUCED. `session_ref` is the first eight characters of the
 * session id — enough for an operator to say "this one" while talking somebody through it, and not the
 * credential. The address is reduced to its network by `mask_ip`, for the reason given beside it.
 *
 * ⚠️ THE RAW CONTACT VALUE IS NOT IN THIS PAYLOAD. `reveal_admin_account_contact_command` is the only
 * way to obtain it, and it writes an audit row first.
 */
create or replace function public.admin_account_detail_command(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  target public.accounts%rowtype;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.support.read')
    or app_private.current_account_has_platform_capability('platform.trust.read')
  ) then
    return jsonb_build_object('allowed', false);
  end if;

  select * into target from public.accounts where id = p_account_id;
  if not found then return jsonb_build_object('allowed', true, 'found', false); end if;

  select jsonb_build_object(
    'allowed', true,
    'found', true,
    'account', jsonb_build_object(
      'account_id', target.id,
      'display_name', coalesce(nullif(btrim(p.display_name), ''), 'Profile not completed'),
      'contact_masked', case
        when u.email is not null and btrim(u.email) <> '' then app_private.mask_email(u.email)
        when u.phone is not null and btrim(u.phone) <> '' then app_private.mask_phone(u.phone)
        else null
      end,
      'contact_kind', case
        when u.email is not null and btrim(u.email) <> '' then 'email'
        when u.phone is not null and btrim(u.phone) <> '' then 'phone'
        else 'none'
      end,
      'has_email', (u.email is not null and btrim(u.email) <> ''),
      'has_phone', (u.phone is not null and btrim(u.phone) <> ''),
      'contact_confirmed', (u.email_confirmed_at is not null),
      'confirmations', jsonb_build_array(
        jsonb_build_object('kind', 'email', 'value_masked', app_private.mask_email(u.email), 'confirmed_at', u.email_confirmed_at),
        jsonb_build_object('kind', 'phone', 'value_masked', app_private.mask_phone(u.phone), 'confirmed_at', u.phone_confirmed_at)
      ),
      'last_sign_in_at', u.last_sign_in_at,
      'account_status', target.status::text,
      'created_at', target.created_at,
      'is_platform_owner', exists (select 1 from public.platform_ownership o where o.owner_account_id = target.id),
      'is_self', target.id = app_private.current_account_id()
    ),
    'admin_roles', coalesce((
      select jsonb_agg(jsonb_build_object('key', r.role_key, 'name', r.display_name, 'status', m.status::text,
                                          'granted_at', m.granted_at, 'revoked_at', m.revoked_at) order by r.display_name)
      from public.platform_admin_memberships m
      join public.platform_roles r on r.id = m.role_id
      where m.account_id = target.id
    ), '[]'::jsonb),
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organisation_id', o.id,
               'name', o.display_name,
               'role', om.role::text,
               'status', om.status::text,
               'joined_at', om.joined_at
             ) order by o.display_name)
      from public.organisation_members om
      join public.organisations o on o.id = om.organisation_id
      where om.account_id = target.id and om.removed_at is null
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pr.id,
               'display_name', pr.display_name,
               'status', pr.status::text,
               'is_public', coalesce(pp.is_public, false),
               'published_at', pp.published_at,
               'readiness_score', sr.total_score,
               'readiness', sr.readiness::text,
               'setup_percent', op.completion_percent,
               'next_action', op.next_action,
               'active_restriction', (
                 select jsonb_build_object('id', x.id, 'kind', x.kind, 'reason_code', x.reason_code,
                                           'applied_at', x.applied_at, 'note', x.note)
                 from public.admin_provider_restrictions x
                 where x.provider_id = pr.id and x.lifted_at is null
                 order by x.applied_at desc limit 1
               )
             ) order by pr.created_at)
      from public.providers pr
      left join public.provider_public_profiles pp on pp.provider_id = pr.id
      left join public.provider_search_readiness sr on sr.provider_id = pr.id
      left join public.provider_onboarding_progress op on op.provider_id = pr.id
      where pr.owner_account_id = target.id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'session_ref', left(s.id::text, 8),
               'created_at', entry ->> 'created_at',
               'updated_at', entry ->> 'updated_at',
               'refreshed_at', entry ->> 'refreshed_at',
               'aal', entry ->> 'aal',
               'ip_masked', app_private.mask_ip(entry ->> 'ip'),
               'user_agent', entry ->> 'user_agent'
             ) order by (entry ->> 'created_at') desc nulls last)
      from auth.sessions s
      cross join lateral (select to_jsonb(s) as entry) j
      -- A session with no live refresh token cannot come back, so it is not an active session. Same
      -- rule as the account holder's own page, so the two never disagree about what "active" means.
      where s.user_id = u.id
        and exists (select 1 from auth.refresh_tokens rt where rt.session_id = s.id and rt.revoked is false)
    ), '[]'::jsonb),
    'verifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'provider_id', v.provider_id,
               'provider_name', pr.display_name,
               'kind', v.kind::text,
               'status', v.status::text,
               'jurisdiction_code', v.jurisdiction_code,
               'created_at', v.created_at,
               'reviewed_at', v.reviewed_at,
               'review_note', nullif(v.metadata ->> 'review_note', '')
             ) order by v.created_at desc)
      from public.provider_verifications v
      join public.providers pr on pr.id = v.provider_id
      where pr.owner_account_id = target.id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'need_text', q.need_text, 'state', q.state::text, 'created_at', q.created_at)
                       order by q.created_at desc)
      from (select * from public.requests rq where rq.customer_account_id = target.id order by rq.created_at desc limit 10) q
    ), '[]'::jsonb),
    'organisations_count', (select count(*) from public.organisation_members om where om.account_id = target.id and om.removed_at is null),
    'open_case_count', (
      (select count(*) from public.provider_verifications v join public.providers pr on pr.id = v.provider_id
        where pr.owner_account_id = target.id and v.status = 'pending')
      + (select count(*) from public.requests rq where rq.customer_account_id = target.id and rq.state = 'disputed')
    )
  ) into result
  from auth.users u
  left join public.profiles p on p.account_id = target.id
  where u.id = target.auth_user_id;

  return coalesce(result, jsonb_build_object('allowed', true, 'found', true, 'account', jsonb_build_object('account_id', target.id, 'account_status', target.status::text, 'display_name', 'Profile not completed'), 'admin_roles', '[]'::jsonb, 'organisations', '[]'::jsonb, 'providers', '[]'::jsonb, 'sessions', '[]'::jsonb, 'verifications', '[]'::jsonb, 'requests', '[]'::jsonb, 'organisations_count', 0, 'open_case_count', 0));
end $$;

revoke all on function public.admin_account_detail_command(uuid) from public, anon;
grant execute on function public.admin_account_detail_command(uuid) to authenticated;

comment on function public.admin_account_detail_command(uuid) is
  'Deep read of one account: masked contacts, roles, organisations, providers, active sessions and verification history. Never returns a raw contact value or a session id.';

-- ── Revealing a contact, audited ───────────────────────────────────────────────────────────────

/**
 * The one way to obtain the raw address, and the reason it exists separately.
 *
 * ⚠️ THE AUDIT ROW IS WRITTEN BEFORE THE VALUE IS RETURNED. If the insert fails, the function raises and
 * the caller receives nothing — so there is no path on which a raw address is shown without a record
 * of who asked. This is what makes the masking in the two readers above a real control rather than a
 * presentation choice.
 *
 * ⚠️ IT DOES NOT REQUIRE A SECOND FACTOR, AND THE REASON IS THE BRIEF. Step-up is reserved here for the
 * writes that change somebody's access — standing, sessions, restrictions. Reading an address that
 * support was already given on a call is a disclosure to be recorded, not a state change to be
 * resisted, and demanding a factor for it would push operators into asking the customer to repeat
 * themselves instead.
 */
create or replace function public.reveal_admin_account_contact_command(
  p_account_id uuid,
  p_reason_code text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  target public.accounts%rowtype;
  raw_email text;
  raw_phone text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.support.read')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('contact_reveal', p_reason_code) then
    raise exception 'choose a reason for revealing this contact' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required to reveal a contact' using errcode = '22023';
  end if;

  select * into target from public.accounts where id = p_account_id;
  if not found then raise exception 'account not found' using errcode = 'P0002'; end if;

  select u.email, u.phone into raw_email, raw_phone from auth.users u where u.id = target.auth_user_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'ACCOUNT_CONTACT_REVEALED', 'account', target.id, p_reason_code, 'restricted',
          jsonb_build_object('note', btrim(p_note),
                             'fields', to_jsonb(array_remove(array[
                               case when raw_email is not null then 'email' end,
                               case when raw_phone is not null then 'phone' end
                             ], null))));

  return jsonb_build_object('allowed', true, 'email', raw_email, 'phone', raw_phone, 'revealed_at', now());
end $$;

revoke all on function public.reveal_admin_account_contact_command(uuid, text, text) from public, anon;
grant execute on function public.reveal_admin_account_contact_command(uuid, text, text) to authenticated;

comment on function public.reveal_admin_account_contact_command(uuid, text, text) is
  'Returns the raw email and phone for one account after writing an audit row naming the operator, the reason code and their note. Fails closed: the value is returned only if the audit write succeeded.';

-- ── Changing an account's standing ─────────────────────────────────────────────────────────────

/**
 * Suspend, reactivate or close an account.
 *
 * ⚠️ WHAT SUSPENSION ACTUALLY DOES, because the page has to say something true. Every authority check in
 * this schema — RLS policies, commands, capability tests — resolves the caller through
 * `app_private.current_account_id()`, which returns NULL unless `accounts.status = 'active'`. So a
 * suspended account is refused by the database on its NEXT request, not when its token expires. The
 * sessions are also ended here so the client cannot even refresh, but the authority change is the part
 * that matters, and it is immediate.
 *
 * ⚠️ THE OWNER AND THE CALLER ARE BOTH OUT OF REACH. Suspending the platform owner would leave the
 * platform unadministrable, and an operator suspending themselves is an accident that reads as a
 * compromise. Both are refused by id, in the database, rather than by hiding a button.
 */
create or replace function public.change_account_standing_command(
  p_account_id uuid,
  p_status text,
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
  target public.accounts%rowtype;
  previous text;
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

  update public.accounts set status = p_status::public.account_status where id = target.id;

  -- Ending the sessions is belt to the authority check's braces: the account is already refused by
  -- every policy, but a refresh would otherwise mint a token that still cannot read anything.
  if p_status <> 'active' then
    delete from auth.refresh_tokens
     where session_id in (select id from auth.sessions where user_id = target.auth_user_id);
    delete from auth.sessions where user_id = target.auth_user_id;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'ACCOUNT_STANDING_CHANGED', 'account', target.id, p_reason_code, 'restricted',
          jsonb_build_object('from', previous, 'to', p_status, 'note', btrim(p_note),
                             'sessions_ended', p_status <> 'active'));
end $$;

revoke all on function public.change_account_standing_command(uuid, text, text, text) from public, anon;
grant execute on function public.change_account_standing_command(uuid, text, text, text) to authenticated;

comment on function public.change_account_standing_command(uuid, text, text, text) is
  'Suspends, reactivates or closes an account. Requires a second factor, a reason code and a note; refuses the platform owner and the caller''s own account; ends the account''s sessions when it stops being active.';

-- ── Ending every session of another account ────────────────────────────────────────────────────

/**
 * Sign an account out of every device.
 *
 * ⚠️ THE ROWS ARE DELETED, NOT FLAGGED. `revoke_my_session_command` in
 * 20260922102000_session_revocation_deletes_rows.sql measured that marking refresh tokens revoked does
 * not stop this GoTrue version refreshing them. The same measurement governs this function, and doing
 * anything tidier here would produce an operator-visible "signed out" that is not true.
 *
 * ⚠️ AN OPERATOR CANNOT USE THIS ON THEMSELVES. Their own devices belong to
 * /settings/security/sessions, which is the surface that knows how to end the session holding the
 * request. Doing it here would sign the operator out mid-investigation with no explanation.
 */
create or replace function public.revoke_account_sessions_command(
  p_account_id uuid,
  p_reason_code text,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  target public.accounts%rowtype;
  ended integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.support.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to end another account''s sessions' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('session_revocation', p_reason_code) then
    raise exception 'choose a reason for ending these sessions' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;

  select * into target from public.accounts where id = p_account_id;
  if not found then raise exception 'account not found' using errcode = 'P0002'; end if;
  if target.id = me then
    raise exception 'use the security settings page to end your own sessions' using errcode = '42501';
  end if;

  select count(*) into ended from auth.sessions where user_id = target.auth_user_id;
  if ended > 0 then
    delete from auth.refresh_tokens where session_id in (select id from auth.sessions where user_id = target.auth_user_id);
    delete from auth.sessions where user_id = target.auth_user_id;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'ACCOUNT_SESSIONS_REVOKED', 'account', target.id, p_reason_code, 'restricted',
          jsonb_build_object('note', btrim(p_note), 'sessions_ended', ended));

  return ended;
end $$;

revoke all on function public.revoke_account_sessions_command(uuid, text, text) from public, anon;
grant execute on function public.revoke_account_sessions_command(uuid, text, text) to authenticated;

comment on function public.revoke_account_sessions_command(uuid, text, text) is
  'Ends every active session of another account by deleting the session rows, with a second factor, a reason code and a note. Refuses the caller''s own account.';

-- ── The provider supply directory ──────────────────────────────────────────────────────────────

/**
 * What the platform has in supply, and what is holding each provider back.
 *
 * ⚠️ READINESS IS READ, NOT RECOMPUTED. The score comes from `provider_search_readiness`, which the
 * provider's own search-readiness page also reads. An operator and a provider disagreeing about the
 * same number because two queries computed it differently is the failure this avoids.
 *
 * ⚠️ `queue` IS DERIVED FROM THE ROWS. "Awaiting verification", "restricted", "expiring credentials" and
 * "not live" are filters over real columns and real rows, not labels an operator maintains.
 */
create or replace function public.admin_provider_directory_command(
  p_search text default null,
  p_queue text default null,
  p_market_id uuid default null,
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
    app_private.current_account_has_platform_capability('platform.admin.manage')
    or app_private.current_account_has_platform_capability('platform.trust.read')
    or app_private.current_account_has_platform_capability('platform.operations.read')
  ) then
    return jsonb_build_object('allowed', false);
  end if;
  if p_queue is not null and p_queue <> '' and p_queue not in ('awaiting_verification', 'restricted', 'expiring_credentials', 'not_live', 'all') then
    raise exception 'unknown supply queue' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      pr.id as provider_id,
      pr.display_name,
      pr.status::text as provider_status,
      pp.slug as public_slug,
      coalesce(pp.is_public, false) as is_public,
      mc.display_name as market_name,
      pr.created_at,
      op.completion_percent as setup_percent,
      sr.total_score as readiness_score,
      sr.readiness::text as readiness_state,
      cr.credential_count,
      cr.credential_expiring,
      cr.credential_expired,
      cr.credential_pending,
      vr.pending_verifications,
      vr.last_verification_at,
      rl.restriction_id,
      rl.restriction_kind,
      rl.restriction_reason_code,
      rl.restriction_applied_at,
      rl.restriction_expires_at,
      rl.restriction_note,
      sc.categories
    from public.providers pr
    left join public.provider_public_profiles pp on pp.provider_id = pr.id
    left join public.public_market_catalog mc on mc.market_id = pr.primary_market_id
    left join public.provider_onboarding_progress op on op.provider_id = pr.id
    left join public.provider_search_readiness sr on sr.provider_id = pr.id
    left join lateral (
      select count(*)::integer as credential_count,
             -- ⚠️ BOTH BOUNDS. "Expiring within 30 days" that counted already-expired rows would overstate
             -- the queue, and an operator acting on it would chase credentials that lapsed last month.
             (count(*) filter (where c.expires_at is not null
                                 and c.expires_at >= current_date
                                 and c.expires_at <= current_date + 30))::integer as credential_expiring,
             (count(*) filter (where c.expires_at is not null and c.expires_at < current_date))::integer as credential_expired,
             (count(*) filter (where c.status = 'pending'))::integer as credential_pending
      from public.provider_credentials c
      where c.provider_id = pr.id
    ) cr on true
    left join lateral (
      select count(*)::integer as pending_verifications, max(v.created_at) as last_verification_at
      from public.provider_verifications v
      where v.provider_id = pr.id and v.status = 'pending'
    ) vr on true
    left join lateral (
      select x.id as restriction_id, x.kind as restriction_kind, x.reason_code as restriction_reason_code,
             x.applied_at as restriction_applied_at, x.expires_at as restriction_expires_at, x.note as restriction_note
      from public.admin_provider_restrictions x
      where x.provider_id = pr.id and x.lifted_at is null
      order by x.applied_at desc limit 1
    ) rl on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', sc2.display_name, 'is_primary', ps.is_primary) order by ps.is_primary desc, sc2.display_name) as categories
      from public.provider_services ps
      join public.public_service_catalog sc2 on sc2.service_entity_id = ps.service_entity_id
      where ps.provider_id = pr.id and ps.is_active
    ) sc on true
    where (needle = '' or lower(pr.display_name) like '%' || needle || '%')
      and (p_market_id is null or pr.primary_market_id = p_market_id)
      and (
        p_queue is null or p_queue = '' or p_queue = 'all'
        or (p_queue = 'awaiting_verification' and coalesce(vr.pending_verifications, 0) > 0)
        or (p_queue = 'restricted' and rl.restriction_id is not null)
        or (p_queue = 'expiring_credentials' and coalesce(cr.credential_expiring, 0) > 0)
        or (p_queue = 'not_live' and coalesce(pp.is_public, false) = false)
      )
    order by pr.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) x;

  return jsonb_build_object('allowed', true, 'providers', result, 'search', p_search, 'queue', p_queue, 'market_id', p_market_id);
end $$;

revoke all on function public.admin_provider_directory_command(text, text, uuid, integer) from public, anon;
grant execute on function public.admin_provider_directory_command(text, text, uuid, integer) to authenticated;

comment on function public.admin_provider_directory_command(text, text, uuid, integer) is
  'Supply directory: onboarding progress, search readiness, service categories, credential status, open verifications and any live operational restriction.';

-- ── Restricting a provider ─────────────────────────────────────────────────────────────────────

create or replace function public.apply_provider_restriction_command(
  p_provider_id uuid,
  p_kind text,
  p_severity text,
  p_reason_code text,
  p_note text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  provider public.providers%rowtype;
  restriction_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.support.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to restrict a provider' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if p_kind not in ('information_required', 'credential_hold', 'availability_paused', 'suspended') then
    raise exception 'unknown restriction kind' using errcode = '22023';
  end if;
  if p_severity not in ('high', 'medium', 'low') then
    raise exception 'unknown restriction severity' using errcode = '22023';
  end if;
  if not app_private.admin_reason_code_valid('provider_restriction', p_reason_code) then
    raise exception 'choose a reason for restricting this provider' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note of at least ten characters is required' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'a restriction cannot expire in the past' using errcode = '22023';
  end if;

  select * into provider from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.admin_provider_restrictions x where x.provider_id = provider.id and x.lifted_at is null) then
    raise exception 'this provider already has an active restriction; lift it before applying another' using errcode = '22023';
  end if;

  insert into public.admin_provider_restrictions(
    provider_id, kind, severity, reason_code, note, applied_by_account_id, expires_at
  ) values (
    provider.id, p_kind, p_severity, p_reason_code, btrim(p_note), app_private.current_account_id(), p_expires_at
  ) returning id into restriction_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PROVIDER_RESTRICTION_APPLIED', 'provider', provider.id, p_reason_code, 'restricted',
          jsonb_build_object('restriction_id', restriction_id, 'kind', p_kind, 'severity', p_severity,
                             'note', btrim(p_note), 'expires_at', p_expires_at));

  return restriction_id;
end $$;

revoke all on function public.apply_provider_restriction_command(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.apply_provider_restriction_command(uuid, text, text, text, text, timestamptz) to authenticated;

comment on function public.apply_provider_restriction_command(uuid, text, text, text, text, timestamptz) is
  'Places one operational hold on a provider with a second factor, a reason code and a note. One live restriction per provider; the row records the decision rather than rewriting the provider''s own status.';

create or replace function public.lift_provider_restriction_command(
  p_restriction_id uuid,
  p_reason_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  restriction public.admin_provider_restrictions%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not (
    app_private.current_account_has_platform_capability('platform.trust.moderate')
    or app_private.current_account_has_platform_capability('platform.support.intervene')
    or app_private.current_account_has_platform_capability('platform.admin.manage')
  ) then
    raise exception 'not authorized to lift a provider restriction' using errcode = '42501';
  end if;
  if not app_private.current_auth_is_aal2() then
    raise exception 'step-up authentication required' using errcode = '42501';
  end if;
  if not app_private.admin_reason_code_valid('restriction_lift', p_reason_code) then
    raise exception 'choose a reason for lifting this restriction' using errcode = '22023';
  end if;

  select * into restriction from public.admin_provider_restrictions where id = p_restriction_id for update;
  if not found then raise exception 'restriction not found' using errcode = 'P0002'; end if;
  if restriction.lifted_at is not null then
    raise exception 'that restriction has already been lifted' using errcode = '22023';
  end if;

  update public.admin_provider_restrictions
     set lifted_at = now(),
         lifted_by_account_id = app_private.current_account_id(),
         lift_reason_code = p_reason_code,
         lift_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = restriction.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'user', 'PROVIDER_RESTRICTION_LIFTED', 'provider', restriction.provider_id, p_reason_code, 'restricted',
          jsonb_build_object('restriction_id', restriction.id, 'kind', restriction.kind, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

revoke all on function public.lift_provider_restriction_command(uuid, text, text) from public, anon;
grant execute on function public.lift_provider_restriction_command(uuid, text, text) to authenticated;

comment on function public.lift_provider_restriction_command(uuid, text, text) is
  'Lifts a live provider restriction with a second factor and a reason code, keeping the original row so the history of the hold survives.';
