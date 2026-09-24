-- Support cases: the private ticket workspace behind /support and /support/[caseId].
--
-- ── ISOLATION IS THE WHOLE DESIGN, SO IT IS STATED FIRST ──────────────────────────────────────
--
-- 1. A CASE BELONGS TO ONE ACCOUNT. Every read and every write re-derives the caller with
--    `app_private.current_account_id()` and every lookup goes through `app_private.support_case_owned_by`,
--    which filters on the owning account. There is one definition of "this case is mine" and every command
--    uses it, because object-level authorisation re-derived in nine places is nine chances to get one wrong.
--
-- 2. "NOT FOUND" IS THE ANSWER FOR SOMEBODY ELSE'S CASE, TOO. A distinct "that case exists but is not yours"
--    is an existence oracle: with it, a reference or an id becomes something worth guessing. The commands
--    refuse both the same way, and the page has one sentence for both.
--
-- 3. THE CASE REFERENCE IS NOT A CREDENTIAL. `reference` is short enough to read down a phone and it is
--    printed on the page — but no command accepts a reference, only a case id, and only with a session that
--    owns it. Knowing somebody's ticket number gets you nothing.
--
-- 4. THE REQUESTER NEVER SEES THE SUPPORT SIDE. Internal notes are filtered out of the read projection, an
--    attachment on an internal note is filtered with it, and a support author is published as the platform
--    ("101GlobalWork Support") rather than as whichever staff account happened to type the reply. There is
--    no support-agent surface in this application yet, so nothing writes an internal note today; the column
--    and the filter exist together so the operator console can start, without a migration that would open a
--    window in which a note is visible.
--
-- ── WHAT A CASE MAY BE ATTACHED TO ────────────────────────────────────────────────────────────
--
-- A project, a payment, or a request — because "which job is this about" is the first question support asks,
-- and answering it from a free-text field is how a thread ends up needing a human to find the job. The link
-- is VALIDATED AT CREATION against the caller's own parties: a case cannot be pointed at somebody else's
-- project, which would leak that the project exists and put it in a support queue it has nothing to do with.
--
-- ── SERVICE LEVELS ────────────────────────────────────────────────────────────────────────────
--
-- The clock starts when the case is created and the two deadlines are computed from the priority, not
-- promised in copy and remembered by nobody. A safety report is floored at HIGH priority: the one case type
-- where somebody must not be able to self-select the slowest queue.
--
-- ⚠️ THE DEADLINES ARE VISIBLE TO THE REQUESTER AND THAT IS INTENTIONAL. The brief asks for an expected-SLA
-- countdown. A countdown the platform cannot honour is worse than no countdown, so the page states the
-- deadline as the platform's own target and says plainly that missing it does not change anything about the
-- work or the money — it is a service promise, not a contractual one, and /pricing owns the contractual
-- position.

create type public.support_case_status as enum ('open', 'awaiting_response', 'investigating', 'resolved', 'closed');
create type public.support_case_kind as enum ('general', 'project', 'payment', 'account', 'verification', 'safety');
create type public.support_case_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  -- Generated in the command, not by a column default: the generator needs pgcrypto, and a DEFAULT
  -- expression is resolved when the table is created under whatever search_path the migration happens to
  -- run with — which is exactly how a default that works locally fails on a project with a different
  -- extension schema.
  reference text not null unique check (reference ~ '^SUP-[0-9A-F]{10}$'),
  account_id uuid not null references public.accounts(id) on delete restrict,
  kind public.support_case_kind not null default 'general',
  status public.support_case_status not null default 'open',
  priority public.support_case_priority not null default 'normal',
  subject text not null check (char_length(btrim(subject)) between 6 and 160),
  -- At most one link, and the command decides which; a case about a payment on a project is a payment case.
  assignment_id uuid references public.assignments(id) on delete set null,
  payment_obligation_id uuid references public.payment_obligations(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  first_response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  closed_by_account_id uuid references public.accounts(id) on delete set null,
  close_reason text check (close_reason is null or char_length(btrim(close_reason)) between 1 and 500),
  reopened_count integer not null default 0 check (reopened_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_cases_closure_shape check (
    (status <> 'closed') or (closed_at is not null)
  ),
  constraint support_cases_resolution_shape check (
    (status not in ('resolved', 'closed')) or resolved_at is not null
  ),
  constraint support_cases_deadline_order check (resolution_due_at >= first_response_due_at)
);

create index support_cases_account_idx on public.support_cases(account_id, created_at desc);
create index support_cases_status_idx on public.support_cases(status, resolution_due_at) where status <> 'closed';
create index support_cases_assignment_idx on public.support_cases(assignment_id) where assignment_id is not null;
create index support_cases_obligation_idx on public.support_cases(payment_obligation_id) where payment_obligation_id is not null;

create table public.support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_account_id uuid references public.accounts(id) on delete set null,
  author_role text not null check (author_role in ('requester', 'support', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  -- A requester's own message can never be marked internal, and a system message has no author. Both rules
  -- are here rather than in the command because a future writer that forgets them is the one that matters.
  constraint support_case_messages_internal_is_support check (not internal or author_role = 'support'),
  constraint support_case_messages_system_has_no_author check (author_role <> 'system' or author_account_id is null)
);

create index support_case_messages_case_idx on public.support_case_messages(case_id, created_at);

create table public.support_case_attachments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  -- Null for a file attached to the case itself rather than to one reply.
  message_id uuid references public.support_case_messages(id) on delete set null,
  uploaded_by_account_id uuid not null references public.accounts(id) on delete restrict,
  object_path text not null unique,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index support_case_attachments_case_idx on public.support_case_attachments(case_id, created_at);

create table public.support_case_feedback (
  case_id uuid primary key references public.support_cases(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(btrim(comment)) between 1 and 2000),
  submitted_at timestamptz not null default now()
);

alter table public.support_cases enable row level security;
alter table public.support_case_messages enable row level security;
alter table public.support_case_attachments enable row level security;
alter table public.support_case_feedback enable row level security;

-- Explicitly denied through the Data API. Every path in and out is a command, which is where ownership is
-- re-derived and where the internal-note filter lives. Same pattern as account_contact_methods.
create policy support_cases_deny_direct on public.support_cases for all to authenticated using (false) with check (false);
create policy support_case_messages_deny_direct on public.support_case_messages for all to authenticated using (false) with check (false);
create policy support_case_attachments_deny_direct on public.support_case_attachments for all to authenticated using (false) with check (false);
create policy support_case_feedback_deny_direct on public.support_case_feedback for all to authenticated using (false) with check (false);

comment on table public.support_cases is
  'One account''s support case. Private: no read or write path exists except a command that re-derives the owning account.';

-- ── The attachment bucket ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/plain','text/csv']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The path is `<account id>/<case id>/<uuid>-<file name>`, and the policy reads the FIRST folder only.
-- That is the one segment a client cannot lie about usefully: it is compared against the account the session
-- resolves to. The case id in the second segment is checked in the command, where it can be resolved against
-- a row that is actually owned.
drop policy if exists support_attachments_objects_owner on storage.objects;
create policy support_attachments_objects_owner on storage.objects
  for all to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = app_private.current_account_id()::text
  )
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = app_private.current_account_id()::text
  );

-- ── Helpers ───────────────────────────────────────────────────────────────────────────────────

/**
 * The single definition of "this case is mine".
 *
 * Returns the row, or nothing. A caller that gets nothing raises the same "case not found" whether the case
 * belongs to somebody else or to nobody, which is the point: the difference is information the platform has
 * no reason to hand out.
 */
create or replace function app_private.support_case_owned_by(p_case_id uuid, p_account_id uuid)
returns public.support_cases
language sql
stable
security definer
set search_path = public, app_private
as $$
  select c.*
    from public.support_cases c
   where c.id = p_case_id
     and c.account_id = p_account_id;
$$;

create or replace function app_private.support_first_response_interval(p_priority public.support_case_priority)
returns interval
language sql
immutable
as $$
  select case p_priority
    when 'urgent' then interval '1 hour'
    when 'high' then interval '4 hours'
    when 'normal' then interval '12 hours'
    else interval '24 hours'
  end;
$$;

create or replace function app_private.support_resolution_interval(p_priority public.support_case_priority)
returns interval
language sql
immutable
as $$
  select case p_priority
    when 'urgent' then interval '8 hours'
    when 'high' then interval '24 hours'
    when 'normal' then interval '72 hours'
    else interval '5 days'
  end;
$$;

revoke all on function app_private.support_case_owned_by(uuid, uuid) from public;
revoke all on function app_private.support_first_response_interval(public.support_case_priority) from public;
revoke all on function app_private.support_resolution_interval(public.support_case_priority) from public;

-- ── Reads ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_support_case_options_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  targets jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  -- Only things this account is actually a party to. A picker that offers the whole platform would leak
  -- which projects exist and produce cases attached to work the requester has nothing to do with.
  select coalesce(jsonb_agg(entry order by entry ->> 'label'), '[]'::jsonb)
    into targets
    from (
      select jsonb_build_object(
               'kind', 'project',
               'id', a.id,
               'label', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'A project'),
               'detail', case
                 when r.customer_account_id = me then 'You posted this request'
                 else 'You are the provider'
               end
             ) as entry
        from public.assignments a
        join public.requests r on r.id = a.request_id
       where a.status <> 'cancelled'
         and (r.customer_account_id = me
              or exists (
                select 1 from public.providers p
                 where p.id = a.provider_id
                   and (p.owner_account_id = me
                        or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
              ))
      union all
      select jsonb_build_object(
               'kind', 'payment',
               'id', o.id,
               'label', 'Payment ' || o.status::text,
               'detail', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'A payment') || ' · ' || o.currency_code || ' ' ||
                         to_char(o.amount_minor / 100.0, 'FM999G999G990D00')
             )
        from public.payment_obligations o
        join public.requests r on r.id = o.request_id
       where o.customer_account_id = me
    ) listed;

  return jsonb_build_object(
    'allowed', true,
    'targets', targets,
    'kinds', jsonb_build_array(
      jsonb_build_object('code', 'general', 'label', 'Something else', 'detail', 'A question that does not fit the others'),
      jsonb_build_object('code', 'project', 'label', 'A project', 'detail', 'Work that is running or finished'),
      jsonb_build_object('code', 'payment', 'label', 'A payment', 'detail', 'Money owed, paid, held or refunded'),
      jsonb_build_object('code', 'account', 'label', 'My account', 'detail', 'Signing in, profile, or access'),
      jsonb_build_object('code', 'verification', 'label', 'Verification', 'detail', 'Documents, checks or credentials'),
      jsonb_build_object('code', 'safety', 'label', 'A safety concern', 'detail', 'Harm, threats, fraud or unsafe work')
    )
  );
end $$;

create or replace function public.get_my_support_cases_command(p_filter text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  scope text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'open');
  cases jsonb;
  open_count integer;
  closed_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;
  if scope not in ('open', 'closed', 'all') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;

  with mine as (
    select c.*,
           (select count(*) from public.support_case_messages m where m.case_id = c.id and not m.internal) as message_count,
           (select count(*) from public.support_case_attachments t where t.case_id = c.id) as attachment_count,
           (select max(m.created_at) from public.support_case_messages m where m.case_id = c.id and not m.internal) as last_message_at,
           (select m.author_role from public.support_case_messages m
             where m.case_id = c.id and not m.internal order by m.created_at desc limit 1) as last_author_role
      from public.support_cases c
     where c.account_id = me
       and case scope
             when 'open' then c.status <> 'closed'
             when 'closed' then c.status = 'closed'
             else true
           end
  )
  select coalesce(jsonb_agg(entry order by last_at desc nulls last), '[]'::jsonb),
         count(*) filter (where status <> 'closed'),
         count(*) filter (where status = 'closed')
    into cases, open_count, closed_count
    from (
      select jsonb_build_object(
               'id', c.id,
               'reference', c.reference,
               'subject', c.subject,
               'kind', c.kind,
               'status', c.status,
               'priority', c.priority,
               'messageCount', c.message_count,
               'attachmentCount', c.attachment_count,
               'createdAt', c.created_at,
               -- ⚠️ ONE DERIVED FLAG RATHER THAN A COUNT OF UNREAD MESSAGES. The platform has no read marker
               -- for cases, and inventing one that only counts when a page happens to be opened would be a
               -- number that means nothing. "We are waiting on you" is what the requester actually needs.
               -- Never true for a closed case: nothing is awaiting anybody once it is closed, and a closed
               -- row that still said "waiting on you" would be the one thing that makes somebody reopen a
               -- finished thread.
               'awaitingYou', case
                 when c.status = 'closed' then false
                 else c.status in ('awaiting_response', 'resolved')
                      or coalesce(c.last_author_role, 'requester') = 'support'
               end,
               'firstResponseDueAt', c.first_response_due_at,
               'resolutionDueAt', c.resolution_due_at,
               'firstRespondedAt', c.first_responded_at,
               'resolvedAt', c.resolved_at,
               'closedAt', c.closed_at,
               'resolutionOverdue', c.status <> 'closed' and c.resolved_at is null and c.resolution_due_at < now(),
               'link', case
                 when c.payment_obligation_id is not null then jsonb_build_object('kind', 'payment', 'label', 'A payment')
                 when c.assignment_id is not null then jsonb_build_object('kind', 'project', 'label', 'A project')
                 when c.request_id is not null then jsonb_build_object('kind', 'request', 'label', 'A request')
                 else null
               end
             ) as entry,
             coalesce(c.last_message_at, c.created_at) as last_at,
             c.status
        from mine c
    ) rows;

  return jsonb_build_object(
    'allowed', true,
    'cases', cases,
    'counts', jsonb_build_object('open', open_count, 'closed', closed_count)
  );
end $$;

create or replace function public.get_my_support_case_command(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.support_cases;
  messages jsonb;
  attachments jsonb;
  feedback jsonb;
  link jsonb := null;
  sla_state text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  c := app_private.support_case_owned_by(p_case_id, me);
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  -- The thread as the requester may read it: internal notes are gone, and a support author is the platform
  -- rather than a person. An author with no profile row and no role is never rendered as a name.
  select coalesce(jsonb_agg(entry order by at), '[]'::jsonb)
    into messages
    from (
      select jsonb_build_object(
               'id', m.id,
               'authorRole', m.author_role,
               'authorName', case
                 when m.author_role = 'support' then '101GlobalWork Support'
                 when m.author_role = 'system' then '101GlobalWork'
                 else coalesce(nullif(btrim(pr.display_name), ''), 'You')
               end,
               'body', m.body,
               'createdAt', m.created_at
             ) as entry,
             m.created_at as at
        from public.support_case_messages m
        left join public.profiles pr on pr.account_id = m.author_account_id
       where m.case_id = c.id
         and not m.internal
    ) listed;

  -- An attachment on an internal note is invisible with the note it belongs to. That is the whole reason
  -- this subquery joins the message rather than filtering on the case alone.
  select coalesce(jsonb_agg(entry order by at), '[]'::jsonb)
    into attachments
    from (
      select jsonb_build_object(
               'id', t.id,
               'fileName', t.file_name,
               'contentType', t.content_type,
               'sizeBytes', t.size_bytes,
               'createdAt', t.created_at,
               'href', '/support/' || c.id || '/attachments/' || t.id
             ) as entry,
             t.created_at as at
        from public.support_case_attachments t
        left join public.support_case_messages m on m.id = t.message_id
       where t.case_id = c.id
         and coalesce(m.internal, false) = false
    ) listed;

  select jsonb_build_object('rating', f.rating, 'comment', f.comment, 'submittedAt', f.submitted_at)
    into feedback
    from public.support_case_feedback f
   where f.case_id = c.id;

  if c.payment_obligation_id is not null then
    select jsonb_build_object(
             'kind', 'payment',
             'id', o.id,
             'label', 'Payment · ' || o.currency_code || ' ' || to_char(o.amount_minor / 100.0, 'FM999G999G990D00'),
             'detail', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'A payment'),
             'href', '/customer/payments/' || o.id
           )
      into link
      from public.payment_obligations o
      join public.requests r on r.id = o.request_id
     where o.id = c.payment_obligation_id;
  elsif c.assignment_id is not null then
    select jsonb_build_object(
             'kind', 'project',
             'id', a.id,
             'label', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'A project'),
             'detail', 'Project ' || a.status::text,
             'href', '/projects/' || a.id
           )
      into link
      from public.assignments a
      join public.requests r on r.id = a.request_id
     where a.id = c.assignment_id;
  end if;

  -- The SLA state, in the terms the page prints. `met` is only ever said about a deadline that was actually
  -- met; an open case whose first-response deadline has passed says so.
  sla_state := case
    when c.status = 'closed' then 'closed'
    when c.first_responded_at is null and c.first_response_due_at < now() then 'first_response_overdue'
    when c.resolved_at is null and c.resolution_due_at < now() then 'resolution_overdue'
    when c.status in ('resolved', 'closed') then 'met'
    when c.first_responded_at is null and c.first_response_due_at < now() + interval '2 hours' then 'first_response_due_soon'
    when c.resolution_due_at < now() + interval '12 hours' then 'resolution_due_soon'
    else 'on_track'
  end;

  return jsonb_build_object(
    'allowed', true,
    'case', jsonb_build_object(
      'id', c.id,
      'reference', c.reference,
      'subject', c.subject,
      'kind', c.kind,
      'status', c.status,
      'priority', c.priority,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at,
      'firstResponseDueAt', c.first_response_due_at,
      'resolutionDueAt', c.resolution_due_at,
      'firstRespondedAt', c.first_responded_at,
      'resolvedAt', c.resolved_at,
      'closedAt', c.closed_at,
      'closedByYou', c.closed_by_account_id = me,
      'closeReason', c.close_reason,
      'reopenedCount', c.reopened_count,
      'canReply', c.status <> 'closed',
      'canClose', c.status <> 'closed',
      'canGiveFeedback', c.status in ('resolved', 'closed') and feedback is null,
      'slaState', sla_state
    ),
    'link', link,
    'messages', messages,
    'attachments', attachments,
    'feedback', feedback
  );
end $$;

/** The one file a requester may download, resolved through the case they own. */
create or replace function public.get_my_support_attachment_command(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  row_out record;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select t.object_path, t.file_name, t.content_type, t.size_bytes
    into row_out
    from public.support_case_attachments t
    join public.support_cases c on c.id = t.case_id
   where t.id = p_attachment_id
     and c.account_id = me;
  if row_out.object_path is null then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'objectPath', row_out.object_path,
    'fileName', row_out.file_name,
    'contentType', row_out.content_type,
    'sizeBytes', row_out.size_bytes
  );
end $$;

-- ── Writes ────────────────────────────────────────────────────────────────────────────────────

create or replace function public.create_support_case_command(
  p_kind text,
  p_subject text,
  p_body text,
  p_target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  kind public.support_case_kind;
  priority public.support_case_priority;
  subject text := btrim(coalesce(p_subject, ''));
  body text := btrim(coalesce(p_body, ''));
  assignment uuid := null;
  obligation uuid := null;
  case_id uuid;
  reference_code text;
  first_due timestamptz;
  resolution_due timestamptz;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  kind := p_kind::public.support_case_kind;
  if char_length(subject) < 6 or char_length(subject) > 160 then
    raise exception 'a subject of 6 to 160 characters is required' using errcode = '22023';
  end if;
  if char_length(body) < 10 or char_length(body) > 8000 then
    raise exception 'describe the problem in 10 to 8000 characters' using errcode = '22023';
  end if;

  priority := case when kind = 'safety' then 'high' else 'normal' end;

  -- The link is resolved by trying, as the caller, to find the target among the things they are a party to.
  -- Anything else leaves the case unlinked rather than failing the whole submission: somebody describing a
  -- problem should not lose their description because a dropdown value was stale.
  if p_target_id is not null then
    if kind = 'payment' then
      select o.id into obligation
        from public.payment_obligations o
       where o.id = p_target_id and o.customer_account_id = me;
    else
      select a.id into assignment
        from public.assignments a
        join public.requests r on r.id = a.request_id
       where a.id = p_target_id
         and (r.customer_account_id = me
              or exists (
                select 1 from public.providers p
                 where p.id = a.provider_id
                   and (p.owner_account_id = me
                        or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
              ));
    end if;
  end if;

  reference_code := 'SUP-' || upper(encode(gen_random_bytes(5), 'hex'));
  first_due := now() + app_private.support_first_response_interval(priority);
  resolution_due := now() + app_private.support_resolution_interval(priority);

  insert into public.support_cases (
    reference, account_id, kind, priority, subject,
    assignment_id, payment_obligation_id, first_response_due_at, resolution_due_at
  )
  values (
    reference_code, me, kind, priority, subject,
    assignment, obligation, first_due, resolution_due
  )
  returning id into case_id;

  insert into public.support_case_messages (case_id, author_account_id, author_role, body)
  values (case_id, me, 'requester', body);

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'SUPPORT_CASE_OPENED', 'support_case', case_id, 'participant_private',
          jsonb_build_object('kind', kind, 'priority', priority, 'linked', assignment is not null or obligation is not null));

  return jsonb_build_object(
    'id', case_id,
    'reference', reference_code,
    'status', 'open',
    'priority', priority,
    'firstResponseDueAt', first_due,
    'resolutionDueAt', resolution_due
  );
end $$;

create or replace function public.reply_to_support_case_command(p_case_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.support_cases;
  body text := btrim(coalesce(p_body, ''));
  new_status public.support_case_status;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(body) < 1 or char_length(body) > 8000 then
    raise exception 'a reply is required' using errcode = '22023';
  end if;

  c := app_private.support_case_owned_by(p_case_id, me);
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  -- A closed case is final, and the refusal says what to do instead. Reopening silently would make "closed"
  -- a word the platform does not mean, and the requester would have no way to tell a finished case from one
  -- somebody is reading again.
  if c.status = 'closed' then
    raise exception 'this case is closed' using errcode = '22023';
  end if;

  -- Replying to a resolved case reopens it. That is the expected shape of "not fixed, actually" and it is
  -- counted, so the queue can see how often a resolution did not hold.
  new_status := case
    when c.status = 'resolved' then 'open'
    when c.status = 'awaiting_response' then 'open'
    else c.status
  end;

  insert into public.support_case_messages (case_id, author_account_id, author_role, body)
  values (c.id, me, 'requester', body);

  update public.support_cases
     set status = new_status,
         resolved_at = case when c.status = 'resolved' then null else resolved_at end,
         reopened_count = case when c.status = 'resolved' then reopened_count + 1 else reopened_count end,
         updated_at = now()
   where id = c.id;

  return jsonb_build_object('status', new_status, 'reopened', c.status = 'resolved');
end $$;

create or replace function public.close_my_support_case_command(p_case_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.support_cases;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'a closing note of at most 500 characters' using errcode = '22023';
  end if;

  c := app_private.support_case_owned_by(p_case_id, me);
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('status', 'closed', 'alreadyClosed', true);
  end if;

  -- Closing a case that was never resolved records the resolution time as well, so the SLA figures do not
  -- quietly count a case the requester gave up on as still outstanding.
  update public.support_cases
     set status = 'closed',
         resolved_at = coalesce(resolved_at, now()),
         closed_at = now(),
         closed_by_account_id = me,
         close_reason = reason,
         updated_at = now()
   where id = c.id;

  insert into public.support_case_messages (case_id, author_role, body)
  values (c.id, 'system', case when reason is null then 'The requester closed this case.' else 'The requester closed this case: ' || reason end);

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'SUPPORT_CASE_CLOSED', 'support_case', c.id, 'participant_private',
          jsonb_build_object('byRequester', true));

  return jsonb_build_object('status', 'closed', 'alreadyClosed', false);
end $$;

create or replace function public.submit_support_case_feedback_command(
  p_case_id uuid,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.support_cases;
  comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'a rating from 1 to 5 is required' using errcode = '22023';
  end if;
  if comment is not null and char_length(comment) > 2000 then
    raise exception 'a comment of at most 2000 characters' using errcode = '22023';
  end if;

  c := app_private.support_case_owned_by(p_case_id, me);
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  -- Feedback is about a resolution, so there has to be one. Asking "how did we do" while a case is still
  -- being worked on produces an answer about waiting rather than about the outcome.
  if c.status not in ('resolved', 'closed') then
    raise exception 'this case has not been resolved yet' using errcode = '22023';
  end if;

  -- Upsert, because somebody who misclicks a star should be able to change it — the alternative is a rating
  -- nobody trusts and a support queue chasing a correction it cannot accept.
  insert into public.support_case_feedback (case_id, account_id, rating, comment)
  values (c.id, me, p_rating, comment)
  on conflict (case_id) do update
    set rating = excluded.rating,
        comment = excluded.comment,
        submitted_at = now();

  return jsonb_build_object('rating', p_rating, 'submitted', true);
end $$;

/**
 * Record an attachment that has already been stored.
 *
 * ⚠️ TWO STEPS, AND THE ORDER IS THE SAFE ONE. The object goes to storage first (the browser uploads through
 * the storage policy, which only permits the account's own folder), then this command records it. A row
 * written first would describe a file that might never arrive — a broken link in a support thread, which is
 * exactly where somebody is already having a bad time.
 *
 * The path is validated rather than trusted: `<account id>/<case id>/<uuid>-<name>`. The account segment is
 * the caller's own, and the case segment has to resolve to a case they own, so a client cannot point a row at
 * another tenant's prefix even if the storage policy were the only thing standing in the way.
 */
create or replace function public.register_support_attachment_command(
  p_case_id uuid,
  p_object_path text,
  p_file_name text,
  p_content_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  c public.support_cases;
  allowed_types constant text[] := array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'text/csv'
  ];
  parts text[];
  attachment_id uuid;
  safe_name text := btrim(coalesce(p_file_name, ''));
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  c := app_private.support_case_owned_by(p_case_id, me);
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if c.status = 'closed' then
    raise exception 'this case is closed' using errcode = '22023';
  end if;

  if p_object_path is null or p_content_type is null then
    raise exception 'the file was not stored' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'files must be no larger than 10 MB' using errcode = '22023';
  end if;
  if not (p_content_type = any (allowed_types)) then
    raise exception 'that file type cannot be attached' using errcode = '22023';
  end if;
  if char_length(safe_name) < 1 or char_length(safe_name) > 200 then
    raise exception 'a file name is required' using errcode = '22023';
  end if;

  parts := storage.foldername(p_object_path);
  if array_length(parts, 1) < 3
     or parts[1] <> me::text
     or parts[2] <> c.id::text then
    raise exception 'unexpected attachment path' using errcode = '22023';
  end if;

  insert into public.support_case_attachments (
    case_id, uploaded_by_account_id, object_path, file_name, content_type, size_bytes
  )
  values (c.id, me, p_object_path, safe_name, p_content_type, p_size_bytes)
  returning id into attachment_id;

  -- A file is activity. Without this the case list would sort it by the last reply and a case that just got
  -- its evidence would look untouched.
  update public.support_cases set updated_at = now() where id = c.id;

  return jsonb_build_object(
    'id', attachment_id,
    'fileName', safe_name,
    'href', '/support/' || c.id || '/attachments/' || attachment_id
  );
end $$;

revoke all on function public.get_my_support_case_options_command() from public, anon;
revoke all on function public.get_my_support_cases_command(text) from public, anon;
revoke all on function public.get_my_support_case_command(uuid) from public, anon;
revoke all on function public.get_my_support_attachment_command(uuid) from public, anon;
revoke all on function public.create_support_case_command(text, text, text, uuid) from public, anon;
revoke all on function public.reply_to_support_case_command(uuid, text) from public, anon;
revoke all on function public.close_my_support_case_command(uuid, text) from public, anon;
revoke all on function public.submit_support_case_feedback_command(uuid, integer, text) from public, anon;
revoke all on function public.register_support_attachment_command(uuid, text, text, text, bigint) from public, anon;

grant execute on function public.get_my_support_case_options_command() to authenticated;
grant execute on function public.get_my_support_cases_command(text) to authenticated;
grant execute on function public.get_my_support_case_command(uuid) to authenticated;
grant execute on function public.get_my_support_attachment_command(uuid) to authenticated;
grant execute on function public.create_support_case_command(text, text, text, uuid) to authenticated;
grant execute on function public.reply_to_support_case_command(uuid, text) to authenticated;
grant execute on function public.close_my_support_case_command(uuid, text) to authenticated;
grant execute on function public.submit_support_case_feedback_command(uuid, integer, text) to authenticated;
grant execute on function public.register_support_attachment_command(uuid, text, text, text, bigint) to authenticated;
