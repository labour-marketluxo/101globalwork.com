-- Phase 7: the completion gate, verified-work reviews, and the customer's asset registry.
--
-- WHAT WAS MISSING, AND WHAT WAS NOT.
--
--   * COMPLETION was half-built. `approve_assignment_completion_command` exists and is well guarded — active
--     assignment, the customer owns the request, the request is `submitted_for_approval`, evidence exists, and
--     a payment obligation must already be funded. What had no writer at all were the other two answers a
--     customer can give: `request correction` and `raise a dispute`. The request state machine has allowed
--     `submitted_for_approval → in_progress` and `→ disputed` since phase 0, so both were reachable states that
--     nothing could reach. There was also nowhere to record what the customer had actually checked before
--     approving, which is what "auditable completion" needs.
--
--   * REVIEWS did not exist in any form — no table, no rating, no provenance rule.
--
--   * ASSETS did not exist in any form.
--
-- ⚠️ NO FILE UPLOADS, AND THE PAGES SAY SO. There is no object storage bucket configured anywhere in this
-- project: `work_evidence.storage_object_path` is a column every writer passes `null` to, and nothing else
-- stores bytes. So reviews and assets hold LINKS to photographs and documents, validated as https, rather than
-- pretending to hold the files. Adding a bucket means credentials, policies and a retention story, and none of
-- that can be verified from here — a dropzone that silently failed to upload would be worse than a link field.
--
-- ⚠️ WHAT MOVES MONEY, AND WHAT DOES NOT. Approving completion is what makes a payout eligible; the payout
-- itself is still executed by the finance commands, after their own revalidation. Requesting a correction
-- moves the work back to `in_progress`, which by itself makes no payout eligible at all. Raising a dispute
-- stops a payout becoming eligible and blocks one that already is. None of the review or asset commands touch
-- money in any way.

-- ── What the customer confirmed before approving ──────────────────────────────────────────────────────
alter table public.completion_approvals
  add column if not exists acknowledged_criteria jsonb not null default '[]'::jsonb;

alter table public.completion_approvals
  add constraint completion_approvals_criteria_is_array
  check (jsonb_typeof(acknowledged_criteria) = 'array');

comment on column public.completion_approvals.acknowledged_criteria is
  'The agreed-scope items the customer ticked before releasing funds: a JSON array of {"key": text, "label": text} exactly as they were shown.';

/**
 * Link arrays — photographs, documents — validated once, for every table that holds them.
 *
 * ⚠️ IMMUTABLE SO IT CAN BE CALLED FROM A CONSTRAINT, AND USED ONLY FROM COMMANDS FOR NOW. It raises rather
 * than returning a boolean, because a CHECK constraint that fails gives a constraint error and the caller
 * cannot tell which link was wrong. The commands call it directly, where the message can name the field.
 */
create or replace function app_private.validate_url_array(p_value jsonb, p_max integer, p_what text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  element jsonb;
begin
  if p_value is null then return '[]'::jsonb; end if;
  if pg_catalog.jsonb_typeof(p_value) <> 'array' then
    raise exception '% must be a list of links', p_what using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_value) > p_max then
    raise exception '% accepts at most % links', p_what, p_max using errcode = '22023';
  end if;
  for element in select e from pg_catalog.jsonb_array_elements(p_value) as t(e) loop
    if pg_catalog.jsonb_typeof(element) <> 'string' then
      raise exception 'every % entry must be a link', p_what using errcode = '22023';
    end if;
    if (element #>> '{}') !~ '^https://[^[:space:]]+$' then
      raise exception 'every % link must start with https://', p_what using errcode = '22023';
    end if;
  end loop;
  return p_value;
end
$function$;

comment on function app_private.validate_url_array(jsonb, integer, text) is
  'Normalises a JSON array of https links, refusing anything else. The platform stores references, not files.';

revoke all on function app_private.validate_url_array(jsonb, integer, text) from public, anon, authenticated;

-- ── Approval, now recording what was checked ──────────────────────────────────────────────────────────
-- ⚠️ DROPPED AND RECREATED, NOT `create or replace`. Postgres would treat a three-argument version as a
-- second function beside the two-argument one, and the SQL funding-gate suite calls this positionally with two
-- arguments. Dropping first means one function, whose third parameter defaults, and that call keeps working.
drop function if exists public.approve_assignment_completion_command(uuid, text);
drop function if exists app_private.approve_assignment_completion_authoritatively(uuid, text);

create or replace function app_private.approve_assignment_completion_authoritatively(
  p_assignment_id uuid,
  p_note text default null,
  p_acknowledged_criteria jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private', 'auth'
as $function$
declare
  a public.assignments%rowtype;
  r public.requests%rowtype;
  actor_account uuid;
  approval_id uuid;
  obligation_id uuid;
  obligation_status public.payment_obligation_status;
  criteria jsonb := coalesce(p_acknowledged_criteria, '[]'::jsonb);
  item jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  actor_account:=app_private.current_account_id();
  select * into a from public.assignments where id=p_assignment_id for update;
  if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
  select * into r from public.requests where id=a.request_id for update;
  if r.customer_account_id<>actor_account then raise exception 'forbidden' using errcode='42501'; end if;
  if r.state<>'submitted_for_approval' then raise exception 'work must be submitted for approval' using errcode='22023'; end if;
  if not exists(select 1 from public.work_evidence where assignment_id=a.id) then raise exception 'completion evidence required' using errcode='22023'; end if;

  select po.id,po.status into obligation_id,obligation_status from public.payment_obligations po where po.assignment_id=a.id for update;
  if found and obligation_status <> 'funded' then
    raise exception 'customer payment must be funded before paid work is approved complete' using errcode='22023';
  end if;

  -- The checklist, validated rather than trusted. The application requires at least one item; the database
  -- requires that whatever is sent is a list of {key,label} pairs, so an approval can never carry a shape the
  -- page could not have produced.
  if jsonb_typeof(criteria) <> 'array' then
    raise exception 'the confirmation checklist must be a list' using errcode='22023';
  end if;
  if jsonb_array_length(criteria) > 40 then
    raise exception 'that is more checklist items than this job could have' using errcode='22023';
  end if;
  for item in select e from jsonb_array_elements(criteria) as t(e) loop
    if jsonb_typeof(item) <> 'object'
       or nullif(btrim(coalesce(item->>'key','')),'') is null
       or nullif(btrim(coalesce(item->>'label','')),'') is null
       or char_length(item->>'label') > 300 then
      raise exception 'every checklist item needs a key and a label of at most 300 characters' using errcode='22023';
    end if;
  end loop;

  insert into public.completion_approvals(assignment_id,request_id,customer_account_id,note,acknowledged_criteria)
  values(a.id,r.id,actor_account,nullif(btrim(coalesce(p_note,'')),''),criteria) returning id into approval_id;
  update public.assignments set status='completed',ended_at=now() where id=a.id;
  update public.requests set state='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=r.id;
  if obligation_id is not null then perform app_private.refresh_payout_eligibility(obligation_id); end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','ASSIGNMENT_COMPLETION_APPROVED','assignment',a.id,'participant_private',
         jsonb_build_object('approval_id',approval_id,'payment_status',coalesce(obligation_status::text,'not_required'),
                            'criteria_acknowledged',jsonb_array_length(criteria)));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('assignment',a.id,'ASSIGNMENT_COMPLETION_APPROVED',jsonb_build_object('request_id',r.id,'approval_id',approval_id),
         'assignment-completed:'||a.id::text)
  on conflict (idempotency_key) do nothing;
  return approval_id;
end
$function$;

create or replace function public.approve_assignment_completion_command(
  p_assignment_id uuid,
  p_note text default null,
  p_acknowledged_criteria jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path='app_private'
as $function$
  select app_private.approve_assignment_completion_authoritatively(p_assignment_id, p_note, p_acknowledged_criteria)
$function$;

revoke all on function public.approve_assignment_completion_command(uuid, text, jsonb) from public, anon;
grant execute on function public.approve_assignment_completion_command(uuid, text, jsonb) to authenticated;
grant execute on function app_private.approve_assignment_completion_authoritatively(uuid, text, jsonb) to authenticated;

-- ── "Not yet": send the work back ─────────────────────────────────────────────────────────────────────
create table public.completion_correction_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  message text not null,
  status text not null default 'open' check (status in ('open','withdrawn','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint completion_correction_message_chk check (char_length(btrim(message)) between 10 and 2000)
);

comment on table public.completion_correction_requests is
  'The customer sending submitted work back with a reason. The request returns to in_progress; the provider reads this on their copy of the job.';

create index completion_correction_assignment_idx on public.completion_correction_requests(assignment_id, created_at desc);
-- One open correction per assignment: the provider should be working to one list, not a pile of them.
create unique index completion_correction_one_open_idx
  on public.completion_correction_requests(assignment_id) where status = 'open';

alter table public.completion_correction_requests enable row level security;

create policy completion_correction_customer_read on public.completion_correction_requests
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy completion_correction_provider_read on public.completion_correction_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = completion_correction_requests.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy completion_correction_admin_read on public.completion_correction_requests
  for select to authenticated
  using (app_private.current_account_has_platform_capability('platform.projects.read'));

revoke all on public.completion_correction_requests from anon;
revoke insert, update, delete on public.completion_correction_requests from authenticated;
grant select on public.completion_correction_requests to authenticated;

create or replace function public.request_completion_correction_command(
  p_assignment_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  msg text := btrim(coalesce(p_message,''));
  correction_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found or a.status <> 'active' then raise exception 'active assignment required' using errcode='22023'; end if;
  select * into r from public.requests where id = a.request_id for update;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if r.state <> 'submitted_for_approval' then
    raise exception 'this work is not waiting for your approval' using errcode='22023';
  end if;
  if char_length(msg) < 10 then
    raise exception 'say what needs putting right, in a sentence' using errcode='22023';
  end if;

  update public.completion_correction_requests
  set status='superseded', resolved_at=now()
  where assignment_id = a.id and status = 'open';

  insert into public.completion_correction_requests(assignment_id, request_id, provider_id, customer_account_id, message)
  values (a.id, r.id, a.provider_id, me, msg)
  returning id into correction_id;

  -- ⚠️ THE STATE MACHINE IS THE GATE. `submitted_for_approval → in_progress` has been permitted since phase 0
  -- and was unreachable; this is its writer. The trigger reads it, so the transition cannot drift from here.
  update public.requests set state='in_progress', updated_at=now() where id = r.id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values (auth.uid(),'account','WORK_COMPLETION_CORRECTION_REQUESTED','assignment',a.id,'correction_request','participant_private',
          jsonb_build_object('correction_id',correction_id,'request_id',r.id));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('assignment',a.id,'WORK_CORRECTION_REQUESTED',
          jsonb_build_object('request_id',r.id,'correction_id',correction_id),
          'work-correction:'||correction_id::text);

  return correction_id;
end
$function$;

revoke all on function public.request_completion_correction_command(uuid, text) from public, anon;
grant execute on function public.request_completion_correction_command(uuid, text) to authenticated;

-- ── "Something is wrong": a dispute ───────────────────────────────────────────────────────────────────
create table public.completion_disputes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  obligation_id uuid references public.payment_obligations(id) on delete restrict,
  reason text not null,
  status text not null default 'open' check (status in ('open','withdrawn','resolved')),
  resolved_by_account_id uuid references public.accounts(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint completion_dispute_reason_chk check (char_length(btrim(reason)) between 10 and 2000),
  constraint completion_dispute_resolution_chk check (status <> 'resolved' or resolved_at is not null)
);

comment on table public.completion_disputes is
  'A customer saying the work is not right. Moves the request to disputed, which stops a payout becoming eligible; resolving one is a platform action, not a customer one.';

create index completion_disputes_assignment_idx on public.completion_disputes(assignment_id, created_at desc);
create unique index completion_disputes_one_open_idx on public.completion_disputes(assignment_id) where status = 'open';

alter table public.completion_disputes enable row level security;

create policy completion_disputes_customer_read on public.completion_disputes
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy completion_disputes_provider_read on public.completion_disputes
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = completion_disputes.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy completion_disputes_admin_read on public.completion_disputes
  for select to authenticated
  using (app_private.current_account_has_platform_capability('platform.projects.read'));

revoke all on public.completion_disputes from anon;
revoke insert, update, delete on public.completion_disputes from authenticated;
grant select on public.completion_disputes to authenticated;

create or replace function public.raise_completion_dispute_command(
  p_assignment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  o public.payment_obligations%rowtype;
  reason text := btrim(coalesce(p_reason,''));
  dispute_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'assignment not found' using errcode='P0002'; end if;
  select * into r from public.requests where id = a.request_id for update;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  -- A dispute is possible while the work is with the customer, or after they approved it and changed their
  -- mind. It is not possible on a job that was cancelled, or one already in dispute.
  if r.state not in ('submitted_for_approval','in_progress','scheduled','completed','accepted') then
    raise exception 'this job is not in a state that can be disputed' using errcode='22023';
  end if;
  if char_length(reason) < 10 then
    raise exception 'say what is wrong, in a sentence' using errcode='22023';
  end if;

  select * into o from public.payment_obligations where assignment_id = a.id;

  insert into public.completion_disputes(assignment_id, request_id, provider_id, customer_account_id, obligation_id, reason)
  values (a.id, r.id, a.provider_id, me, o.id, reason)
  returning id into dispute_id;

  update public.requests set state='disputed', updated_at=now() where id = r.id;

  -- A payout that already exists must stop, and the hold is the platform's own interlock rather than a flag on
  -- this table. With no payout yet, moving the request to `disputed` is what keeps one from becoming eligible —
  -- `refresh_payout_eligibility` only ever fires for a completed request.
  if o.id is not null then
    perform app_private.block_payout_for_financial_hold(o.id, 'dispute_open');
  end if;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values (auth.uid(),'account','WORK_COMPLETION_DISPUTED','assignment',a.id,'work_dispute','participant_private',
          jsonb_build_object('dispute_id',dispute_id,'request_id',r.id,'obligation_id',o.id,'previous_state','submitted_for_approval'));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('assignment',a.id,'WORK_DISPUTED',
          jsonb_build_object('request_id',r.id,'dispute_id',dispute_id,'provider_id',a.provider_id),
          'work-disputed:'||dispute_id::text);

  return dispute_id;
end
$function$;

create or replace function public.withdraw_completion_dispute_command(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  d public.completion_disputes%rowtype;
  r public.requests%rowtype;
begin
  if me is null then raise exception 'not authorized' using errcode='42501'; end if;
  select * into d from public.completion_disputes where id = p_dispute_id for update;
  if not found then raise exception 'that dispute no longer exists' using errcode='P0002'; end if;
  if d.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if d.status <> 'open' then raise exception 'that dispute is already %', d.status using errcode='22023'; end if;

  select * into r from public.requests where id = d.request_id for update;
  if r.state <> 'disputed' then
    raise exception 'this job has already moved on from the dispute' using errcode='22023';
  end if;

  update public.completion_disputes set status='withdrawn', resolved_at=now() where id = d.id;

  -- ⚠️ WITHDRAWING PUTS THE WORK BACK WHERE IT WAS, AND ONLY ONE PLACE IS SOUND. Back to
  -- `submitted_for_approval`: the evidence is still there, the payout was never released, and the customer has
  -- to make the approval decision explicitly. Returning it to `in_progress` would throw away the submit the
  -- provider already made; returning it to `completed` would approve work nobody approved.
  update public.requests set state='submitted_for_approval', updated_at=now() where id = r.id;

  if d.obligation_id is not null then
    perform app_private.refresh_payout_eligibility(d.obligation_id);
  end if;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values (auth.uid(),'account','WORK_COMPLETION_DISPUTE_WITHDRAWN','assignment',d.assignment_id,'work_dispute_withdrawn','participant_private',
          jsonb_build_object('dispute_id',d.id));
end
$function$;

revoke all on function public.raise_completion_dispute_command(uuid, text) from public, anon;
revoke all on function public.withdraw_completion_dispute_command(uuid) from public, anon;
grant execute on function public.raise_completion_dispute_command(uuid, text) to authenticated;
grant execute on function public.withdraw_completion_dispute_command(uuid) to authenticated;

-- ── Reviews, only after verified completion ───────────────────────────────────────────────────────────
create table public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  -- ⚠️ THE PROVENANCE RECORD, CARRIED AS A FOREIGN KEY RATHER THAN CHECKED ONCE. A review is attached to the
  -- exact approval row that made the work complete, so a review cannot outlive the record that justified it and
  -- the rule is enforced by the schema, not only by the command that writes the row.
  completion_approval_id uuid not null references public.completion_approvals(id) on delete restrict,
  workmanship smallint not null check (workmanship between 1 and 5),
  punctuality smallint not null check (punctuality between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  quote_accuracy smallint not null check (quote_accuracy between 1 and 5),
  comment text,
  photo_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_reviews_comment_chk check (comment is null or char_length(btrim(comment)) between 1 and 2000),
  constraint provider_reviews_photos_is_array check (jsonb_typeof(photo_urls) = 'array')
);

comment on table public.provider_reviews is
  'One review per completed assignment, from the customer who paid for it. `completion_approval_id` is the proof the work was verified complete first.';

create index provider_reviews_provider_idx on public.provider_reviews(provider_id, created_at desc);

alter table public.provider_reviews enable row level security;

create policy provider_reviews_customer_read on public.provider_reviews
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

-- The provider reads their own reviews. There is no public review wall and this migration does not invent one:
-- `provider_public_profiles.trust_score` is a separate, platform-controlled figure and is not derived here.
create policy provider_reviews_provider_read on public.provider_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_reviews.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy provider_reviews_admin_read on public.provider_reviews
  for select to authenticated
  using (app_private.current_account_has_platform_capability('platform.trust.read'));

revoke all on public.provider_reviews from anon;
revoke insert, update, delete on public.provider_reviews from authenticated;
grant select on public.provider_reviews to authenticated;

create or replace function public.submit_provider_review_command(
  p_assignment_id uuid,
  p_workmanship smallint,
  p_punctuality smallint,
  p_communication smallint,
  p_quote_accuracy smallint,
  p_comment text default null,
  p_photo_urls jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  approval_id uuid;
  photos jsonb;
  review_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then raise exception 'assignment not found' using errcode='P0002'; end if;
  select * into r from public.requests where id = a.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  -- ⚠️ VERIFIED WORK PROVENANCE, ENFORCED HERE AND BY THE FOREIGN KEY. The review has to point at the approval
  -- row that recorded the customer accepting this work, and that row only exists if the provider submitted
  -- evidence and the customer approved it. A completed assignment with no approval row cannot be reviewed.
  select id into approval_id from public.completion_approvals where assignment_id = a.id;
  if approval_id is null then
    raise exception 'this job has not been approved complete, so it cannot be reviewed' using errcode='22023';
  end if;
  if a.status <> 'completed' then
    raise exception 'this job is not complete, so it cannot be reviewed' using errcode='22023';
  end if;

  -- ⚠️ ONE REVIEW PER JOB, AND THE MESSAGE SAYS SO. The unique index would refuse a second one with a
  -- constraint error; saying it here means the customer reads a sentence instead of a constraint name.
  if exists (select 1 from public.provider_reviews r where r.assignment_id = a.id) then
    raise exception 'you have already reviewed this job' using errcode='22023';
  end if;

  if p_workmanship is null or p_workmanship not between 1 and 5
     or p_punctuality is null or p_punctuality not between 1 and 5
     or p_communication is null or p_communication not between 1 and 5
     or p_quote_accuracy is null or p_quote_accuracy not between 1 and 5 then
    raise exception 'every rating has to be a whole number from 1 to 5' using errcode='22023';
  end if;

  photos := app_private.validate_url_array(p_photo_urls, 6, 'review photographs');

  insert into public.provider_reviews(
    assignment_id, request_id, provider_id, customer_account_id, completion_approval_id,
    workmanship, punctuality, communication, quote_accuracy, comment, photo_urls
  ) values (
    a.id, r.id, a.provider_id, me, approval_id,
    p_workmanship, p_punctuality, p_communication, p_quote_accuracy,
    nullif(btrim(coalesce(p_comment,'')), ''), photos
  ) returning id into review_id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','PROVIDER_REVIEW_SUBMITTED','provider_review',review_id,'participant_private',
          jsonb_build_object('assignment_id',a.id,'provider_id',a.provider_id,'approval_id',approval_id,
                             'ratings',jsonb_build_object('workmanship',p_workmanship,'punctuality',p_punctuality,
                                                          'communication',p_communication,'quote_accuracy',p_quote_accuracy)));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('provider',a.provider_id,'PROVIDER_REVIEW_SUBMITTED',
          jsonb_build_object('review_id',review_id,'assignment_id',a.id,'provider_id',a.provider_id),
          'provider-review:'||review_id::text);

  return review_id;
end
$function$;

revoke all on function public.submit_provider_review_command(uuid, smallint, smallint, smallint, smallint, text, jsonb) from public, anon;
grant execute on function public.submit_provider_review_command(uuid, smallint, smallint, smallint, smallint, text, jsonb) to authenticated;

-- ── The customer's own registry of things that were installed, made or maintained ─────────────────────
--
-- ⚠️ AN ASSET IS THE CUSTOMER'S RECORD, NOT THE PLATFORM'S. Nothing here is derived from the work the platform
-- brokered, and it is not asserted by a provider: the customer writes what they own, and the only provider
-- named is one they point at. That is why an asset can exist with no assignment behind it at all — a boiler
-- somebody else installed is still a boiler, and a registry that refused it would be a registry nobody keeps.
create table public.customer_assets (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  name text not null,
  category text not null,
  make_model text,
  serial_number text,
  installed_on date,
  location_id uuid references public.public_location_catalog(location_id) on delete set null,
  installed_by_provider_id uuid references public.providers(id) on delete set null,
  -- Set when the asset came out of a job on this platform, so the page can point back at the work that put it
  -- there. Nullable, because most of the things in somebody's building were installed by somebody else.
  source_assignment_id uuid references public.assignments(id) on delete set null,
  warranty_provider_name text,
  warranty_expires_on date,
  next_service_due_on date,
  notes text,
  document_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_assets_name_chk check (char_length(btrim(name)) between 2 and 200),
  constraint customer_assets_category_chk check (char_length(btrim(category)) between 2 and 80),
  constraint customer_assets_documents_is_array check (jsonb_typeof(document_urls) = 'array'),
  constraint customer_assets_warranty_window_chk check (
    warranty_expires_on is null or installed_on is null or warranty_expires_on >= installed_on
  )
);

comment on table public.customer_assets is
  'What the customer owns: installed, made or maintained. Written by the customer, read by them and by any provider they have named on it.';

create index customer_assets_account_idx on public.customer_assets(customer_account_id, created_at desc);

create table public.asset_service_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.customer_assets(id) on delete cascade,
  occurred_on date not null,
  kind text not null check (kind in ('installed','service','repair','maintenance','warranty_claim','note')),
  summary text not null,
  provider_id uuid references public.providers(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  document_urls jsonb not null default '[]'::jsonb,
  recorded_by_account_id uuid not null references public.accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint asset_service_summary_chk check (char_length(btrim(summary)) between 2 and 2000),
  constraint asset_service_documents_is_array check (jsonb_typeof(document_urls) = 'array')
);

comment on table public.asset_service_events is
  'The asset''s history: one row per thing that happened to it, each with the date it happened rather than the date it was typed in.';

create index asset_service_events_asset_idx on public.asset_service_events(asset_id, occurred_on desc, created_at desc);

create table public.asset_warranty_claims (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.customer_assets(id) on delete cascade,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  provider_id uuid references public.providers(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','withdrawn')),
  document_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint asset_warranty_claim_reason_chk check (char_length(btrim(reason)) between 10 and 2000),
  constraint asset_warranty_claim_documents_is_array check (jsonb_typeof(document_urls) = 'array')
);

comment on table public.asset_warranty_claims is
  'A customer saying they are claiming on a warranty. Recorded and shown to the named provider — the platform does not adjudicate warranties and has no model for doing so.';
comment on column public.asset_warranty_claims.status is
  'Only the two states a customer can cause: open and withdrawn. Nothing resolves a claim inside the platform, and no third value pretends otherwise.';

create index asset_warranty_claims_asset_idx on public.asset_warranty_claims(asset_id, created_at desc);
create unique index asset_warranty_claims_one_open_idx on public.asset_warranty_claims(asset_id) where status = 'open';

alter table public.customer_assets enable row level security;
alter table public.asset_service_events enable row level security;
alter table public.asset_warranty_claims enable row level security;

create policy customer_assets_owner_all on public.customer_assets
  for all to authenticated
  using (customer_account_id = app_private.current_account_id())
  with check (customer_account_id = app_private.current_account_id());

-- The provider named on an asset reads it. They are the one who installed or maintains the thing, and a
-- registry entry naming them that they cannot see would be a record about them they are not party to.
create policy customer_assets_named_provider_read on public.customer_assets
  for select to authenticated
  using (
    installed_by_provider_id is not null and exists (
      select 1 from public.providers p
      where p.id = customer_assets.installed_by_provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy asset_service_events_owner_all on public.asset_service_events
  for all to authenticated
  using (exists (
    select 1 from public.customer_assets a
    where a.id = asset_service_events.asset_id and a.customer_account_id = app_private.current_account_id()
  ))
  with check (exists (
    select 1 from public.customer_assets a
    where a.id = asset_service_events.asset_id and a.customer_account_id = app_private.current_account_id()
  ));

create policy asset_service_events_provider_read on public.asset_service_events
  for select to authenticated
  using (
    provider_id is not null and exists (
      select 1 from public.providers p
      where p.id = asset_service_events.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy asset_warranty_claims_owner_all on public.asset_warranty_claims
  for all to authenticated
  using (customer_account_id = app_private.current_account_id())
  with check (customer_account_id = app_private.current_account_id());

create policy asset_warranty_claims_provider_read on public.asset_warranty_claims
  for select to authenticated
  using (
    provider_id is not null and exists (
      select 1 from public.providers p
      where p.id = asset_warranty_claims.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.customer_assets, public.asset_service_events, public.asset_warranty_claims from anon;
-- ⚠️ SELECT ONLY, EVEN THOUGH THE POLICIES ABOVE ARE `for all`. Every write goes through a command below, so the
-- ownership check, the date checks and the audit row cannot be skipped by posting to PostgREST directly. The
-- permissive policies exist so that a future definer path or an admin capability can be added without a second
-- migration; they are not a licence for the client to write.
revoke insert, update, delete on public.customer_assets, public.asset_service_events, public.asset_warranty_claims from authenticated;
grant select on public.customer_assets, public.asset_service_events, public.asset_warranty_claims to authenticated;

create or replace function public.create_customer_asset_command(
  p_name text,
  p_category text,
  p_make_model text default null,
  p_serial_number text default null,
  p_installed_on date default null,
  p_location_id uuid default null,
  p_warranty_provider_name text default null,
  p_warranty_expires_on date default null,
  p_next_service_due_on date default null,
  p_notes text default null,
  p_document_urls jsonb default '[]'::jsonb,
  p_source_assignment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  name text := btrim(coalesce(p_name,''));
  category text := btrim(coalesce(p_category,''));
  docs jsonb;
  a public.assignments%rowtype;
  r public.requests%rowtype;
  provider uuid;
  installed date := p_installed_on;
  asset_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  if char_length(name) < 2 then raise exception 'give the asset a name' using errcode='22023'; end if;
  if char_length(name) > 200 then raise exception 'that name is too long' using errcode='22023'; end if;
  if char_length(category) < 2 then raise exception 'say what kind of thing it is' using errcode='22023'; end if;
  if char_length(category) > 80 then raise exception 'that category is too long' using errcode='22023'; end if;

  if p_warranty_expires_on is not null and installed is not null and p_warranty_expires_on < installed then
    raise exception 'a warranty cannot end before the thing was installed' using errcode='22023';
  end if;
  if p_next_service_due_on is not null and installed is not null and p_next_service_due_on < installed then
    raise exception 'the next service cannot be due before the thing was installed' using errcode='22023';
  end if;

  docs := app_private.validate_url_array(p_document_urls, 10, 'asset documents');

  -- ⚠️ LINKING TO A JOB IS CHECKED, NOT TRUSTED. The assignment has to be the caller's own and complete, and
  -- the provider is read from it rather than taken from the form — otherwise an asset could name any provider
  -- on the platform as its installer by passing an id.
  if p_source_assignment_id is not null then
    select * into a from public.assignments where id = p_source_assignment_id;
    if not found then raise exception 'that job no longer exists' using errcode='22023'; end if;
    select * into r from public.requests where id = a.request_id;
    if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
    if a.status <> 'completed' then
      raise exception 'only a completed job can be recorded as the source of an asset' using errcode='22023';
    end if;
    provider := a.provider_id;
    if installed is null then installed := a.ended_at::date; end if;
  end if;

  insert into public.customer_assets(
    customer_account_id, name, category, make_model, serial_number, installed_on, location_id,
    installed_by_provider_id, source_assignment_id, warranty_provider_name, warranty_expires_on,
    next_service_due_on, notes, document_urls
  ) values (
    me, name, category, nullif(btrim(coalesce(p_make_model,'')),''), nullif(btrim(coalesce(p_serial_number,'')),''),
    installed, p_location_id, provider, p_source_assignment_id,
    nullif(btrim(coalesce(p_warranty_provider_name,'')),''), p_warranty_expires_on,
    p_next_service_due_on, nullif(btrim(coalesce(p_notes,'')),''), docs
  ) returning id into asset_id;

  -- Registering something is itself the first entry in its history, so the timeline is never empty and the
  -- installation date on the card is a fact in the log rather than a field beside it.
  insert into public.asset_service_events(asset_id, occurred_on, kind, summary, provider_id, assignment_id, recorded_by_account_id)
  values (asset_id, coalesce(installed, current_date), 'installed',
          'Registered in your asset list.', provider, p_source_assignment_id, me);

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','CUSTOMER_ASSET_REGISTERED','customer_asset',asset_id,'participant_private',
          jsonb_build_object('category',category,'source_assignment_id',p_source_assignment_id,'provider_id',provider));

  return asset_id;
end
$function$;

create or replace function public.update_customer_asset_command(
  p_asset_id uuid,
  p_make_model text default null,
  p_serial_number text default null,
  p_warranty_provider_name text default null,
  p_warranty_expires_on date default null,
  p_next_service_due_on date default null,
  p_notes text default null,
  p_document_urls jsonb default null
)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  asset public.customer_assets%rowtype;
  docs jsonb;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into asset from public.customer_assets where id = p_asset_id for update;
  if not found then raise exception 'that asset no longer exists' using errcode='P0002'; end if;
  if asset.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  -- A null means "leave it alone"; the page sends an empty string to clear a field, which arrives here as an
  -- empty string rather than as null, so the two are distinguishable.
  docs := case when p_document_urls is null then asset.document_urls
               else app_private.validate_url_array(p_document_urls, 10, 'asset documents') end;

  if p_warranty_expires_on is not null and asset.installed_on is not null and p_warranty_expires_on < asset.installed_on then
    raise exception 'a warranty cannot end before the thing was installed' using errcode='22023';
  end if;

  update public.customer_assets
  set make_model = nullif(btrim(coalesce(p_make_model,'')),''),
      serial_number = nullif(btrim(coalesce(p_serial_number,'')),''),
      warranty_provider_name = nullif(btrim(coalesce(p_warranty_provider_name,'')),''),
      warranty_expires_on = p_warranty_expires_on,
      next_service_due_on = p_next_service_due_on,
      notes = nullif(btrim(coalesce(p_notes,'')),''),
      document_urls = docs,
      updated_at = now()
  where id = asset.id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','CUSTOMER_ASSET_UPDATED','customer_asset',asset.id,'participant_private',
          jsonb_build_object('next_service_due_on',p_next_service_due_on));
end
$function$;

create or replace function public.record_asset_service_event_command(
  p_asset_id uuid,
  p_occurred_on date,
  p_kind text,
  p_summary text,
  p_provider_id uuid default null,
  p_assignment_id uuid default null,
  p_document_urls jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  asset public.customer_assets%rowtype;
  kind text := lower(btrim(coalesce(p_kind,'')));
  summary text := btrim(coalesce(p_summary,''));
  docs jsonb;
  event_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into asset from public.customer_assets where id = p_asset_id for update;
  if not found then raise exception 'that asset no longer exists' using errcode='P0002'; end if;
  if asset.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  -- `installed` and `warranty_claim` are written by the paths that know they happened — registering the asset,
  -- and filing a claim. Logging them by hand would let the same fact exist twice with different dates.
  if kind not in ('service','repair','maintenance','note') then
    raise exception 'unknown history entry type' using errcode='22023';
  end if;
  if char_length(summary) < 2 then raise exception 'say what happened' using errcode='22023'; end if;
  if p_occurred_on is null then raise exception 'when did it happen' using errcode='22023'; end if;
  if p_occurred_on > current_date then raise exception 'that date is in the future' using errcode='22023'; end if;
  if asset.installed_on is not null and p_occurred_on < asset.installed_on then
    raise exception 'that is before the thing was installed' using errcode='22023';
  end if;

  docs := app_private.validate_url_array(p_document_urls, 10, 'history documents');

  insert into public.asset_service_events(asset_id, occurred_on, kind, summary, provider_id, assignment_id, document_urls, recorded_by_account_id)
  values (asset.id, p_occurred_on, kind, summary, p_provider_id, p_assignment_id, docs, me)
  returning id into event_id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','ASSET_SERVICE_RECORDED','asset_service_event',event_id,'participant_private',
          jsonb_build_object('asset_id',asset.id,'kind',kind,'occurred_on',p_occurred_on));

  return event_id;
end
$function$;

create or replace function public.file_asset_warranty_claim_command(
  p_asset_id uuid,
  p_reason text,
  p_document_urls jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  asset public.customer_assets%rowtype;
  reason text := btrim(coalesce(p_reason,''));
  docs jsonb;
  claim_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into asset from public.customer_assets where id = p_asset_id for update;
  if not found then raise exception 'that asset no longer exists' using errcode='P0002'; end if;
  if asset.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if char_length(reason) < 10 then raise exception 'say what has gone wrong, in a sentence' using errcode='22023'; end if;

  if exists (select 1 from public.asset_warranty_claims c where c.asset_id = asset.id and c.status = 'open') then
    raise exception 'you already have an open warranty claim on this asset' using errcode='22023';
  end if;

  docs := app_private.validate_url_array(p_document_urls, 10, 'claim documents');

  insert into public.asset_warranty_claims(asset_id, customer_account_id, provider_id, reason, document_urls)
  values (asset.id, me, asset.installed_by_provider_id, reason, docs)
  returning id into claim_id;

  insert into public.asset_service_events(asset_id, occurred_on, kind, summary, provider_id, document_urls, recorded_by_account_id)
  values (asset.id, current_date, 'warranty_claim', reason, asset.installed_by_provider_id, docs, me);

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values (auth.uid(),'account','ASSET_WARRANTY_CLAIM_FILED','asset_warranty_claim',claim_id,'warranty_claim','participant_private',
          jsonb_build_object('asset_id',asset.id,'provider_id',asset.installed_by_provider_id,
                             'warranty_expires_on',asset.warranty_expires_on));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('customer_asset',asset.id,'ASSET_WARRANTY_CLAIM_FILED',
          jsonb_build_object('claim_id',claim_id,'asset_id',asset.id,'provider_id',asset.installed_by_provider_id),
          'asset-warranty-claim:'||claim_id::text);

  return claim_id;
end
$function$;

create or replace function public.withdraw_asset_warranty_claim_command(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  c public.asset_warranty_claims%rowtype;
begin
  if me is null then raise exception 'not authorized' using errcode='42501'; end if;
  select * into c from public.asset_warranty_claims where id = p_claim_id for update;
  if not found then raise exception 'that claim no longer exists' using errcode='P0002'; end if;
  if c.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if c.status <> 'open' then raise exception 'that claim is already %', c.status using errcode='22023'; end if;

  update public.asset_warranty_claims set status='withdrawn', resolved_at=now() where id = c.id;
end
$function$;

revoke all on function public.create_customer_asset_command(text, text, text, text, date, uuid, text, date, date, text, jsonb, uuid) from public, anon;
revoke all on function public.update_customer_asset_command(uuid, text, text, text, date, date, text, jsonb) from public, anon;
revoke all on function public.record_asset_service_event_command(uuid, date, text, text, uuid, uuid, jsonb) from public, anon;
revoke all on function public.file_asset_warranty_claim_command(uuid, text, jsonb) from public, anon;
revoke all on function public.withdraw_asset_warranty_claim_command(uuid) from public, anon;
grant execute on function public.create_customer_asset_command(text, text, text, text, date, uuid, text, date, date, text, jsonb, uuid) to authenticated;
grant execute on function public.update_customer_asset_command(uuid, text, text, text, date, date, text, jsonb) to authenticated;
grant execute on function public.record_asset_service_event_command(uuid, date, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.file_asset_warranty_claim_command(uuid, text, jsonb) to authenticated;
grant execute on function public.withdraw_asset_warranty_claim_command(uuid) to authenticated;

-- ── Reading the registry, with the provider names the customer cannot read directly ───────────────────
/**
 * ⚠️ WHY THESE ARE DEFINER FUNCTIONS. Every asset table is readable by its owner through RLS. `providers` is
 * not: it has no customer-facing select policy, so joining it from a customer client returns no row rather than
 * an error, and an asset whose card says "installed by" with nothing after it is worse than no card. These
 * return the trading name and public slug of the provider the CUSTOMER named on THEIR asset, and assert
 * ownership in the WHERE clause before returning a row. Nothing else about the provider is in the result.
 */
create or replace function public.get_customer_assets()
returns table(
  asset_id uuid,
  name text,
  category text,
  make_model text,
  serial_number text,
  installed_on date,
  location_name text,
  installed_by_provider_id uuid,
  installed_by_name text,
  installed_by_slug text,
  source_assignment_id uuid,
  source_request_id uuid,
  warranty_provider_name text,
  warranty_expires_on date,
  next_service_due_on date,
  notes text,
  document_urls jsonb,
  created_at timestamptz,
  service_event_count integer,
  last_service_on date,
  open_claim_count integer
)
language sql
stable
security definer
set search_path='public','app_private'
as $function$
  select
    a.id,
    a.name,
    a.category,
    a.make_model,
    a.serial_number,
    a.installed_on,
    lc.display_name,
    a.installed_by_provider_id,
    -- NULL when no provider was named, so the page shows an absence rather than the word "Provider".
    case when a.installed_by_provider_id is null then null
         else coalesce(nullif(btrim(p.display_name), ''), 'Provider') end,
    pp.slug,
    a.source_assignment_id,
    asg.request_id,
    a.warranty_provider_name,
    a.warranty_expires_on,
    a.next_service_due_on,
    a.notes,
    a.document_urls,
    a.created_at,
    coalesce(ev.event_count, 0),
    ev.last_on,
    coalesce(cl.open_claims, 0)
  from public.customer_assets a
  left join public.public_location_catalog lc on lc.location_id = a.location_id
  left join public.providers p on p.id = a.installed_by_provider_id
  left join public.provider_public_profiles pp on pp.provider_id = a.installed_by_provider_id
  left join public.assignments asg on asg.id = a.source_assignment_id
  left join lateral (
    select count(*)::integer as event_count, max(e.occurred_on) as last_on
    from public.asset_service_events e
    where e.asset_id = a.id
  ) ev on true
  left join lateral (
    select count(*)::integer as open_claims
    from public.asset_warranty_claims c
    where c.asset_id = a.id and c.status = 'open'
  ) cl on true
  where a.customer_account_id = app_private.current_account_id()
  order by a.created_at desc;
$function$;

comment on function public.get_customer_assets() is
  'The caller''s own asset registry, with the provider they named and the counts the grid shows.';

create or replace function public.get_customer_asset(p_asset_id uuid)
returns table(
  asset_id uuid,
  name text,
  category text,
  make_model text,
  serial_number text,
  installed_on date,
  location_id uuid,
  location_name text,
  installed_by_provider_id uuid,
  installed_by_name text,
  installed_by_slug text,
  source_assignment_id uuid,
  source_request_id uuid,
  source_request_label text,
  warranty_provider_name text,
  warranty_expires_on date,
  next_service_due_on date,
  notes text,
  document_urls jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  events jsonb,
  claims jsonb
)
language sql
stable
security definer
set search_path='public','app_private'
as $function$
  select
    a.id,
    a.name,
    a.category,
    a.make_model,
    a.serial_number,
    a.installed_on,
    a.location_id,
    lc.display_name,
    a.installed_by_provider_id,
    case when a.installed_by_provider_id is null then null
         else coalesce(nullif(btrim(p.display_name), ''), 'Provider') end,
    pp.slug,
    a.source_assignment_id,
    asg.request_id,
    nullif(btrim(coalesce(rq.need_text, '')), ''),
    a.warranty_provider_name,
    a.warranty_expires_on,
    a.next_service_due_on,
    a.notes,
    a.document_urls,
    a.created_at,
    a.updated_at,
    ev.events,
    cl.claims
  from public.customer_assets a
  left join public.public_location_catalog lc on lc.location_id = a.location_id
  left join public.providers p on p.id = a.installed_by_provider_id
  left join public.provider_public_profiles pp on pp.provider_id = a.installed_by_provider_id
  left join public.assignments asg on asg.id = a.source_assignment_id
  left join public.requests rq on rq.id = asg.request_id
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'occurred_on', e.occurred_on,
             'kind', e.kind,
             'summary', e.summary,
             'provider_id', e.provider_id,
             'provider_name', case when e.provider_id is null then null
                                   else coalesce(nullif(btrim(ep.display_name), ''), 'Provider') end,
             'assignment_id', e.assignment_id,
             'document_urls', e.document_urls,
             'recorded_at', e.created_at
           ) order by e.occurred_on desc, e.created_at desc), '[]'::jsonb) as events
    from public.asset_service_events e
    left join public.providers ep on ep.id = e.provider_id
    where e.asset_id = a.id
  ) ev on true
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id,
             'reason', c.reason,
             'status', c.status,
             'provider_id', c.provider_id,
             'provider_name', case when c.provider_id is null then null
                                   else coalesce(nullif(btrim(cp.display_name), ''), 'Provider') end,
             'document_urls', c.document_urls,
             'created_at', c.created_at,
             'resolved_at', c.resolved_at
           ) order by c.created_at desc), '[]'::jsonb) as claims
    from public.asset_warranty_claims c
    left join public.providers cp on cp.id = c.provider_id
    where c.asset_id = a.id
  ) cl on true
  where a.id = p_asset_id
    and a.customer_account_id = app_private.current_account_id();
$function$;

comment on function public.get_customer_asset(uuid) is
  'One of the caller''s own assets, whole: its history and its warranty claims, with the provider names resolved.';

revoke all on function public.get_customer_assets() from public, anon;
revoke all on function public.get_customer_asset(uuid) from public, anon;
grant execute on function public.get_customer_assets() to authenticated;
grant execute on function public.get_customer_asset(uuid) to authenticated;
