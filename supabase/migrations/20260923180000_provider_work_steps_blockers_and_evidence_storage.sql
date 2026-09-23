-- The field workspace: the provider's own job list, task steps, blockers, and storage for evidence.
--
-- Four things the brief asks for that had nowhere to live, and one that had a place but no policy:
--
--   1. "Task checklist". There is no checklist anywhere in this schema — the agreed scope is the accepted
--      quote, and that is a document, not a list with ticks against it. `assignment_task_steps` is the
--      provider's own plan for the job, which is what a field checklist actually is.
--
--   2. "Pause / Blocked". The request state machine has no paused state, and it must not grow one: `requests`
--      drives payment, matching and completion, and a fourth actor pausing it would be a change to the money
--      model. A blocker is what a provider means when they say they are blocked — a missing part, a locked
--      gate, no access — so it is recorded as one, with a reason and a resolution.
--
--   3. Evidence at volume. `work_evidence` holds one payload per row and `submit_work_evidence_command` takes
--      one. A completion package is a handful of photographs and a note, so the package command below writes
--      the rows and lets the EXISTING authoritative function perform the state change — one writer of
--      `requests.state`, as before.
--
--   4. Somewhere to put the bytes. No bucket existed and no storage policy existed, so `storage_object_path`
--      was a column nothing could ever fill. This creates a PRIVATE bucket and the policies that let exactly
--      two parties read an object: the provider who owns the job, and the customer who commissioned it.
--
--   5. "Customer name". `profiles` is self-only, so a provider could not see who they were working for. The
--      read models below project the customer's DISPLAY NAME for work the provider has been hired for, and
--      nothing else — no contact details, no address, no email. See the comment on get_my_work_command.

-- ── 1. The provider's own checklist ───────────────────────────────────────────────────────────

create table public.assignment_task_steps (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 200),
  label text not null check (char_length(btrim(label)) between 2 and 200),
  state text not null default 'todo' check (state in ('todo','doing','done')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, ordinal)
);

create index assignment_task_steps_assignment_idx on public.assignment_task_steps(assignment_id, ordinal);

alter table public.assignment_task_steps enable row level security;

create policy assignment_task_steps_owner_read on public.assignment_task_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.assignment_task_steps from anon;
revoke insert, update, delete on public.assignment_task_steps from authenticated;
grant select on public.assignment_task_steps to authenticated;

comment on table public.assignment_task_steps is
  'The provider''s own checklist for one assignment. Not the customer''s scope and not a payment gate: a plan the field provider ticks off.';

-- ── 2. Blockers ───────────────────────────────────────────────────────────────────────────────

create table public.assignment_blockers (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  reason_code text not null check (reason_code in ('no_access','missing_material','unsafe_conditions','customer_unavailable','scope_unclear','weather','other')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  opened_by_account_id uuid not null references public.accounts(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text check (resolved_note is null or char_length(btrim(resolved_note)) between 1 and 500)
);

-- One open blocker per assignment: a job is blocked or it is not, and a pile of open blockers would make
-- "why is this stopped" a question with several answers.
create unique index assignment_blockers_one_open_idx
  on public.assignment_blockers(assignment_id) where resolved_at is null;

alter table public.assignment_blockers enable row level security;

create policy assignment_blockers_owner_read on public.assignment_blockers
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

-- The customer can see that their job is stopped, and why. They cannot see it before it is stopped, and they
-- cannot see the note history of a resolved blocker beyond the resolution.
create policy assignment_blockers_customer_read on public.assignment_blockers
  for select to authenticated
  using (
    exists (
      select 1 from public.assignments a
      join public.requests r on r.id = a.request_id
      where a.id = assignment_id and r.customer_account_id = app_private.current_account_id()
    )
  );

revoke all on public.assignment_blockers from anon;
revoke insert, update, delete on public.assignment_blockers from authenticated;
grant select on public.assignment_blockers to authenticated;

comment on table public.assignment_blockers is
  'Why a job has stopped, in the provider''s own account of it. Open or resolved; never a change to the request state machine.';

-- ── 3. Evidence that belongs to a step ────────────────────────────────────────────────────────

alter table public.work_evidence
  add column if not exists task_step_id uuid references public.assignment_task_steps(id) on delete set null;

create index if not exists work_evidence_step_idx on public.work_evidence(task_step_id) where task_step_id is not null;

comment on column public.work_evidence.task_step_id is
  'The checklist step this evidence belongs to, when the provider assigned one. Optional: evidence about the whole job is normal.';

-- ── 4. Commands ───────────────────────────────────────────────────────────────────────────────

/** Add a step. Ordinals continue from the highest existing one so two devices cannot both claim "step 3". */
create or replace function public.add_assignment_task_step_command(
  p_assignment_id uuid,
  p_label text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  prov public.providers%rowtype;
  next_ordinal integer;
  step_id uuid;
  label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if char_length(label) < 2 or char_length(label) > 200 then
    raise exception 'a step needs a label of 2 to 200 characters' using errcode = '22023';
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = a.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if a.status <> 'active' then
    raise exception 'active assignment required' using errcode = '22023';
  end if;

  select coalesce(max(ordinal), 0) + 1 into next_ordinal
  from public.assignment_task_steps where assignment_id = p_assignment_id;
  if next_ordinal > 200 then
    raise exception 'this checklist is full' using errcode = '22023';
  end if;

  insert into public.assignment_task_steps(assignment_id, provider_id, ordinal, label, note)
  values (p_assignment_id, a.provider_id, next_ordinal, label, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into step_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ASSIGNMENT_TASK_STEP_ADDED', 'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('step_id', step_id, 'ordinal', next_ordinal));

  return step_id;
end $$;

revoke all on function public.add_assignment_task_step_command(uuid, text, text) from public, anon;
grant execute on function public.add_assignment_task_step_command(uuid, text, text) to authenticated;

/**
 * Tick a step off, or put it back.
 *
 * ⚠️ IT IS IDEMPOTENT BY CONSTRUCTION: the caller sends the state it wants, not a toggle. A queued tap that
 * arrives twice leaves the step in the same place, which is what makes the offline queue safe to replay.
 */
create or replace function public.set_assignment_task_step_command(
  p_step_id uuid,
  p_state text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  step public.assignment_task_steps%rowtype;
  prov public.providers%rowtype;
  a public.assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if p_state not in ('todo','doing','done') then
    raise exception 'invalid step state' using errcode = '22023';
  end if;

  select * into step from public.assignment_task_steps where id = p_step_id;
  if not found then raise exception 'step not found' using errcode = 'P0002'; end if;
  select * into a from public.assignments where id = step.assignment_id;
  select * into prov from public.providers where id = step.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if a.status <> 'active' then
    raise exception 'this assignment is closed, so its checklist cannot change' using errcode = '22023';
  end if;

  update public.assignment_task_steps
     set state = p_state,
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         updated_at = now()
   where id = p_step_id;

  return p_state;
end $$;

revoke all on function public.set_assignment_task_step_command(uuid, text, text) from public, anon;
grant execute on function public.set_assignment_task_step_command(uuid, text, text) to authenticated;

create or replace function public.remove_assignment_task_step_command(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  step public.assignment_task_steps%rowtype;
  prov public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into step from public.assignment_task_steps where id = p_step_id;
  if not found then return; end if;
  select * into prov from public.providers where id = step.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.assignment_task_steps where id = p_step_id;
end $$;

revoke all on function public.remove_assignment_task_step_command(uuid) from public, anon;
grant execute on function public.remove_assignment_task_step_command(uuid) to authenticated;

/** Say the job is stopped, and why. One open blocker per assignment, enforced by an index. */
create or replace function public.open_assignment_blocker_command(
  p_assignment_id uuid,
  p_reason_code text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  prov public.providers%rowtype;
  blocker_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if p_reason_code not in ('no_access','missing_material','unsafe_conditions','customer_unavailable','scope_unclear','weather','other') then
    raise exception 'invalid blocker reason' using errcode = '22023';
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = a.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if a.status <> 'active' then
    raise exception 'active assignment required' using errcode = '22023';
  end if;

  -- Raising a second blocker is not a failure of the second call; it is the same statement repeated. Returning
  -- the open one keeps the action idempotent for a queued replay.
  select id into blocker_id from public.assignment_blockers
  where assignment_id = p_assignment_id and resolved_at is null;
  if blocker_id is not null then
    update public.assignment_blockers
       set reason_code = p_reason_code,
           note = nullif(btrim(coalesce(p_note, '')), '')
     where id = blocker_id;
    return blocker_id;
  end if;

  insert into public.assignment_blockers(assignment_id, provider_id, reason_code, note, opened_by_account_id)
  values (p_assignment_id, a.provider_id, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), acct)
  returning id into blocker_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ASSIGNMENT_BLOCKED', 'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('reason_code', p_reason_code, 'blocker_id', blocker_id));

  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('assignment', p_assignment_id, 'ASSIGNMENT_BLOCKED',
          jsonb_build_object('request_id', a.request_id, 'reason_code', p_reason_code),
          'assignment-blocked:' || blocker_id::text);

  return blocker_id;
end $$;

revoke all on function public.open_assignment_blocker_command(uuid, text, text) from public, anon;
grant execute on function public.open_assignment_blocker_command(uuid, text, text) to authenticated;

create or replace function public.resolve_assignment_blocker_command(p_blocker_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  blocker public.assignment_blockers%rowtype;
  prov public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into blocker from public.assignment_blockers where id = p_blocker_id;
  if not found then return; end if;
  select * into prov from public.providers where id = blocker.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if blocker.resolved_at is not null then return; end if;

  update public.assignment_blockers
     set resolved_at = now(), resolved_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_blocker_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ASSIGNMENT_UNBLOCKED', 'assignment', blocker.assignment_id, 'participant_private',
          jsonb_build_object('blocker_id', p_blocker_id));
end $$;

revoke all on function public.resolve_assignment_blocker_command(uuid, text) from public, anon;
grant execute on function public.resolve_assignment_blocker_command(uuid, text) to authenticated;

-- ── 5. A completion package ───────────────────────────────────────────────────────────────────

/**
 * Submit several files at once, optionally attributed to a checklist step.
 *
 * ⚠️ THE STATE CHANGE IS STILL PERFORMED BY `submit_work_evidence_authoritatively`, NOT BY THIS FUNCTION. The
 * extra rows are written here, then the FIRST path goes through the existing command, which does the
 * transition, the audit event and the outbox write — so there is still exactly one writer of
 * `requests.state = 'submitted_for_approval'` and its payment/approval consequences. If that command refuses,
 * this function's exception rolls the whole call back and the extra rows vanish with it.
 *
 * ⚠️ THE IDEMPOTENCY KEY IS THE CLIENT'S, WHICH IS WHAT MAKES A REPLAY SAFE. The queue on the device generates
 * one key per package and reuses it on retry; the authoritative command looks it up in `outbox_events` and
 * returns the existing evidence id instead of writing a second package.
 */
create or replace function public.submit_assignment_evidence_package_command(
  p_assignment_id uuid,
  p_storage_object_paths text[],
  p_note text,
  p_kind public.evidence_kind default 'photo',
  p_task_step_id uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  prov public.providers%rowtype;
  paths text[] := coalesce(p_storage_object_paths, '{}'::text[]);
  prefix text;
  path text;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  evidence_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found or a.status <> 'active' then
    raise exception 'active assignment required' using errcode = '22023';
  end if;
  select * into prov from public.providers where id = a.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.requests where id = a.request_id;
  if r.state <> 'in_progress' then
    raise exception 'work must be in progress before evidence submission' using errcode = '22023';
  end if;

  if array_length(paths, 1) is null or array_length(paths, 1) < 1 then
    raise exception 'at least one file is required' using errcode = '22023';
  end if;
  if array_length(paths, 1) > 12 then
    raise exception 'a package can carry at most 12 files' using errcode = '22023';
  end if;

  -- ⚠️ EVERY PATH MUST SIT UNDER THIS JOB'S OWN PREFIX. The storage policy already scopes writes that way, but
  -- accepting any string here would let a provider attach somebody else's object to their own submission —
  -- and the customer reads whatever this column points at.
  prefix := a.provider_id::text || '/' || a.id::text || '/';
  foreach path in array paths loop
    if path is null or char_length(path) > 400 or left(path, char_length(prefix)) <> prefix then
      raise exception 'that file does not belong to this job' using errcode = '22023';
    end if;
  end loop;

  if p_task_step_id is not null then
    if not exists (
      select 1 from public.assignment_task_steps s
      where s.id = p_task_step_id and s.assignment_id = p_assignment_id
    ) then
      raise exception 'that checklist step is not on this job' using errcode = '22023';
    end if;
  end if;

  -- Everything except the first file. A single-row package needs none of this and the loop simply does not run.
  for position_index in 2..array_length(paths, 1) loop
    insert into public.work_evidence(
      assignment_id, provider_id, kind, note, storage_object_path, submitted_by_account_id, task_step_id, metadata
    ) values (
      a.id, a.provider_id, p_kind, note, paths[position_index], acct, p_task_step_id,
      jsonb_build_object('source', 'package', 'ordinal', position_index)
    );
  end loop;

  evidence_id := app_private.submit_work_evidence_authoritatively(
    a.id, p_kind, note, paths[1], null, p_idempotency_key
  );

  if p_task_step_id is not null then
    update public.work_evidence
       set task_step_id = p_task_step_id,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'package', 'ordinal', 1)
     where id = evidence_id;
  end if;

  return evidence_id;
end $$;

revoke all on function public.submit_assignment_evidence_package_command(uuid, text[], text, public.evidence_kind, uuid, text) from public, anon;
grant execute on function public.submit_assignment_evidence_package_command(uuid, text[], text, public.evidence_kind, uuid, text) to authenticated;

-- ── 6. Private storage for the files themselves ───────────────────────────────────────────────
--
-- ⚠️ A PRIVATE BUCKET WITH POLICY-ENFORCED PATHS, because evidence is photographs of somebody's home. The path
-- is `<provider_id>/<assignment_id>/<file>`, and the policies below compare those two segments against rows —
-- so a provider can only write into their own jobs, and only the two parties to the job can read what is there.
-- `public = false` means the objects are unreachable without a signed URL, even if somebody guesses a path.
--
-- This section assumes the Supabase storage schema, which every Supabase project (and the local CLI stack) has.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-evidence',
  'work-evidence',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists work_evidence_objects_insert on storage.objects;
create policy work_evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'work-evidence'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and exists (
      select 1
      from public.assignments a
      join public.providers p on p.id = a.provider_id
      where a.id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[1]
        and a.status = 'active'
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

drop policy if exists work_evidence_objects_read on storage.objects;
create policy work_evidence_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'work-evidence'
    and exists (
      select 1
      from public.assignments a
      join public.requests r on r.id = a.request_id
      join public.providers p on p.id = a.provider_id
      where a.id::text = (storage.foldername(name))[2]
        and (
          r.customer_account_id = app_private.current_account_id()
          or p.owner_account_id = app_private.current_account_id()
          or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))
        )
    )
  );

-- Deleting is for cleaning up a bad upload, not for removing evidence that has been submitted: the row in
-- `work_evidence` keeps pointing at the path either way, which is why the app never deletes a submitted file.
drop policy if exists work_evidence_objects_delete on storage.objects;
create policy work_evidence_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'work-evidence'
    and exists (
      select 1
      from public.assignments a
      join public.providers p on p.id = a.provider_id
      where a.id::text = (storage.foldername(name))[2]
        and p.id::text = (storage.foldername(name))[1]
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

-- ── 7. The provider's job list ────────────────────────────────────────────────────────────────

/**
 * Every job this provider holds, with what the four tabs and the cards need.
 *
 * ⚠️ THE CUSTOMER'S DISPLAY NAME IS PROJECTED HERE, AND THE DECISION IS DELIBERATE. `profiles` is readable only
 * by its owner, so a provider could not see who they were working for at all. Once an assignment exists, the
 * two parties have agreed work and the provider is going to meet this person — a name is what makes "which job
 * is this" answerable on a phone. What is NOT projected is anything that reaches a person: no email, no phone,
 * no address, no city of residence. The platform holds no street address for either party, and this command
 * does not change that.
 *
 * ⚠️ IT IS NOT LIMITED TO OPEN WORK. Completed and cancelled assignments are in the same list because "Completed
 * history" is one of the four tabs; the page filters, the command does not.
 */
create or replace function public.get_my_work_command(p_provider_id uuid)
returns table(
  assignment_id uuid,
  request_id uuid,
  need_text text,
  request_state text,
  urgency text,
  assignment_status text,
  assigned_at timestamptz,
  ended_at timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  schedule_timezone text,
  schedule_status text,
  confirmed_at timestamptz,
  field_state text,
  field_state_at timestamptz,
  obligation_status text,
  amount_minor bigint,
  currency_code text,
  evidence_count integer,
  steps_total integer,
  steps_done integer,
  open_blocker_reason text,
  correction_open boolean,
  approved_at timestamptz,
  location_name text,
  city_name text,
  service_name text,
  customer_display_name text
)
language sql
stable
security definer
set search_path = public, app_private, auth
as $function$
  select
    a.id,
    r.id,
    coalesce(nullif(btrim(r.need_text), ''), 'Assigned work'),
    r.state::text,
    r.urgency::text,
    a.status::text,
    a.assigned_at,
    a.ended_at,
    s.scheduled_start,
    s.scheduled_end,
    s.timezone,
    coalesce(s.customer_status, 'unscheduled'),
    s.confirmed_at,
    fp.state::text,
    fp.recorded_at,
    ob.status::text,
    ob.amount_minor,
    ob.currency_code,
    (select count(*)::integer from public.work_evidence w where w.assignment_id = a.id),
    (select count(*)::integer from public.assignment_task_steps st where st.assignment_id = a.id),
    (select count(*)::integer from public.assignment_task_steps st where st.assignment_id = a.id and st.state = 'done'),
    (select b.reason_code from public.assignment_blockers b where b.assignment_id = a.id and b.resolved_at is null limit 1),
    exists (
      select 1 from public.completion_correction_requests c
      where c.assignment_id = a.id and c.status = 'open'
    ),
    (select ca.approved_at from public.completion_approvals ca where ca.assignment_id = a.id),
    lc.display_name,
    parent.display_name,
    sc.display_name,
    (select pr.display_name from public.profiles pr where pr.account_id = r.customer_account_id limit 1)
  from public.assignments a
  join public.requests r on r.id = a.request_id
  left join public.assignment_schedules s on s.assignment_id = a.id
  left join public.assignment_field_progress fp on fp.assignment_id = a.id
  left join public.payment_obligations ob on ob.assignment_id = a.id
  left join public.public_location_catalog lc on lc.location_id = r.location_id
  left join public.public_location_catalog parent on parent.location_id = lc.parent_id
  left join public.public_service_catalog sc on sc.service_entity_id = r.service_entity_id
  where a.provider_id = p_provider_id
    and exists (
      select 1 from public.providers p
      where p.id = p_provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  order by
    case a.status when 'active' then 0 else 1 end,
    s.scheduled_start nulls last,
    a.assigned_at desc;
$function$;

revoke all on function public.get_my_work_command(uuid) from public, anon;
grant execute on function public.get_my_work_command(uuid) to authenticated;

comment on function public.get_my_work_command(uuid) is
  'Every assignment for this provider: schedule, field progress, payment state, checklist progress, blockers, and the customer''s display name.';

-- ── 8. One job, in the field ──────────────────────────────────────────────────────────────────

/**
 * The execution workspace's read.
 *
 * ⚠️ LANDMARK AND ACCESS NOTES ARE INCLUDED HERE, AND WERE WITHHELD ON THE OPPORTUNITY PAGE. The difference is
 * the relationship: this is work the customer has hired this provider to do, and "the gate code is 4417" is
 * something the provider needs to be told. The line is drawn at the same place it was drawn before — the moment
 * an assignment exists.
 */
create or replace function public.get_my_assignment_command(p_provider_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  prov public.providers%rowtype;
  scope jsonb := '{}'::jsonb;
  steps jsonb := '[]'::jsonb;
  evidence jsonb := '[]'::jsonb;
  blocker jsonb;
  correction jsonb;
  customer_name text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found or a.provider_id <> p_provider_id then return null; end if;
  select * into prov from public.providers where id = a.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.requests where id = a.request_id;

  select coalesce(rs.scope_json, '{}'::jsonb) into scope
  from public.request_scopes rs
  where rs.request_id = r.id
  order by rs.version desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', st.id,
           'ordinal', st.ordinal,
           'label', st.label,
           'state', st.state,
           'note', st.note
         ) order by st.ordinal), '[]'::jsonb)
    into steps
    from public.assignment_task_steps st
   where st.assignment_id = a.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id,
           'kind', w.kind::text,
           'note', w.note,
           'storage_path', w.storage_object_path,
           'external_url', w.external_url,
           'task_step_id', w.task_step_id,
           'submitted_at', w.submitted_at
         ) order by w.submitted_at desc), '[]'::jsonb)
    into evidence
    from public.work_evidence w
   where w.assignment_id = a.id;

  select jsonb_build_object(
           'id', b.id, 'reason_code', b.reason_code, 'note', b.note, 'opened_at', b.opened_at
         )
    into blocker
    from public.assignment_blockers b
   where b.assignment_id = a.id and b.resolved_at is null
   limit 1;

  select jsonb_build_object('id', c.id, 'message', c.message, 'status', c.status, 'created_at', c.created_at)
    into correction
    from public.completion_correction_requests c
   where c.assignment_id = a.id and c.status = 'open'
   order by c.created_at desc
   limit 1;

  select pr.display_name into customer_name
  from public.profiles pr where pr.account_id = r.customer_account_id limit 1;

  return jsonb_build_object(
    'assignment', jsonb_build_object(
      'id', a.id,
      'status', a.status::text,
      'assigned_at', a.assigned_at,
      'ended_at', a.ended_at,
      'field_state', (select fp.state::text from public.assignment_field_progress fp where fp.assignment_id = a.id),
      'field_state_at', (select fp.recorded_at from public.assignment_field_progress fp where fp.assignment_id = a.id)
    ),
    'request', jsonb_build_object(
      'id', r.id,
      'need_text', r.need_text,
      'state', r.state::text,
      'urgency', r.urgency::text,
      'timezone', r.timezone,
      'service_name', (select sc.display_name from public.public_service_catalog sc where sc.service_entity_id = r.service_entity_id),
      'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
      'city_name', (
        select parent.display_name
        from public.public_location_catalog lc
        join public.public_location_catalog parent on parent.location_id = lc.parent_id
        where lc.location_id = r.location_id
      ),
      'currency_code', (select m.default_currency_code from public.public_market_catalog m where m.market_id = r.market_id)
    ),
    'customer', jsonb_build_object('display_name', customer_name, 'has_photo', false),
    'schedule', (
      select jsonb_build_object(
               'scheduled_start', s.scheduled_start,
               'scheduled_end', s.scheduled_end,
               'timezone', s.timezone,
               'note', s.note,
               'status', s.customer_status,
               'confirmed_at', s.confirmed_at
             )
      from public.assignment_schedules s where s.assignment_id = a.id
    ),
    'obligation', (
      select jsonb_build_object('status', ob.status::text, 'amount_minor', ob.amount_minor, 'currency_code', ob.currency_code)
      from public.payment_obligations ob where ob.assignment_id = a.id
    ),
    'site', jsonb_build_object(
      'landmark', nullif(btrim(coalesce(scope ->> 'landmark', '')), ''),
      'access_notes', nullif(btrim(coalesce(scope ->> 'access_notes', '')), ''),
      'area_text', nullif(btrim(coalesce(scope ->> 'area_text', '')), ''),
      'answers', coalesce(scope -> 'answers', '{}'::jsonb),
      'hazardous', coalesce((scope ->> 'hazardous')::boolean, false)
    ),
    'steps', steps,
    'evidence', evidence,
    'blocker', blocker,
    'correction', correction,
    'approved_at', (select ca.approved_at from public.completion_approvals ca where ca.assignment_id = a.id),
    'agreement', (
      select jsonb_build_object(
               'quote_version', ag.quote_version_label,
               'total_minor', ag.total_minor,
               'currency_code', ag.currency_code,
               'accepted_at', ag.accepted_at,
               'auth_method', ag.auth_method
             )
      from public.agreement_acceptances ag where ag.assignment_id = a.id
    )
  );
end $$;

revoke all on function public.get_my_assignment_command(uuid, uuid) from public, anon;
grant execute on function public.get_my_assignment_command(uuid, uuid) to authenticated;

comment on function public.get_my_assignment_command(uuid, uuid) is
  'One assignment in the field: scope, checklist, evidence, blocker, correction, agreement, the site notes the customer gave, and their display name.';
