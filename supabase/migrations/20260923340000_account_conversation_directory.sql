-- The universal conversation directory behind /messages.
--
-- ── IT IS A DIRECTORY OVER THE THREADS THAT ALREADY EXIST, NOT A NEW THREAD TABLE ─────────────
--
-- This codebase has two message tables, deliberately, and neither is replaced here:
--
--   project_messages        the conversation about an assignment, grouped by what it is about
--   provider_quote_messages the conversation between a customer and one provider about a request
--
-- features/quotes/messages.ts already records why there is no shared thread table: the two are
-- authorised differently (project role vs. request ownership vs. provider ownership), and a single
-- table would have to be readable by both parties of both relationships to be useful at all.
--
-- A directory is the right answer to "show me everything I am in", and it does not need a third copy
-- of the messages. What it DOES need is per-account state that no message table holds: when this
-- account last read a thread, and whether it archived it. That is the only new table here.
--
-- ── A THREAD KEY IS DERIVED, NOT INVENTED ─────────────────────────────────────────────────────
--
--   pm:<assignment id>:<context kind>:<context id | ->     one project thread, one task, one dispute
--   pq:<request id>                                        one customer/provider quote conversation
--
-- The key is deterministic from the rows it describes, so a read marker written today still matches
-- the thread tomorrow. It is not a security boundary: read state is scoped to the account by the
-- primary key, and every write first checks the key names a thread that account is actually in.

create table public.conversation_read_states (
  account_id uuid not null references public.accounts(id) on delete cascade,
  thread_key text not null check (thread_key ~ '^(pm|pq):[0-9a-zA-Z:_-]{4,180}$'),
  -- The newest message this account has seen in the thread. Null means "never opened", which counts
  -- every message in it as unread — the honest default for somebody who has not been there yet.
  last_read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, thread_key)
);

create index conversation_read_states_account_idx
  on public.conversation_read_states(account_id, archived_at);

alter table public.conversation_read_states enable row level security;

-- No direct access: the commands below are the only way in, and they re-derive who the caller is.
create policy conversation_read_states_deny_direct on public.conversation_read_states
  for all to authenticated using (false) with check (false);

comment on table public.conversation_read_states is
  'Per-account read markers and archive flags for conversations that live in project_messages and provider_quote_messages. There is no third copy of the messages.';

-- ── The directory ─────────────────────────────────────────────────────────────────────────────

/**
 * Every thread this account is a participant in, with the state the account has against it.
 *
 * ⚠️ TAKES AN ACCOUNT ID, SO IT IS REVOKED FROM EVERY ROLE. The public command passes
 * `app_private.current_account_id()` and nothing else.
 *
 * ⚠️ THE SCOPE IS "ACTIVE WORK", WHICH IS A CHOICE AND IS WRITTEN DOWN HERE BECAUSE IT IS VISIBLE. Threads on
 * an assignment whose status is still `active`, plus every quote conversation — because the brief asks for the
 * active threads and because a directory that filled up with finished jobs would be harder to use than the
 * project pages it duplicates. The consequence, stated plainly: a completed project's threads leave this list.
 * They are not deleted, they are still on the project's own messages page, and they still appear in the
 * notification feed — which is scoped by what is still true rather than by what is still running.
 *
 * ⚠️ PARTICIPANTS COME FROM THE MESSAGES THEMSELVES. There is no membership table to read, and
 * inventing one would be the second source of truth this migration exists to avoid. The practical
 * consequence, stated because it is visible in the UI: a thread with no messages has no
 * participants, and a person appears in the header only once they have said something. Names come
 * from `profiles`; an account with no display name is "A participant" rather than an id.
 */
create or replace function app_private.conversation_threads_for(p_account_id uuid)
returns table (
  thread_key text,
  kind text,
  title text,
  context_label text,
  href text,
  participants jsonb,
  unread_count integer,
  awaiting_me boolean,
  last_excerpt text,
  last_author text,
  last_activity_at timestamptz,
  archived boolean
)
language sql
stable
security definer
set search_path = public, app_private, auth
as $$
with me as (
  select p_account_id as account_id
),
my_providers as (
  select p.id
    from public.providers p, me
   where p.owner_account_id = me.account_id
      or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))
),
my_assignments as (
  select a.id as assignment_id,
         a.provider_id,
         r.id as request_id,
         r.customer_account_id,
         coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'Your project') as project_label
    from public.assignments a
    join public.requests r on r.id = a.request_id
    cross join me
   where a.status = 'active'
     and (r.customer_account_id = me.account_id or a.provider_id in (select id from my_providers))
),
thread_keys as (
  -- One row per (assignment, context) that has at least one message.
  select 'pm:' || m.assignment_id || ':' || m.context_kind || ':' ||
           coalesce(nullif(m.context_id::text, '00000000-0000-0000-0000-000000000000'), '-') as thread_key,
         case when m.context_kind = 'project' then 'project' else m.context_kind end as kind,
         a.assignment_id,
         a.request_id,
         m.context_kind as context_kind,
         coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid) as context_id,
         a.project_label,
         a.customer_account_id,
         a.provider_id
    from public.project_messages m
    join my_assignments a on a.assignment_id = m.assignment_id
   group by m.assignment_id, m.context_kind, m.context_id, a.assignment_id, a.request_id,
            a.project_label, a.customer_account_id, a.provider_id

  union all

  -- One row per request with a quote conversation the caller is part of.
  select 'pq:' || r.id,
         'quote',
         null::uuid,
         r.id,
         'quote',
         null::uuid,
         coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.need_text), ''), 'Your request'),
         r.customer_account_id,
         null::uuid
    from public.requests r
    cross join me
   where exists (
     select 1
       from public.provider_quote_messages qm
      where qm.request_id = r.id
        and (r.customer_account_id = me.account_id
             or qm.provider_id in (select id from my_providers))
   )
)
select tk.thread_key,
       tk.kind,
       case tk.kind
         when 'task' then coalesce(
           (select t.title from public.project_tasks t where t.id = tk.context_id),
           'A task'
         )
         when 'quote' then
           case when tk.customer_account_id = me.account_id then 'The quote' else 'A quote conversation' end
         when 'scope_change' then 'A scope question'
         when 'milestone' then 'A milestone'
         when 'dispute' then 'The dispute'
         else tk.project_label
       end,
       tk.project_label,
       case
         when tk.kind = 'quote' and tk.customer_account_id = me.account_id then
           '/customer/requests/' || tk.request_id || '/quotes'
         when tk.kind = 'quote' then
           '/provider/requests/' || tk.request_id || '/quote'
         else '/projects/' || tk.assignment_id || '/messages'
       end,
       coalesce(participants.listed, '[]'::jsonb),
       coalesce(unread.total, 0)::integer,
       coalesce(unread.total, 0) > 0,
       coalesce(last_pm.excerpt, last_qm.excerpt),
       coalesce(last_pm.author_name, last_qm.author_name),
       coalesce(last_pm.created_at, last_qm.created_at),
       coalesce(rs.archived_at is not null, false)
  from thread_keys tk
  cross join me
  left join public.conversation_read_states rs
         on rs.account_id = me.account_id and rs.thread_key = tk.thread_key
  -- The newest message in a project thread. Empty for quote threads by construction.
  left join lateral (
    select m.body as excerpt,
           coalesce(nullif(btrim(pr.display_name), ''), 'A participant') as author_name,
           m.created_at
      from public.project_messages m
      left join public.profiles pr on pr.account_id = m.author_account_id
     where tk.kind <> 'quote'
       and m.assignment_id = tk.assignment_id
       and m.context_kind = tk.context_kind
       and coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid) = tk.context_id
     order by m.created_at desc
     limit 1
  ) last_pm on true
  -- The newest message in a quote thread. Empty for project threads by construction.
  left join lateral (
    select qm.message as excerpt,
           coalesce(nullif(btrim(pr.display_name), ''), 'A participant') as author_name,
           qm.created_at
      from public.provider_quote_messages qm
      left join public.profiles pr on pr.account_id = qm.author_account_id
     where tk.kind = 'quote'
       and qm.request_id = tk.request_id
     order by qm.created_at desc
     limit 1
  ) last_qm on true
  left join lateral (
    select count(*) as total
      from (
        select m.created_at
          from public.project_messages m
         where tk.kind <> 'quote'
           and m.assignment_id = tk.assignment_id
           and m.context_kind = tk.context_kind
           and coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid) = tk.context_id
           and m.author_account_id <> me.account_id
           and m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
        union all
        select qm.created_at
          from public.provider_quote_messages qm
         where tk.kind = 'quote'
           and qm.request_id = tk.request_id
           and qm.author_account_id <> me.account_id
           and qm.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
      ) unread_rows
  ) unread on true
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('name', part.display_name, 'role', part.role)
             order by part.role, part.display_name
           ) as listed
      from (
        select distinct
               coalesce(nullif(btrim(pr.display_name), ''), 'A participant') as display_name,
               case
                 when m.author_account_id = tk.customer_account_id then 'customer'
                 when m.author_account_id = (select p.owner_account_id from public.providers p where p.id = tk.provider_id) then 'provider'
                 else 'provider'
               end as role
          from public.project_messages m
          left join public.profiles pr on pr.account_id = m.author_account_id
         where tk.kind <> 'quote'
           and m.assignment_id = tk.assignment_id
           and m.context_kind = tk.context_kind
           and coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid) = tk.context_id
         limit 4
      ) part
  ) participants on true
 where coalesce(last_pm.created_at, last_qm.created_at) is not null;
$$;

revoke all on function app_private.conversation_threads_for(uuid) from public;

-- ── The public reads ──────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_conversations_command(
  p_query text default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  needle text := nullif(btrim(coalesce(p_query, '')), '');
  scope text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'all');
  threads jsonb;
  open_count integer;
  unread_count integer;
  archived_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;
  if scope not in ('all', 'unread', 'archived') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;

  with listed as (
    select t.*
      from app_private.conversation_threads_for(me) t
     where case scope
             when 'archived' then t.archived
             when 'unread' then t.unread_count > 0 and not t.archived
             else not t.archived
           end
       and (
         needle is null
         or t.title ilike '%' || needle || '%'
         or t.context_label ilike '%' || needle || '%'
         or t.last_excerpt ilike '%' || needle || '%'
         or t.last_author ilike '%' || needle || '%'
         or exists (
           select 1 from jsonb_array_elements(t.participants) p
            where p ->> 'name' ilike '%' || needle || '%'
         )
       )
  )
  select coalesce(jsonb_agg(entry order by last_at desc nulls last), '[]'::jsonb),
         count(*) filter (where not archived),
         count(*) filter (where unread_count > 0 and not archived),
         count(*) filter (where archived)
    into threads, open_count, unread_count, archived_count
    from (
      select jsonb_build_object(
               'key', t.thread_key,
               'kind', t.kind,
               'title', t.title,
               'contextLabel', t.context_label,
               'href', t.href,
               'participants', t.participants,
               'unreadCount', t.unread_count,
               'awaitingMe', t.awaiting_me,
               'lastExcerpt', t.last_excerpt,
               'lastAuthor', t.last_author,
               'lastActivityAt', t.last_activity_at,
               'archived', t.archived
             ) as entry,
             t.last_activity_at as last_at,
             t.unread_count,
             t.archived
        from listed t
    ) rows;

  return jsonb_build_object(
    'allowed', true,
    'threads', threads,
    'counts', jsonb_build_object(
      'open', open_count,
      'unreadThreads', unread_count,
      'archived', archived_count
    )
  );
end $$;

create or replace function public.get_my_conversation_badge_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  unread_threads integer;
  unread_messages integer;
begin
  if me is null then
    return jsonb_build_object('allowed', false, 'unreadThreads', 0, 'unreadMessages', 0);
  end if;

  select count(*) filter (where t.unread_count > 0),
         coalesce(sum(t.unread_count), 0)
    into unread_threads, unread_messages
    from app_private.conversation_threads_for(me) t
   where not t.archived;

  return jsonb_build_object(
    'allowed', true,
    'unreadThreads', unread_threads,
    'unreadMessages', unread_messages
  );
end $$;

-- ── Writes ────────────────────────────────────────────────────────────────────────────────────

create or replace function app_private.assert_conversation_in_my_list(p_account_id uuid, p_thread_key text)
returns void
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if p_thread_key is null or btrim(p_thread_key) = '' then
    raise exception 'a thread is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from app_private.conversation_threads_for(p_account_id) t
     where t.thread_key = p_thread_key
  ) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.mark_my_conversation_read_command(p_thread_key text)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform app_private.assert_conversation_in_my_list(me, p_thread_key);

  insert into public.conversation_read_states (account_id, thread_key, last_read_at)
  values (me, p_thread_key, now())
  on conflict (account_id, thread_key) do update
    set last_read_at = now(),
        updated_at = now();
end $$;

/**
 * Archive or restore.
 *
 * Archiving is a per-account view, not a state on the conversation: the other party's copy stays
 * exactly where it was, and a new message does not un-archive anything. The page says so, because
 * "archive" in a shared thread is a word people reasonably read as "hide it from everyone".
 */
create or replace function public.archive_my_conversation_command(p_thread_key text, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_archived is null then
    raise exception 'a value is required' using errcode = '22023';
  end if;
  perform app_private.assert_conversation_in_my_list(me, p_thread_key);

  insert into public.conversation_read_states (account_id, thread_key, archived_at)
  values (me, p_thread_key, case when p_archived then now() else null end)
  on conflict (account_id, thread_key) do update
    set archived_at = case when p_archived then now() else null end,
        updated_at = now();
end $$;

revoke all on function app_private.assert_conversation_in_my_list(uuid, text) from public;
revoke all on function public.get_my_conversations_command(text, text) from public, anon;
revoke all on function public.get_my_conversation_badge_command() from public, anon;
revoke all on function public.mark_my_conversation_read_command(text) from public, anon;
revoke all on function public.archive_my_conversation_command(text, boolean) from public, anon;

grant execute on function public.get_my_conversations_command(text, text) to authenticated;
grant execute on function public.get_my_conversation_badge_command() to authenticated;
grant execute on function public.mark_my_conversation_read_command(text) to authenticated;
grant execute on function public.archive_my_conversation_command(text, boolean) to authenticated;
