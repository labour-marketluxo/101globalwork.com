-- Evidence review, the canonical timeline, and versioned documents.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────────────
--
-- 1. FLAGS ON EVIDENCE. Proof of work could be submitted and read, but not disputed: a customer who thinks a
--    photograph shows somebody else's job had no way to say so inside the record. A flag is that statement, with a
--    reason, raised and withdrawn by a participant, and it changes what the evidence tag reads.
--
-- 2. THE TIMELINE READS `audit_events`. The activity feed built earlier is derived from operational rows and is
--    honest as far as it goes, but it cannot show a platform intervention — those live in the audit log, which is
--    revoked from `authenticated`. This read projects the audit rows that belong to one project onto a documented
--    set of fields, so "administrative override notices" are real entries rather than prose.
--
-- 3. DOCUMENTS ARE VERSIONED ROWS, NEVER OVERWRITTEN. A new version is a new row; nothing updates an existing one,
--    and there is NO DELETE POLICY on the storage objects, so history cannot be edited away from either side.
--
-- ⚠️ WHAT THE TIMELINE MUST NOT BE. It is not a chat log: `PROJECT_MESSAGE_SENT` audit rows are excluded, and the
-- page says the conversation lives in Messages. Nothing in it is editable by anybody, including an admin — the
-- only way an entry changes is a later entry.

-- ── 1. Flags ──────────────────────────────────────────────────────────────────────────────────

create table public.project_evidence_flags (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.work_evidence(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  reason_code text not null check (reason_code in ('not_this_job','unreadable','incomplete','misleading','other')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  raised_by_account_id uuid not null references public.accounts(id),
  status text not null default 'open' check (status in ('open','withdrawn')),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open flag per item per account: the same person saying the same thing twice is a duplicate, not an escalation.
create unique index project_evidence_flags_one_open_idx
  on public.project_evidence_flags(evidence_id, raised_by_account_id) where status = 'open';
create index project_evidence_flags_assignment_idx on public.project_evidence_flags(assignment_id, status);

alter table public.project_evidence_flags enable row level security;
create policy project_evidence_flags_participant_read on public.project_evidence_flags
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
revoke all on public.project_evidence_flags from anon;
revoke insert, update, delete on public.project_evidence_flags from authenticated;
grant select on public.project_evidence_flags to authenticated;

comment on table public.project_evidence_flags is
  'A participant saying an evidence item does not show what it claims to. Raised and withdrawn, never resolved inside the platform.';

-- ── 2. Documents ──────────────────────────────────────────────────────────────────────────────

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  -- Versions of one document share this id. It is the first version's own id, so a document that has never been
  -- revised is still a group of one and the version list is never empty.
  document_group_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 200),
  document_type text not null check (document_type in ('agreement','scope','receipt','certificate','permit','insurance','other')),
  version_major integer not null check (version_major between 1 and 500),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  access_scope text not null default 'participants' check (access_scope in ('participants','provider_only','customer_only')),
  uploaded_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  unique (document_group_id, version_major)
);

create index project_documents_assignment_idx on public.project_documents(assignment_id, document_type, created_at desc);
create index project_documents_group_idx on public.project_documents(document_group_id, version_major desc);

create table public.project_document_decisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  decided_by_account_id uuid not null references public.accounts(id),
  decision text not null check (decision in ('approved','declined')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  decided_at timestamptz not null default now(),
  -- One decision per account per version. Changing your mind updates it, so "signer status" has one answer.
  unique (document_id, decided_by_account_id)
);

alter table public.project_documents enable row level security;
alter table public.project_document_decisions enable row level security;
create policy project_documents_participant_read on public.project_documents
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
create policy project_document_decisions_participant_read on public.project_document_decisions
  for select to authenticated using (app_private.project_role_for(assignment_id) is not null);
revoke all on public.project_documents, public.project_document_decisions from anon;
revoke insert, update, delete on public.project_documents, public.project_document_decisions from authenticated;
grant select on public.project_documents, public.project_document_decisions to authenticated;

comment on table public.project_documents is
  'Versioned files on one assignment. A new version is a new row and nothing updates an old one, so the history of what was signed is intact by construction.';
comment on table public.project_document_decisions is
  'A participant approving or declining one version. This is an acknowledgement, not an e-signature: the agreement clickwrap with its step-up is a separate record and this page says so.';

-- ── 3. Document storage ───────────────────────────────────────────────────────────────────────
--
-- ⚠️ DOCUMENTS LIVE IN THE EXISTING PRIVATE BUCKET UNDER THEIR OWN PREFIX: `<assignment_id>/documents/<file>`.
-- The evidence policies key on different segments and cannot match this shape, so nothing here widens evidence
-- access; and there is deliberately NO DELETE POLICY, which is what makes a version permanent.

drop policy if exists project_documents_objects_insert on storage.objects;
create policy project_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'work-evidence'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] = 'documents'
    and app_private.project_role_for(((storage.foldername(name))[1])::uuid) in ('customer','provider')
  );

-- Reading an object requires the row to exist AND its access scope to admit the caller, so a document marked
-- provider-only is not readable by the customer even with the path.
drop policy if exists project_documents_objects_read on storage.objects;
create policy project_documents_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'work-evidence'
    and (storage.foldername(name))[2] = 'documents'
    and exists (
      select 1
      from public.project_documents d
      where d.storage_path = name
        and (
          d.access_scope = 'participants'
          or (d.access_scope = 'provider_only' and app_private.project_role_for(d.assignment_id) = 'provider')
          or (d.access_scope = 'customer_only' and app_private.project_role_for(d.assignment_id) = 'customer')
        )
    )
  );

-- ── 4. Commands ───────────────────────────────────────────────────────────────────────────────

create or replace function public.flag_project_evidence_command(
  p_evidence_id uuid,
  p_reason_code text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  w public.work_evidence%rowtype;
  role text;
  flag_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_reason_code not in ('not_this_job','unreadable','incomplete','misleading','other') then
    raise exception 'invalid flag reason' using errcode = '22023';
  end if;
  select * into w from public.work_evidence where id = p_evidence_id;
  if not found then raise exception 'evidence not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(w.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then
    raise exception 'platform admins read this record; flagging is a party''s statement' using errcode = '22023';
  end if;

  insert into public.project_evidence_flags(evidence_id, assignment_id, reason_code, note, raised_by_account_id)
  values (p_evidence_id, w.assignment_id, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), app_private.current_account_id())
  on conflict (evidence_id, raised_by_account_id) where status = 'open'
  do update set reason_code = excluded.reason_code, note = excluded.note
  returning id into flag_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_EVIDENCE_FLAGGED', 'assignment', w.assignment_id, p_reason_code, 'participant_private',
          jsonb_build_object('evidence_id', p_evidence_id, 'flag_id', flag_id, 'role', role));

  return flag_id;
end $$;

revoke all on function public.flag_project_evidence_command(uuid, text, text) from public, anon;
grant execute on function public.flag_project_evidence_command(uuid, text, text) to authenticated;

create or replace function public.withdraw_project_evidence_flag_command(p_flag_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  f public.project_evidence_flags%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into f from public.project_evidence_flags where id = p_flag_id;
  if not found then return; end if;
  -- Only the person who raised it withdraws it, and only while it is open.
  if f.raised_by_account_id <> app_private.current_account_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if f.status <> 'open' then return; end if;

  update public.project_evidence_flags set status = 'withdrawn', withdrawn_at = now() where id = p_flag_id;
  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_EVIDENCE_FLAG_WITHDRAWN', 'assignment', f.assignment_id, 'participant_private',
          jsonb_build_object('flag_id', p_flag_id, 'evidence_id', f.evidence_id));
end $$;

revoke all on function public.withdraw_project_evidence_flag_command(uuid) from public, anon;
grant execute on function public.withdraw_project_evidence_flag_command(uuid) to authenticated;

/**
 * Register an uploaded document version.
 *
 * ⚠️ THE ROW IS CREATED AFTER THE BYTES, AND THE PATH IS CHECKED AGAINST THIS PROJECT'S PREFIX. The storage policy
 * already refuses a write outside `<assignment_id>/documents/`, and this re-checks it, so a registered document can
 * only point at a file the caller was allowed to put there.
 *
 * ⚠️ A NEW VERSION NEVER TOUCHES AN OLD ONE. `version_major` is computed as the highest for the group plus one and
 * the row is inserted; nothing here updates an existing version, and the storage objects have no delete policy.
 */
create or replace function public.add_project_document_command(
  p_assignment_id uuid,
  p_title text,
  p_document_type text,
  p_storage_path text,
  p_access_scope text default 'participants',
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_document_group_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.project_role_for(p_assignment_id);
  title text := btrim(coalesce(p_title, ''));
  prefix text;
  group_id uuid := p_document_group_id;
  next_version integer;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read documents; they do not add them' using errcode = '22023'; end if;
  if char_length(title) < 2 or char_length(title) > 200 then
    raise exception 'a document needs a title of 2 to 200 characters' using errcode = '22023';
  end if;
  if p_document_type not in ('agreement','scope','receipt','certificate','permit','insurance','other') then
    raise exception 'invalid document type' using errcode = '22023';
  end if;
  if coalesce(p_access_scope, 'participants') not in ('participants','provider_only','customer_only') then
    raise exception 'invalid access scope' using errcode = '22023';
  end if;

  prefix := p_assignment_id::text || '/documents/';
  if p_storage_path is null or char_length(p_storage_path) > 400 or left(p_storage_path, char_length(prefix)) <> prefix then
    raise exception 'that file does not belong to this project' using errcode = '22023';
  end if;

  if group_id is null then
    -- A brand new document: the group id is this row's own id, assigned here so the first version is also the
    -- group. `version_major` is 1 by definition.
    group_id := gen_random_uuid();
    next_version := 1;
  else
    if not exists (select 1 from public.project_documents d where d.document_group_id = group_id and d.assignment_id = p_assignment_id) then
      raise exception 'that document is not on this project' using errcode = '22023';
    end if;
    select coalesce(max(d.version_major), 0) + 1 into next_version
    from public.project_documents d where d.document_group_id = group_id;
  end if;

  insert into public.project_documents(
    assignment_id, document_group_id, title, document_type, version_major, storage_path,
    mime_type, size_bytes, access_scope, uploaded_by_account_id
  ) values (
    p_assignment_id, group_id, title, p_document_type, next_version, p_storage_path,
    nullif(btrim(coalesce(p_mime_type, '')), ''), p_size_bytes, coalesce(p_access_scope, 'participants'),
    app_private.current_account_id()
  ) returning id into new_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', case when next_version = 1 then 'PROJECT_DOCUMENT_ADDED' else 'PROJECT_DOCUMENT_VERSION_ADDED' end,
          'assignment', p_assignment_id, 'participant_private',
          jsonb_build_object('document_id', new_id, 'group_id', group_id, 'version', next_version, 'type', p_document_type, 'role', role));

  return jsonb_build_object('id', new_id, 'document_group_id', group_id, 'version_major', next_version);
end $$;

revoke all on function public.add_project_document_command(uuid, text, text, text, text, text, bigint, uuid) from public, anon;
grant execute on function public.add_project_document_command(uuid, text, text, text, text, text, bigint, uuid) to authenticated;

create or replace function public.decide_project_document_command(
  p_document_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  d public.project_documents%rowtype;
  role text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_decision not in ('approved','declined') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into d from public.project_documents where id = p_document_id;
  if not found then raise exception 'document not found' using errcode = 'P0002'; end if;
  role := app_private.project_role_for(d.assignment_id);
  if role is null then raise exception 'not authorized' using errcode = '42501'; end if;
  if role = 'admin' then raise exception 'platform admins read documents; they do not sign them' using errcode = '22023'; end if;
  -- An agreement's signature is the clickwrap record with its step-up, not an acknowledgement on this page.
  if d.document_type = 'agreement' then
    raise exception 'the agreement is signed through the agreement flow, which records how you verified' using errcode = '22023';
  end if;
  -- Nobody acknowledges their own upload: a document you produced is not one you can approve on the other party's
  -- behalf, and the decision column would stop meaning anything.
  if d.uploaded_by_account_id = app_private.current_account_id() then
    raise exception 'you cannot approve your own upload' using errcode = '22023';
  end if;

  insert into public.project_document_decisions(document_id, assignment_id, decided_by_account_id, decision, note)
  values (p_document_id, d.assignment_id, app_private.current_account_id(), p_decision, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (document_id, decided_by_account_id) do update
    set decision = excluded.decision, note = excluded.note, decided_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROJECT_DOCUMENT_' || upper(p_decision), 'assignment', d.assignment_id, 'participant_private',
          jsonb_build_object('document_id', p_document_id, 'version', d.version_major, 'role', role));
end $$;

revoke all on function public.decide_project_document_command(uuid, text, text) from public, anon;
grant execute on function public.decide_project_document_command(uuid, text, text) to authenticated;

-- ── 5. Reads ──────────────────────────────────────────────────────────────────────────────────

/**
 * The evidence gallery.
 *
 * ⚠️ THE VERIFICATION TAG IS DERIVED, NOT A COLUMN. `work_evidence` has no review state, and inventing a second one
 * beside the completion approval would let the two disagree. So the tag reads: flagged when an open flag exists,
 * approved when the job's completion was approved, submitted otherwise. Each of those is a row somebody can point at.
 */
create or replace function public.get_project_evidence_command(p_assignment_id uuid)
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
  approval public.completion_approvals%rowtype;
  items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;
  select * into approval from public.completion_approvals where assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(entry order by entry ->> 'submitted_at' desc nulls last), '[]'::jsonb)
    into items
    from (
      select jsonb_build_object(
        'id', w.id,
        'kind', w.kind::text,
        'note', w.note,
        'storage_path', w.storage_object_path,
        'external_url', w.external_url,
        'source', w.metadata ->> 'source',
        'ordinal', w.metadata ->> 'ordinal',
        'submitted_at', w.submitted_at,
        'step_label', (select s.label from public.assignment_task_steps s where s.id = w.task_step_id),
        'uploader_role', case when w.submitted_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
        'uploader_name', coalesce((
          select pr.display_name from public.profiles pr where pr.account_id = w.submitted_by_account_id limit 1
        ), 'A participant'),
        'open_flag_count', (
          select count(*) from public.project_evidence_flags f where f.evidence_id = w.id and f.status = 'open'
        ),
        'flags', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', f.id,
                   'reason_code', f.reason_code,
                   'note', f.note,
                   'status', f.status,
                   'raised_by_role', case when f.raised_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
                   'raised_by_me', f.raised_by_account_id = app_private.current_account_id(),
                   'created_at', f.created_at
                 ) order by f.created_at desc)
          from public.project_evidence_flags f where f.evidence_id = w.id
        ), '[]'::jsonb),
        'verification', case
          when exists (select 1 from public.project_evidence_flags f where f.evidence_id = w.id and f.status = 'open') then 'flagged'
          when approval.id is not null then 'approved'
          else 'submitted'
        end
      ) as entry
      from public.work_evidence w
      where w.assignment_id = p_assignment_id
    ) evidence_rows;

  return jsonb_build_object('allowed', true, 'role', role, 'request_state', r.state::text, 'items', items);
end $$;

revoke all on function public.get_project_evidence_command(uuid) from public, anon;
grant execute on function public.get_project_evidence_command(uuid) to authenticated;

/**
 * The canonical timeline.
 *
 * ⚠️ IT IS THE AUDIT LOG, PROJECTED. Each entry carries who caused it — a party, the platform, or the system — the
 * exact instant, and the record it is about. Platform interventions are flagged rather than blended in, which is
 * what the brief means by an administrative override notice.
 *
 * ⚠️ CHAT IS EXCLUDED BY NAME. `PROJECT_MESSAGE_SENT` rows are filtered out: a message is what somebody said and
 * this page is what happened. The conversation has its own tab, and the page says so.
 */
create or replace function public.get_project_timeline_command(p_assignment_id uuid)
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
  events jsonb := '[]'::jsonb;
  customer_auth uuid;
  provider_auth uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;

  -- Who the two parties are, in auth terms, so an audit row can be attributed to a side rather than to a uuid.
  select ac.auth_user_id into customer_auth from public.accounts ac where ac.id = r.customer_account_id;
  select ac.auth_user_id into provider_auth
  from public.providers p join public.accounts ac on ac.id = p.owner_account_id
  where p.id = a.provider_id;

  select coalesce(jsonb_agg(entry order by entry ->> 'at' desc nulls last), '[]'::jsonb)
    into events
    from (
      select jsonb_build_object(
        'kind', e.action,
        'at', e.occurred_at,
        'actor_role', case
          when e.actor_type = 'system' then 'system'
          when e.actor_user_id is null then 'system'
          when e.actor_user_id = customer_auth then 'customer'
          when e.actor_user_id = provider_auth then 'provider'
          else 'platform'
        end,
        'actor_type', e.actor_type,
        'description', case e.action
          when 'ASSIGNMENT_STARTED' then 'Work started'
          when 'PROVIDER_FIELD_PROGRESS_RECORDED' then 'A field checkpoint was recorded'
          when 'WORK_EVIDENCE_SUBMITTED' then 'Evidence was submitted'
          when 'ASSIGNMENT_BLOCKED' then 'The job was paused'
          when 'ASSIGNMENT_UNBLOCKED' then 'The job was resumed'
          when 'PAYMENT_ATTEMPT_CREATED' then 'A payment was started'
          when 'PAYMENT_RECONCILED' then 'A payment was reconciled and the obligation funded'
          when 'PAYOUT_QUEUED' then 'A payout was queued'
          when 'PAYOUT_REQUESTED_BY_PROVIDER' then 'The provider asked for a payout'
          when 'PAYOUT_PROVIDER_STATE_CHANGED' then 'The payment provider reported a payout state'
          when 'QUOTE_WITHDRAWN' then 'A quote version was withdrawn'
          when 'PROJECT_STAGE_ADDED' then 'A stage was added to the plan'
          when 'PROJECT_TASK_ADDED' then 'A task was added to the plan'
          when 'PROJECT_TASK_UPDATED' then 'A task''s scope was edited'
          when 'PROJECT_TASK_STATUS_CHANGED' then 'A task changed state'
          when 'PROJECT_EVIDENCE_FLAGGED' then 'Evidence was flagged'
          when 'PROJECT_EVIDENCE_FLAG_WITHDRAWN' then 'An evidence flag was withdrawn'
          when 'PROJECT_DOCUMENT_ADDED' then 'A document was added'
          when 'PROJECT_DOCUMENT_VERSION_ADDED' then 'A new document version was added'
          when 'PROJECT_DOCUMENT_APPROVED' then 'A document was approved'
          when 'PROJECT_DOCUMENT_DECLINED' then 'A document was declined'
          when 'WORK_COMPLETION_DISPUTE_WITHDRAWN' then 'A dispute was withdrawn'
          else replace(lower(e.action), '_', ' ')
        end,
        'resource_type', e.resource_type,
        'resource_id', e.resource_id,
        'reason_code', e.reason_code,
        -- Anything not caused by one of the two parties is an intervention or an automation, and both are worth
        -- marking rather than blending into the record.
        'is_override', e.actor_type = 'system'
          or (e.actor_user_id is not null and e.actor_user_id <> customer_auth and e.actor_user_id <> provider_auth)
      ) as entry
      from public.audit_events e
      where e.action <> 'PROJECT_MESSAGE_SENT'
        and (
          (e.resource_type = 'assignment' and e.resource_id = p_assignment_id)
          or (e.resource_type = 'request' and e.resource_id = r.id)
          or (e.resource_type = 'payment_obligation' and e.resource_id in (
                select o.id from public.payment_obligations o where o.assignment_id = p_assignment_id))
          or (e.resource_type = 'payout' and e.resource_id in (
                select p.id from public.payouts p
                join public.payment_obligations o on o.id = p.obligation_id
                where o.assignment_id = p_assignment_id))
        )
    ) audit_rows;

  return jsonb_build_object('allowed', true, 'role', role, 'events', events);
end $$;

revoke all on function public.get_project_timeline_command(uuid) from public, anon;
grant execute on function public.get_project_timeline_command(uuid) to authenticated;

/**
 * The document repository, version by version.
 *
 * ⚠️ AN AGREEMENT'S SIGNER STATUS IS NOT STORED HERE. An agreement is signed through the clickwrap flow with its
 * step-up and its record is `agreement_acceptances`; this read reports that as the agreement version's status rather
 * than keeping a second copy that could disagree with what was actually accepted.
 */
create or replace function public.get_project_documents_command(p_assignment_id uuid)
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
  agreement public.agreement_acceptances%rowtype;
  documents jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into r from public.requests where id = a.request_id;
  select * into agreement from public.agreement_acceptances where assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(entry order by entry ->> 'latest_created_at' desc nulls last), '[]'::jsonb)
    into documents
    from (
      select jsonb_build_object(
        'document_group_id', g.document_group_id,
        'title', g.title,
        'document_type', g.document_type,
        'latest_version', g.latest_version,
        'latest_created_at', g.latest_created_at,
        'access_scope', g.access_scope,
        'versions', g.versions
      ) as entry
      from (
        select d.document_group_id,
               max(d.version_major) as latest_version,
               max(d.created_at) as latest_created_at,
               (array_agg(d.title order by d.version_major desc))[1] as title,
               (array_agg(d.document_type order by d.version_major desc))[1] as document_type,
               (array_agg(d.access_scope order by d.version_major desc))[1] as access_scope,
               jsonb_agg(jsonb_build_object(
                 'id', d.id,
                 'version_major', d.version_major,
                 'title', d.title,
                 'document_type', d.document_type,
                 'storage_path', d.storage_path,
                 'mime_type', d.mime_type,
                 'size_bytes', d.size_bytes,
                 'access_scope', d.access_scope,
                 'created_at', d.created_at,
                 'uploader_role', case when d.uploaded_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
                 'uploader_name', coalesce((
                   select pr.display_name from public.profiles pr where pr.account_id = d.uploaded_by_account_id limit 1
                 ), 'A participant'),
                 'uploaded_by_me', d.uploaded_by_account_id = app_private.current_account_id(),
                 'decisions', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'decision', dec.decision,
                            'role', case when dec.decided_by_account_id = r.customer_account_id then 'customer' else 'provider' end,
                            'note', dec.note,
                            'decided_at', dec.decided_at
                          ) order by dec.decided_at)
                   from public.project_document_decisions dec where dec.document_id = d.id
                 ), '[]'::jsonb),
                 'signer_status', case
                   when d.document_type = 'agreement' then case when agreement.id is not null then 'signed' else 'awaiting_customer_signature' end
                   when exists (select 1 from public.project_document_decisions dec where dec.document_id = d.id and dec.decision = 'declined') then 'declined'
                   when exists (select 1 from public.project_document_decisions dec where dec.document_id = d.id and dec.decision = 'approved') then 'approved'
                   else 'awaiting_acknowledgement'
                 end
               ) order by d.version_major desc) as versions
        from public.project_documents d
        where d.assignment_id = p_assignment_id
        group by d.document_group_id
      ) g
    ) document_rows;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'agreement_acceptance', case
      when agreement.id is null then null
      else jsonb_build_object('version', agreement.quote_version_label, 'accepted_at', agreement.accepted_at, 'auth_method', agreement.auth_method)
    end,
    'documents', documents
  );
end $$;

revoke all on function public.get_project_documents_command(uuid) from public, anon;
grant execute on function public.get_project_documents_command(uuid) to authenticated;
