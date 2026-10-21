-- Customer decisions on a live quote: ask for a change, decline it, withdraw the ask, cancel the request.
--
-- WHY A NEW TABLE AND THREE COMMANDS. The brief lists "Request Revision", "Decline Quote" and "Cancel
-- Request", and none of them existed: the only customer writers anywhere in this schema were
-- `accept_quote_command` (which declines the other quotes as a side effect) and
-- `approve_assignment_completion_command`. `quote_status` has carried `declined` since phase 1 with no
-- customer writer, and `request_state` has carried `cancelled` with no writer at all — so both were
-- unreachable states that these commands make reachable, rather than new vocabulary invented here.
--
-- ⚠️ EVERY ROW THESE COMMANDS WRITE HAS A READER. `quote_change_requests` is read by the customer's
-- quote pages AND by the provider's own quote page (a change request nobody can see is a message into a
-- void). `requests.cancellation_reason` is read by the customer's request list and detail. This is
-- deliberately not the pattern of `quotes.scope_snapshot`, which has one writer that always writes `{}`
-- and no reader at all.
--
-- ⚠️ WHAT THE PROVIDER CANNOT YET DO IS SAID, NOT SIMULATED. There is no provider-side action to
-- acknowledge or resolve a change request — that is the provider workspace's business, not this
-- migration's — so `quote_change_status` has only `open` and `withdrawn`, the two states a customer can
-- actually cause. A status vocabulary with `resolved` in it and no writer would be a lie told in an enum.

alter table public.requests
  add column if not exists cancellation_reason text;

comment on column public.requests.cancellation_reason is
  'Why the customer cancelled, as they typed it. Set only by cancel_request_command.';

create type public.quote_change_kind as enum ('revision', 'clarification', 'decline');
create type public.quote_change_status as enum ('open', 'withdrawn');

create table public.quote_change_requests (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  kind public.quote_change_kind not null,
  message text not null,
  status public.quote_change_status not null default 'open',
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint quote_change_message_length check (char_length(btrim(message)) between 10 and 2000)
);

comment on table public.quote_change_requests is
  'A customer''s ask of a provider about one quote version. Read by both sides; nothing resolves it yet.';

create index quote_change_quote_idx on public.quote_change_requests(quote_id, created_at desc);
create index quote_change_customer_idx on public.quote_change_requests(customer_account_id, created_at desc);
create index quote_change_provider_idx on public.quote_change_requests(provider_id, status, created_at desc);

alter table public.quote_change_requests enable row level security;

-- The customer who asked, and the provider who was asked. Both expressions mirror the policies already
-- on `quotes`, including the organisation-member case, so an organisation sees what its owner sees.
create policy quote_change_customer_read on public.quote_change_requests
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy quote_change_provider_read on public.quote_change_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = quote_change_requests.provider_id
        and (
          p.owner_account_id = app_private.current_account_id()
          or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))
        )
    )
  );

grant select on public.quote_change_requests to authenticated;

-- ── Ask for a revision or a clarification ────────────────────────────────────────────────────────────
create or replace function public.request_quote_change_command(
  p_quote_id uuid,
  p_kind public.quote_change_kind,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare
  me uuid; q public.quotes%rowtype; r public.requests%rowtype; msg text; change_id uuid;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  perform 1 from public.quotes where id = p_quote_id for update;
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;

  select * into r from public.requests where id = q.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;

  -- A decline is a decision, not a question: it changes the quote's status and must go through
  -- `decline_quote_command`. Refusing it here keeps exactly one writer per fact.
  if p_kind = 'decline' then
    raise exception 'use decline_quote_command to decline a quote' using errcode = '22023';
  end if;

  if q.status <> 'submitted' then
    raise exception 'a % quote cannot be questioned', q.status using errcode = '22023';
  end if;

  if r.state in ('cancelled', 'completed') then
    raise exception 'this request is closed' using errcode = '22023';
  end if;

  msg := btrim(coalesce(p_message, ''));
  if char_length(msg) < 10 then
    raise exception 'say what you would like changed' using errcode = '22023';
  end if;

  insert into public.quote_change_requests(quote_id, request_id, provider_id, customer_account_id, kind, message)
  values (q.id, q.request_id, q.provider_id, me, p_kind, msg)
  returning id into change_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'QUOTE_CHANGE_REQUESTED', 'quote', q.id, 'participant_private',
          jsonb_build_object('account_id', me, 'kind', p_kind, 'change_request_id', change_id,
                             'quote_version', q.version_major || '.' || q.version_revision));

  -- ⚠️ NOTHING PUBLISHES THE OUTBOX YET (`published_at` stays null, `attempt_count` 0). The row is the
  -- record that a notification is owed, not evidence that one was sent.
  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('quote', q.id, 'QUOTE_CHANGE_REQUESTED',
          jsonb_build_object('quote_id', q.id, 'request_id', q.request_id, 'provider_id', q.provider_id,
                             'kind', p_kind, 'change_request_id', change_id),
          'quote-change:' || change_id::text);

  return change_id;
end
$function$;

-- ── Withdraw your own ask ─────────────────────────────────────────────────────────────────────────────
create or replace function public.withdraw_quote_change_command(p_change_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare me uuid; c public.quote_change_requests%rowtype;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  select * into c from public.quote_change_requests where id = p_change_id for update;
  if not found then raise exception 'change request not found' using errcode = 'P0002'; end if;
  if c.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;
  if c.status <> 'open' then raise exception 'this request is already %', c.status using errcode = '22023'; end if;

  update public.quote_change_requests
  set status = 'withdrawn', withdrawn_at = now()
  where id = p_change_id and status = 'open';
end
$function$;

-- ── Decline a quote ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.decline_quote_command(p_quote_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare me uuid; q public.quotes%rowtype; r public.requests%rowtype; msg text;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  perform 1 from public.quotes where id = p_quote_id for update;
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;

  select * into r from public.requests where id = q.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;

  if q.status <> 'submitted' then
    raise exception 'only a submitted quote can be declined (this one is %)', q.status using errcode = '22023';
  end if;

  if r.state in ('cancelled', 'completed') then
    raise exception 'this request is closed' using errcode = '22023';
  end if;

  -- Declining one quote after another has been accepted would silently contradict the assignment that
  -- already exists, so the request's chosen quote is not declinable.
  if exists (select 1 from public.assignments a where a.request_id = r.id and a.status = 'active') then
    raise exception 'a provider is already assigned to this request' using errcode = '22023';
  end if;

  msg := btrim(coalesce(p_reason, ''));
  if char_length(msg) < 10 then
    raise exception 'give the provider a reason (at least 10 characters)' using errcode = '22023';
  end if;

  update public.quotes set status = 'declined', updated_at = now()
  where id = q.id and status = 'submitted';

  -- The reason travels as a change request so the provider reads it in the same place as everything else
  -- they were asked; `kind = 'decline'` is the record of the decision itself.
  insert into public.quote_change_requests(quote_id, request_id, provider_id, customer_account_id, kind, message)
  values (q.id, q.request_id, q.provider_id, me, 'decline', msg);

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'QUOTE_DECLINED', 'quote', q.id, 'participant_private',
          jsonb_build_object('account_id', me, 'reason', msg,
                             'quote_version', q.version_major || '.' || q.version_revision));

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('quote', q.id, 'QUOTE_DECLINED',
          jsonb_build_object('quote_id', q.id, 'request_id', q.request_id, 'provider_id', q.provider_id),
          'quote-declined:' || q.id::text);
end
$function$;

-- ── Cancel the request ───────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_request_command(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare me uuid; r public.requests%rowtype; msg text; obligation public.payment_obligation_status;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  perform 1 from public.requests where id = p_request_id for update;
  select * into r from public.requests where id = p_request_id;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;

  -- Reuse the platform's own state machine rather than hard-coding which states may be cancelled, so
  -- this command cannot disagree with the trigger that enforces it.
  if not app_private.validate_request_transition(r.state, 'cancelled') then
    raise exception 'a request that is % cannot be cancelled here', replace(r.state::text, '_', ' ')
      using errcode = '22023';
  end if;

  -- ⚠️ THE MONEY GATE, AND WHY IT IS NOT "CONTACT SUPPORT" FILLER. Once an obligation leaves `pending`
  -- money has moved or is moving, and the only refund path in this platform is `request_refund_command`,
  -- which requires the `platform.money.refund` capability — an ADMIN capability. Letting a customer
  -- cancel a funded request from a web form would strand the funds, so it is refused with the reason.
  select o.status into obligation
  from public.payment_obligations o
  where o.request_id = r.id and o.status not in ('pending', 'cancelled')
  order by o.created_at desc
  limit 1;

  if obligation is not null then
    raise exception 'this request has money against it (payment %). A refund has to be raised by the platform team, so this cannot be cancelled from here', obligation
      using errcode = '22023';
  end if;

  msg := btrim(coalesce(p_reason, ''));
  if char_length(msg) < 10 then
    raise exception 'say why you are cancelling (at least 10 characters)' using errcode = '22023';
  end if;

  -- An unpaid assignment cannot outlive the request it belongs to. Its obligation is still `pending`, so
  -- cancelling both is consistent with the gate above.
  update public.assignments set status = 'cancelled', ended_at = now()
  where request_id = r.id and status = 'active';

  update public.payment_obligations set status = 'cancelled', updated_at = now()
  where request_id = r.id and status = 'pending';

  update public.requests
  set state = 'cancelled', cancellation_reason = msg, updated_at = now()
  where id = r.id;

  -- Submitted quotes are deliberately left alone. Accepting one is already impossible once the request
  -- is cancelled (`accept_quote_authoritatively` requires state quoted/matching/submitted), so rewriting
  -- the quotes here would be a second guard doing the same job, and one that could disagree with it.
  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'REQUEST_CANCELLED', 'request', r.id, 'participant_private',
          jsonb_build_object('account_id', me, 'reason', msg, 'previous_state', r.state));

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('request', r.id, 'REQUEST_CANCELLED',
          jsonb_build_object('request_id', r.id, 'customer_account_id', me),
          'request-cancelled:' || r.id::text);
end
$function$;

revoke all on function public.request_quote_change_command(uuid, public.quote_change_kind, text) from public, anon;
revoke all on function public.withdraw_quote_change_command(uuid) from public, anon;
revoke all on function public.decline_quote_command(uuid, text) from public, anon;
revoke all on function public.cancel_request_command(uuid, text) from public, anon;

grant execute on function public.request_quote_change_command(uuid, public.quote_change_kind, text) to authenticated;
grant execute on function public.withdraw_quote_change_command(uuid) to authenticated;
grant execute on function public.decline_quote_command(uuid, text) to authenticated;
grant execute on function public.cancel_request_command(uuid, text) to authenticated;
