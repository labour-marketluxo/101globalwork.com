-- The notification centre: the feed behind /notifications, and the channel/event matrix behind
-- /settings/notifications.
--
-- ── WHY THERE IS NO `notifications` TABLE FULL OF ROWS ─────────────────────────────────────────
--
-- The obvious build is a table plus a writer on every code path that could produce one. That was
-- rejected here for a reason this codebase has already paid for once: the admin operations page had to
-- learn to say "zero delivery attempts, no error" out loud, because a queue with nothing writing to it
-- looks exactly like a queue with nothing to do. A notification table is the same trap one level up —
-- every future feature that forgets to insert a row silently produces a user who is never told
-- anything, and nothing in the system can tell the difference.
--
-- So the feed is DERIVED ON READ from the rows that actually caused each event: tasks, project
-- messages, change requests, issues, payment obligations, payouts, quotes, MFA factors and sessions.
-- An event cannot drift from the record it describes, and no code path can forget to announce itself.
--
-- THE COST, STATED PLAINLY: an event that stops being true disappears from the feed. A task sent back
-- for changes stops being "ready for review" the moment it is re-opened, which is the behaviour we
-- want; but it also means the feed is a statement about NOW rather than a log of everything ever
-- announced. The record of what happened already exists in the tables below and in audit_events.
--
-- What IS stored per account is only the part that is genuinely account state: whether each item has
-- been read, and whether it has been dismissed.
--
-- ── THE SAFETY EXCEPTION IS ENFORCED IN THE DATABASE ──────────────────────────────────────────
--
-- Security, legal and payment-dispute notices are locked: `notification_events.locked` is true and
-- names the channels that can never be switched off. The rule is enforced here rather than in the UI,
-- so a POST that never came from the page gets the same answer, and the page reads the lock from the
-- same row it renders.

create type public.notification_category as enum (
  'work_updates', 'financials', 'marketing', 'security', 'legal', 'payment_disputes'
);
create type public.notification_channel as enum ('email', 'push', 'sms', 'in_app');
create type public.notification_severity as enum ('info', 'attention', 'action');

-- ── 1. The event catalogue ────────────────────────────────────────────────────────────────────

create table public.notification_events (
  code text primary key,
  category public.notification_category not null,
  label text not null check (char_length(btrim(label)) between 2 and 120),
  description text not null check (char_length(btrim(description)) between 2 and 400),
  -- Locked = the safety exception. It cannot be switched off on any channel it requires.
  locked boolean not null default false,
  required_channels public.notification_channel[] not null default '{in_app}'::public.notification_channel[],
  default_channels public.notification_channel[] not null default '{in_app}'::public.notification_channel[],
  sort_order integer not null default 100,
  constraint notification_events_code_shape check (code ~ '^[a-z_]+\.[a-z_]+$'),
  -- A locked event with no required channel is a lock that locks nothing.
  constraint notification_events_locked_requires_channel check (
    not locked or coalesce(array_length(required_channels, 1), 0) >= 1
  ),
  -- Required channels must be inside the defaults, or the default state would already break the lock.
  constraint notification_events_required_subset check (required_channels <@ default_channels)
);

comment on column public.notification_events.locked is
  'The safety exception: security, legal and payment-dispute notices. Enforced by set_my_notification_preference_command, not by the page.';

insert into public.notification_events
  (code, category, label, description, locked, required_channels, default_channels, sort_order)
values
  ('work.task_assigned', 'work_updates', 'A task is assigned to you',
   'Someone put your name on a task in a shared project plan.', false, '{}', '{in_app,email}', 10),
  ('work.task_ready_for_review', 'work_updates', 'Work is ready for your review',
   'A task was marked submitted and is waiting on your decision.', false, '{}', '{in_app,email}', 20),
  ('work.message_received', 'work_updates', 'A new message in a project thread',
   'The other party posted in a conversation you are part of.', false, '{}', '{in_app,email}', 30),
  ('work.change_proposed', 'work_updates', 'A change to the project was proposed',
   'Scope, schedule or price was proposed as a change and needs a decision.', false, '{}', '{in_app,email}', 40),
  ('financials.quote_received', 'financials', 'A quote arrived for your request',
   'A provider priced your request and is waiting to hear back.', false, '{}', '{in_app,email}', 50),
  ('financials.payment_due', 'financials', 'A payment is due',
   'Work is agreed and funded work cannot start until the payment clears.', false, '{}', '{in_app,email}', 60),
  ('financials.payout_update', 'financials', 'A payout changed status',
   'A payout for your completed work moved, was paid, or needs attention.', false, '{}', '{in_app,email}', 70),
  ('security.new_device', 'security', 'A new device signed in',
   'Sign-ins from a device other than the one you are using are always reported.', true,
   '{in_app,email}', '{in_app,email}', 80),
  ('security.factor_changed', 'security', 'Two-factor authentication changed',
   'A factor was added to the account. Changes to how you sign in are always reported.', true,
   '{in_app,email}', '{in_app,email}', 90),
  ('legal.case_opened', 'legal', 'A case was opened on your project',
   'A safety, privacy or operational case was raised. Payouts on the project may be held.', true,
   '{in_app,email}', '{in_app,email}', 100),
  ('payment_disputes.opened', 'payment_disputes', 'A payment dispute was opened',
   'Money is held while a dispute is unresolved. This notice cannot be switched off.', true,
   '{in_app,email}', '{in_app,email}', 110),
  ('payment_disputes.resolved', 'payment_disputes', 'A payment dispute was resolved',
   'A dispute on your money has been decided or withdrawn.', true,
   '{in_app,email}', '{in_app,email}', 120),
  ('marketing.product_updates', 'marketing', 'Product updates and new features',
   'Occasional notes about what changed on the platform.', false, '{}', '{email}', 200),
  ('marketing.provider_tips', 'marketing', 'Tips for getting more work',
   'Suggestions about profiles, quotes and availability. Never sent to customers.', false, '{}', '{email}', 210)
on conflict (code) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description,
      locked = excluded.locked,
      required_channels = excluded.required_channels,
      default_channels = excluded.default_channels,
      sort_order = excluded.sort_order;

-- ── 2. Per-account state ──────────────────────────────────────────────────────────────────────

create table public.notification_preferences (
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_code text not null references public.notification_events(code) on delete cascade,
  channel public.notification_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, event_code, channel)
);

create table public.notification_states (
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- Derived from the row the event describes, never random: 'task_ready_for_review:<task uuid>'. A key
  -- that no longer appears in the feed is dead weight in this table and nothing else.
  notification_key text not null check (char_length(notification_key) between 3 and 200),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, notification_key)
);

create index notification_preferences_account_idx on public.notification_preferences(account_id, event_code);
create index notification_states_account_idx on public.notification_states(account_id, dismissed_at);

comment on table public.notification_states is
  'Read and dismissal state only. The notifications themselves are derived on read — see the file header.';

alter table public.notification_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_states enable row level security;

-- No table is reachable through the Data API. Everything goes through a command, which is where the
-- ownership check and the lock live. Same pattern as account_capabilities and audit_events.
create policy notification_events_deny_direct on public.notification_events
  for select to authenticated using (false);
create policy notification_preferences_deny_direct on public.notification_preferences
  for all to authenticated using (false) with check (false);
create policy notification_states_deny_direct on public.notification_states
  for all to authenticated using (false) with check (false);

-- ── 3. Is this channel on for this event? ─────────────────────────────────────────────────────

create or replace function app_private.notification_channel_enabled(
  p_account_id uuid,
  p_event_code text,
  p_channel public.notification_channel
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select pref.enabled
              from public.notification_preferences pref
             where pref.account_id = p_account_id
               and pref.event_code = p_event_code
               and pref.channel = p_channel),
           p_channel = any(e.default_channels),
           false
         )
    from public.notification_events e
   where e.code = p_event_code;
$$;

-- ── 4. The feed, derived ──────────────────────────────────────────────────────────────────────

/**
 * Everything this account should be told about right now, one row per event.
 *
 * ⚠️ TAKES AN ACCOUNT ID AND IS THEREFORE NOT GRANTED TO ANYONE. The public commands below are
 * SECURITY DEFINER and pass `app_private.current_account_id()`, never a value from the request; this
 * function is revoked from every role so it cannot be called directly with somebody else's id.
 *
 * ⚠️ MESSAGES ARE COLLAPSED TO THE NEWEST PER THREAD. A busy project would otherwise fill the feed
 * with one notification per message and bury the task that actually needs a decision. The full
 * conversation is on /messages and in the project's own thread.
 */
create or replace function app_private.notification_feed_for(p_account_id uuid)
returns table (
  notification_key text,
  event_code text,
  category public.notification_category,
  locked boolean,
  severity public.notification_severity,
  title text,
  summary text,
  entity_label text,
  href text,
  action_required boolean,
  occurred_at timestamptz
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
-- ⚠️ COMPLETED ASSIGNMENTS ARE INCLUDED, AND THAT IS THE POINT. A payout for finished work, a dispute
-- opened after completion, a final message on the job and a task left un-ticked are exactly the events a
-- person most needs to be told about, and an "active only" filter here would hide every one of them. Only
-- cancelled work is dropped: there is nothing left to act on, and a cancelled job that keeps announcing its
-- old tasks is noise. The word "active" in the brief belongs to the conversation directory, which is scoped
-- that way on purpose; the feed is scoped by what is still true rather than by what is still running.
my_assignments as (
  select a.id as assignment_id,
         a.provider_id,
         r.id as request_id,
         r.customer_account_id,
         coalesce(nullif(btrim(r.need_text), ''), 'Your project') as project_label
    from public.assignments a
    join public.requests r on r.id = a.request_id
    cross join me
   where a.status <> 'cancelled'
     and (r.customer_account_id = me.account_id or a.provider_id in (select id from my_providers))
),
latest_thread_messages as (
  select distinct on (m.assignment_id, m.context_kind, coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid))
         m.id, m.assignment_id, m.context_kind, m.context_id, m.body, m.created_at
    from public.project_messages m
    join my_assignments a on a.assignment_id = m.assignment_id
    cross join me
   where m.author_account_id <> me.account_id
   order by m.assignment_id,
            m.context_kind,
            coalesce(m.context_id, '00000000-0000-0000-0000-000000000000'::uuid),
            m.created_at desc
),
events as (
  -- Work assigned to me and not started.
  select 'task_assigned:' || t.id as notification_key,
         'work.task_assigned'::text as event_code,
         'info'::public.notification_severity as severity,
         'A task is assigned to you'::text as title,
         t.title as summary,
         a.project_label as entity_label,
         '/projects/' || t.assignment_id || '/tasks/' || t.id as href,
         false as action_required,
         coalesce(t.updated_at, t.created_at) as occurred_at
    from public.project_tasks t
    join my_assignments a on a.assignment_id = t.assignment_id
    cross join me
   where t.assignee_account_id = me.account_id
     and t.status in ('not_started', 'in_progress')

  union all

  -- Work submitted to me, as the customer, for review.
  select 'task_review:' || t.id,
         'work.task_ready_for_review',
         'action',
         'Work is ready for your review',
         t.title,
         a.project_label,
         '/projects/' || t.assignment_id || '/tasks/' || t.id,
         true,
         coalesce(t.submitted_at, t.updated_at)
    from public.project_tasks t
    join my_assignments a on a.assignment_id = t.assignment_id
    cross join me
   where t.status = 'submitted'
     and a.customer_account_id = me.account_id

  union all

  -- The newest message in each thread I am not the author of.
  select 'thread_message:' || m.id,
         'work.message_received',
         'info',
         case m.context_kind
           when 'task' then 'A new message about a task'
           when 'quote' then 'A new message about the quote'
           when 'scope_change' then 'A new message about a scope question'
           when 'milestone' then 'A new message about a milestone'
           when 'dispute' then 'A new message about the dispute'
           else 'A new message about the project'
         end,
         left(m.body, 160),
         a.project_label,
         '/projects/' || m.assignment_id || '/messages',
         false,
         m.created_at
    from latest_thread_messages m
    join my_assignments a on a.assignment_id = m.assignment_id

  union all

  -- A change proposed by the other party, waiting on my decision.
  select 'change_proposed:' || c.id,
         'work.change_proposed',
         'action',
         'A change to the project was proposed',
         c.title,
         a.project_label,
         '/projects/' || c.assignment_id || '/changes',
         true,
         c.created_at
    from public.project_change_requests c
    join my_assignments a on a.assignment_id = c.assignment_id
    cross join me
   where c.status = 'proposed'
     and c.created_by_account_id <> me.account_id

  union all

  -- A quote on my own request.
  select 'quote_received:' || q.id,
         'financials.quote_received',
         'attention',
         'A quote arrived for your request',
         coalesce(nullif(btrim(q.summary), ''), 'A provider priced your request'),
         coalesce(nullif(btrim(r.need_text), ''), 'Your request'),
         '/customer/requests/' || q.request_id || '/quotes',
         false,
         q.submitted_at
    from public.quotes q
    join public.requests r on r.id = q.request_id
    cross join me
   where r.customer_account_id = me.account_id
     and q.status = 'submitted'

  union all

  -- Money I owe, on a project that is already agreed.
  select 'payment_due:' || o.id,
         'financials.payment_due',
         'action',
         'A payment is due',
         'Funds are held until the job is approved, and work cannot start before this clears.',
         a.project_label,
         '/customer/payments/' || o.id,
         true,
         o.created_at
    from public.payment_obligations o
    join my_assignments a on a.assignment_id = o.assignment_id
    cross join me
   where o.customer_account_id = me.account_id
     and o.status in ('pending', 'funding')

  union all

  -- A payout for my own work.
  select 'payout:' || p.id,
         'financials.payout_update',
         case when p.status in ('failed', 'blocked') then 'attention' else 'info' end::public.notification_severity,
         case p.status
           when 'eligible' then 'Your payout is ready to be paid'
           when 'queued' then 'Your payout is queued'
           when 'processing' then 'Your payout is being processed'
           when 'paid' then 'Your payout was paid'
           when 'failed' then 'Your payout failed'
           when 'blocked' then 'Your payout is on hold'
           when 'cancelled' then 'Your payout was cancelled'
           else 'Your payout changed status'
         end,
         'The money for this job.',
         a.project_label,
         '/provider/earnings',
         false,
         p.updated_at
    from public.payouts p
    join public.payment_obligations o on o.id = p.obligation_id
    join my_assignments a on a.assignment_id = o.assignment_id
   where p.provider_id in (select id from my_providers)

  union all

  -- A case raised by the other party. A financial case is a payment dispute and is categorised as one.
  select 'issue_opened:' || i.id,
         case when i.kind = 'financial_dispute'
              then 'payment_disputes.opened'
              else 'legal.case_opened'
         end,
         'action',
         case when i.kind = 'financial_dispute'
              then 'A payment dispute was opened'
              else 'A case was opened on your project'
         end,
         i.summary,
         a.project_label,
         '/projects/' || i.assignment_id || '/issues/' || i.id,
         true,
         i.created_at
    from public.project_issues i
    join my_assignments a on a.assignment_id = i.assignment_id
    cross join me
   where i.status in ('open', 'investigation', 'escalated')
     and i.raised_by_account_id <> me.account_id

  union all

  -- A financial case that is now closed.
  select 'issue_resolved:' || i.id,
         'payment_disputes.resolved',
         'info',
         'A payment dispute was resolved',
         coalesce(nullif(btrim(i.resolution), ''), 'The dispute on this project is closed.'),
         a.project_label,
         '/projects/' || i.assignment_id || '/issues/' || i.id,
         false,
         coalesce(i.resolved_at, i.updated_at)
    from public.project_issues i
    join my_assignments a on a.assignment_id = i.assignment_id
   where i.kind = 'financial_dispute'
     and i.status in ('resolved', 'closed')
     and coalesce(i.resolved_at, i.updated_at) > now() - interval '90 days'

  union all

  -- A second factor was added to this account.
  select 'factor_added:' || f.id,
         'security.factor_changed',
         'info',
         'Two-factor authentication changed',
         'A ' || f.factor_type || ' factor was enrolled on this account.',
         'Account security',
         '/settings/security',
         false,
         f.created_at
    from auth.mfa_factors f
   where f.user_id = auth.uid()
     and f.status = 'verified'

  union all

  -- A device other than this one holding a live session.
  select 'session_started:' || s.id,
         'security.new_device',
         'info',
         'A new device signed in',
         coalesce(nullif(s.ip, ''), 'An address the platform did not record'),
         'Account security',
         '/settings/security/sessions',
         false,
         s.created_at
    from auth.sessions s
   where s.user_id = auth.uid()
     and s.id <> nullif(auth.jwt() ->> 'session_id', '')::uuid
     and s.created_at > now() - interval '30 days'
     and exists (
       select 1 from auth.refresh_tokens rt
        where rt.session_id = s.id and rt.revoked is false
     )
)
select e.notification_key,
       e.event_code,
       c.category,
       c.locked,
       e.severity,
       e.title,
       e.summary,
       e.entity_label,
       e.href,
       e.action_required,
       e.occurred_at
  from events e
  join public.notification_events c on c.code = e.event_code;
$$;

revoke all on function app_private.notification_channel_enabled(uuid, text, public.notification_channel) from public;
revoke all on function app_private.notification_feed_for(uuid) from public;

-- ── 5. Reads ──────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_notifications_command(p_category text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  wanted public.notification_category;
  limited_to_codes text[];
  items jsonb;
  unread integer;
  outstanding integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  if p_category is not null and btrim(p_category) <> '' and p_category <> 'all' then
    -- Casting an unknown string raises 22P02, which the action maps to a coded failure. The page
    -- never sends anything else, so this only ever fires on an edited URL.
    wanted := p_category::public.notification_category;
  end if;

  -- An event switched off for in-app delivery does not appear. A locked event ignores the setting,
  -- which is the whole point of the lock.
  select coalesce(array_agg(e.code), '{}')
    into limited_to_codes
    from public.notification_events e
   where e.locked
      or app_private.notification_channel_enabled(me, e.code, 'in_app');

  with feed as (
    select f.*, s.read_at, s.dismissed_at
      from app_private.notification_feed_for(me) f
      left join public.notification_states s
             on s.account_id = me and s.notification_key = f.notification_key
     where f.event_code = any(limited_to_codes)
       and (wanted is null or f.category = wanted)
       and s.dismissed_at is null
  )
  select coalesce(jsonb_agg(entry order by sort_at desc), '[]'::jsonb),
         count(*) filter (where read_at is null),
         count(*) filter (where action_required and read_at is null)
    into items, unread, outstanding
    from (
      select jsonb_build_object(
               'key', f.notification_key,
               'category', f.category,
               'severity', f.severity,
               'title', f.title,
               'summary', f.summary,
               'entityLabel', f.entity_label,
               'href', f.href,
               'actionRequired', f.action_required,
               'locked', f.locked,
               'unread', f.read_at is null,
               'occurredAt', f.occurred_at
             ) as entry,
             f.occurred_at as sort_at,
             f.read_at,
             f.action_required
        from feed f
    ) listed;

  return jsonb_build_object(
    'allowed', true,
    'items', items,
    'counts', jsonb_build_object('unread', unread, 'actionRequired', outstanding)
  );
end $$;

create or replace function public.get_my_notification_badge_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  unread integer;
  outstanding integer;
begin
  if me is null then
    return jsonb_build_object('allowed', false, 'unread', 0, 'actionRequired', 0);
  end if;

  select count(*) filter (where s.read_at is null),
         count(*) filter (where f.action_required and s.read_at is null)
    into unread, outstanding
    from app_private.notification_feed_for(me) f
    left join public.notification_states s
           on s.account_id = me and s.notification_key = f.notification_key
   where s.dismissed_at is null
     and (f.locked or app_private.notification_channel_enabled(me, f.event_code, 'in_app'));

  return jsonb_build_object('allowed', true, 'unread', unread, 'actionRequired', outstanding);
end $$;

comment on function public.get_my_notification_badge_command() is
  'The shell badge. Counts only what the account can actually see: dismissed items are gone and events switched off for in-app delivery are not counted.';

-- ── 6. Actions on one notification ────────────────────────────────────────────────────────────

/**
 * Both writes below refuse a key that is not in the caller's own feed.
 *
 * That is not a security barrier — the state row is scoped to the account either way — it is what
 * stops the table filling with keys nothing will ever match, and it means "the notification was not
 * found" is reported rather than silently recorded as success.
 */
create or replace function app_private.assert_notification_in_my_feed(p_account_id uuid, p_key text)
returns void
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if p_key is null or char_length(btrim(p_key)) = 0 then
    raise exception 'a notification key is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from app_private.notification_feed_for(p_account_id) f
     where f.notification_key = p_key
  ) then
    raise exception 'notification not found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.mark_my_notification_read_command(p_key text)
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
  perform app_private.assert_notification_in_my_feed(me, p_key);

  insert into public.notification_states (account_id, notification_key, read_at)
  values (me, p_key, now())
  on conflict (account_id, notification_key) do update
    set read_at = coalesce(public.notification_states.read_at, excluded.read_at),
        updated_at = now();
end $$;

create or replace function public.dismiss_my_notification_command(p_key text)
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
  perform app_private.assert_notification_in_my_feed(me, p_key);

  -- Dismissing implies reading. An item that is gone but still counted as unread would make the badge
  -- disagree with the list, and the badge is the number people act on.
  insert into public.notification_states (account_id, notification_key, read_at, dismissed_at)
  values (me, p_key, now(), now())
  on conflict (account_id, notification_key) do update
    set read_at = coalesce(public.notification_states.read_at, excluded.read_at),
        dismissed_at = excluded.dismissed_at,
        updated_at = now();
end $$;

create or replace function public.mark_all_my_notifications_read_command(p_category text default null)
returns integer
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  wanted public.notification_category;
  changed integer;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_category is not null and btrim(p_category) <> '' and p_category <> 'all' then
    wanted := p_category::public.notification_category;
  end if;

  with marked as (
    insert into public.notification_states (account_id, notification_key, read_at)
    select me, f.notification_key, now()
      from app_private.notification_feed_for(me) f
      left join public.notification_states s
             on s.account_id = me and s.notification_key = f.notification_key
     where s.dismissed_at is null
       and s.read_at is null
       and (wanted is null or f.category = wanted)
       and (f.locked or app_private.notification_channel_enabled(me, f.event_code, 'in_app'))
    on conflict (account_id, notification_key) do update
      set read_at = coalesce(public.notification_states.read_at, excluded.read_at),
          updated_at = now()
    returning 1
  )
  select count(*) into changed from marked;

  return changed;
end $$;

-- ── 7. The preference matrix ──────────────────────────────────────────────────────────────────

create or replace function public.get_my_notification_preferences_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  events jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by sort_order), '[]'::jsonb)
    into events
    from (
      select e.sort_order,
             jsonb_build_object(
               'code', e.code,
               'category', e.category,
               'label', e.label,
               'description', e.description,
               'locked', e.locked,
               'channels', jsonb_build_object(
                 'email', jsonb_build_object(
                   'enabled', coalesce(pref_email.enabled, 'email' = any(e.default_channels)),
                   'locked', e.locked and 'email' = any(e.required_channels)
                 ),
                 'push', jsonb_build_object(
                   'enabled', coalesce(pref_push.enabled, 'push' = any(e.default_channels)),
                   'locked', e.locked and 'push' = any(e.required_channels)
                 ),
                 'sms', jsonb_build_object(
                   'enabled', coalesce(pref_sms.enabled, 'sms' = any(e.default_channels)),
                   'locked', e.locked and 'sms' = any(e.required_channels)
                 ),
                 'in_app', jsonb_build_object(
                   'enabled', coalesce(pref_in_app.enabled, 'in_app' = any(e.default_channels)),
                   'locked', e.locked and 'in_app' = any(e.required_channels)
                 )
               )
             ) as entry
        from public.notification_events e
        left join public.notification_preferences pref_email
               on pref_email.account_id = me and pref_email.event_code = e.code and pref_email.channel = 'email'
        left join public.notification_preferences pref_push
               on pref_push.account_id = me and pref_push.event_code = e.code and pref_push.channel = 'push'
        left join public.notification_preferences pref_sms
               on pref_sms.account_id = me and pref_sms.event_code = e.code and pref_sms.channel = 'sms'
        left join public.notification_preferences pref_in_app
               on pref_in_app.account_id = me and pref_in_app.event_code = e.code and pref_in_app.channel = 'in_app'
    ) listed;

  return jsonb_build_object(
    'allowed', true,
    'events', events,
    -- Rendered as the unavailable-but-honest note beside the matrix. The platform has no push or SMS
    -- transport configured, so those columns are stored and shown but cannot deliver anything yet.
    'transport', jsonb_build_object(
      'in_app', 'available',
      'email', 'available',
      'push', 'unavailable',
      'sms', 'unavailable'
    )
  );
end $$;

create or replace function public.set_my_notification_preference_command(
  p_event_code text,
  p_channel text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  event_row public.notification_events%rowtype;
  channel public.notification_channel;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'a value is required' using errcode = '22023';
  end if;

  channel := p_channel::public.notification_channel;
  select * into event_row from public.notification_events where code = p_event_code;
  if not found then
    raise exception 'not a notification event' using errcode = 'P0002';
  end if;

  -- THE SAFETY EXCEPTION, ENFORCED HERE. A locked event cannot be switched off on a required channel,
  -- and a locked event cannot be switched off in-app either — that is the channel the feed itself is.
  if event_row.locked
     and not p_enabled
     and (channel = any(event_row.required_channels) or channel = 'in_app')
  then
    raise exception 'this notice cannot be switched off' using errcode = '42501';
  end if;

  insert into public.notification_preferences (account_id, event_code, channel, enabled)
  values (me, p_event_code, channel, p_enabled)
  on conflict (account_id, event_code, channel) do update
    set enabled = excluded.enabled,
        updated_at = now();
end $$;

revoke all on function app_private.assert_notification_in_my_feed(uuid, text) from public;
revoke all on function public.get_my_notifications_command(text) from public, anon;
revoke all on function public.get_my_notification_badge_command() from public, anon;
revoke all on function public.mark_my_notification_read_command(text) from public, anon;
revoke all on function public.dismiss_my_notification_command(text) from public, anon;
revoke all on function public.mark_all_my_notifications_read_command(text) from public, anon;
revoke all on function public.get_my_notification_preferences_command() from public, anon;
revoke all on function public.set_my_notification_preference_command(text, text, boolean) from public, anon;

grant execute on function public.get_my_notifications_command(text) to authenticated;
grant execute on function public.get_my_notification_badge_command() to authenticated;
grant execute on function public.mark_my_notification_read_command(text) to authenticated;
grant execute on function public.dismiss_my_notification_command(text) to authenticated;
grant execute on function public.mark_all_my_notifications_read_command(text) to authenticated;
grant execute on function public.get_my_notification_preferences_command() to authenticated;
grant execute on function public.set_my_notification_preference_command(text, text, boolean) to authenticated;
