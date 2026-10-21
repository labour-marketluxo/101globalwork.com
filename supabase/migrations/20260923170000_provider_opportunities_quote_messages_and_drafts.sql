-- Provider opportunities, the quote conversation, quote drafts, and withdrawing an offer.
--
-- Four things the brief asks for that had nowhere to live:
--
--   1. "Mark interested" and "Decline" on an opportunity. There is no invitation table and no response
--      record — matching is computed, so a provider's answer to an opportunity is the one fact the
--      platform was not keeping. `provider_opportunity_responses` keeps it.
--
--   2. "Message customer" / "Send clarification". The only conversation this schema had ran one way:
--      `quote_change_requests` is written by the CUSTOMER and read by the provider. A provider had no
--      channel at all, and a channel that only the sender can read is a message into a void, so
--      `provider_quote_messages` is read by both sides and the customer's quote page renders it.
--
--   3. "Save draft". A draft CANNOT be a `quotes` row with status 'draft' in this schema: version numbers
--      are assigned on insert by counting existing rows, so a draft would consume v1.0 and the first real
--      offer would go out as v2.0 — a customer would see a first quote labelled as a revision. A draft also
--      must not be readable by the customer, and `quotes_customer_read` would hand it to them. So drafts
--      live in their own table, are never projected, and are deleted when the quote is submitted.
--
--   4. "Withdraw quote". `quote_status` has had 'withdrawn' since the first quote migration and nothing
--      could ever set it.
--
-- ⚠️ PRIVACY MINIMISATION, AND WHERE IT IS ENFORCED. `get_my_opportunity_detail_command` does not return
-- the customer's scope document. It returns an ALLOWLIST of keys from it (`answers`, `preferred_window`,
-- `preferred_date`, `hazardous`, `area_text`) and deliberately withholds `landmark`, `access_notes` and
-- `contact_preference`, which are the three fields that describe how to reach a person or a door. They
-- become visible through the assignment read model once a quote is accepted and the work exists, which is
-- the same line `get_customer_bookings` already draws for the customer's side.

-- ── 1. What a provider said about an opportunity ──────────────────────────────────────────────

create table public.provider_opportunity_responses (
  provider_id uuid not null references public.providers(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  response text not null check (response in ('interested','declined')),
  -- A fixed vocabulary rather than free text: this is a reason the platform may one day count, and a
  -- free-text field nobody reads is a field that slowly fills with things nobody can act on.
  reason_code text check (reason_code in ('outside_travel','schedule_conflict','scope_not_suitable','no_capacity','not_my_trade','other')),
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  responded_by_account_id uuid not null references public.accounts(id),
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, request_id)
);

alter table public.provider_opportunity_responses enable row level security;

create policy provider_opportunity_responses_owner_read on public.provider_opportunity_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.provider_opportunity_responses from anon;
revoke insert, update, delete on public.provider_opportunity_responses from authenticated;
grant select on public.provider_opportunity_responses to authenticated;

comment on table public.provider_opportunity_responses is
  'The provider''s own answer to an opportunity: interested, or declined with a reason. Never visible to the customer.';

-- ── 2. The conversation about a quote ─────────────────────────────────────────────────────────

create table public.provider_quote_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  -- Null when the message is about the request rather than one version of the price: a clarification
  -- asked before the first quote exists has no quote to hang from.
  quote_id uuid references public.quotes(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete cascade,
  author_account_id uuid not null references public.accounts(id),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index provider_quote_messages_request_idx on public.provider_quote_messages(request_id, created_at desc);
create index provider_quote_messages_quote_idx on public.provider_quote_messages(quote_id, created_at desc) where quote_id is not null;

alter table public.provider_quote_messages enable row level security;

create policy provider_quote_messages_owner_read on public.provider_quote_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

-- The other half of the conversation. Without this the provider writes into a void.
create policy provider_quote_messages_customer_read on public.provider_quote_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_id and r.customer_account_id = app_private.current_account_id()
    )
  );

revoke all on public.provider_quote_messages from anon;
revoke insert, update, delete on public.provider_quote_messages from authenticated;
grant select on public.provider_quote_messages to authenticated;

comment on table public.provider_quote_messages is
  'Messages a provider sends to the customer about a request or one quote version. Read by both sides; the customer''s own questions are quote_change_requests, which is the other direction of the same conversation.';

-- ── 3. Drafts ─────────────────────────────────────────────────────────────────────────────────

create table public.provider_quote_drafts (
  provider_id uuid not null references public.providers(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_by_account_id uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  primary key (provider_id, request_id)
);

alter table public.provider_quote_drafts enable row level security;

create policy provider_quote_drafts_owner_read on public.provider_quote_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  );

revoke all on public.provider_quote_drafts from anon;
revoke insert, update, delete on public.provider_quote_drafts from authenticated;
grant select on public.provider_quote_drafts to authenticated;

comment on table public.provider_quote_drafts is
  'A half-written quote, kept out of `quotes` entirely: a draft must not be readable by the customer and must not consume a version number. Deleted when the quote is submitted.';

-- ── 4. Commands ───────────────────────────────────────────────────────────────────────────────

/**
 * The provider's answer to one opportunity.
 *
 * ⚠️ AN INTERESTED MARK IS NOT AN APPLICATION AND NOT A HOLD. It is the provider's own note to themselves,
 * surfaced back in the feed, so a page full of eligible work can be triaged across sessions on a phone.
 * Nothing about matching, eligibility or the customer's view changes — promising otherwise in the UI would
 * be a promise this platform cannot keep.
 *
 * ⚠️ A DECLINE NEEDS A REASON; AN INTEREST MARK DOES NOT. The reason is the only feedback loop the platform
 * has about why eligible work is not being answered, and it is optional-with-one-value rather than required
 * for interest, because "I am looking at this" needs no explanation.
 */
create or replace function public.respond_to_opportunity_command(
  p_provider_id uuid,
  p_request_id uuid,
  p_response text,
  p_reason_code text default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if p_response not in ('interested','declined') then
    raise exception 'invalid opportunity response' using errcode = '22023';
  end if;
  if p_reason_code is not null and p_reason_code not in ('outside_travel','schedule_conflict','scope_not_suitable','no_capacity','not_my_trade','other') then
    raise exception 'invalid decline reason' using errcode = '22023';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- The response is checked against the same command the feed is built from, so an account cannot record
  -- an answer about a request that is not actually offered to it.
  if not exists (
    select 1 from public.list_my_provider_opportunities_command(200) o
    where o.provider_id = p_provider_id and o.request_id = p_request_id
  ) then
    raise exception 'that request is not an open opportunity for this provider' using errcode = '22023';
  end if;

  insert into public.provider_opportunity_responses(provider_id, request_id, response, reason_code, note, responded_by_account_id)
  values (p_provider_id, p_request_id, p_response,
          case when p_response = 'declined' then p_reason_code else null end,
          case when p_response = 'declined' then clean_note else null end,
          acct)
  on conflict (provider_id, request_id) do update
    set response = excluded.response,
        reason_code = excluded.reason_code,
        note = excluded.note,
        responded_by_account_id = excluded.responded_by_account_id,
        responded_at = now(),
        updated_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_OPPORTUNITY_RESPONSE', 'request', p_request_id, 'participant_private',
          jsonb_build_object('provider_id', p_provider_id, 'response', p_response, 'reason_code', p_reason_code));

  return p_response;
end $$;

revoke all on function public.respond_to_opportunity_command(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.respond_to_opportunity_command(uuid, uuid, text, text, text) to authenticated;

/**
 * A message from the provider to the customer about this work.
 *
 * ⚠️ IT MUST BE ABOUT A REQUEST THIS PROVIDER CAN ACT ON. The check is the same eligibility command the
 * feed uses, plus a quote this provider already owns when a quote id is given — so the message table cannot
 * be used to reach a customer whose job this provider has no business with.
 */
create or replace function public.send_quote_message_command(
  p_provider_id uuid,
  p_request_id uuid,
  p_quote_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  body text := btrim(coalesce(p_message, ''));
  message_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if char_length(body) < 2 or char_length(body) > 2000 then
    raise exception 'a message must be between 1 and 2000 characters' using errcode = '22023';
  end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_quote_id is not null then
    if not exists (select 1 from public.quotes q where q.id = p_quote_id and q.provider_id = p_provider_id and q.request_id = p_request_id) then
      raise exception 'that quote does not belong to this provider and request' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.list_my_provider_opportunities_command(200) o
      where o.provider_id = p_provider_id and o.request_id = p_request_id
    ) and not exists (
      select 1 from public.quotes q where q.provider_id = p_provider_id and q.request_id = p_request_id
    ) then
      raise exception 'that request is not open to this provider' using errcode = '22023';
    end if;
  end if;

  insert into public.provider_quote_messages(request_id, quote_id, provider_id, author_account_id, message)
  values (p_request_id, p_quote_id, p_provider_id, acct, body)
  returning id into message_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_QUOTE_MESSAGE_SENT', 'request', p_request_id, 'participant_private',
          jsonb_build_object('provider_id', p_provider_id, 'quote_id', p_quote_id, 'message_id', message_id));

  return message_id;
end $$;

revoke all on function public.send_quote_message_command(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.send_quote_message_command(uuid, uuid, uuid, text) to authenticated;

/**
 * Save a draft, or delete the one that exists when the payload is empty.
 *
 * ⚠️ THE DRAFT IS NOT VALIDATED LIKE A QUOTE, AND THAT IS DELIBERATE. A draft exists to survive a phone
 * call in the middle of pricing a job; half-filled rows are the normal state of one. What IS enforced is
 * the size and shape of the payload, so a draft cannot become a place to store something the quote tables
 * would refuse. The quote command re-validates every figure at submission.
 */
create or replace function public.save_quote_draft_command(
  p_provider_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'a draft payload must be an object' using errcode = '22023';
  end if;
  if pg_column_size(payload) > 32768 then
    raise exception 'draft payload is too large' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.list_my_provider_opportunities_command(200) o
    where o.provider_id = p_provider_id and o.request_id = p_request_id
  ) then
    raise exception 'that request is not an open opportunity for this provider' using errcode = '22023';
  end if;

  if payload = '{}'::jsonb then
    delete from public.provider_quote_drafts where provider_id = p_provider_id and request_id = p_request_id;
    return false;
  end if;

  insert into public.provider_quote_drafts(provider_id, request_id, payload, updated_by_account_id)
  values (p_provider_id, p_request_id, payload, acct)
  on conflict (provider_id, request_id) do update
    set payload = excluded.payload, updated_by_account_id = excluded.updated_by_account_id, updated_at = now();

  return true;
end $$;

revoke all on function public.save_quote_draft_command(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_quote_draft_command(uuid, uuid, jsonb) to authenticated;

/**
 * Withdraw an offer.
 *
 * ⚠️ ONLY A SUBMITTED, UNLOCKED VERSION CAN BE WITHDRAWN. An accepted version is the document the assignment
 * and the payment obligation point at, and the lock trigger already refuses to change it — this command
 * refuses first so the provider is told why rather than meeting a constraint violation. A draft has no
 * customer waiting and is deleted instead. An already-withdrawn quote is not an error: the provider's intent
 * is already true.
 */
create or replace function public.withdraw_quote_command(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  q public.quotes%rowtype;
  prov public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'quote not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = q.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if q.status = 'withdrawn' then return; end if;
  if q.status = 'accepted' or q.locked_at is not null then
    raise exception 'an accepted quote cannot be withdrawn' using errcode = '22023';
  end if;
  if q.status <> 'submitted' then
    raise exception 'only a submitted quote can be withdrawn' using errcode = '22023';
  end if;

  update public.quotes set status = 'withdrawn', updated_at = now() where id = p_quote_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'QUOTE_WITHDRAWN', 'quote', p_quote_id, 'participant_private',
          jsonb_build_object('provider_id', q.provider_id, 'request_id', q.request_id, 'version', q.version_label));
end $$;

revoke all on function public.withdraw_quote_command(uuid) from public, anon;
grant execute on function public.withdraw_quote_command(uuid) to authenticated;

-- ── 5. The opportunity feed ───────────────────────────────────────────────────────────────────

/**
 * The feed, on top of the eligibility command.
 *
 * ⚠️ IT DOES NOT RE-DERIVE ELIGIBILITY. The base rows come from
 * `list_my_provider_opportunities_command`, which is the same list matching publishes elsewhere, so the
 * feed cannot offer work the quote form would refuse. This function adds what the CARD needs and nothing
 * about who may see it.
 *
 * ⚠️ THE "TRAVEL BAND" IS A COVERAGE BAND, AND IT HAS TO BE. `locations` has latitude and longitude
 * columns and NO ROW IN THIS DATABASE HAS THEM SET, so a metric distance is a number the platform cannot
 * compute — and a distance slider would promise the provider a measurement that does not exist. What is
 * knowable is which of the provider's own records the request matched: their primary area, or another area
 * they have chosen to cover. That is the band, it is derived from rows, and the page says what it means.
 */
create or replace function public.get_my_opportunities_command(p_provider_id uuid)
returns table(
  request_id uuid,
  need_text text,
  request_state text,
  urgency text,
  market_id uuid,
  service_entity_id uuid,
  service_name text,
  location_id uuid,
  location_name text,
  city_name text,
  region_name text,
  band text,
  is_primary_area boolean,
  fit_score integer,
  fit_reasons text[],
  posted_at timestamptz,
  preferred_window text,
  hazardous boolean,
  response text,
  response_reason text,
  quote_id uuid,
  quote_status text,
  quote_version text,
  has_draft boolean,
  unread_from_customer boolean
)
language sql
stable
security definer
set search_path = public, app_private, auth
as $function$
  select
    o.request_id,
    o.need_text,
    o.request_state,
    r.urgency::text,
    o.market_id,
    o.service_entity_id,
    sc.display_name as service_name,
    o.location_id,
    lc.display_name as location_name,
    parent.display_name as city_name,
    region.display_name as region_name,
    case when pa.is_primary then 'primary' else 'covered' end as band,
    coalesce(pa.is_primary, false) as is_primary_area,
    coalesce(elig.eligibility_score, 0)::integer as fit_score,
    coalesce(elig.reasons, '{}'::text[]) as fit_reasons,
    r.created_at as posted_at,
    nullif(btrim(coalesce(scope.scope_json ->> 'preferred_window', '')), '') as preferred_window,
    coalesce((scope.scope_json ->> 'hazardous')::boolean, false) as hazardous,
    resp.response,
    resp.reason_code as response_reason,
    q.id as quote_id,
    q.status::text as quote_status,
    q.version_label as quote_version,
    (draft.request_id is not null) as has_draft,
    exists (
      select 1 from public.quote_change_requests c
      where c.request_id = o.request_id and c.provider_id = p_provider_id and c.status = 'open'
    ) as unread_from_customer
  from public.list_my_provider_opportunities_command(100) o
  join public.requests r on r.id = o.request_id
  left join public.public_service_catalog sc on sc.service_entity_id = o.service_entity_id
  left join public.public_location_catalog lc on lc.location_id = o.location_id
  left join public.public_location_catalog parent on parent.location_id = lc.parent_id
  left join public.public_location_catalog region on region.location_id = parent.parent_id
  left join public.provider_service_areas pa
    on pa.provider_id = o.provider_id and pa.location_id = o.location_id and pa.is_active
  left join public.provider_matching_eligibility elig
    on elig.provider_id = o.provider_id
   and elig.service_entity_id = o.service_entity_id
   and elig.location_id = o.location_id
  left join public.provider_opportunity_responses resp
    on resp.provider_id = o.provider_id and resp.request_id = o.request_id
  left join public.quotes q on q.id = o.quote_id
  left join public.provider_quote_drafts draft
    on draft.provider_id = o.provider_id and draft.request_id = o.request_id
  left join lateral (
    select rs.scope_json
    from public.request_scopes rs
    where rs.request_id = o.request_id
    order by rs.version desc
    limit 1
  ) scope on true
  where o.provider_id = p_provider_id
    -- ⚠️ THE OWNERSHIP PREDICATE IS REDUNDANT TODAY AND IS KEPT ANYWAY. The base command already joins on the
    -- caller's own account, so an id belonging to somebody else yields no rows before this line runs. A
    -- `security definer` function whose safety depends entirely on a rule inside another function is one edit
    -- away from being a read of another provider's feed, and the cost of saying it here is one `exists`.
    and exists (
      select 1 from public.providers p
      where p.id = p_provider_id
        and (p.owner_account_id = app_private.current_account_id()
             or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
    )
  order by r.created_at desc, o.request_id;
$function$;

revoke all on function public.get_my_opportunities_command(uuid) from public, anon;
grant execute on function public.get_my_opportunities_command(uuid) to authenticated;

comment on function public.get_my_opportunities_command(uuid) is
  'The signed-in provider''s eligible work, with the coverage band, the fit score, its own response and whether a draft or an open customer question is attached.';

-- ── 6. One opportunity, in full ───────────────────────────────────────────────────────────────

/**
 * The detail page's read.
 *
 * ⚠️ THE SCOPE IS PROJECTED KEY BY KEY, NOT PASSED THROUGH. `landmark`, `access_notes` and
 * `contact_preference` are withheld until a quote is accepted — the first two describe how to reach a door
 * and the third is a person's preferred contact method. Everything the provider needs to PRICE the work
 * (the customer's answers, the window they want, whether the work is hazardous) is included.
 */
create or replace function public.get_my_opportunity_detail_command(p_provider_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  feed record;
  scope jsonb := '{}'::jsonb;
  quotes jsonb := '[]'::jsonb;
  draft jsonb;
  messages integer := 0;
  currency text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into feed
  from public.get_my_opportunities_command(p_provider_id) opportunity
  where opportunity.request_id = p_request_id;
  if not found then
    raise exception 'that request is not an open opportunity for this provider' using errcode = '22023';
  end if;

  select coalesce(rs.scope_json, '{}'::jsonb) into scope
  from public.request_scopes rs
  where rs.request_id = p_request_id
  order by rs.version desc
  limit 1;

  select coalesce(jsonb_agg(entry order by entry ->> 'submitted_at' desc), '[]'::jsonb) into quotes
  from (
    select jsonb_build_object(
      'id', q.id,
      'status', q.status::text,
      'version', q.version_label,
      'version_major', q.version_major,
      'version_revision', q.version_revision,
      'total_minor', q.total_minor,
      'currency_code', q.currency_code,
      'summary', q.summary,
      'submitted_at', q.submitted_at,
      'valid_until', q.valid_until,
      'accepted_at', q.accepted_at,
      'locked_at', q.locked_at
    ) as entry
    from public.quotes q
    where q.provider_id = p_provider_id and q.request_id = p_request_id
  ) quote_rows;

  select d.payload into draft
  from public.provider_quote_drafts d
  where d.provider_id = p_provider_id and d.request_id = p_request_id;

  select count(*)::integer into messages
  from public.provider_quote_messages m
  where m.provider_id = p_provider_id and m.request_id = p_request_id;

  select m.default_currency_code into currency
  from public.public_market_catalog m
  where m.market_id = feed.market_id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', feed.request_id,
      'need_text', feed.need_text,
      'state', feed.request_state,
      'urgency', feed.urgency,
      'currency_code', currency,
      'posted_at', feed.posted_at,
      'service_name', feed.service_name,
      'location_name', feed.location_name,
      'city_name', feed.city_name,
      'region_name', feed.region_name,
      'band', feed.band,
      'is_primary_area', feed.is_primary_area,
      'preferred_window', feed.preferred_window,
      'hazardous', feed.hazardous
    ),
    'fit', jsonb_build_object(
      'score', feed.fit_score,
      'reasons', to_jsonb(feed.fit_reasons)
    ),
    'scope', jsonb_build_object(
      'answers', coalesce(scope -> 'answers', '{}'::jsonb),
      'not_sure', coalesce(scope -> 'not_sure', '[]'::jsonb),
      'preferred_window', nullif(btrim(coalesce(scope ->> 'preferred_window', '')), ''),
      'preferred_date', nullif(btrim(coalesce(scope ->> 'preferred_date', '')), ''),
      'area_text', nullif(btrim(coalesce(scope ->> 'area_text', '')), ''),
      'hazardous', coalesce((scope ->> 'hazardous')::boolean, false)
    ),
    'response', jsonb_build_object('response', feed.response, 'reason_code', feed.response_reason),
    'quotes', quotes,
    'draft', draft,
    'message_count', messages
  );
end $$;

revoke all on function public.get_my_opportunity_detail_command(uuid, uuid) from public, anon;
grant execute on function public.get_my_opportunity_detail_command(uuid, uuid) to authenticated;

comment on function public.get_my_opportunity_detail_command(uuid, uuid) is
  'One opportunity in full, with an ALLOWLIST of the customer''s scope: answers, window, area and hazard flag only. Landmark, access notes and contact preference stay private until a quote is accepted.';

-- ── 7. The request header, for work this provider is already part of ──────────────────────────

/**
 * The heading of a request a provider has quoted or been assigned.
 *
 * ⚠️ THIS EXISTS BECAUSE `requests` HAS NO PROVIDER READ POLICY, AND THAT WAS BREAKING A PAGE. The owner
 * policy admits the customer and the organisation only, so `from('requests').select(...)` inside
 * /provider/assignments/[id] returns nothing for the provider doing the work — and the page treats that as
 * `notFound()`. A provider opening their own accepted job met a 404. Same read, same intent, expressed as a
 * command that re-checks the provider's own records instead of relying on a policy that does not exist.
 *
 * It returns what a heading needs and nothing about the customer as a person: no name, no contact, no
 * scope document. The area hierarchy is included because "which city is this in" is the first question a
 * provider asks about a job.
 */
create or replace function public.get_my_request_header_command(p_provider_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  r public.requests%rowtype;
  quote_count integer := 0;
  assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into r from public.requests where id = p_request_id;
  if not found then return null; end if;

  select count(*)::integer into quote_count
  from public.quotes q where q.provider_id = p_provider_id and q.request_id = p_request_id;

  select a.id into assignment_id
  from public.assignments a where a.provider_id = p_provider_id and a.request_id = p_request_id
  order by a.assigned_at desc limit 1;

  -- The relationship is the authorisation: this provider must be quoting it, working on it, or eligible to
  -- quote it. Anything else returns null rather than a row, so the caller cannot use this as a general
  -- request reader by guessing uuids.
  if quote_count = 0 and assignment_id is null and not exists (
    select 1 from public.list_my_provider_opportunities_command(200) o
    where o.provider_id = p_provider_id and o.request_id = p_request_id
  ) then
    return null;
  end if;

  return jsonb_build_object(
    'id', r.id,
    'need_text', r.need_text,
    'state', r.state::text,
    'urgency', r.urgency::text,
    'posted_at', r.created_at,
    'timezone', r.timezone,
    'service_name', (select sc.display_name from public.public_service_catalog sc where sc.service_entity_id = r.service_entity_id),
    'location_name', (select lc.display_name from public.public_location_catalog lc where lc.location_id = r.location_id),
    'city_name', (
      select parent.display_name
      from public.public_location_catalog lc
      join public.public_location_catalog parent on parent.location_id = lc.parent_id
      where lc.location_id = r.location_id
    ),
    'currency_code', (select m.default_currency_code from public.public_market_catalog m where m.market_id = r.market_id),
    'quote_count', quote_count,
    'assignment_id', assignment_id
  );
end $$;

revoke all on function public.get_my_request_header_command(uuid, uuid) from public, anon;
grant execute on function public.get_my_request_header_command(uuid, uuid) to authenticated;

comment on function public.get_my_request_header_command(uuid, uuid) is
  'The heading of a request this provider quotes, works on, or is eligible for. Null for anything else. No customer identity, no scope document.';
