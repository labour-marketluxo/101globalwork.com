-- The shared project workspace: stages, tasks, a task state machine, and contextual messages.
--
-- ── WHY THIS IS NEW SCHEMA AND NOT A VIEW OF WHAT EXISTS ───────────────────────────────────────
--
-- 1. THERE IS NO PROJECTS TABLE, AND THERE IS STILL NO PROJECTS TABLE. The unit of agreed work in this schema is
--    the ASSIGNMENT, created when a customer accepts a quote, and the brief's `projectId` IS the assignment id —
--    the same mapping the customer agreement route has used since it was built. This migration does not add a
--    second concept for the same thing.
--
-- 2. STAGES AND TASKS HAD NOWHERE TO LIVE. `assignment_task_steps` is the PROVIDER'S OWN checklist: private to
--    them, one flat list, no assignee, no state machine, and never shown to the customer. A shared stage/task
--    breakdown with two parties acting on it is a different object with different rules, so it is a different
--    table pair rather than a widened version of that one.
--
-- 3. THE STATE MACHINE IS IN THE DATABASE, WITH ROLE RULES, AND THE UI RENDERS WHAT IT RETURNS. A task cannot be
--    approved by the party that did it, transitions are enumerated rather than inferred, and the read model
--    reports which moves THIS caller may make — so the buttons on a page are the transitions the command will
--    accept, not a guess that fails on submit.
--
-- ⚠️ TASKS DO NOT MOVE MONEY, AND THE PAGES SAY SO. The assignment's own completion (evidence → approval) is what
-- funds a payout; a task list is how the work is planned and tracked. Nothing here writes to `requests`,
-- `payment_obligations` or `payouts`.

create type public.project_task_status as enum ('not_started','in_progress','blocked','submitted','completed');

-- ── 1. Stages ─────────────────────────────────────────────────────────────────────────────────

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 200),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  description text check (description is null or char_length(btrim(description)) between 1 and 2000),
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, ordinal)
);

create index project_stages_assignment_idx on public.project_stages(assignment_id, ordinal);

-- ── 2. Tasks ──────────────────────────────────────────────────────────────────────────────────

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  -- 0 is allowed only as the sentinel a reorder steps through, and never survives the transaction it is used in.
  ordinal integer not null check (ordinal between 0 and 500),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  description text check (description is null or char_length(btrim(description)) between 1 and 4000),
  status public.project_task_status not null default 'not_started',
  -- Either party can be assigned a task, and null means "nobody in particular". Which account you are is what
  -- decides the role badge beside it, so the two parties see their own name on it.
  assignee_account_id uuid references public.accounts(id) on delete set null,
  -- Scope parameters as the form captured them: key/value pairs a provider would otherwise keep on paper.
  scope_parameters jsonb not null default '{}'::jsonb,
  -- The completion criteria, as a checklist: an array of {label, done}. Enforced as an array, not as prose, so
  -- "is this task done" cannot be answered differently by the two sides.
  completion_criteria jsonb not null default '[]'::jsonb,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(btrim(blocked_reason)) between 1 and 500),
  status_note text check (status_note is null or char_length(btrim(status_note)) between 1 and 500),
  created_by_account_id uuid not null references public.accounts(id),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, ordinal),
  constraint project_tasks_scope_object check (jsonb_typeof(scope_parameters) = 'object'),
  constraint project_tasks_criteria_array check (jsonb_typeof(completion_criteria) = 'array'),
  constraint project_tasks_window_chk check (scheduled_end is null or scheduled_start is null or scheduled_end >= scheduled_start)
);

create index project_tasks_assignment_idx on public.project_tasks(assignment_id, status);
create index project_tasks_stage_idx on public.project_tasks(stage_id, ordinal);

-- ── 3. Messages ───────────────────────────────────────────────────────────────────────────────

create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  -- WHAT A MESSAGE IS ABOUT, which is what makes a thread navigable: six contexts, and a task or dispute id when
  -- the context has one. Everything in one list would be a chat log nobody can find a decision in.
  context_kind text not null check (context_kind in ('project','task','quote','scope_change','milestone','dispute')),
  context_id uuid,
  author_account_id uuid not null references public.accounts(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- A preview, not an upload: the file is already in the private evidence bucket and the message points at the
  -- row. Participants can read it through the storage policy they already have.
  attachment_evidence_id uuid references public.work_evidence(id) on delete set null,
  translated_body text,
  translated_language text,
  created_at timestamptz not null default now(),
  constraint project_messages_translation_pair check (
    (translated_body is null and translated_language is null)
    or (translated_body is not null and translated_language is not null)
  )
);

create index project_messages_assignment_idx on public.project_messages(assignment_id, created_at desc);
create index project_messages_context_idx on public.project_messages(assignment_id, context_kind, created_at desc);

comment on table public.project_messages is
  'Conversation about one assignment, grouped by what it is about. The factual record is not in here: see the activity feed, which is derived from the rows that caused it.';
comment on column public.project_messages.translated_body is
  'A translation, stored BESIDE the original and never in place of it. Null today: no translation provider is configured, and the UI says so rather than offering a button that cannot work.';

-- ── 4. Who may see and do what ────────────────────────────────────────────────────────────────

/**
 * The caller's role on one assignment, or null.
 *
 * ⚠️ ONE FUNCTION, USED BY EVERY POLICY AND EVERY COMMAND. Object-level authorisation that is re-derived in five
 * places is five chances for one of them to be wrong; this is the single definition of "you are the customer",
 * "you are the provider" or "you are a platform admin with the projects capability".
 */
create or replace function app_private.project_role_for(p_assignment_id uuid)
returns text
language sql
stable
security definer
set search_path = public, app_private, auth
as $$
  select case
    when exists (
      select 1 from public.assignments a
      join public.requests r on r.id = a.request_id
      where a.id = p_assignment_id and r.customer_account_id = app_private.current_account_id()
    ) then 'customer'
    when exists (
      select 1 from public.assignments a
      join public.providers p on p.id = a.provider_id
      where a.id = p_assignment_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    ) then 'provider'
    when app_private.current_account_has_platform_capability('platform.projects.read') then 'admin'
    else null
  end;
$$;

revoke all on function app_private.project_role_for(uuid) from public, anon;
grant execute on function app_private.project_role_for(uuid) to authenticated;

alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_messages enable row level security;

create policy project_stages_participant_read on public.project_stages
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
create policy project_tasks_participant_read on public.project_tasks
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
create policy project_messages_participant_read on public.project_messages
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);

revoke all on public.project_stages, public.project_tasks, public.project_messages from anon;
revoke insert, update, delete on public.project_stages, public.project_tasks, public.project_messages from authenticated;
grant select on public.project_stages, public.project_tasks, public.project_messages to authenticated;

-- ── 5. Commands ───────────────────────────────────────────────────────────────────────────────

create or replace function public.add_project_stage_command(
  p_assignment_id uuid,
  p_title text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  next_ordinal integer;
  stage_id uuid;
  title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  -- Admins read projects; they do not plan other people's work from a page like this. Intervention has its own
  -- capability and its own record, and pretending otherwise here would leave no trace of who changed the plan.
  if role = 'admin' then raise exception 'platform admins read the plan; they do not edit it' using errcode = '22023'; end if;
  if char_length(title) < 2 or char_length(title) > 200 then
    raise exception 'a stage needs a title of 2 to 200 characters' using errcode = '22023';
  end if;

  select coalesce(max(ordinal), 0) + 1 into next_ordinal from public.project_stages where assignment_id = p_assignment_id;
  if next_ordinal > 200 then raise exception 'this plan is full' using errcode = '22023'; end if;

  insert into public.project_stages(assignment_id, ordinal, title, description, created_by_account_id)
  values (p_assignment_id, next_ordinal, title, nullif(btrim(coalesce(p_description, '')), ''), app_private.current_account_id())
  returning id into stage_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_STAGE_ADDED', 'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('stage_id', stage_id, 'role', role));

  return stage_id;
end $$;

revoke all on function public.add_project_stage_command(uuid, text, text) from public, anon;
grant execute on function public.add_project_stage_command(uuid, text, text) to authenticated;

create or replace function public.add_project_task_command(
  p_assignment_id uuid,
  p_stage_id uuid,
  p_title text,
  p_description text default null,
  p_assignee_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  stage public.project_stages%rowtype;
  next_ordinal integer;
  task_id uuid;
  title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read the plan; they do not edit it' using errcode = '22023'; end if;
  if char_length(title) < 2 or char_length(title) > 200 then
    raise exception 'a task needs a title of 2 to 200 characters' using errcode = '22023';
  end if;

  select * into stage from public.project_stages where id = p_stage_id and assignment_id = p_assignment_id;
  if not found then raise exception 'that stage is not on this project' using errcode = '22023'; end if;

  -- ⚠️ THE ASSIGNEE MUST BE ONE OF THE TWO PARTIES. Assigning work to somebody with no relationship to the job
  -- would create a task nobody can open, and "assigned to whom" would stop being a meaningful column.
  if p_assignee_account_id is not null then
    if p_assignee_account_id <> app_private.current_account_id() then
      if not exists (
        select 1 from public.assignments a
        join public.requests r on r.id = a.request_id
        join public.providers p on p.id = a.provider_id
        where a.id = p_assignment_id
          and (r.customer_account_id = p_assignee_account_id or p.owner_account_id = p_assignee_account_id)
      ) then
        raise exception 'a task can only be assigned to one of the two parties' using errcode = '22023';
      end if;
    end if;
  end if;

  select coalesce(max(ordinal), 0) + 1 into next_ordinal from public.project_tasks where stage_id = p_stage_id;
  if next_ordinal > 500 then raise exception 'this stage is full' using errcode = '22023'; end if;

  insert into public.project_tasks(assignment_id, stage_id, ordinal, title, description, assignee_account_id, created_by_account_id)
  values (p_assignment_id, p_stage_id, next_ordinal, title, nullif(btrim(coalesce(p_description, '')), ''), p_assignee_account_id, app_private.current_account_id())
  returning id into task_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_TASK_ADDED', 'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('task_id', task_id, 'role', role, 'has_assignee', p_assignee_account_id is not null));

  return task_id;
end $$;

revoke all on function public.add_project_task_command(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.add_project_task_command(uuid, uuid, text, text, uuid) to authenticated;

/**
 * Edit a task's scope: title, description, the scope parameters, the completion criteria and the window.
 *
 * ⚠️ THIS IS NOT A STATUS CHANGE, AND IT CANNOT BE USED AS ONE. Status moves through
 * `set_project_task_status_command` and nowhere else, so the two cannot disagree about what "done" means.
 */
create or replace function public.update_project_task_command(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_scope_parameters jsonb,
  p_completion_criteria jsonb,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  t public.project_tasks%rowtype;
  role text;
  criteria jsonb := coalesce(p_completion_criteria, '[]'::jsonb);
  entry jsonb;
  label text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into t from public.project_tasks where id = p_task_id;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(t.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read the plan; they do not edit it' using errcode = '22023'; end if;
  if t.status = 'completed' then
    raise exception 'this task is complete; its scope is history' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_scope_parameters, '{}'::jsonb)) <> 'object' then
    raise exception 'scope parameters must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(criteria) <> 'array' then
    raise exception 'completion criteria must be an array' using errcode = '22023';
  end if;
  -- Every criterion is a labelled checkbox. Anything else would be a criterion nobody can tick, which is how a
  -- checklist becomes a paragraph.
  for entry in select element from pg_catalog.jsonb_array_elements(criteria) as t(element) loop
    if pg_catalog.jsonb_typeof(entry) <> 'object' then
      raise exception 'every criterion must be an object' using errcode = '22023';
    end if;
    label := pg_catalog.btrim(coalesce(entry ->> 'label', ''));
    if label = '' or pg_catalog.char_length(label) > 200 then
      raise exception 'every criterion needs a label of 1 to 200 characters' using errcode = '22023';
    end if;
  end loop;

  update public.project_tasks
     set title = btrim(coalesce(p_title, title)),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         scope_parameters = coalesce(p_scope_parameters, '{}'::jsonb),
         completion_criteria = criteria,
         scheduled_start = p_scheduled_start,
         scheduled_end = p_scheduled_end,
         updated_at = now()
   where id = p_task_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_TASK_UPDATED', 'assignment', t.assignment_id, 'participant_private',
          jsonb_build_object('task_id', p_task_id, 'role', role));
end $$;

revoke all on function public.update_project_task_command(uuid, text, text, jsonb, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_project_task_command(uuid, text, text, jsonb, jsonb, timestamptz, timestamptz) to authenticated;

/**
 * The task state machine.
 *
 * ⚠️ THE TRANSITIONS ARE ENUMERATED, NOT INFERRED FROM A NUMBER LINE OF STATUSES, AND EACH HAS AN OWNER:
 *
 *   not_started → in_progress   the provider starts work
 *   in_progress → blocked       either party can stop it — a customer knows about a locked gate too
 *   blocked     → in_progress   the provider resumes
 *   in_progress → submitted     the provider asks for approval
 *   submitted   → completed     THE CUSTOMER approves
 *   submitted   → in_progress   THE CUSTOMER sends it back
 *   completed   → (nothing)     it is history
 *
 * ⚠️ THE PROVIDER CANNOT APPROVE THEIR OWN WORK, and that is the whole reason the machine is here rather than in a
 * form. The same rule the completion flow already enforces for the job as a whole applies to the tasks inside it.
 */
create or replace function public.set_project_task_status_command(
  p_task_id uuid,
  p_status text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  t public.project_tasks%rowtype;
  role text;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_status not in ('not_started','in_progress','blocked','submitted','completed') then
    raise exception 'invalid task status' using errcode = '22023';
  end if;

  select * into t from public.project_tasks where id = p_task_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(t.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read the plan; they do not move it' using errcode = '22023'; end if;
  if t.status = p_status then return p_status::text; end if;

  if t.status = 'completed' then
    raise exception 'this task is complete; a finished task is not reopened' using errcode = '22023';
  end if;

  if not (
    (t.status = 'not_started' and p_status = 'in_progress' and role = 'provider')
    or (t.status = 'in_progress' and p_status = 'blocked')
    or (t.status = 'blocked' and p_status = 'in_progress' and role = 'provider')
    or (t.status = 'in_progress' and p_status = 'submitted' and role = 'provider')
    or (t.status = 'submitted' and p_status = 'completed' and role = 'customer')
    or (t.status = 'submitted' and p_status = 'in_progress' and role = 'customer')
  ) then
    raise exception 'a % cannot move a task from % to %', role, t.status, p_status using errcode = '22023';
  end if;

  update public.project_tasks
     set status = p_status::public.project_task_status,
         blocked_reason = case when p_status = 'blocked' then note else null end,
         status_note = case when p_status = 'blocked' then null else note end,
         submitted_at = case when p_status = 'submitted' then now() else submitted_at end,
         completed_at = case when p_status = 'completed' then now() else null end,
         updated_at = now()
   where id = p_task_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_TASK_STATUS_CHANGED', 'assignment', t.assignment_id, 'participant_private',
          jsonb_build_object('task_id', p_task_id, 'from', t.status, 'to', p_status, 'role', role));

  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('assignment', t.assignment_id, 'PROJECT_TASK_STATUS_CHANGED',
          jsonb_build_object('task_id', p_task_id, 'from', t.status, 'to', p_status, 'role', role),
          'project-task-status:' || p_task_id::text || ':' || p_status || ':' || extract(epoch from now())::text)
  on conflict (idempotency_key) do nothing;

  return p_status;
end $$;

revoke all on function public.set_project_task_status_command(uuid, text, text) from public, anon;
grant execute on function public.set_project_task_status_command(uuid, text, text) to authenticated;

/**
 * Move a task up or down inside its stage.
 *
 * ⚠️ THE SWAP GOES THROUGH A SENTINEL ORDINAL. `unique (stage_id, ordinal)` would refuse a direct swap of two rows
 * — the first update collides with the second row — so one of them steps aside first. Same shape the reorder
 * helpers in most schemas end up with; saying why is cheaper than the bug it prevents.
 */
create or replace function public.move_project_task_command(p_task_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  t public.project_tasks%rowtype;
  neighbour public.project_tasks%rowtype;
  role text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_direction not in ('up','down') then raise exception 'invalid direction' using errcode = '22023'; end if;

  select * into t from public.project_tasks where id = p_task_id;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(t.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read the plan; they do not reorder it' using errcode = '22023'; end if;
  if t.status = 'completed' then
    raise exception 'a finished task keeps its place in the plan' using errcode = '22023';
  end if;

  -- Two statements rather than one with a CASE in the ORDER BY: a conditional expression there produces NULLs for
  -- half the rows, and DESC puts NULLs first, which would swap a task with a neighbour it does not have.
  if p_direction = 'up' then
    select * into neighbour from public.project_tasks
    where stage_id = t.stage_id and ordinal < t.ordinal
    order by ordinal desc limit 1;
  else
    select * into neighbour from public.project_tasks
    where stage_id = t.stage_id and ordinal > t.ordinal
    order by ordinal asc limit 1;
  end if;
  if not found then return; end if;

  update public.project_tasks set ordinal = 0, updated_at = now() where id = t.id;
  update public.project_tasks set ordinal = t.ordinal, updated_at = now() where id = neighbour.id;
  update public.project_tasks set ordinal = neighbour.ordinal, updated_at = now() where id = t.id;
end $$;

revoke all on function public.move_project_task_command(uuid, text) from public, anon;
grant execute on function public.move_project_task_command(uuid, text) to authenticated;

/**
 * A message about this project, or about one of its parts.
 *
 * ⚠️ AN ATTACHMENT IS AN EXISTING EVIDENCE ROW, NOT AN UPLOAD. Files live in the private evidence bucket with the
 * queue, the compression and the policies already built for them; a message points at one and the participants can
 * open it through the policy they already have. A second upload path would be a second set of limits to get wrong.
 *
 * ⚠️ THE BODY IS STORED EXACTLY AS WRITTEN. There is no translation provider configured, so `translated_body`
 * stays null — and the column exists beside the original rather than replacing it, so the day one is connected the
 * original text is still the record.
 */
create or replace function public.send_project_message_command(
  p_assignment_id uuid,
  p_context_kind text,
  p_context_id uuid,
  p_body text,
  p_attachment_evidence_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  body text := btrim(coalesce(p_body, ''));
  message_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then
    raise exception 'platform admins read this thread; posting into it is support work with its own record' using errcode = '22023';
  end if;
  if p_context_kind not in ('project','task','quote','scope_change','milestone','dispute') then
    raise exception 'invalid message context' using errcode = '22023';
  end if;
  if char_length(body) < 1 or char_length(body) > 4000 then
    raise exception 'a message must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  if p_context_id is not null and not (
    exists (select 1 from public.project_tasks t where t.id = p_context_id and t.assignment_id = p_assignment_id)
    or exists (select 1 from public.work_evidence w where w.id = p_context_id and w.assignment_id = p_assignment_id)
  ) then
    -- The only contexts that carry an id today are tasks and evidence. Anything else is refused rather than
    -- stored as a dangling reference nobody can resolve.
    raise exception 'that context does not belong to this project' using errcode = '22023';
  end if;
  if p_attachment_evidence_id is not null and not exists (
    select 1 from public.work_evidence w
    where w.id = p_attachment_evidence_id and w.assignment_id = p_assignment_id
  ) then
    raise exception 'that attachment is not on this project' using errcode = '22023';
  end if;

  insert into public.project_messages(assignment_id, context_kind, context_id, author_account_id, body, attachment_evidence_id)
  values (p_assignment_id, p_context_kind, p_context_id, app_private.current_account_id(), body, p_attachment_evidence_id)
  returning id into message_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_MESSAGE_SENT', 'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('message_id', message_id, 'context', p_context_kind, 'role', role));

  return message_id;
end $$;

revoke all on function public.send_project_message_command(uuid, text, uuid, text, uuid) from public, anon;
grant execute on function public.send_project_message_command(uuid, text, uuid, text, uuid) to authenticated;

-- ── 6. Reads ──────────────────────────────────────────────────────────────────────────────────

/**
 * The project document: who you are on it, what it is, what needs doing, and the plan.
 *
 * ⚠️ `allowed` IS THE AUTHORISATION ANSWER, AND IT IS RETURNED RATHER THAN RAISED. A page that receives
 * `{allowed: false}` renders its not-found response, so somebody who guesses an assignment id learns nothing —
 * not even that it exists.
 *
 * ⚠️ THE NEXT ACTION IS CHOSEN BY THE PLATFORM, PER ROLE, FROM THE AUTHORITATIVE STATE. It is not a to-do list the
 * page invents: the branches below are the states the job can be in, and each one names the single thing the
 * caller can actually do next. Where a state has no action for this role, it says so instead of inventing one.
 *
 * ⚠️ TASKS ARE INCLUDED AND THEY DO NOT DECIDE MONEY. They are the plan; the job's own completion is what funds a
 * payout. The milestones below are the real money path, derived from the rows that record it.
 */
create or replace function public.get_project_command(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  role text := app_private.project_role_for(p_assignment_id);
  a public.assignments%rowtype;
  r public.requests%rowtype;
  prov public.providers%rowtype;
  customer_name text;
  provider_name text;
  obligation public.payment_obligations%rowtype;
  payout public.payouts%rowtype;
  schedule jsonb;
  agreement jsonb;
  stages jsonb := '[]'::jsonb;
  evidence jsonb := '[]'::jsonb;
  changes jsonb := '[]'::jsonb;
  risks jsonb := '[]'::jsonb;
  milestones jsonb := '[]'::jsonb;
  next_action jsonb;
  counts record;
  blocker public.assignment_blockers%rowtype;
  correction public.completion_correction_requests%rowtype;
  dispute public.completion_disputes%rowtype;
  approval public.completion_approvals%rowtype;
  overdue integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;
  select * into prov from public.providers where id = a.provider_id;

  select pr.display_name into customer_name from public.profiles pr where pr.account_id = r.customer_account_id limit 1;
  provider_name := prov.display_name;

  select * into obligation from public.payment_obligations where assignment_id = a.id;
  select * into payout from public.payouts where obligation_id = obligation.id;
  select * into blocker from public.assignment_blockers where assignment_id = a.id and resolved_at is null limit 1;
  select * into correction from public.completion_correction_requests where assignment_id = a.id and status = 'open' order by created_at desc limit 1;
  select * into dispute from public.completion_disputes where assignment_id = a.id and status = 'open' order by created_at desc limit 1;
  select * into approval from public.completion_approvals where assignment_id = a.id;

  select jsonb_build_object(
           'scheduled_start', s.scheduled_start,
           'scheduled_end', s.scheduled_end,
           'timezone', s.timezone,
           'note', s.note,
           'status', s.customer_status,
           'confirmed_at', s.confirmed_at
         )
    into schedule
    from public.assignment_schedules s where s.assignment_id = a.id;

  select jsonb_build_object(
           'quote_version', ag.quote_version_label,
           'total_minor', ag.total_minor,
           'currency_code', ag.currency_code,
           'accepted_at', ag.accepted_at,
           'auth_method', ag.auth_method
         )
    into agreement
    from public.agreement_acceptances ag where ag.assignment_id = a.id;

  -- The plan, stage by stage, with each task's own counts. Two queries rather than a lateral per task: the
  -- response is a document either way, and one pass over the tasks is cheaper than one per stage.
  select coalesce(jsonb_agg(entry order by entry ->> 'ordinal'), '[]'::jsonb)
    into stages
    from (
      select jsonb_build_object(
        'id', s.id,
        'ordinal', s.ordinal,
        'title', s.title,
        'description', s.description,
        'task_count', (select count(*) from public.project_tasks t where t.stage_id = s.id),
        'done_count', (select count(*) from public.project_tasks t where t.stage_id = s.id and t.status = 'completed'),
        'tasks', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', t.id,
                   'ordinal', t.ordinal,
                   'title', t.title,
                   'status', t.status::text,
                   'blocked_reason', t.blocked_reason,
                   'scheduled_start', t.scheduled_start,
                   'scheduled_end', t.scheduled_end,
                   'assignee_role', case
                     when t.assignee_account_id is null then null
                     when t.assignee_account_id = r.customer_account_id then 'customer'
                     else 'provider'
                   end,
                   'criteria_total', jsonb_array_length(t.completion_criteria),
                   'criteria_done', coalesce((
                     select count(*) from jsonb_array_elements(t.completion_criteria) c
                     where c ->> 'done' = 'true'
                   ), 0),
                   'completed_at', t.completed_at,
                   'updated_at', t.updated_at
                 ) order by t.ordinal)
          from public.project_tasks t where t.stage_id = s.id
        ), '[]'::jsonb)
      ) as entry
      from public.project_stages s
      where s.assignment_id = a.id
    ) stage_rows;

  select
    count(*)::integer as total,
    (count(*) filter (where t.status = 'completed'))::integer as done,
    (count(*) filter (where t.status = 'blocked'))::integer as blocked,
    (count(*) filter (where t.status = 'submitted'))::integer as awaiting_approval,
    (count(*) filter (
      where t.scheduled_end is not null and t.scheduled_end < now() and t.status not in ('completed','submitted')
    ))::integer as overdue
    into counts
    from public.project_tasks t
    where t.assignment_id = a.id;
  overdue := coalesce(counts.overdue, 0);

  -- Evidence and the customer's questions: both are on the project, and both belong in the drill-down rather than
  -- the top of the overview, which is why the page collapses them.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'kind', w.kind::text, 'note', w.note, 'storage_path', w.storage_object_path,
           'external_url', w.external_url, 'submitted_at', w.submitted_at
         ) order by w.submitted_at desc), '[]'::jsonb)
    into evidence
    from public.work_evidence w where w.assignment_id = a.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'kind', c.kind::text, 'message', c.message, 'status', c.status, 'created_at', c.created_at
         ) order by c.created_at desc), '[]'::jsonb)
    into changes
    from public.quote_change_requests c where c.request_id = r.id;

  -- ── The risks and issues banner ─────────────────────────────────────────────────────────────
  if blocker.id is not null then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'blocked', 'severity', 'high',
      'label', 'The job is stopped',
      'detail', coalesce(blocker.note, blocker.reason_code)
    ));
  end if;
  if correction.id is not null then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'correction', 'severity', 'high',
      'label', 'Work was sent back by the customer',
      'detail', correction.message
    ));
  end if;
  if dispute.id is not null then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'dispute', 'severity', 'high',
      'label', 'A dispute is open',
      'detail', dispute.reason
    ));
  end if;
  if obligation.id is not null and obligation.status in ('pending','funding') and r.state in ('scheduled','in_progress') then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'unfunded', 'severity', 'medium',
      'label', 'The payment has not been funded',
      'detail', 'Paid work cannot start until the customer funds the obligation.'
    ));
  end if;
  if overdue > 0 then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'overdue', 'severity', 'medium',
      'label', overdue || ' task(s) past their scheduled finish',
      'detail', 'The plan and the calendar disagree. Move the task or move the date.'
    ));
  end if;
  if coalesce(counts.blocked, 0) > 0 and blocker.id is null then
    risks := risks || jsonb_build_array(jsonb_build_object(
      'key', 'tasks_blocked', 'severity', 'medium',
      'label', counts.blocked || ' task(s) blocked',
      'detail', 'Individual tasks are marked blocked. The job itself is still running.'
    ));
  end if;

  -- ── The milestones that exist, derived from the rows that record them ───────────────────────
  milestones := milestones
    || jsonb_build_array(jsonb_build_object('key','agreement','label','Agreement accepted','at', agreement ->> 'accepted_at','done', agreement is not null))
    || jsonb_build_array(jsonb_build_object('key','funded','label','Payment funded','at', null, 'done', obligation.status is not null and obligation.status = 'funded'))
    || jsonb_build_array(jsonb_build_object('key','started','label','Work started','at', null, 'done', r.state in ('in_progress','submitted_for_approval','completed')))
    || jsonb_build_array(jsonb_build_object('key','submitted','label','Submitted for approval','at', null, 'done', r.state in ('submitted_for_approval','completed')))
    || jsonb_build_array(jsonb_build_object('key','approved','label','Completed and approved','at', approval.approved_at, 'done', approval.id is not null))
    || jsonb_build_array(jsonb_build_object('key','paid','label','Payout sent','at', case when payout.status = 'paid' then payout.updated_at else null end, 'done', payout.status = 'paid'));

  -- ── The one next action for this caller ─────────────────────────────────────────────────────
  if dispute.id is not null then
    next_action := jsonb_build_object('key','dispute_open','title','A dispute is open on this project','detail','Nothing moves until it is resolved. Everything is still readable.', 'href_kind','none');
  elsif correction.id is not null then
    next_action := case
      when role = 'provider' then jsonb_build_object('key','fix_correction','title','Fix what the customer asked for','detail','The work came back with a reason. When it is done, submit evidence again.', 'href_kind','provider_work')
      else jsonb_build_object('key','await_fix','title','Waiting on the provider to fix this','detail','They have your note and the job is back in their hands.', 'href_kind','none')
    end;
  elsif obligation.id is not null and obligation.status in ('pending','funding') and r.state = 'scheduled' then
    next_action := case
      when role = 'customer' then jsonb_build_object('key','fund','title','Fund the work so it can start','detail','The time is agreed and the provider cannot start paid work until the payment is funded.', 'href_kind','customer_request')
      else jsonb_build_object('key','await_funding','title','Waiting for the customer to fund this','detail','You can still travel and prepare; starting work stays locked until it is funded.', 'href_kind','none')
    end;
  elsif r.state = 'accepted' then
    next_action := case
      when role = 'provider' then jsonb_build_object('key','schedule','title','Agree a time for the work','detail','Nothing can start until a time is agreed with the customer.', 'href_kind','provider_work')
      else jsonb_build_object('key','await_schedule','title','Waiting for a date from the provider','detail','They will propose a time; you confirm it.', 'href_kind','none')
    end;
  elsif r.state = 'scheduled' and schedule ->> 'confirmed_at' is null then
    next_action := case
      when role = 'customer' then jsonb_build_object('key','confirm_time','title','Confirm the appointment','detail','A time is on the job and the provider is waiting on your answer.', 'href_kind','customer_booking')
      else jsonb_build_object('key','await_confirmation','title','Waiting for the customer to confirm the time','detail','They have been asked; nothing else is needed from you yet.', 'href_kind','none')
    end;
  elsif r.state = 'in_progress' then
    next_action := case
      when role = 'provider' then jsonb_build_object('key','submit_evidence','title','Submit your completion evidence','detail','Photographs and a note are what ask the customer to approve the work.', 'href_kind','provider_evidence')
      else jsonb_build_object('key','await_work','title','Work is under way','detail','You will be asked to approve completion when the provider submits evidence.', 'href_kind','none')
    end;
  elsif r.state = 'submitted_for_approval' then
    next_action := case
      when role = 'customer' then jsonb_build_object('key','approve','title','Approve the completed work','detail','Check the evidence, then approve — that is what releases the payment.', 'href_kind','customer_completion')
      else jsonb_build_object('key','await_approval','title','Waiting for the customer to approve','detail','Nothing is paid until they do.', 'href_kind','none')
    end;
  elsif r.state = 'completed' then
    next_action := jsonb_build_object('key','plan_tasks','title','The job is finished','detail','The plan below stays readable as the record of how it went.', 'href_kind','none');
  elsif coalesce(counts.total, 0) = 0 then
    next_action := jsonb_build_object('key','plan','title','Write the plan','detail','Break the work into stages and tasks so both sides can see what happens when.', 'href_kind','project_work');
  else
    next_action := jsonb_build_object('key','plan_next','title','Continue the plan','detail', counts.done || ' of ' || counts.total || ' tasks are done.', 'href_kind','project_work');
  end if;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'project', jsonb_build_object(
      'assignment_id', a.id,
      'request_id', r.id,
      'outcome', coalesce(nullif(btrim(r.need_text), ''), 'Agreed work'),
      'state', r.state::text,
      'urgency', r.urgency::text,
      'assigned_at', a.assigned_at,
      'completed_at', r.completed_at,
      'timezone', r.timezone,
      'service_name', (select sc.display_name from public.public_service_catalog sc where sc.service_entity_id = r.service_entity_id),
      'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
      'city_name', (
        select parent.display_name from public.public_location_catalog lc
        join public.public_location_catalog parent on parent.location_id = lc.parent_id
        where lc.location_id = r.location_id
      ),
      'currency_code', (select m.default_currency_code from public.public_market_catalog m where m.market_id = r.market_id),
      'customer_name', customer_name,
      'provider_name', provider_name,
      -- The two account ids, so the assignment control can name a party in a form. They are VALUES THE PAGE MAY
      -- POST, never text it renders: the names above are what a person reads.
      'customer_account_id', r.customer_account_id,
      'provider_account_id', prov.owner_account_id
    ),
    'schedule', schedule,
    'agreement', agreement,
    'money', jsonb_build_object(
      'obligation_status', obligation.status::text,
      'amount_minor', obligation.amount_minor,
      'currency_code', obligation.currency_code,
      'payout_status', payout.status::text,
      'payout_amount_minor', payout.amount_minor
    ),
    'risks', risks,
    'next_action', next_action,
    'progress', jsonb_build_object(
      'tasks_total', coalesce(counts.total, 0),
      'tasks_done', coalesce(counts.done, 0),
      'tasks_blocked', coalesce(counts.blocked, 0),
      'tasks_awaiting_approval', coalesce(counts.awaiting_approval, 0),
      'tasks_overdue', overdue,
      'stages', jsonb_array_length(stages)
    ),
    'stages', stages,
    'milestones', milestones,
    'evidence', evidence,
    'changes', changes
  );
end $$;

revoke all on function public.get_project_command(uuid) from public, anon;
grant execute on function public.get_project_command(uuid) to authenticated;

comment on function public.get_project_command(uuid) is
  'One assignment as a shared project: the caller''s role, the next action for that role, risks, milestones, the stage/task plan, evidence and the customer''s questions.';

/**
 * One task, in the depth the detail page needs.
 *
 * ⚠️ `allowed_transitions` IS THE STATE MACHINE SPEAKING TO THE PAGE. The command refuses anything else, and this
 * list is what lets the UI render exactly the buttons that would work for THIS caller — a customer sees "Approve"
 * and "Send back" on a submitted task and no "Start"; a provider sees "Start" and "Submit for approval" and no
 * "Approve". The alternative, a page that decides for itself, is how a button ends up offering a move that fails.
 *
 * ⚠️ THE TASK'S LINK TO MONEY IS A REFERENCE, NOT A CONTROL. The project's obligation and payout are shown because
 * a task list with no idea whether the work is funded is a list somebody works for free against.
 */
create or replace function public.get_project_task_command(p_assignment_id uuid, p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  t public.project_tasks%rowtype;
  stage public.project_stages%rowtype;
  a public.assignments%rowtype;
  r public.requests%rowtype;
  obligation public.payment_obligations%rowtype;
  payout public.payouts%rowtype;
  transitions jsonb := '[]'::jsonb;
  evidence jsonb := '[]'::jsonb;
  siblings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into t from public.project_tasks where id = p_task_id and assignment_id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into stage from public.project_stages where id = t.stage_id;
  select * into a from public.assignments where id = p_assignment_id;
  select * into r from public.requests where id = a.request_id;
  select * into obligation from public.payment_obligations where assignment_id = a.id;
  select * into payout from public.payouts where obligation_id = obligation.id;

  -- The allowed moves, for this role, from the status the row is actually in.
  if role <> 'admin' and t.status <> 'completed' then
    if t.status = 'not_started' and role = 'provider' then
      transitions := transitions || jsonb_build_array(jsonb_build_object('status','in_progress','label','Start task'));
    elsif t.status = 'in_progress' then
      transitions := transitions || jsonb_build_array(jsonb_build_object('status','blocked','label','Mark blocked'));
      if role = 'provider' then
        transitions := transitions || jsonb_build_array(jsonb_build_object('status','submitted','label','Submit for approval'));
      end if;
    elsif t.status = 'blocked' and role = 'provider' then
      transitions := transitions || jsonb_build_array(jsonb_build_object('status','in_progress','label','Resume task'));
    elsif t.status = 'submitted' and role = 'customer' then
      transitions := transitions || jsonb_build_array(jsonb_build_object('status','completed','label','Approve task'))
        || jsonb_build_array(jsonb_build_object('status','in_progress','label','Send back for more work'));
    end if;
  end if;

  -- Evidence already on this project, so a task can point at the photographs that answer it. The link is by
  -- context rather than by column: messages and the job's own evidence list are where a task's proof shows up.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'kind', w.kind::text, 'note', w.note, 'submitted_at', w.submitted_at
         ) order by w.submitted_at desc), '[]'::jsonb)
    into evidence
    from public.work_evidence w where w.assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sib.id, 'ordinal', sib.ordinal, 'title', sib.title, 'status', sib.status::text
         ) order by sib.ordinal), '[]'::jsonb)
    into siblings
    from public.project_tasks sib
    where sib.stage_id = t.stage_id and sib.id <> t.id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'task', jsonb_build_object(
      'id', t.id,
      'assignment_id', t.assignment_id,
      'stage_id', t.stage_id,
      'stage_title', stage.title,
      'ordinal', t.ordinal,
      'title', t.title,
      'description', t.description,
      'status', t.status::text,
      'blocked_reason', t.blocked_reason,
      'status_note', t.status_note,
      'scope_parameters', t.scope_parameters,
      'completion_criteria', t.completion_criteria,
      'scheduled_start', t.scheduled_start,
      'scheduled_end', t.scheduled_end,
      'submitted_at', t.submitted_at,
      'completed_at', t.completed_at,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'assignee_role', case
        when t.assignee_account_id is null then null
        when t.assignee_account_id = r.customer_account_id then 'customer'
        else 'provider'
      end,
      'assignee_name', (
        select pr.display_name from public.profiles pr where pr.account_id = t.assignee_account_id limit 1
      )
    ),
    'allowed_transitions', transitions,
    'siblings', siblings,
    'money', jsonb_build_object(
      'obligation_status', obligation.status::text,
      'amount_minor', obligation.amount_minor,
      'currency_code', obligation.currency_code,
      'payout_status', payout.status::text
    ),
    'request_state', r.state::text,
    'evidence', evidence
  );
end $$;

revoke all on function public.get_project_task_command(uuid, uuid) from public, anon;
grant execute on function public.get_project_task_command(uuid, uuid) to authenticated;

/**
 * The conversation, and the record beside it.
 *
 * ⚠️ THESE ARE TWO LISTS AND THEY STAY TWO LISTS. Chat is what people said; the activity feed is what happened,
 * derived from the rows that caused it — a schedule written, a checkpoint recorded, evidence submitted, an
 * approval given. Merging them into one stream is how a decision gets confused with a comment about it, which is
 * the separation the brief asks for and the reason this function returns both rather than interleaving them.
 */
create or replace function public.get_project_messages_command(p_assignment_id uuid)
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
  messages jsonb := '[]'::jsonb;
  activity jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'context_kind', m.context_kind,
           'context_id', m.context_id,
           'context_label', case
             when m.context_kind = 'task' then (select t.title from public.project_tasks t where t.id = m.context_id)
             when m.context_kind = 'project' then coalesce(nullif(btrim(r.need_text), ''), 'The project')
             when m.context_kind = 'quote' then 'The quote'
             when m.context_kind = 'scope_change' then 'A scope question'
             when m.context_kind = 'milestone' then 'A milestone'
             when m.context_kind = 'dispute' then 'The dispute'
             else 'This project'
           end,
           'author_role', case when m.author_account_id = r.customer_account_id then 'customer' else 'provider' end,
           'author_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = m.author_account_id limit 1), 'A participant'),
           'body', m.body,
           'translated_body', m.translated_body,
           'translated_language', m.translated_language,
           'attachment', case when m.attachment_evidence_id is null then null else jsonb_build_object(
             'evidence_id', m.attachment_evidence_id,
             'kind', (select w.kind::text from public.work_evidence w where w.id = m.attachment_evidence_id),
             'note', (select w.note from public.work_evidence w where w.id = m.attachment_evidence_id)
           ) end,
           'created_at', m.created_at
         ) order by m.created_at), '[]'::jsonb)
    into messages
    from public.project_messages m where m.assignment_id = p_assignment_id;

  -- The record: only rows that exist, in the order they happened. No task status history is included because the
  -- task rows carry their own timestamps and pretending to a log this schema does not keep would be invention.
  select coalesce(jsonb_agg(entry order by entry ->> 'at' desc nulls last), '[]'::jsonb)
    into activity
    from (
      select jsonb_build_object('kind','assigned','label','Work accepted and assigned','at', a.assigned_at) as entry
      union all
      select jsonb_build_object('kind','scheduled','label','A time was agreed','at', s.scheduled_start)
      from public.assignment_schedules s where s.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','confirmed','label','The customer confirmed the appointment','at', s.confirmed_at)
      from public.assignment_schedules s where s.assignment_id = p_assignment_id and s.confirmed_at is not null
      union all
      select jsonb_build_object('kind','field','label','The provider recorded “' || fp.state::text || '”','at', fp.recorded_at)
      from public.assignment_field_progress fp where fp.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','evidence','label','Evidence submitted (' || w.kind::text || ')','at', w.submitted_at)
      from public.work_evidence w where w.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','blocked','label','The job was paused','at', b.opened_at)
      from public.assignment_blockers b where b.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','unblocked','label','The job was resumed','at', b.resolved_at)
      from public.assignment_blockers b where b.assignment_id = p_assignment_id and b.resolved_at is not null
      union all
      select jsonb_build_object('kind','correction','label','The customer sent the work back','at', c.created_at)
      from public.completion_correction_requests c where c.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','approved','label','The customer approved completion','at', ca.approved_at)
      from public.completion_approvals ca where ca.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','agreement','label','The agreement was accepted','at', ag.accepted_at)
      from public.agreement_acceptances ag where ag.assignment_id = p_assignment_id
      union all
      select jsonb_build_object('kind','quote','label','Quote ' || q.version_label || ' was accepted','at', q.accepted_at)
      from public.quotes q where q.request_id = r.id and q.provider_id = a.provider_id and q.status = 'accepted'
      union all
      select jsonb_build_object('kind','funded','label','The payment was funded','at', o.updated_at)
      from public.payment_obligations o where o.assignment_id = p_assignment_id and o.status = 'funded'
      union all
      select jsonb_build_object('kind','payout','label','Payout ' || p.status::text,'at', p.updated_at)
      from public.payouts p join public.payment_obligations o on o.id = p.obligation_id
      where o.assignment_id = p_assignment_id
    ) activity_rows;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'contexts', jsonb_build_array(
      jsonb_build_object('kind','project','label','The project'),
      jsonb_build_object('kind','task','label','A task','tasks', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) order by t.ordinal)
        from public.project_tasks t where t.assignment_id = p_assignment_id
      ), '[]'::jsonb)),
      jsonb_build_object('kind','quote','label','The quote'),
      jsonb_build_object('kind','scope_change','label','A scope question'),
      jsonb_build_object('kind','milestone','label','A milestone'),
      jsonb_build_object('kind','dispute','label','The dispute')
    ),
    'messages', messages,
    'activity', activity
  );
end $$;

revoke all on function public.get_project_messages_command(uuid) from public, anon;
grant execute on function public.get_project_messages_command(uuid) to authenticated;

comment on function public.get_project_messages_command(uuid) is
  'The chat about one assignment, grouped by context, plus the factual activity feed derived from the rows that caused it. Two lists, deliberately not interleaved.';
