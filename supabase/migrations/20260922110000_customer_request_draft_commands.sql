-- Customer request intake: the draft a guided flow needs, and the submit that closes it.
--
-- WHY NEW COMMANDS RATHER THAN THE EXISTING ONE. `create_request_command` is the right primitive for
-- a one-page form: it validates, dedupes on `idempotency_key`, writes an audit event and an outbox
-- event, and inserts the row with `state = 'submitted'`. It cannot express a five-step flow, because
-- nothing exists until the visitor reaches the last step — and the brief asks for Save Draft at three
-- different points, which means the request has to exist before it is submitted.
--
-- The schema already anticipated this, which is why these two functions are small:
--
--   `requests.state` begins at 'draft' and `validate_request_transition` already permits only
--   draft → submitted | cancelled. The state machine IS the submit guard.
--   `request_scopes` is versioned with `status` in draft|proposed|accepted|superseded, so the
--   clarification answers and the logistics detail have a home and a lifecycle before a quote exists.
--
-- IDEMPOTENCY WITHOUT A SECOND KEY COLUMN. `requests.idempotency_key` is `not null unique` and belongs
-- to the draft row, so it cannot also guard the submit. It does not need to: the submit is a single
-- UPDATE whose WHERE clause includes `state = 'draft'`, so a second click (or a double POST, or a
-- retried request after a timeout) updates zero rows and returns the same request id it would have
-- returned the first time. The transition itself is the guard, which is the strongest kind — it cannot
-- drift from the state machine because it IS the state machine.
--
-- WHAT THE SCOPE JSON HOLDS, and why it is not columns: the clarification answers, the access notes,
-- the landmark and the preferred window are all things a provider needs to read and a customer may
-- change before the work is quoted. `request_scopes` was built to hold exactly that, versioned, with an
-- `accepted` status for the version the provider has agreed to. Adding five nullable columns to
-- `requests` instead would have scattered the same data across two tables and made "which answers were
-- in force when the quote was given" unanswerable.

-- ── Save a step ────────────────────────────────────────────────────────────────────────────────

create or replace function public.save_customer_request_draft_command(
  p_draft_id uuid,
  p_need_text text,
  p_market_id uuid,
  p_service_entity_id uuid,
  p_location_id uuid,
  p_urgency public.request_urgency,
  p_scope jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  acct uuid := app_private.current_account_id();
  draft public.requests%rowtype;
  next_version integer;
begin
  if auth.uid() is null or acct is null then
    raise exception 'active account required' using errcode = '28000';
  end if;

  if p_scope is not null and jsonb_typeof(p_scope) <> 'object' then
    raise exception 'scope must be a json object' using errcode = '22023';
  end if;

  if p_draft_id is null then
    -- A draft may be saved with almost nothing in it — that IS the point of a first step that offers
    -- "Save Draft" next to "Continue". The only requirement is a market, because the column is not
    -- nullable and every request belongs to one; the caller resolves the platform's current market.
    insert into public.requests (
      customer_account_id, market_id, service_entity_id, location_id, state, urgency, need_text,
      source, idempotency_key
    ) values (
      acct, p_market_id, p_service_entity_id, p_location_id, 'draft',
      coalesce(p_urgency, 'normal'::public.request_urgency),
      nullif(btrim(coalesce(p_need_text, '')), ''),
      'guided-web',
      -- Namespaced and prefixed so a draft key is recognisable in the table, and unique per attempt.
      'draft:' || gen_random_uuid()
    )
    returning * into draft;
  else
    select * into draft from public.requests where id = p_draft_id for update;

    if not found then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
    -- Ownership is read from the row, never taken from the caller's word for it.
    if draft.customer_account_id <> acct then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    -- A submitted request is no longer a draft. Without this the flow could edit a request that a
    -- provider is already reading, and `validate_request_transition` would refuse the update anyway —
    -- this makes the refusal a clear message instead of a constraint error.
    if draft.state <> 'draft' then
      raise exception 'this request has already been submitted' using errcode = '22023';
    end if;

    update public.requests
       set need_text = coalesce(nullif(btrim(coalesce(p_need_text, '')), ''), need_text),
           service_entity_id = coalesce(p_service_entity_id, service_entity_id),
           location_id = coalesce(p_location_id, location_id),
           urgency = coalesce(p_urgency, urgency),
           updated_at = now()
     where id = draft.id
    returning * into draft;
  end if;

  if p_scope is not null then
    select coalesce(max(version), 0) + 1 into next_version
      from public.request_scopes where request_id = draft.id;

    -- One draft scope at a time: earlier drafts are superseded rather than kept, because a draft has no
    -- audience yet. Versioning earns its keep once a quote references an accepted version.
    update public.request_scopes
       set status = 'superseded'
     where request_id = draft.id and status = 'draft';

    insert into public.request_scopes (request_id, version, status, scope_json, created_by_account_id)
    values (draft.id, next_version, 'draft', p_scope, acct);
  end if;

  return draft.id;
end$$;

-- ── Submit ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_customer_request_draft_command(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  acct uuid := app_private.current_account_id();
  draft public.requests%rowtype;
  submitted uuid;
begin
  if auth.uid() is null or acct is null then
    raise exception 'active account required' using errcode = '28000';
  end if;

  update public.requests
     set state = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where id = p_draft_id
     and customer_account_id = acct
     -- The guard, and the whole idempotency story: a second submission matches nothing.
     and state = 'draft'
  returning * into draft;

  if not found then
    -- Either it was never this account's draft, or it has already been submitted. Both answers are the
    -- same to a caller who clicked twice, so both return the row when it exists and is theirs — the
    -- page then renders the confirmation rather than an error nobody can act on.
    select * into draft from public.requests where id = p_draft_id and customer_account_id = acct;
    if not found then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
    if draft.state = 'draft' then
      raise exception 'could not submit this request' using errcode = '22023';
    end if;
    return draft.id;
  end if;

  submitted := draft.id;

  if length(btrim(coalesce(draft.need_text, ''))) < 5 then
    raise exception 'a description is required before submitting' using errcode = '22023';
  end if;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'REQUEST_SUBMITTED_FROM_DRAFT', 'request', submitted, 'participant_private',
          jsonb_build_object('account_id', acct, 'source', 'guided-web'));

  -- The same outbox event the one-page form writes. ⚠️ NOTHING PUBLISHES THESE YET: `published_at`
  -- stays null and no consumer is running, so submitting a request sends no email and no SMS. The
  -- confirmation page says so rather than offering notification preferences that would do nothing.
  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('request', submitted, 'REQUEST_CREATED',
          jsonb_build_object('request_id', submitted, 'customer_account_id', acct),
          'request-submitted:' || submitted::text);

  return submitted;
end$$;

-- Function execute grants are PUBLIC by default in Postgres, and this project revokes that explicitly
-- everywhere. Both functions act on the calling account only.
revoke all on function public.save_customer_request_draft_command(uuid, text, uuid, uuid, uuid, public.request_urgency, jsonb) from public, anon;
revoke all on function public.submit_customer_request_draft_command(uuid) from public, anon;
grant execute on function public.save_customer_request_draft_command(uuid, text, uuid, uuid, uuid, public.request_urgency, jsonb) to authenticated;
grant execute on function public.submit_customer_request_draft_command(uuid) to authenticated;
