-- A draft may be saved before anything is written in the description box.
--
-- MEASURED, not assumed: the first version of save_customer_request_draft_command inserted
-- `nullif(btrim(p_need_text), '')`, which is NULL when the visitor presses Save Draft on an empty
-- first step, and `requests.need_text` is `not null`. The call answered:
--
--   400 {"code":"23502","details":"Failing row contains (…"}
--
-- The nullif was doing two jobs and only one of them was wanted: it normalised whitespace-only input
-- to nothing, but it also produced NULL. `coalesce(…, '')` keeps the normalisation and satisfies the
-- column. Emptiness is then enforced where it matters — submit_customer_request_draft_command already
-- refuses a description shorter than 5 characters, so nothing can be SUBMITTED empty; only typing and
-- leaving can be, which is precisely what a draft is for.

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
  cleaned text := btrim(coalesce(p_need_text, ''));
begin
  if auth.uid() is null or acct is null then
    raise exception 'active account required' using errcode = '28000';
  end if;

  if p_scope is not null and jsonb_typeof(p_scope) <> 'object' then
    raise exception 'scope must be a json object' using errcode = '22023';
  end if;

  if p_draft_id is null then
    insert into public.requests (
      customer_account_id, market_id, service_entity_id, location_id, state, urgency, need_text,
      source, idempotency_key
    ) values (
      acct, p_market_id, p_service_entity_id, p_location_id, 'draft',
      coalesce(p_urgency, 'normal'::public.request_urgency),
      cleaned,
      'guided-web',
      'draft:' || gen_random_uuid()
    )
    returning * into draft;
  else
    select * into draft from public.requests where id = p_draft_id for update;

    if not found then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
    if draft.customer_account_id <> acct then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if draft.state <> 'draft' then
      raise exception 'this request has already been submitted' using errcode = '22023';
    end if;

    update public.requests
       set need_text = case when cleaned = '' then need_text else cleaned end,
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

    update public.request_scopes
       set status = 'superseded'
     where request_id = draft.id and status = 'draft';

    insert into public.request_scopes (request_id, version, status, scope_json, created_by_account_id)
    values (draft.id, next_version, 'draft', p_scope, acct);
  end if;

  return draft.id;
end$$;

revoke all on function public.save_customer_request_draft_command(uuid, text, uuid, uuid, uuid, public.request_urgency, jsonb) from public, anon;
grant execute on function public.save_customer_request_draft_command(uuid, text, uuid, uuid, uuid, public.request_urgency, jsonb) to authenticated;
