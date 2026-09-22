-- Corrective: the agreement acceptance read epoch seconds into a timestamptz variable.
--
-- WHAT WAS WRONG. `accept_project_agreement_command` collected the `amr` timestamp as a double precision
-- (epoch seconds) and stored it in a variable declared `timestamptz`. Postgres coerced the number on
-- assignment and then objected at insert time:
--
--     date/time field value out of range: "1790069990"
--
-- so EVERY agreement acceptance failed, on the first call, with 22008 — the step-up had passed and the
-- insert could not. Found by calling the command over HTTP as a real customer; the migration applied
-- cleanly, because nothing in a migration checks that a value survives the round trip through a variable.
--
-- THE FIX is the type the number actually is: epoch seconds stay `double precision` and are converted
-- once, at the point of use, with `to_timestamp`.
--
-- Migrations are immutable once applied, so this is a `create or replace` of the same signature rather
-- than an edit to 20260922122000.

create or replace function public.accept_project_agreement_command(
  p_assignment_id uuid,
  p_agreement_hash text,
  p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare
  me uuid; a public.assignments%rowtype; r public.requests%rowtype;
  q public.quotes%rowtype; existing_id uuid; consent text; verified_epoch double precision;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  perform 1 from public.assignments where id = p_assignment_id for update;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'agreement not found' using errcode = 'P0002'; end if;

  select * into r from public.requests where id = a.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;

  if a.status <> 'active' then
    raise exception 'this agreement is % and can no longer be accepted', a.status using errcode = '22023';
  end if;

  select * into q from public.quotes where id = a.accepted_quote_id;
  if not found then raise exception 'the accepted quote for this agreement is missing' using errcode = 'P0002'; end if;

  if q.status <> 'accepted' or q.locked_at is null then
    raise exception 'the accepted quote version is not locked' using errcode = '22023';
  end if;

  select id into existing_id from public.agreement_acceptances where assignment_id = a.id;
  if existing_id is not null then return existing_id; end if;

  if not app_private.current_auth_verified_within(interval '15 minutes') then
    raise exception 'step-up verification required' using errcode = '42501';
  end if;

  if p_agreement_hash is null or p_agreement_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid agreement reference' using errcode = '22023';
  end if;

  consent := btrim(coalesce(p_consent_version, ''));
  if char_length(consent) < 3 or char_length(consent) > 40 then
    raise exception 'invalid consent reference' using errcode = '22023';
  end if;

  -- Epoch seconds stay double precision, and become a timestamp only here.
  select coalesce(max((entry ->> 'timestamp')::double precision), extract(epoch from now()))
  into verified_epoch
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry;

  insert into public.agreement_acceptances(
    assignment_id, request_id, quote_id, customer_account_id, provider_id,
    quote_version_label, total_minor, currency_code, agreement_hash, consent_version,
    auth_method, verified_at)
  values (a.id, a.request_id, q.id, me, a.provider_id,
          q.version_label, q.total_minor, q.currency_code, lower(p_agreement_hash), consent,
          app_private.current_auth_method(), to_timestamp(verified_epoch))
  returning id into existing_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'AGREEMENT_ACCEPTED', 'assignment', a.id, 'participant_private',
          jsonb_build_object('account_id', me, 'quote_id', q.id, 'quote_version', q.version_label,
                             'auth_method', app_private.current_auth_method(),
                             'agreement_hash', lower(p_agreement_hash)));

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('assignment', a.id, 'AGREEMENT_ACCEPTED',
          jsonb_build_object('assignment_id', a.id, 'request_id', a.request_id, 'quote_id', q.id,
                             'customer_account_id', me),
          'agreement-accepted:' || a.id::text);

  return existing_id;
end
$function$;

revoke all on function public.accept_project_agreement_command(uuid, text, text) from public, anon;
grant execute on function public.accept_project_agreement_command(uuid, text, text) to authenticated;
