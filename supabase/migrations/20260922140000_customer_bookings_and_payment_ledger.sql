-- Customer bookings, and the read model the payment surfaces are built on.
--
-- WHY THIS EXISTS. Two of the four surfaces in the brief have nothing behind them today:
--
--   * BOOKINGS. `assignment_schedules` holds one row per assignment, written only by the provider's
--     `schedule_assignment_authoritatively`. The customer has no way to confirm a time, propose a different
--     one, or record that a booking was called off — so "Pending / Confirmed / Rescheduled" are not states
--     this database can express. Worse, the provider's command requires `requests.state = 'accepted'`, so a
--     provider cannot even move a booking once it exists: "rescheduled" was unreachable in both directions.
--
--   * THE LEDGER VIEW. `payment_provider_events`, `payment_reconciliations`, `ledger_transactions` and
--     `ledger_entries` are revoked from `authenticated` outright — correctly, because they are the
--     accountant's view of the platform, not a customer's. But the brief requires the customer to see a
--     "Reconciled" badge whose whole meaning is "this is the ledger record". A page cannot read that from
--     `payment_attempts.status`, which is the provider's word, and it must not read the ledger tables
--     directly. The two definer functions at the bottom are the narrow projection that answers exactly that
--     question for exactly the caller's own money, and nothing else.
--
-- ⚠️ WHAT IS DELIBERATELY NOT ADDED. There is no `due_at` on an obligation, so no page here invents one: an
-- obligation is payable as soon as it exists, and the list says so rather than rendering a fabricated
-- deadline. There is likewise no customer-initiated refund: `request_refund_authoritatively` requires the
-- platform capability `platform.money.refund` and a step-up, and this migration does not weaken that. What a
-- customer gets instead is a recorded request that the platform team reads and acts on with the tools that
-- already carry the money interlocks.

-- ── When a booking is confirmed, and when a confirmation stops being one ──────────────────────────────
alter table public.assignment_schedules
  add column if not exists customer_status text not null default 'proposed',
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists rescheduled_at timestamptz;

alter table public.assignment_schedules
  add constraint assignment_schedule_customer_status_chk
  check (customer_status in ('proposed','confirmed','rescheduled','cancelled'));

comment on column public.assignment_schedules.customer_status is
  'The customer'' side of the appointment: proposed (not yet answered), confirmed, rescheduled (the provider moved a confirmed time, so it needs answering again), cancelled.';
comment on column public.assignment_schedules.rescheduled_at is
  'Set when a provider moved an appointment that had already been confirmed.';

/**
 * ⚠️ THE WINDOW IS THE FACT, AND THE CONFIRMATION FOLLOWS IT.
 *
 * A confirmation is a statement about a specific date and time. If the time moves, the confirmation is no
 * longer about the appointment in front of the customer, so it must not survive the change — otherwise the
 * page would show "Confirmed" beside a slot nobody agreed to.
 *
 * ⚠️ ONE WRITER PER FACT. The provider's command writes the times; this trigger only reacts to that. The
 * customer's command writes `customer_status`; this trigger only reacts when the times are unchanged, which
 * is what makes `proposed → confirmed` possible at all. Neither side can set the other's value.
 */
create or replace function app_private.track_schedule_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.customer_status := 'proposed';
    new.confirmed_at := null;
    new.confirmed_by_account_id := null;
    new.rescheduled_at := null;
    return new;
  end if;

  if (new.scheduled_start, new.scheduled_end, new.timezone)
     is distinct from (old.scheduled_start, old.scheduled_end, old.timezone) then
    -- A confirmed appointment that moves is not confirmed any more, and it is not "proposed" either — the
    -- customer already dealt with this booking once. It is exactly "rescheduled": the provider changed it.
    new.customer_status := case when old.customer_status in ('confirmed','rescheduled') then 'rescheduled' else 'proposed' end;
    new.confirmed_at := null;
    new.confirmed_by_account_id := null;
    new.rescheduled_at := now();
  end if;

  return new;
end
$function$;

comment on function app_private.track_schedule_confirmation() is
  'Keeps customer_status honest: a new schedule is proposed, and moving the window cancels a confirmation.';

revoke all on function app_private.track_schedule_confirmation() from public, anon, authenticated;

drop trigger if exists assignment_schedules_track_confirmation on public.assignment_schedules;
create trigger assignment_schedules_track_confirmation
  before insert or update on public.assignment_schedules
  for each row execute function app_private.track_schedule_confirmation();

-- ── A provider can now move a booking that already exists ─────────────────────────────────────────────
-- ⚠️ THIS IS A RELAXATION OF A GUARD, SO IT IS SPELLED OUT. The original function required
-- `requests.state = 'accepted'`, which is true exactly once — before the first schedule. A provider could
-- therefore confirm a time and never change it, which is not how appointments work. `scheduled` is added to
-- the set of states that may be (re)scheduled; every other check — the actor owning the provider, the active
-- assignment, the future window, the timezone — is unchanged, and the request stays `scheduled`.
create or replace function app_private.schedule_assignment_authoritatively(p_assignment_id uuid,p_scheduled_start timestamptz,p_scheduled_end timestamptz,p_timezone text,p_note text default null) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; p public.providers%rowtype; schedule_id uuid; actor_account uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 actor_account:=app_private.current_account_id(); if actor_account is null then raise exception 'active account required' using errcode='42501'; end if;
 select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
 select * into r from public.requests where id=a.request_id for update; select * into p from public.providers where id=a.provider_id;
 if not (p.owner_account_id=actor_account or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 if r.state not in ('accepted','scheduled') then raise exception 'request must be accepted or scheduled before scheduling' using errcode='22023'; end if;
 if p_scheduled_start <= now() - interval '5 minutes' then raise exception 'scheduled start must not be in the past' using errcode='22023'; end if;
 if p_scheduled_end is not null and p_scheduled_end<=p_scheduled_start then raise exception 'invalid schedule window' using errcode='22023'; end if;
 if nullif(btrim(coalesce(p_timezone,'')),'') is null then raise exception 'timezone required' using errcode='22023'; end if;
 insert into public.assignment_schedules(assignment_id,scheduled_start,scheduled_end,timezone,note,scheduled_by_account_id) values(a.id,p_scheduled_start,p_scheduled_end,btrim(p_timezone),nullif(btrim(coalesce(p_note,'')),''),actor_account) on conflict(assignment_id) do update set scheduled_start=excluded.scheduled_start,scheduled_end=excluded.scheduled_end,timezone=excluded.timezone,note=excluded.note,scheduled_by_account_id=excluded.scheduled_by_account_id,updated_at=now() returning id into schedule_id;
 update public.requests set state='scheduled' where id=r.id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','ASSIGNMENT_SCHEDULED','assignment',a.id,'participant_private',jsonb_build_object('scheduled_start',p_scheduled_start,'timezone',p_timezone));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'ASSIGNMENT_SCHEDULED',jsonb_build_object('request_id',r.id,'scheduled_start',p_scheduled_start,'timezone',p_timezone),'assignment-scheduled:'||a.id::text||':'||schedule_id::text);
 return schedule_id;
end $$;

-- ── A customer can ask for a different time ───────────────────────────────────────────────────────────
-- ⚠️ A PROPOSAL IS NOT A RESCHEDULE, AND THE DIFFERENCE IS THE POINT. Only the provider can move the booking,
-- because only the provider can know whether they can. What the customer has is a request with a time on it,
-- which the provider either accepts (and the schedule moves through the ordinary command above) or leaves.
-- One open proposal per assignment, so a customer cannot stack contradictory times against one booking.
create table public.appointment_time_proposals (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  proposed_start timestamptz not null,
  proposed_end timestamptz,
  timezone text not null,
  message text,
  status text not null default 'open' check (status in ('open','withdrawn','accepted','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint appointment_proposal_window_chk check (proposed_end is null or proposed_end > proposed_start),
  constraint appointment_proposal_message_chk check (message is null or char_length(btrim(message)) between 1 and 1000)
);

comment on table public.appointment_time_proposals is
  'A time the customer is asking for. Only the provider can move the booking; accepting one goes through the ordinary schedule command.';

create unique index appointment_time_proposals_one_open_idx
  on public.appointment_time_proposals(assignment_id) where status = 'open';
create index appointment_time_proposals_provider_idx
  on public.appointment_time_proposals(provider_id, status, created_at desc);

alter table public.appointment_time_proposals enable row level security;

create policy appointment_proposals_customer_read on public.appointment_time_proposals
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy appointment_proposals_provider_read on public.appointment_time_proposals
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = appointment_time_proposals.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.appointment_time_proposals from anon;
-- Read only. Every write goes through a command below, so the ownership and state checks cannot be skipped.
revoke insert, update, delete on public.appointment_time_proposals from authenticated;
grant select on public.appointment_time_proposals to authenticated;

-- ── Confirm / propose / withdraw ──────────────────────────────────────────────────────────────────────
create or replace function public.confirm_appointment_command(p_assignment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  r public.requests%rowtype;
  s public.assignment_schedules%rowtype;
  confirmed timestamptz;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found or a.status <> 'active' then raise exception 'active assignment required' using errcode='22023'; end if;

  select * into r from public.requests where id = a.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  select * into s from public.assignment_schedules where assignment_id = a.id for update;
  if not found then raise exception 'there is no appointment to confirm yet' using errcode='22023'; end if;

  -- Confirming a time that has already passed would record agreement to something that did not happen.
  if s.scheduled_start < now() - interval '5 minutes' then
    raise exception 'that appointment time has already passed' using errcode='22023';
  end if;
  if r.state not in ('scheduled','accepted') then
    raise exception 'this booking is no longer waiting on your confirmation' using errcode='22023';
  end if;

  -- Idempotent: a second click, or a retry after a timeout, returns the same instant rather than moving it.
  if s.customer_status = 'confirmed' then return s.confirmed_at; end if;

  update public.assignment_schedules
  set customer_status = 'confirmed', confirmed_at = now(), confirmed_by_account_id = me, updated_at = now()
  where id = s.id
  returning confirmed_at into confirmed;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','APPOINTMENT_CONFIRMED','assignment',a.id,'participant_private',
          jsonb_build_object('scheduled_start', s.scheduled_start, 'timezone', s.timezone));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('assignment',a.id,'APPOINTMENT_CONFIRMED',
          jsonb_build_object('request_id',r.id,'scheduled_start',s.scheduled_start),
          'appointment-confirmed:'||s.id::text)
  on conflict (idempotency_key) do nothing;

  return confirmed;
end
$function$;

create or replace function public.propose_appointment_time_command(
  p_assignment_id uuid,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_timezone text,
  p_message text default null
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
  proposal_id uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into a from public.assignments where id = p_assignment_id for update;
  if not found or a.status <> 'active' then raise exception 'active assignment required' using errcode='22023'; end if;

  select * into r from public.requests where id = a.request_id for update;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if r.state not in ('accepted','scheduled') then
    raise exception 'this booking is no longer waiting to be moved' using errcode='22023';
  end if;

  if p_proposed_start <= now() then raise exception 'a proposed time must be in the future' using errcode='22023'; end if;
  if p_proposed_end is not null and p_proposed_end <= p_proposed_start then
    raise exception 'the finish must be after the start' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_timezone,'')),'') is null then raise exception 'timezone required' using errcode='22023'; end if;

  -- A second ask replaces the first rather than queueing behind it: the provider should be weighing one time,
  -- not a list. `superseded` is what the previous proposal becomes, and the customer's page says so.
  update public.appointment_time_proposals
  set status = 'superseded', resolved_at = now()
  where assignment_id = a.id and status = 'open';

  insert into public.appointment_time_proposals(
    assignment_id, request_id, provider_id, customer_account_id,
    proposed_start, proposed_end, timezone, message
  ) values (
    a.id, r.id, a.provider_id, me,
    p_proposed_start, p_proposed_end, btrim(p_timezone), nullif(btrim(coalesce(p_message,'')), '')
  ) returning id into proposal_id;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values (auth.uid(),'account','APPOINTMENT_TIME_PROPOSED','assignment',a.id,'participant_private',
          jsonb_build_object('proposal_id',proposal_id,'proposed_start',p_proposed_start,'timezone',btrim(p_timezone)));

  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('assignment',a.id,'APPOINTMENT_TIME_PROPOSED',
          jsonb_build_object('request_id',r.id,'proposal_id',proposal_id,'proposed_start',p_proposed_start),
          'appointment-proposed:'||proposal_id::text);

  return proposal_id;
end
$function$;

create or replace function public.withdraw_appointment_proposal_command(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  t public.appointment_time_proposals%rowtype;
begin
  if me is null then raise exception 'not authorized' using errcode='42501'; end if;
  select * into t from public.appointment_time_proposals where id = p_proposal_id for update;
  if not found then raise exception 'that proposal no longer exists' using errcode='P0002'; end if;
  if t.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if t.status <> 'open' then raise exception 'that proposal is already %', t.status using errcode='22023'; end if;

  update public.appointment_time_proposals set status='withdrawn', resolved_at=now() where id = t.id;
end
$function$;

-- The provider's half of a proposal: accept it, which moves the booking through the ordinary command so the
-- window checks, the audit trail and the confirmation reset all happen exactly as they do for any schedule.
create or replace function public.accept_appointment_proposal_command(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  t public.appointment_time_proposals%rowtype;
  p public.providers%rowtype;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;

  select * into t from public.appointment_time_proposals where id = p_proposal_id for update;
  if not found then raise exception 'proposal not found' using errcode='P0002'; end if;
  if t.status <> 'open' then raise exception 'that proposal is already %', t.status using errcode='22023'; end if;

  select * into p from public.providers where id = t.provider_id;
  if not (p.owner_account_id = me or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  perform app_private.schedule_assignment_authoritatively(
    t.assignment_id, t.proposed_start, t.proposed_end, t.timezone,
    'Accepted the time the customer asked for.'
  );

  update public.appointment_time_proposals set status='accepted', resolved_at=now() where id = t.id;
  return t.assignment_id;
end
$function$;

revoke all on function public.confirm_appointment_command(uuid) from public, anon;
revoke all on function public.propose_appointment_time_command(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.withdraw_appointment_proposal_command(uuid) from public, anon;
revoke all on function public.accept_appointment_proposal_command(uuid) from public, anon;
grant execute on function public.confirm_appointment_command(uuid) to authenticated;
grant execute on function public.propose_appointment_time_command(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.withdraw_appointment_proposal_command(uuid) to authenticated;
grant execute on function public.accept_appointment_proposal_command(uuid) to authenticated;

-- ── A customer's request for money to be looked at ────────────────────────────────────────────────────
-- ⚠️ THIS TABLE MOVES NO MONEY, BY DESIGN. A refund is executed by `request_refund_authoritatively`, which
-- demands the `platform.money.refund` capability and a step-up, and a payout hold is applied by the interlock
-- functions. Neither is reachable from here and neither is weakened. What this records is that the customer
-- has asked, with a reason, so the platform team has something to act on — which is the only honest meaning
-- of a customer-facing "Dispute / Refund request entry point" in a ledger this strict.
create table public.payment_dispute_requests (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.payment_obligations(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  kind text not null check (kind in ('refund','dispute')),
  message text not null,
  status text not null default 'open' check (status in ('open','withdrawn','reviewed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint payment_dispute_request_message_chk check (char_length(btrim(message)) between 10 and 2000)
);

comment on table public.payment_dispute_requests is
  'A customer asking the platform team to look at a payment. Records the ask; the money interlocks stay with the capability-gated admin commands.';

create unique index payment_dispute_requests_one_open_kind_idx
  on public.payment_dispute_requests(obligation_id, kind) where status = 'open';
create index payment_dispute_requests_obligation_idx
  on public.payment_dispute_requests(obligation_id, created_at desc);

alter table public.payment_dispute_requests enable row level security;

create policy payment_dispute_requests_customer_read on public.payment_dispute_requests
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy payment_dispute_requests_provider_read on public.payment_dispute_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = payment_dispute_requests.provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

create policy payment_dispute_requests_admin_read on public.payment_dispute_requests
  for select to authenticated
  using (app_private.current_account_has_platform_capability('platform.money.read'));

revoke all on public.payment_dispute_requests from anon;
revoke insert, update, delete on public.payment_dispute_requests from authenticated;
grant select on public.payment_dispute_requests to authenticated;

create or replace function public.raise_payment_dispute_request_command(
  p_obligation_id uuid,
  p_kind text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  o public.payment_obligations%rowtype;
  r public.requests%rowtype;
  kind text := lower(btrim(coalesce(p_kind,'')));
  msg text := btrim(coalesce(p_message,''));
  rid uuid;
begin
  if auth.uid() is null or me is null then raise exception 'active account required' using errcode='28000'; end if;
  if kind not in ('refund','dispute') then raise exception 'unknown request kind' using errcode='22023'; end if;

  select * into o from public.payment_obligations where id = p_obligation_id for update;
  if not found then raise exception 'payment not found' using errcode='P0002'; end if;
  if o.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;

  -- There is nothing to look at until money has actually been taken. A `pending` obligation is a payment the
  -- customer has not made; the way to stop it is to cancel the booking, not to dispute it.
  if o.status not in ('funded','partially_refunded','refunded','disputed') then
    raise exception 'money has not been taken for this payment, so there is nothing to dispute yet' using errcode='22023';
  end if;

  if char_length(msg) < 10 then raise exception 'say what went wrong, in a sentence' using errcode='22023'; end if;

  select * into r from public.requests where id = o.request_id;

  -- ⚠️ THE PARTIAL UNIQUE INDEX WOULD REFUSE THIS TOO, BUT WITH A CONSTRAINT ERROR. One open request of each
  -- kind per payment is the rule; catching it here turns "duplicate key value violates unique constraint" into
  -- a sentence the customer can act on, and the index stays as the thing that makes the rule true.
  if exists (
    select 1 from public.payment_dispute_requests d
    where d.obligation_id = o.id and d.kind = kind and d.status = 'open'
  ) then
    raise exception 'you already have an open % request for this payment', kind using errcode='22023';
  end if;

  insert into public.payment_dispute_requests(obligation_id, request_id, provider_id, customer_account_id, kind, message)
  values (o.id, o.request_id, o.provider_id, me, kind, msg)
  returning id into rid;

  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,reason_code,data_classification,metadata)
  values (auth.uid(),'account','PAYMENT_DISPUTE_REQUESTED','payment_dispute_request',rid,kind,'participant_private',
          jsonb_build_object('obligation_id',o.id,'request_id',o.request_id,'obligation_status',o.status));

  -- ⚠️ NOTHING PUBLISHES THE OUTBOX YET, so this is a record that the platform team is owed a notification,
  -- not evidence that one was sent. The `/admin/money/[id]` page reads the row itself.
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values ('payment_obligation',o.id,'PAYMENT_DISPUTE_REQUESTED',
          jsonb_build_object('dispute_request_id',rid,'obligation_id',o.id,'kind',kind,'request_state',r.state),
          'payment-dispute-request:'||rid::text);

  return rid;
end
$function$;

create or replace function public.withdraw_payment_dispute_request_command(p_dispute_request_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  d public.payment_dispute_requests%rowtype;
begin
  if me is null then raise exception 'not authorized' using errcode='42501'; end if;
  select * into d from public.payment_dispute_requests where id = p_dispute_request_id for update;
  if not found then raise exception 'that request no longer exists' using errcode='P0002'; end if;
  if d.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if d.status <> 'open' then raise exception 'that request is already %', d.status using errcode='22023'; end if;

  update public.payment_dispute_requests set status='withdrawn', resolved_at=now() where id = d.id;
end
$function$;

revoke all on function public.raise_payment_dispute_request_command(uuid, text, text) from public, anon;
revoke all on function public.withdraw_payment_dispute_request_command(uuid) from public, anon;
grant execute on function public.raise_payment_dispute_request_command(uuid, text, text) to authenticated;
grant execute on function public.withdraw_payment_dispute_request_command(uuid) to authenticated;

-- ── The checkout gate ─────────────────────────────────────────────────────────────────────────────────
-- ── What a gateway in this market can actually ask for ────────────────────────────────────────────────
-- ⚠️ THE CHANNELS LIVE IN `payment_adapters.config`, NOT IN THE PAGE. Which of card / bank transfer / USSD /
-- QR a market can use is a property of the gateway and the market, and it is already configurable in that
-- JSON. Hard-coding a list in a React component would put a commercial fact in the wrong layer, and adding a
-- second gateway in another market would silently keep offering the first market's channels. The checkout
-- page reads this list, and the API re-reads it and refuses a channel that is not in it.
update public.payment_adapters
set config = config || jsonb_build_object('checkout_channels', jsonb_build_array('card','bank','ussd','bank_transfer','qr')),
    updated_at = now()
where adapter_key = 'paystack';

comment on column public.payment_adapters.config is
  'Adapter configuration. `checkout_channels` is the list of payment channels this adapter offers in its markets; the checkout page renders them and the checkout API refuses anything else.';

-- ⚠️ THIS IS THE STEP-UP REQUIREMENT, AND IT IS ENFORCED WHERE THE MONEY MOVES. The platform already gates
-- agreement acceptance on an authentication inside the last 15 minutes
-- (`current_auth_verified_within`). Paying is the same kind of act, so it uses the same window and the same
-- helper rather than a second policy invented for this page. `checkout` is authorised here and nowhere else;
-- the API route calls this before it creates a payment attempt, so a session that has not stepped up cannot
-- reach the provider even by posting straight to the endpoint.
create or replace function public.authorize_customer_checkout_command(p_obligation_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  me uuid := app_private.current_account_id();
  o public.payment_obligations%rowtype;
begin
  if auth.uid() is null or me is null then raise exception 'authentication required' using errcode='28000'; end if;

  select * into o from public.payment_obligations where id = p_obligation_id;
  if not found then raise exception 'payment not found' using errcode='P0002'; end if;
  if o.customer_account_id <> me then raise exception 'not authorized' using errcode='42501'; end if;
  if o.status not in ('pending','funding') then raise exception 'this payment is not payable' using errcode='22023'; end if;

  if not app_private.current_auth_verified_within(interval '15 minutes') then
    raise exception 'step-up verification required' using errcode='42501';
  end if;
end
$function$;

comment on function public.authorize_customer_checkout_command(uuid) is
  'Ownership, payability and a recent authentication, checked before a payment attempt is created.';

revoke all on function public.authorize_customer_checkout_command(uuid) from public, anon;
grant execute on function public.authorize_customer_checkout_command(uuid) to authenticated;

/**
 * The same facts, for the page to render instead of guessing.
 *
 * ⚠️ A SEPARATE READ, ON PURPOSE. The page must not infer "you need to verify" from a failed POST, because by
 * then the customer has already pressed Pay. This returns ownership, payability and the age of the current
 * authentication in one row, so the checkout page can put the verification step in front of the button rather
 * than after it. It asserts ownership in the WHERE clause: another account's payment simply returns no row.
 */
create or replace function public.get_customer_checkout_state(p_payment_id uuid)
returns table(
  payable boolean,
  step_up_required boolean,
  auth_method text,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path='public','app_private','auth'
as $function$
  select
    (o.status in ('pending','funding')),
    not app_private.current_auth_verified_within(interval '15 minutes'),
    app_private.current_auth_method(),
    (
      select to_timestamp(max((entry ->> 'timestamp')::double precision))
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
    )
  from public.payment_obligations o
  where o.id = p_payment_id
    and o.customer_account_id = app_private.current_account_id();
$function$;

comment on function public.get_customer_checkout_state(uuid) is
  'Whether the caller may pay this obligation right now, and whether their session needs to step up first.';

revoke all on function public.get_customer_checkout_state(uuid) from public, anon;
grant execute on function public.get_customer_checkout_state(uuid) to authenticated;

-- ── The customer's view of the ledger ─────────────────────────────────────────────────────────────────
/**
 * ⚠️ WHY A DEFINER FUNCTION RATHER THAN RLS ON THE LEDGER TABLES. `payment_reconciliations`,
 * `payment_provider_events` and `ledger_*` are revoked from `authenticated` outright, and that is correct:
 * they are the platform's books, they name every counterparty on the platform, and a customer has no business
 * reading another customer's entries. Widening those policies to answer one badge would be the wrong trade.
 *
 * This function returns exactly the reconciliation facts about ONE customer's own obligations — no account
 * codes, no counterparty identity, no entries — and asserts `o.customer_account_id = current_account_id()`
 * before it returns a row. That assertion is the whole security model, because a definer function bypasses
 * RLS: without it, this would be a ledger oracle keyed by a guessable uuid.
 *
 * ⚠️ `reconciled_state` IS DERIVED FROM THE RECONCILIATION, NOT FROM THE ATTEMPT. `payment_attempts.status`
 * is the provider's report of what happened; `payment_reconciliations` is the platform's own record of having
 * matched that report to a balanced ledger transaction. The brief's rule — "reconciled ledger records are
 * financial truth" — is only meaningful if the badge reads the second and not the first.
 */
create or replace function public.get_customer_payment_ledger()
returns table(
  payment_id uuid,
  request_id uuid,
  request_label text,
  request_state public.request_state,
  provider_id uuid,
  provider_name text,
  provider_slug text,
  amount_minor bigint,
  currency_code text,
  obligation_status public.payment_obligation_status,
  created_at timestamptz,
  updated_at timestamptz,
  paid_at timestamptz,
  settled_at timestamptz,
  released_at timestamptz,
  payout_status public.payout_status,
  refunded_minor bigint,
  open_dispute_requests integer,
  attempt_count integer,
  latest_attempt_id uuid,
  latest_attempt_status public.payment_attempt_status,
  payment_reference text,
  reconciled_state text,
  reconciled_at timestamptz,
  has_ledger_transaction boolean
)
language sql
stable
security definer
set search_path='public','app_private'
as $function$
  with mine as (
    select o.*
    from public.payment_obligations o
    where o.customer_account_id = app_private.current_account_id()
  ),
  attempts as (
    select a.obligation_id,
           count(*)::integer as attempt_count,
           (array_agg(a.id order by a.created_at desc))[1] as latest_attempt_id,
           (array_agg(a.status order by a.created_at desc))[1] as latest_attempt_status,
           (array_agg(coalesce(a.provider_reference, a.checkout_reference) order by a.created_at desc)
             filter (where coalesce(a.provider_reference, a.checkout_reference) is not null))[1] as payment_reference
    from public.payment_attempts a
    join mine on mine.id = a.obligation_id
    group by a.obligation_id
  ),
  reconciliations as (
    select a.obligation_id,
           bool_or(rec.result = 'matched' and rec.ledger_transaction_id is not null) as matched,
           bool_or(rec.result = 'mismatch') as mismatched,
           max(rec.reconciled_at) filter (where rec.result = 'matched' and rec.ledger_transaction_id is not null) as reconciled_at
    from public.payment_reconciliations rec
    join public.payment_attempts a on a.id = rec.payment_attempt_id
    join mine on mine.id = a.obligation_id
    group by a.obligation_id
  ),
  rejected as (
    select a.obligation_id, bool_or(e.status = 'rejected') as any_rejected
    from public.payment_provider_events e
    join public.payment_attempts a on a.id = e.payment_attempt_id
    join mine on mine.id = a.obligation_id
    group by a.obligation_id
  ),
  refunds as (
    select f.obligation_id, coalesce(sum(f.amount_minor) filter (where f.status = 'succeeded'), 0)::bigint as refunded_minor
    from public.payment_refunds f
    join mine on mine.id = f.obligation_id
    group by f.obligation_id
  ),
  disputes as (
    select d.obligation_id, count(*)::integer as open_requests
    from public.payment_dispute_requests d
    join mine on mine.id = d.obligation_id
    where d.status = 'open'
    group by d.obligation_id
  )
  select
    o.id,
    o.request_id,
    coalesce(nullif(btrim(r.need_text), ''), 'Request'),
    r.state,
    o.provider_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Provider'),
    pp.slug,
    o.amount_minor,
    o.currency_code,
    o.status,
    o.created_at,
    o.updated_at,
    rec.reconciled_at,
    -- "Settled" is the moment a balanced ledger transaction exists for this obligation. It is null until the
    -- books have it, whatever the provider or the browser says.
    case when rec.matched then rec.reconciled_at else null end,
    case when pay.status = 'paid' then pay.updated_at else null end,
    pay.status,
    coalesce(ref.refunded_minor, 0),
    coalesce(dis.open_requests, 0),
    coalesce(att.attempt_count, 0),
    att.latest_attempt_id,
    att.latest_attempt_status,
    att.payment_reference,
    case
      when coalesce(rec.matched, false) then 'reconciled'
      when coalesce(rec.mismatched, false) or coalesce(rej.any_rejected, false) then 'attention'
      else 'pending'
    end,
    rec.reconciled_at,
    coalesce(rec.matched, false)
  from mine o
  join public.requests r on r.id = o.request_id
  join public.providers p on p.id = o.provider_id
  left join public.provider_public_profiles pp on pp.provider_id = o.provider_id
  left join attempts att on att.obligation_id = o.id
  left join reconciliations rec on rec.obligation_id = o.id
  left join rejected rej on rej.obligation_id = o.id
  left join refunds ref on ref.obligation_id = o.id
  left join disputes dis on dis.obligation_id = o.id
  left join public.payouts pay on pay.obligation_id = o.id
  order by o.created_at desc;
$function$;

comment on function public.get_customer_payment_ledger() is
  'Every payment obligation belonging to the calling account, with the reconciliation state that makes the ledger the authority.';

create or replace function public.get_customer_payment_activity(p_payment_id uuid)
returns table(
  attempt_id uuid,
  attempt_status public.payment_attempt_status,
  provider_adapter text,
  payment_reference text,
  amount_minor bigint,
  currency_code text,
  created_at timestamptz,
  updated_at timestamptz,
  events jsonb
)
language sql
stable
security definer
set search_path='public','app_private'
as $function$
  with mine as (
    select o.id
    from public.payment_obligations o
    where o.id = p_payment_id
      and o.customer_account_id = app_private.current_account_id()
  )
  select
    a.id,
    a.status,
    a.provider_adapter,
    coalesce(a.provider_reference, a.checkout_reference),
    a.amount_minor,
    a.currency_code,
    a.created_at,
    a.updated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', e.id,
               'event_type', e.event_type,
               'status', e.status,
               'signature_verified', e.signature_verified,
               'received_at', e.received_at,
               'reconciled_at', e.reconciled_at,
               'rejection_reason', e.rejection_reason,
               'result', (
                 select r.result from public.payment_reconciliations r where r.provider_event_id = e.id limit 1
               ),
               'ledger_transaction_id', (
                 select r.ledger_transaction_id from public.payment_reconciliations r where r.provider_event_id = e.id limit 1
               )
             ) order by e.received_at)
      from public.payment_provider_events e
      where e.payment_attempt_id = a.id
    ), '[]'::jsonb)
  from public.payment_attempts a
  join mine on mine.id = a.obligation_id
  order by a.created_at desc;
$function$;

comment on function public.get_customer_payment_activity(uuid) is
  'The provider events behind one of the caller''s own payments, with the reconciliation result for each — the evidence for the status timeline.';

revoke all on function public.get_customer_payment_ledger() from public, anon;
revoke all on function public.get_customer_payment_activity(uuid) from public, anon;
grant execute on function public.get_customer_payment_ledger() to authenticated;
grant execute on function public.get_customer_payment_activity(uuid) to authenticated;

-- ── The customer's bookings, with the provider identity they cannot read directly ─────────────────────
/**
 * ⚠️ SAME REASON AS THE QUOTE READER. Every table a booking is made of is readable by the customer through
 * RLS — `assignments`, `requests`, `assignment_schedules`, `payment_obligations`, `appointment_time_proposals`
 * — except one. `providers` has no customer-facing select policy, so a plain join against it comes back with
 * no rows rather than an error, and the booking would render with no provider on it. `provider_public_profiles`
 * does not carry the display name either, and its authenticated policy is owner-only.
 *
 * So this function returns the provider's trading name and slug for the caller's own assignments, and asserts
 * `requests.customer_account_id = current_account_id()` before returning a row. Nothing else about the
 * provider — no contact details, no account, no payout destination — is in the result.
 */
create or replace function public.get_customer_bookings()
returns table(
  assignment_id uuid,
  request_id uuid,
  request_label text,
  request_state public.request_state,
  assignment_status public.assignment_status,
  provider_id uuid,
  provider_name text,
  provider_slug text,
  location_name text,
  landmark text,
  access_notes text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  schedule_timezone text,
  schedule_note text,
  schedule_status text,
  confirmed_at timestamptz,
  rescheduled_at timestamptz,
  proposal_id uuid,
  proposal_start timestamptz,
  proposal_end timestamptz,
  proposal_timezone text,
  proposal_message text,
  proposal_created_at timestamptz,
  obligation_id uuid,
  obligation_status public.payment_obligation_status,
  amount_minor bigint,
  currency_code text
)
language sql
stable
security definer
set search_path='public','app_private'
as $function$
  with mine as (
    select a.id as assignment_id, a.request_id, a.provider_id, a.status as assignment_status
    from public.assignments a
    join public.requests r on r.id = a.request_id
    where r.customer_account_id = app_private.current_account_id()
  )
  select
    m.assignment_id,
    m.request_id,
    coalesce(nullif(btrim(r.need_text), ''), 'Booking'),
    r.state,
    m.assignment_status,
    m.provider_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Provider'),
    pp.slug,
    lc.display_name,
    nullif(btrim(coalesce(sc.scope_json ->> 'landmark', '')), ''),
    nullif(btrim(coalesce(sc.scope_json ->> 'access_notes', '')), ''),
    s.scheduled_start,
    s.scheduled_end,
    s.timezone,
    s.note,
    -- A booking with no schedule row at all is still a booking: the assignment exists and the time is not
    -- agreed yet. 'unscheduled' is that state, and the page names it rather than showing a blank date.
    coalesce(s.customer_status, 'unscheduled'),
    s.confirmed_at,
    s.rescheduled_at,
    t.id,
    t.proposed_start,
    t.proposed_end,
    t.timezone,
    t.message,
    t.created_at,
    o.id,
    o.status,
    o.amount_minor,
    o.currency_code
  from mine m
  join public.requests r on r.id = m.request_id
  join public.providers p on p.id = m.provider_id
  left join public.provider_public_profiles pp on pp.provider_id = m.provider_id
  left join public.public_location_catalog lc on lc.location_id = r.location_id
  -- The newest scope version is what the provider was reading, so that is the one whose access notes belong
  -- beside the appointment. There is no address book on this platform; the area and these notes are the whole
  -- of what it holds about where the work happens.
  left join lateral (
    select rs.scope_json
    from public.request_scopes rs
    where rs.request_id = m.request_id
    order by rs.version desc
    limit 1
  ) sc on true
  left join public.assignment_schedules s on s.assignment_id = m.assignment_id
  left join public.appointment_time_proposals t
    on t.assignment_id = m.assignment_id and t.status = 'open'
  left join public.payment_obligations o on o.assignment_id = m.assignment_id
  order by s.scheduled_start asc nulls last, m.assignment_id;
$function$;

comment on function public.get_customer_bookings() is
  'The caller''s own assignments with their appointment, any open time proposal, and the payment beside them.';

revoke all on function public.get_customer_bookings() from public, anon;
grant execute on function public.get_customer_bookings() to authenticated;
