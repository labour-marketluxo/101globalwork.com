create or replace function app_private.submit_quote_authoritatively(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text,
  p_scope_snapshot jsonb,
  p_valid_until timestamptz,
  p_idempotency_key text
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
  if not (p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
  if p.status <> 'active' then raise exception 'provider is not active' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_services ps where ps.provider_id=p_provider_id and ps.service_entity_id=r.service_entity_id and ps.is_active) then raise exception 'provider does not offer requested service' using errcode='22023'; end if;
  if not exists(select 1 from public.provider_service_areas pa where pa.provider_id=p_provider_id and pa.location_id=r.location_id and pa.is_active) then raise exception 'request is outside provider service area' using errcode='22023'; end if;
  select exists(select 1 from public.provider_verifications v where v.provider_id=p_provider_id and v.kind='identity' and v.status='verified' and (v.expires_at is null or v.expires_at>now())) into identity_ok;
  if not identity_ok then raise exception 'verified identity required' using errcode='22023'; end if;
  select readiness_score into readiness from public.provider_public_profiles where provider_id=p_provider_id and is_public and published_at is not null and accepts_new_work;
  if coalesce(readiness,0) < 60 then raise exception 'provider is not eligible to quote' using errcode='22023'; end if;

  insert into public.quotes(request_id,provider_id,currency_code,total_minor,summary,scope_snapshot,valid_until,idempotency_key)
  values(p_request_id,p_provider_id,p_currency_code,p_total_minor,btrim(p_summary),coalesce(p_scope_snapshot,'{}'::jsonb),p_valid_until,p_idempotency_key)
  returning id into qid;

  if r.state='submitted' then
    update public.requests set state='matching',updated_at=now() where id=p_request_id;
    update public.requests set state='quoted',updated_at=now() where id=p_request_id;
  elsif r.state='matching' then
    update public.requests set state='quoted',updated_at=now() where id=p_request_id;
  end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','QUOTE_SUBMITTED','quote',qid,'participant_private',jsonb_build_object('request_id',p_request_id,'provider_id',p_provider_id,'currency_code',p_currency_code,'total_minor',p_total_minor));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('request',p_request_id,'QUOTE_SUBMITTED',jsonb_build_object('quote_id',qid,'provider_id',p_provider_id), 'quote-submitted:'||qid::text);
  return qid;
end
$function$;
