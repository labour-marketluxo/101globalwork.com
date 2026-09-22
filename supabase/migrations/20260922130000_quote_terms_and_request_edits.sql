-- The attributes the quote comparison is asked to compare, and the edit the request detail is asked to offer.
--
-- WHY THIS EXISTS. The brief asks the comparison to put line items, materials in/out, timeline, inspection
-- requirements and warranty terms side by side, and asks the quote detail to itemise the cost and separate
-- taxes and fees from optional add-ons. None of that had anywhere to live: `quotes` held a total, a currency,
-- a free-text summary and a validity date, and the provider's form collected exactly those. A comparison
-- page could either invent rows or say the platform cannot answer — which is what it said, correctly, until
-- this migration.
--
-- ⚠️ THE ITEMISATION IS THE PRICE, NOT A COMMENTARY ON IT. `line_items` and `taxes_and_fees_minor` have to
-- add up to `total_minor`, enforced by a trigger, so the breakdown on the customer's screen cannot be a
-- different number from the one they accept. `optional_addons` is deliberately OUTSIDE that sum: an add-on is
-- something the provider is offering on top, not something the customer is being charged for.
--
-- ⚠️ A QUOTE MAY STILL HAVE NO ITEMISATION, AND THAT IS SAID RATHER THAN FORBIDDEN IN THE DATABASE. Rows
-- written before this migration, and the SQL end-to-end suites that submit a quote with a single total, have
-- none. The trigger therefore validates the breakdown WHEN ONE EXISTS and refuses taxes with nothing behind
-- them; it does not require one. The provider form requires at least one line, so no quote written through
-- the application from here on is unpriced in the dark.

alter table public.quotes
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists optional_addons jsonb not null default '[]'::jsonb,
  add column if not exists taxes_and_fees_minor bigint not null default 0,
  add column if not exists materials_included boolean,
  add column if not exists materials_note text,
  add column if not exists exclusions text,
  add column if not exists timeline_days integer,
  add column if not exists timeline_note text,
  add column if not exists inspection_required boolean,
  add column if not exists warranty_terms text;

comment on column public.quotes.line_items is
  'The itemised breakdown: a JSON array of {"label": text, "amount_minor": integer}. Together with taxes_and_fees_minor it must equal total_minor.';
comment on column public.quotes.optional_addons is
  'Work the provider offers on top of this price: a JSON array of {"label": text, "amount_minor": integer}. NOT part of total_minor.';
comment on column public.quotes.taxes_and_fees_minor is
  'Taxes, levies and fees included in total_minor, separated from the work itself.';
comment on column public.quotes.materials_included is
  'Whether the price includes materials. NULL means the provider did not state either way — not "no".';
comment on column public.quotes.exclusions is
  'What this price does NOT cover, in the provider''s words. NULL means none was stated, which is not the same as "nothing is excluded".';
comment on column public.quotes.timeline_days is
  'The provider''s own estimate, in days, of how long the work takes. NULL means they stated no timeline.';
comment on column public.quotes.inspection_required is
  'Whether the provider needs to inspect before the quoted work can proceed. NULL means they did not say.';
comment on column public.quotes.warranty_terms is
  'The warranty the provider is offering, in their words. NULL means none was stated. The platform enforces no warranty.';

alter table public.quotes
  add constraint quotes_line_items_is_array check (jsonb_typeof(line_items) = 'array'),
  add constraint quotes_optional_addons_is_array check (jsonb_typeof(optional_addons) = 'array'),
  add constraint quotes_taxes_non_negative check (taxes_and_fees_minor >= 0),
  add constraint quotes_timeline_days_positive check (timeline_days is null or timeline_days > 0),
  add constraint quotes_materials_note_length check (materials_note is null or char_length(btrim(materials_note)) between 1 and 2000),
  add constraint quotes_exclusions_length check (exclusions is null or char_length(btrim(exclusions)) between 1 and 2000),
  add constraint quotes_timeline_note_length check (timeline_note is null or char_length(btrim(timeline_note)) between 1 and 2000),
  add constraint quotes_warranty_terms_length check (warranty_terms is null or char_length(btrim(warranty_terms)) between 1 and 2000);

-- ── The breakdown has to be true ─────────────────────────────────────────────────────────────────────
create or replace function app_private.validate_quote_terms()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  item jsonb;
  item_label text;
  item_sum bigint := 0;
  line_count integer;
begin
  if pg_catalog.jsonb_typeof(new.line_items) is distinct from 'array' then
    raise exception 'quote line items must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(new.optional_addons) is distinct from 'array' then
    raise exception 'quote optional add-ons must be a JSON array' using errcode = '22023';
  end if;
  if new.taxes_and_fees_minor < 0 then
    raise exception 'quote taxes and fees cannot be negative' using errcode = '22023';
  end if;

  -- The two loops are the same shape on purpose: a line item and an add-on are both {label, amount_minor},
  -- and only the sum they feed differs.
  for item in select element from pg_catalog.jsonb_array_elements(new.line_items) as t(element) loop
    if pg_catalog.jsonb_typeof(item) <> 'object' then
      raise exception 'every quote line item must be an object' using errcode = '22023';
    end if;
    item_label := pg_catalog.btrim(coalesce(item->>'label', ''));
    if item_label = '' or pg_catalog.char_length(item_label) > 200 then
      raise exception 'every quote line item needs a label of 1 to 200 characters' using errcode = '22023';
    end if;
    if coalesce(item->>'amount_minor', '') !~ '^[0-9]{1,15}$' then
      raise exception 'every quote line item needs a whole, non-negative amount in minor units' using errcode = '22023';
    end if;
    item_sum := item_sum + (item->>'amount_minor')::bigint;
  end loop;

  for item in select element from pg_catalog.jsonb_array_elements(new.optional_addons) as t(element) loop
    if pg_catalog.jsonb_typeof(item) <> 'object' then
      raise exception 'every optional add-on must be an object' using errcode = '22023';
    end if;
    item_label := pg_catalog.btrim(coalesce(item->>'label', ''));
    if item_label = '' or pg_catalog.char_length(item_label) > 200 then
      raise exception 'every optional add-on needs a label of 1 to 200 characters' using errcode = '22023';
    end if;
    if coalesce(item->>'amount_minor', '') !~ '^[0-9]{1,15}$' then
      raise exception 'every optional add-on needs a whole, non-negative amount in minor units' using errcode = '22023';
    end if;
  end loop;

  line_count := pg_catalog.jsonb_array_length(new.line_items);

  -- Taxes with nothing itemised would be a charge with no explanation, which is the one shape this
  -- column exists to prevent.
  if line_count = 0 and new.taxes_and_fees_minor > 0 then
    raise exception 'a quote that charges taxes or fees must itemise what it is charging for' using errcode = '22023';
  end if;

  if line_count > 0 and item_sum + new.taxes_and_fees_minor <> new.total_minor then
    raise exception 'quote line items and taxes add up to %, not the total of %',
      item_sum + new.taxes_and_fees_minor, new.total_minor using errcode = '22023';
  end if;

  if new.timeline_days is not null and new.timeline_days <= 0 then
    raise exception 'a quote timeline must be a positive number of days' using errcode = '22023';
  end if;

  return new;
end
$function$;

comment on function app_private.validate_quote_terms() is
  'Refuses a quote whose itemisation and taxes do not add up to its total, or whose terms are malformed. Runs before insert and before update.';

drop trigger if exists quotes_validate_terms on public.quotes;
create trigger quotes_validate_terms
  before insert or update on public.quotes
  for each row execute function app_private.validate_quote_terms();

-- A function created in this migration is granted to PUBLIC by default, and this project revokes that
-- everywhere. A trigger function cannot be called directly, but leaving the grant in place would put the
-- default back rather than the project's own rule.
revoke all on function app_private.validate_quote_terms() from public, anon, authenticated;

-- ── The provider's write path, widened ───────────────────────────────────────────────────────────────
-- ⚠️ DROPPED AND RECREATED, NOT `create or replace`. Postgres resolves an 8-argument call against an
-- 8-argument function exactly, but leaving both the 8-argument original and an 18-argument version with ten
-- trailing defaults is two functions where there should be one. The wrapper is dropped first because it is
-- the only dependent of the private function, and a SQL-bodied function records that dependency.
drop function if exists public.submit_quote_command(uuid, uuid, text, bigint, text, jsonb, timestamptz, text);
drop function if exists app_private.submit_quote_authoritatively(uuid, uuid, text, bigint, text, jsonb, timestamptz, text);

create or replace function app_private.submit_quote_authoritatively(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text,
  p_scope_snapshot jsonb,
  p_valid_until timestamptz,
  p_idempotency_key text,
  p_line_items jsonb default '[]'::jsonb,
  p_taxes_and_fees_minor bigint default 0,
  p_materials_included boolean default null,
  p_materials_note text default null,
  p_timeline_days integer default null,
  p_timeline_note text default null,
  p_inspection_required boolean default null,
  p_warranty_terms text default null,
  p_optional_addons jsonb default '[]'::jsonb,
  p_exclusions text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private', 'auth'
as $function$
declare
  qid uuid;
  r public.requests%rowtype;
  p public.providers%rowtype;
  existing uuid;
  identity_ok boolean;
  readiness numeric;
  market_currency text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_total_minor <= 0 then raise exception 'quote total must be greater than zero' using errcode='22023'; end if;
  if p_currency_code !~ '^[A-Z]{3}$' then raise exception 'invalid currency code' using errcode='22023'; end if;
  if length(btrim(coalesce(p_summary,''))) < 20 then raise exception 'quote scope summary must be at least 20 characters' using errcode='22023'; end if;
  if p_valid_until is not null and p_valid_until <= now() then raise exception 'quote validity must be in the future' using errcode='22023'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency key required' using errcode='22023'; end if;
  if coalesce(p_taxes_and_fees_minor, 0) < 0 then
    raise exception 'quote taxes and fees cannot be negative' using errcode='22023';
  end if;
  if p_line_items is not null and jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'quote line items must be a JSON array' using errcode='22023';
  end if;
  if p_optional_addons is not null and jsonb_typeof(p_optional_addons) <> 'array' then
    raise exception 'quote optional add-ons must be a JSON array' using errcode='22023';
  end if;

  select id into existing from public.quotes where provider_id=p_provider_id and idempotency_key=p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into r from public.requests where id=p_request_id for update;
  if not found then raise exception 'request not found' using errcode='P0002'; end if;
  if r.state not in ('submitted','matching','quoted') then raise exception 'request is not open for quotes' using errcode='22023'; end if;
  if r.service_entity_id is null or r.location_id is null then raise exception 'request needs service and location before quoting' using errcode='22023'; end if;

  select default_currency_code into market_currency from public.markets where id=r.market_id;
  if market_currency is null then raise exception 'request market currency is not configured' using errcode='22023'; end if;
  if p_currency_code <> market_currency then raise exception 'quote currency must match request market currency' using errcode='22023'; end if;

  select * into p from public.providers where id=p_provider_id;
  if not found then raise exception 'provider not found' using errcode='P0002'; end if;
  if r.customer_account_id = p.owner_account_id then raise exception 'provider cannot quote own request' using errcode='22023'; end if;
  if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
  if p.status <> 'active' then raise exception 'provider is not active' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_services ps where ps.provider_id=p_provider_id and ps.service_entity_id=r.service_entity_id and ps.is_active) then raise exception 'provider does not offer requested service' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_service_areas pa where pa.provider_id=p_provider_id and pa.location_id=r.location_id and pa.is_active) then raise exception 'request is outside provider service area' using errcode='22023'; end if;
  select exists(select 1 from public.provider_verifications v where v.provider_id=p_provider_id and v.kind='identity' and v.status='verified' and (v.expires_at is null or v.expires_at>now())) into identity_ok;
  if not identity_ok then raise exception 'verified identity required' using errcode='22023'; end if;
  select readiness_score into readiness from public.provider_public_profiles where provider_id=p_provider_id and is_public and published_at is not null and accepts_new_work;
  if coalesce(readiness,0) < 60 then raise exception 'provider is not eligible to quote' using errcode='22023'; end if;

  insert into public.quotes(
    request_id, provider_id, currency_code, total_minor, summary, scope_snapshot, valid_until, idempotency_key,
    line_items, taxes_and_fees_minor, materials_included, materials_note,
    exclusions, timeline_days, timeline_note, inspection_required, warranty_terms, optional_addons
  )
  values(
    p_request_id, p_provider_id, p_currency_code, p_total_minor, btrim(p_summary),
    coalesce(p_scope_snapshot, '{}'::jsonb), p_valid_until, p_idempotency_key,
    coalesce(p_line_items, '[]'::jsonb),
    coalesce(p_taxes_and_fees_minor, 0),
    p_materials_included,
    nullif(btrim(coalesce(p_materials_note, '')), ''),
    nullif(btrim(coalesce(p_exclusions, '')), ''),
    p_timeline_days,
    nullif(btrim(coalesce(p_timeline_note, '')), ''),
    p_inspection_required,
    nullif(btrim(coalesce(p_warranty_terms, '')), ''),
    coalesce(p_optional_addons, '[]'::jsonb)
  )
  returning id into qid;

  if r.state='submitted' then
    update public.requests set state='matching',updated_at=now() where id=p_request_id;
    update public.requests set state='quoted',updated_at=now() where id=p_request_id;
  elsif r.state='matching' then
    update public.requests set state='quoted',updated_at=now() where id=p_request_id;
  end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','QUOTE_SUBMITTED','quote',qid,'participant_private',jsonb_build_object('request_id',p_request_id,'provider_id',p_provider_id,'currency_code',p_currency_code,'total_minor',p_total_minor,'itemised',jsonb_array_length(coalesce(p_line_items,'[]'::jsonb)) > 0));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('request',p_request_id,'QUOTE_SUBMITTED',jsonb_build_object('quote_id',qid,'provider_id',p_provider_id), 'quote-submitted:'||qid::text);
  return qid;
end
$function$;

create or replace function public.submit_quote_command(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text default null,
  p_scope_snapshot jsonb default '{}'::jsonb,
  p_valid_until timestamptz default null,
  p_idempotency_key text default null,
  p_line_items jsonb default '[]'::jsonb,
  p_taxes_and_fees_minor bigint default 0,
  p_materials_included boolean default null,
  p_materials_note text default null,
  p_timeline_days integer default null,
  p_timeline_note text default null,
  p_inspection_required boolean default null,
  p_warranty_terms text default null,
  p_optional_addons jsonb default '[]'::jsonb,
  p_exclusions text default null
)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$
  select app_private.submit_quote_authoritatively(
    p_request_id, p_provider_id, p_currency_code, p_total_minor, p_summary, p_scope_snapshot,
    p_valid_until, p_idempotency_key, p_line_items, p_taxes_and_fees_minor,
    p_materials_included, p_materials_note, p_timeline_days, p_timeline_note,
    p_inspection_required, p_warranty_terms, p_optional_addons, p_exclusions
  )
$$;

revoke all on function public.submit_quote_command(
  uuid, uuid, text, bigint, text, jsonb, timestamptz, text,
  jsonb, bigint, boolean, text, integer, text, boolean, text, jsonb, text) from public, anon;
grant execute on function public.submit_quote_command(
  uuid, uuid, text, bigint, text, jsonb, timestamptz, text,
  jsonb, bigint, boolean, text, integer, text, boolean, text, jsonb, text) to authenticated;
revoke all on function app_private.submit_quote_authoritatively(
  uuid, uuid, text, bigint, text, jsonb, timestamptz, text,
  jsonb, bigint, boolean, text, integer, text, boolean, text, jsonb, text) from public, anon, authenticated;

-- ── The customer's read path, widened to carry the same terms ─────────────────────────────────────────
-- Dropped rather than replaced because a `RETURNS TABLE` cannot change shape under `create or replace`.
drop function if exists public.get_customer_quote_comparison(uuid);

create or replace function public.get_customer_quote_comparison(p_request_id uuid)
returns table(
  quote_id uuid,
  provider_id uuid,
  provider_display_name text,
  provider_slug text,
  provider_headline text,
  provider_identity_verified boolean,
  readiness_score integer,
  trust_score integer,
  version_label text,
  version_major integer,
  version_revision integer,
  status public.quote_status,
  total_minor bigint,
  currency_code text,
  summary text,
  valid_until timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  locked_at timestamptz,
  is_latest boolean,
  superseded_by_version text,
  open_change_requests integer,
  line_items jsonb,
  optional_addons jsonb,
  taxes_and_fees_minor bigint,
  materials_included boolean,
  materials_note text,
  exclusions text,
  timeline_days integer,
  timeline_note text,
  inspection_required boolean,
  warranty_terms text
)
language sql
security definer
set search_path = public, app_private
as $function$
  with mine as (
    select r.id
    from public.requests r
    where r.id = p_request_id
      and r.customer_account_id = app_private.current_account_id()
  ),
  ranked as (
    select q.*,
           row_number() over (
             partition by q.provider_id
             order by q.version_major desc, q.version_revision desc, q.submitted_at desc
           ) as recency,
           first_value(q.version_label) over (
             partition by q.provider_id
             order by q.version_major desc, q.version_revision desc, q.submitted_at desc
           ) as highest_label
    from public.quotes q
    join mine on mine.id = q.request_id
  )
  select
    q.id,
    q.provider_id,
    p.display_name,
    pp.slug,
    pp.headline,
    coalesce((pp.verification_summary ->> 'verified')::boolean, false),
    pp.readiness_score,
    pp.trust_score,
    q.version_label,
    q.version_major,
    q.version_revision,
    q.status,
    q.total_minor,
    q.currency_code,
    q.summary,
    q.valid_until,
    q.submitted_at,
    q.accepted_at,
    q.locked_at,
    (q.recency = 1),
    case when q.recency = 1 then null else q.highest_label end,
    (
      select count(*)::integer
      from public.quote_change_requests c
      where c.quote_id = q.id and c.status = 'open'
    ),
    q.line_items,
    q.optional_addons,
    q.taxes_and_fees_minor,
    q.materials_included,
    q.materials_note,
    q.exclusions,
    q.timeline_days,
    q.timeline_note,
    q.inspection_required,
    q.warranty_terms
  from ranked q
  join public.providers p on p.id = q.provider_id
  left join public.provider_public_profiles pp on pp.provider_id = q.provider_id
  order by q.provider_id, q.version_major desc, q.version_revision desc, q.submitted_at desc;
$function$;

comment on function public.get_customer_quote_comparison(uuid) is
  'Every quote version on one of the caller''s own requests, with the provider identity the customer cannot read directly and the structured terms the comparison shows.';

revoke all on function public.get_customer_quote_comparison(uuid) from public, anon;
grant execute on function public.get_customer_quote_comparison(uuid) to authenticated;

-- ── Editing an open request before anybody has priced it ──────────────────────────────────────────────
-- The brief's request detail offers "Edit Request". Drafts already have the guided flow. What had no writer
-- was the window between submitting and the first quote, when the request is visible to providers and the
-- customer has not yet seen a price. This command is that writer, and it closes the window exactly where the
-- prices start: once a submitted quote or an assignment exists, the edits stop and the page says why.
--
-- ⚠️ THE SCOPE IS VERSIONED, NOT OVERWRITTEN. `request_scopes` already numbers its rows; an edit writes a new
-- version and supersedes the previous one, so what the providers were shown at the time the request was open
-- stays readable rather than being erased by the edit.
create or replace function public.update_customer_request_command(
  p_request_id uuid,
  p_need_text text,
  p_urgency public.request_urgency,
  p_location_id uuid,
  p_scope jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare
  acct uuid := app_private.current_account_id();
  r public.requests%rowtype;
  msg text;
  next_version integer;
begin
  if auth.uid() is null or acct is null then
    raise exception 'active account required' using errcode = '28000';
  end if;

  if p_scope is not null and jsonb_typeof(p_scope) <> 'object' then
    raise exception 'scope must be a json object' using errcode = '22023';
  end if;

  perform 1 from public.requests where id = p_request_id for update;
  select * into r from public.requests where id = p_request_id;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if r.customer_account_id <> acct then raise exception 'not authorized' using errcode = '42501'; end if;

  if r.state not in ('draft', 'submitted', 'matching') then
    raise exception 'this request can no longer be edited' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.quotes q
    where q.request_id = r.id and q.status in ('submitted', 'accepted')
  ) then
    raise exception 'providers have already quoted this request, so it can no longer be edited' using errcode = '22023';
  end if;
  if exists (select 1 from public.assignments a where a.request_id = r.id and a.status = 'active') then
    raise exception 'a provider is already assigned to this request' using errcode = '22023';
  end if;

  msg := btrim(coalesce(p_need_text, ''));
  if char_length(msg) < 5 then
    raise exception 'describe the work in at least a few words' using errcode = '22023';
  end if;
  if char_length(msg) > 4000 then
    raise exception 'that description is too long' using errcode = '22023';
  end if;

  update public.requests
     set need_text = msg,
         urgency = coalesce(p_urgency, urgency),
         location_id = coalesce(p_location_id, location_id),
         updated_at = now()
   where id = r.id;

  if p_scope is not null then
    select coalesce(max(version), 0) + 1 into next_version
      from public.request_scopes where request_id = r.id;

    -- A draft scope and a proposed scope describe the same thing — what the customer is asking for — so
    -- the edit supersedes both. An `accepted` scope is never touched: it is the record a quote was given
    -- against, and there is no quote at this point anyway.
    update public.request_scopes
       set status = 'superseded'
     where request_id = r.id and status in ('draft', 'proposed');

    insert into public.request_scopes (request_id, version, status, scope_json, created_by_account_id)
    values (r.id, next_version, 'proposed', p_scope, acct);
  end if;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'REQUEST_EDITED_BY_CUSTOMER', 'request', r.id, 'participant_private',
          jsonb_build_object('account_id', acct, 'previous_state', r.state, 'scope_version', next_version));

  return r.id;
end
$function$;

revoke all on function public.update_customer_request_command(uuid, text, public.request_urgency, uuid, jsonb) from public, anon;
grant execute on function public.update_customer_request_command(uuid, text, public.request_urgency, uuid, jsonb) to authenticated;

-- ── A clarification stays answerable after the quote is accepted ──────────────────────────────────────
-- `request_quote_change_command` refused anything that was not `submitted`. The agreement page asks the
-- customer to be able to raise a clarification about the version they are accepting, and that version is
-- `accepted` — so the refusal turned the brief's "Decline / Request Clarification" into a button that could
-- not work. A clarification is a question, not a change: it writes a row against the quote and never touches
-- the locked version, which is why allowing it here cannot un-freeze a price.
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

  if p_kind = 'decline' then
    raise exception 'use decline_quote_command to decline a quote' using errcode = '22023';
  end if;

  -- An accepted quote answers clarifications only. A revision request on it would be a request to change a
  -- locked price, which is what the version lock exists to refuse.
  if q.status <> 'submitted' and not (q.status = 'accepted' and p_kind = 'clarification') then
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

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('quote', q.id, 'QUOTE_CHANGE_REQUESTED',
          jsonb_build_object('quote_id', q.id, 'request_id', q.request_id, 'provider_id', q.provider_id,
                             'kind', p_kind, 'change_request_id', change_id),
          'quote-change:' || change_id::text);

  return change_id;
end
$function$;
