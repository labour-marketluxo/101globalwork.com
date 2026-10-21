-- Change requests with a baseline history, the escrow checkpoint, and isolated issue cases.
--
-- ── WHAT THIS ADDS, AND WHAT IT REFUSES TO INVENT ─────────────────────────────────────────────
--
-- 1. CHANGE REQUESTS. `quote_change_requests` is a CUSTOMER's question about a quote and could not carry a proposed
--    price, a schedule shift or a decision. A change request is a proposal with a baseline diff, decided by the
--    party who did not write it, and an acceptance that APPENDS a baseline version — the previous one stays.
--
-- 2. ONE ESCROW CHECKPOINT, SAID OUT LOUD. This platform releases money exactly once per job: the completion
--    approval, against one funded obligation. There is no partial escrow and no per-milestone payout, so the
--    milestones read reports the real checkpoint with its real amount rather than five invented ones each holding
--    money the schema cannot hold.
--
-- 3. ISSUE CASES, WITH A LEGAL HOLD THAT DOES SOMETHING. An issue is a case hub separate from the chat: a kind, a
--    status, deadlines, responses and appeals. A safety, privacy or financial dispute carries a legal hold, and the
--    hold is enforced where it matters — `request_my_payout_command` below refuses to queue a payout while one is
--    open, which is the single financial action a party can take by themselves.

-- ── 1. Change requests and the baseline history ───────────────────────────────────────────────

create table public.project_change_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 4 and 200),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  change_kind text not null check (change_kind in ('scope','schedule','price','mixed')),
  -- The baseline as it stood when the proposal was written, frozen on the row: a proposal that recomputed its own
  -- comparison later would silently compare itself against a baseline it never saw.
  baseline_total_minor bigint,
  baseline_currency_code text,
  baseline_scheduled_start timestamptz,
  proposed_total_minor bigint,
  proposed_currency_code text,
  proposed_scheduled_start timestamptz,
  evidence_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'draft' check (status in ('draft','proposed','accepted','rejected','withdrawn')),
  created_by_account_id uuid not null references public.accounts(id),
  decided_by_account_id uuid references public.accounts(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_change_decision_chk check (
    status not in ('accepted','rejected') or (decided_at is not null and decided_by_account_id is not null)
  ),
  constraint project_change_money_chk check (
    (baseline_total_minor is null) = (baseline_currency_code is null)
    and (proposed_total_minor is null) = (proposed_currency_code is null)
  )
);

create index project_change_assignment_idx on public.project_change_requests(assignment_id, status, created_at desc);

create table public.project_baseline_versions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  version integer not null check (version between 1 and 500),
  total_minor bigint,
  currency_code text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  source text not null check (source in ('accepted_quote','change_request')),
  change_request_id uuid references public.project_change_requests(id) on delete set null,
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  unique (assignment_id, version)
);

alter table public.project_change_requests enable row level security;
alter table public.project_baseline_versions enable row level security;
create policy project_change_participant_read on public.project_change_requests
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
create policy project_baseline_participant_read on public.project_baseline_versions
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
revoke all on public.project_change_requests, public.project_baseline_versions from anon;
revoke insert, update, delete on public.project_change_requests, public.project_baseline_versions from authenticated;
grant select on public.project_change_requests, public.project_baseline_versions to authenticated;

comment on table public.project_baseline_versions is
  'The agreed scope and price of the job, version by version. A change request that is accepted APPENDS a version; nothing updates an earlier one.';

-- ── 2. Issue cases ────────────────────────────────────────────────────────────────────────────

create table public.project_issues (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  kind text not null check (kind in ('operational','safety','privacy','financial_dispute')),
  status text not null default 'open' check (status in ('draft','open','investigation','resolved','escalated','closed')),
  summary text not null check (char_length(btrim(summary)) between 10 and 2000),
  raised_by_account_id uuid not null references public.accounts(id),
  -- A deadline the other party can see. Nothing enforces a consequence for missing it — saying so is better than a
  -- countdown that means nothing.
  response_due_at timestamptz,
  -- The hold is the rule: safety, privacy and financial cases freeze payouts until they are resolved or closed.
  legal_hold boolean not null default false,
  resolution text check (resolution is null or char_length(btrim(resolution)) between 1 and 2000),
  resolved_by_account_id uuid references public.accounts(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_issue_resolution_chk check (
    status not in ('resolved','closed') or (resolved_at is not null and resolution is not null)
  )
);

create unique index project_issues_one_open_idx
  on public.project_issues(assignment_id) where status in ('open','investigation','escalated');
create index project_issues_assignment_idx on public.project_issues(assignment_id, created_at desc);

create table public.project_issue_responses (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.project_issues(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  author_account_id uuid not null references public.accounts(id),
  kind text not null check (kind in ('response','evidence','appeal','settlement','admin_decision')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  evidence_id uuid references public.work_evidence(id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_issue_responses_idx on public.project_issue_responses(issue_id, created_at);

alter table public.project_issues enable row level security;
alter table public.project_issue_responses enable row level security;
create policy project_issues_participant_read on public.project_issues
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
create policy project_issue_responses_participant_read on public.project_issue_responses
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
revoke all on public.project_issues, public.project_issue_responses from anon;
revoke insert, update, delete on public.project_issues, public.project_issue_responses from authenticated;
grant select on public.project_issues, public.project_issue_responses to authenticated;

comment on table public.project_issues is
  'A case hub: an operational issue, a safety or privacy incident, or a financial dispute. Separate from the project chat, and a legal hold on one blocks a self-service payout.';

-- ── 3. Commands ───────────────────────────────────────────────────────────────────────────────

/** Propose a change. The baseline is read here, not taken from the form, so the diff cannot be written by the caller. */
create or replace function public.create_project_change_request_command(
  p_assignment_id uuid,
  p_title text,
  p_description text,
  p_change_kind text,
  p_proposed_total_minor bigint default null,
  p_proposed_scheduled_start timestamptz default null,
  p_evidence_ids uuid[] default '{}'::uuid[],
  p_submit boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  obligation public.payment_obligations%rowtype;
  schedule public.assignment_schedules%rowtype;
  change_id uuid;
  evidence uuid[] := coalesce(p_evidence_ids, '{}'::uuid[]);
  item uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read change requests; they do not propose them' using errcode = '22023'; end if;
  if p_change_kind not in ('scope','schedule','price','mixed') then
    raise exception 'invalid change kind' using errcode = '22023';
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into r from public.requests where id = a.request_id;
  select * into obligation from public.payment_obligations where assignment_id = p_assignment_id;
  select * into schedule from public.assignment_schedules where assignment_id = p_assignment_id;

  foreach item in array evidence loop
    if not exists (select 1 from public.work_evidence w where w.id = item and w.assignment_id = p_assignment_id) then
      raise exception 'that evidence is not on this project' using errcode = '22023';
    end if;
  end loop;

  insert into public.project_change_requests(
    assignment_id, title, description, change_kind,
    baseline_total_minor, baseline_currency_code, baseline_scheduled_start,
    proposed_total_minor, proposed_currency_code, proposed_scheduled_start,
    evidence_ids, status, created_by_account_id
  ) values (
    p_assignment_id, btrim(p_title), btrim(p_description), p_change_kind,
    obligation.amount_minor, obligation.currency_code, schedule.scheduled_start,
    p_proposed_total_minor,
    case when p_proposed_total_minor is null then null else coalesce(obligation.currency_code, 'NGN') end,
    p_proposed_scheduled_start,
    evidence, case when p_submit then 'proposed' else 'draft' end, app_private.current_account_id()
  ) returning id into change_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', case when p_submit then 'PROJECT_CHANGE_PROPOSED' else 'PROJECT_CHANGE_DRAFTED' end,
          'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('change_id', change_id, 'kind', p_change_kind, 'role', role));

  return change_id;
end $$;

revoke all on function public.create_project_change_request_command(uuid, text, text, text, bigint, timestamptz, uuid[], boolean) from public, anon;
grant execute on function public.create_project_change_request_command(uuid, text, text, text, bigint, timestamptz, uuid[], boolean) to authenticated;

/**
 * Decide a change proposal, and — on acceptance — append a baseline version.
 *
 * ⚠️ THE DECIDER IS THE PARTY WHO DID NOT WRITE IT. A proposal you can accept yourself is not a proposal; it is a
 * note to file. This is the same shape the task machine uses for approval, applied to scope and price.
 *
 * ⚠️ ACCEPTANCE APPENDS; IT NEVER EDITS. The baseline version written here sits beside the one it replaces, and the
 * change row records which version it produced. History is the sequence of rows, not a field that moved.
 */
create or replace function public.decide_project_change_request_command(
  p_change_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  c public.project_change_requests%rowtype;
  role text;
  next_version integer;
  baseline_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_decision not in ('accepted','rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into c from public.project_change_requests where id = p_change_id for update;
  if not found then raise exception 'change request not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(c.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then
    raise exception 'platform admins read change requests; the parties decide them' using errcode = '22023';
  end if;
  if c.status not in ('draft','proposed') then
    raise exception 'this proposal has already been decided' using errcode = '22023';
  end if;
  if c.created_by_account_id = app_private.current_account_id() then
    raise exception 'the party who proposed a change does not decide it' using errcode = '22023';
  end if;

  update public.project_change_requests
     set status = p_decision,
         decided_by_account_id = app_private.current_account_id(),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where id = p_change_id;

  if p_decision = 'accepted' then
    select coalesce(max(version), 0) + 1 into next_version
    from public.project_baseline_versions where assignment_id = c.assignment_id;

    insert into public.project_baseline_versions(
      assignment_id, version, total_minor, currency_code, scheduled_start, scheduled_end,
      source, change_request_id, created_by_account_id
    ) values (
      c.assignment_id, next_version,
      coalesce(c.proposed_total_minor, c.baseline_total_minor),
      coalesce(c.proposed_currency_code, c.baseline_currency_code),
      coalesce(c.proposed_scheduled_start, c.baseline_scheduled_start),
      null,
      'change_request', c.id, app_private.current_account_id()
    ) returning id into baseline_id;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_CHANGE_' || upper(p_decision), 'assignment', c.assignment_id, 'participant_private',
          jsonb_build_object('change_id', p_change_id, 'role', role, 'baseline_id', baseline_id));

  return jsonb_build_object('status', p_decision, 'baseline_id', baseline_id, 'baseline_version', next_version);
end $$;

revoke all on function public.decide_project_change_request_command(uuid, text, text) from public, anon;
grant execute on function public.decide_project_change_request_command(uuid, text, text) to authenticated;

create or replace function public.withdraw_project_change_request_command(p_change_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  c public.project_change_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into c from public.project_change_requests where id = p_change_id for update;
  if not found then return; end if;
  -- Only the proposer withdraws their own proposal, and only while it is undecided.
  if c.created_by_account_id <> app_private.current_account_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if c.status not in ('draft','proposed') then return; end if;

  update public.project_change_requests
     set status = 'withdrawn', decision_note = nullif(btrim(coalesce(p_note, '')), ''), decided_at = now(),
         decided_by_account_id = app_private.current_account_id(), updated_at = now()
   where id = p_change_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_CHANGE_WITHDRAWN', 'assignment', c.assignment_id, 'participant_private',
          jsonb_build_object('change_id', p_change_id));
end $$;

revoke all on function public.withdraw_project_change_request_command(uuid, text) from public, anon;
grant execute on function public.withdraw_project_change_request_command(uuid, text) to authenticated;

/** Open a case. A safety, privacy or financial case starts under a legal hold. */
create or replace function public.open_project_issue_command(
  p_assignment_id uuid,
  p_kind text,
  p_summary text,
  p_response_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  issue_id uuid;
  hold boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then
    raise exception 'platform admins work cases through the administration surface, not from a party page' using errcode = '22023';
  end if;
  if p_kind not in ('operational','safety','privacy','financial_dispute') then
    raise exception 'invalid issue kind' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.project_issues i
    where i.assignment_id = p_assignment_id and i.status in ('open','investigation','escalated')
  ) then
    raise exception 'this project already has an open case' using errcode = '23505';
  end if;

  hold := p_kind in ('safety','privacy','financial_dispute');

  insert into public.project_issues(assignment_id, kind, summary, raised_by_account_id, response_due_at, legal_hold)
  values (p_assignment_id, p_kind, btrim(p_summary), app_private.current_account_id(), p_response_due_at, hold)
  returning id into issue_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_ISSUE_OPENED', 'assignment', p_assignment_id, p_kind, 'participant_private',
          jsonb_build_object('issue_id', issue_id, 'legal_hold', hold, 'role', role));

  return issue_id;
end $$;

revoke all on function public.open_project_issue_command(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.open_project_issue_command(uuid, text, text, timestamptz) to authenticated;

/**
 * Add to a case: a response, evidence, an appeal, a settlement offer, or — for platform staff — a decision.
 *
 * ⚠️ THE ADMIN DECISION IS A DIFFERENT KIND OF ENTRY, NOT A COMMENT. `admin_decision` requires the intervention
 * capability, and the case page renders those entries apart from the parties' own words, so a decision cannot read
 * as one more opinion in the thread.
 */
create or replace function public.respond_to_project_issue_command(
  p_issue_id uuid,
  p_kind text,
  p_body text,
  p_evidence_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  i public.project_issues%rowtype;
  role text;
  body text := btrim(coalesce(p_body, ''));
  response_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_kind not in ('response','evidence','appeal','settlement','admin_decision') then
    raise exception 'invalid response kind' using errcode = '22023';
  end if;
  if char_length(body) < 1 or char_length(body) > 4000 then
    raise exception 'a response must be between 1 and 4000 characters' using errcode = '22023';
  end if;

  select * into i from public.project_issues where id = p_issue_id;
  if not found then raise exception 'issue not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(i.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if i.status in ('resolved','closed') then
    raise exception 'this case is closed; nothing more can be added' using errcode = '22023';
  end if;
  if p_kind = 'admin_decision' and not app_private.current_account_has_platform_capability('platform.projects.intervene') then
    raise exception 'a platform decision needs the intervention capability' using errcode = '42501';
  end if;
  if p_kind <> 'admin_decision' and role = 'admin' then
    raise exception 'platform staff post decisions, not party responses' using errcode = '22023';
  end if;
  if p_evidence_id is not null and not exists (
    select 1 from public.work_evidence w where w.id = p_evidence_id and w.assignment_id = i.assignment_id
  ) then
    raise exception 'that evidence is not on this project' using errcode = '22023';
  end if;

  insert into public.project_issue_responses(issue_id, assignment_id, author_account_id, kind, body, evidence_id)
  values (p_issue_id, i.assignment_id, app_private.current_account_id(), p_kind, body, p_evidence_id)
  returning id into response_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_ISSUE_RESPONSE', 'assignment', i.assignment_id, 'participant_private',
          jsonb_build_object('issue_id', p_issue_id, 'kind', p_kind, 'role', role));

  return response_id;
end $$;

revoke all on function public.respond_to_project_issue_command(uuid, text, text, uuid) from public, anon;
grant execute on function public.respond_to_project_issue_command(uuid, text, text, uuid) to authenticated;

/**
 * Move a case's status.
 *
 * ⚠️ WHO MAY DO WHAT IS THE WHOLE POINT. Platform staff investigate, resolve and close — a case is not resolved by
 * the parties agreeing privately, because the hold on the money is the platform's to lift. A party may escalate
 * (asking for that intervention) and may accept a settlement, which is the one resolution a party can cause.
 */
create or replace function public.set_project_issue_status_command(
  p_issue_id uuid,
  p_status text,
  p_resolution text default null
)
returns text
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  i public.project_issues%rowtype;
  role text;
  is_platform boolean;
  resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_status not in ('investigation','escalated','resolved','closed') then
    raise exception 'invalid issue status' using errcode = '22023';
  end if;

  select * into i from public.project_issues where id = p_issue_id for update;
  if not found then raise exception 'issue not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(i.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  is_platform := app_private.current_account_has_platform_capability('platform.projects.intervene')
    and (role = 'admin' or app_private.current_account_has_platform_capability('platform.money.dispute_manage'));

  if p_status in ('investigation','closed') and not is_platform then
    raise exception 'only the platform investigates or closes a case' using errcode = '42501';
  end if;
  if p_status = 'resolved' then
    if is_platform then
      if resolution is null then raise exception 'a platform resolution needs its reasoning' using errcode = '22023'; end if;
    else
      -- A party resolves by accepting a settlement, and only where one was offered.
      if not exists (
        select 1 from public.project_issue_responses r
        where r.issue_id = p_issue_id and r.kind = 'settlement'
      ) then
        raise exception 'there is no settlement to accept' using errcode = '22023';
      end if;
      resolution := coalesce(resolution, 'The parties accepted the settlement on the case.');
    end if;
  end if;
  if i.status in ('resolved','closed') then
    raise exception 'this case is already finished' using errcode = '22023';
  end if;

  update public.project_issues
     set status = p_status,
         resolution = case when p_status in ('resolved','closed') then resolution else null end,
         resolved_by_account_id = case when p_status in ('resolved','closed') then app_private.current_account_id() else null end,
         resolved_at = case when p_status in ('resolved','closed') then now() else null end,
         -- The hold lifts when the case is resolved or closed, and at no other time.
         legal_hold = case when p_status in ('resolved','closed') then false else legal_hold end,
         updated_at = now()
   where id = p_issue_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_ISSUE_' || upper(p_status), 'assignment', i.assignment_id, p_status, 'participant_private',
          jsonb_build_object('issue_id', p_issue_id, 'from', i.status, 'to', p_status, 'platform', is_platform));

  return p_status;
end $$;

revoke all on function public.set_project_issue_status_command(uuid, text, text) from public, anon;
grant execute on function public.set_project_issue_status_command(uuid, text, text) to authenticated;

-- ── 4. The legal hold, enforced where it bites ────────────────────────────────────────────────

/**
 * Redefined: a self-service payout request refuses to queue while a case with a legal hold is open.
 *
 * ⚠️ THIS IS THE ENFORCEMENT THE HOLD EXISTS FOR. Of the money paths a party can reach, this is the only one they
 * operate themselves — the platform's execution path has its own checks — so this is where a frozen case has to
 * stop something. Everything else in the body is unchanged from the version this replaces.
 */
create or replace function public.request_my_payout_command(p_payout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  p public.payouts%rowtype;
  prov public.providers%rowtype;
  reason text;
  ref text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into p from public.payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = p.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.project_issues i
    join public.payment_obligations o on o.assignment_id = i.assignment_id
    where o.id = p.obligation_id
      and i.legal_hold
      and i.status in ('open','investigation','escalated')
  ) then
    raise exception 'this job is under a legal hold: the case has to be resolved first' using errcode = '22023';
  end if;

  if p.status in ('queued','processing','paid') then return p.id; end if;
  if p.status <> 'eligible' then
    raise exception 'this payout is not eligible to request' using errcode = '22023';
  end if;

  reason := app_private.payout_execution_block_reason(p.id);
  if reason is not null then
    raise exception 'payout is not ready: %', reason using errcode = '22023';
  end if;

  ref := coalesce(p.provider_reference, 'gw-payout-' || replace(p.id::text, '-', ''));
  update public.payouts
     set status = 'queued',
         provider_adapter = coalesce(provider_adapter, 'paystack'),
         provider_reference = ref,
         block_reason = null,
         last_validated_at = now(),
         updated_at = now()
   where id = p.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'PAYOUT_REQUESTED_BY_PROVIDER', 'payout', p.id, 'provider_payout_request', 'system_internal',
          jsonb_build_object('provider_id', p.provider_id, 'provider_reference', ref));

  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('payout', p.id, 'PAYOUT_REQUESTED', jsonb_build_object('provider_id', p.provider_id, 'amount_minor', p.amount_minor, 'currency_code', p.currency_code),
          'payout-requested:' || p.id::text)
  on conflict (idempotency_key) do nothing;

  return p.id;
end $$;

-- ── 5. Reads ──────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_project_changes_command(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  changes jsonb := '[]'::jsonb;
  baselines jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'title', c.title,
           'description', c.description,
           'change_kind', c.change_kind,
           'status', c.status,
           'baseline_total_minor', c.baseline_total_minor,
           'baseline_currency_code', c.baseline_currency_code,
           'baseline_scheduled_start', c.baseline_scheduled_start,
           'proposed_total_minor', c.proposed_total_minor,
           'proposed_currency_code', c.proposed_currency_code,
           'proposed_scheduled_start', c.proposed_scheduled_start,
           'price_delta_minor', case
             when c.proposed_total_minor is null or c.baseline_total_minor is null then null
             else c.proposed_total_minor - c.baseline_total_minor
           end,
           'schedule_shift_days', case
             when c.proposed_scheduled_start is null or c.baseline_scheduled_start is null then null
             else round(extract(epoch from (c.proposed_scheduled_start - c.baseline_scheduled_start)) / 86400)::integer
           end,
           'evidence_ids', c.evidence_ids,
           'created_by_role', case when c.created_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
           'created_by_me', c.created_by_account_id = app_private.current_account_id(),
           'decided_by_role', case
             when c.decided_by_account_id is null then null
             when c.decided_by_account_id = r.customer_account_id then 'customer'
             else 'provider'
           end,
           'decided_at', c.decided_at,
           'decision_note', c.decision_note,
           'created_at', c.created_at
         ) order by c.created_at desc), '[]'::jsonb)
    into changes
    from public.project_change_requests c where c.assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'version', b.version, 'total_minor', b.total_minor, 'currency_code', b.currency_code,
           'scheduled_start', b.scheduled_start, 'source', b.source, 'change_request_id', b.change_request_id,
           'created_at', b.created_at
         ) order by b.version), '[]'::jsonb)
    into baselines
    from public.project_baseline_versions b where b.assignment_id = p_assignment_id;

  return jsonb_build_object('allowed', true, 'role', role, 'changes', changes, 'baselines', baselines);
end $$;

revoke all on function public.get_project_changes_command(uuid) from public, anon;
grant execute on function public.get_project_changes_command(uuid) to authenticated;

/**
 * The milestones read: the one escrow checkpoint, the plan's stages, and the open cases.
 *
 * ⚠️ ONE CHECKPOINT HOLDS MONEY, AND THE PAGE SAYS SO. This platform releases escrow exactly once, on the
 * completion approval, against one funded obligation. Stages are checkpoints of the plan and carry no money; showing
 * a payout figure beside each of them would be five numbers the schema cannot pay.
 */
create or replace function public.get_project_milestones_command(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  obligation public.payment_obligations%rowtype;
  payout public.payouts%rowtype;
  stages jsonb := '[]'::jsonb;
  issues jsonb := '[]'::jsonb;
  tasks_total integer := 0;
  tasks_done integer := 0;
  evidence_count integer := 0;
  payout_verified boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;
  select * into obligation from public.payment_obligations where assignment_id = p_assignment_id;
  select * into payout from public.payouts where obligation_id = obligation.id;
  select exists (
    select 1 from public.provider_payout_destinations d
    where d.provider_id = a.provider_id and d.verification_status = 'verified' and d.is_default
  ) into payout_verified;

  select count(*)::integer,
         (count(*) filter (where t.status = 'completed'))::integer
    into tasks_total, tasks_done
    from public.project_tasks t where t.assignment_id = p_assignment_id;
  select count(*)::integer into evidence_count from public.work_evidence w where w.assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'ordinal', s.ordinal, 'title', s.title,
           'task_count', (select count(*) from public.project_tasks t where t.stage_id = s.id),
           'done_count', (select count(*) from public.project_tasks t where t.stage_id = s.id and t.status = 'completed')
         ) order by s.ordinal), '[]'::jsonb)
    into stages
    from public.project_stages s where s.assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'kind', i.kind, 'status', i.status, 'summary', i.summary,
           'legal_hold', i.legal_hold, 'response_due_at', i.response_due_at, 'created_at', i.created_at
         ) order by i.created_at desc), '[]'::jsonb)
    into issues
    from public.project_issues i where i.assignment_id = p_assignment_id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'state', r.state::text,
    'checkpoint', jsonb_build_object(
      'amount_minor', obligation.amount_minor,
      'currency_code', obligation.currency_code,
      'obligation_status', obligation.status::text,
      'payout_status', payout.status::text,
      'payout_verified_destination', payout_verified,
      'required_approver', 'customer',
      'tasks_total', tasks_total,
      'tasks_done', tasks_done,
      'evidence_count', evidence_count,
      'approved_at', (select ca.approved_at from public.completion_approvals ca where ca.assignment_id = p_assignment_id),
      'correction_open', exists (
        select 1 from public.completion_correction_requests c
        where c.assignment_id = p_assignment_id and c.status = 'open'
      )
    ),
    'stages', stages,
    'issues', issues
  );
end $$;

revoke all on function public.get_project_milestones_command(uuid) from public, anon;
grant execute on function public.get_project_milestones_command(uuid) to authenticated;

create or replace function public.get_project_issue_command(p_assignment_id uuid, p_issue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  i public.project_issues%rowtype;
  obligation public.payment_obligations%rowtype;
  payout public.payouts%rowtype;
  responses jsonb := '[]'::jsonb;
  hold_minor bigint;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;
  select * into i from public.project_issues where id = p_issue_id and assignment_id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into obligation from public.payment_obligations where assignment_id = p_assignment_id;
  select * into payout from public.payouts where obligation_id = obligation.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', resp.id,
           'kind', resp.kind,
           'body', resp.body,
           'evidence_id', resp.evidence_id,
           'author_role', case
             when resp.author_account_id = r.customer_account_id then 'customer'
             when resp.author_account_id = (select p.owner_account_id from public.providers p where p.id = a.provider_id) then 'provider'
             else 'platform'
           end,
           'author_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = resp.author_account_id limit 1), 'A participant'),
           'created_at', resp.created_at
         ) order by resp.created_at), '[]'::jsonb)
    into responses
    from public.project_issue_responses resp where resp.issue_id = p_issue_id;

  -- The money the hold is sitting on: an eligible or queued payout is exactly what this case is freezing.
  hold_minor := case
    when i.legal_hold and payout.status in ('eligible','queued','processing') then payout.amount_minor
    else null
  end;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'issue', jsonb_build_object(
      'id', i.id,
      'kind', i.kind,
      'status', i.status,
      'summary', i.summary,
      'raised_by_role', case when i.raised_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
      'raised_by_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = i.raised_by_account_id limit 1), 'A participant'),
      'response_due_at', i.response_due_at,
      'legal_hold', i.legal_hold,
      'resolution', i.resolution,
      'resolved_at', i.resolved_at,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ),
    'responses', responses,
    'money', jsonb_build_object(
      'obligation_status', obligation.status::text,
      'amount_minor', obligation.amount_minor,
      'currency_code', obligation.currency_code,
      'payout_status', payout.status::text,
      'held_minor', hold_minor
    ),
    'platform': jsonb_build_object(
      'can_intervene', app_private.current_account_has_platform_capability('platform.projects.intervene')
    )
  );
end $$;

revoke all on function public.get_project_issue_command(uuid, uuid) from public, anon;
grant execute on function public.get_project_issue_command(uuid, uuid) to authenticated;
