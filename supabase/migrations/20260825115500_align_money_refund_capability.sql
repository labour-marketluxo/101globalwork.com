-- Align refund authorization with the canonical platform administration capability model.
-- Finance Admin and Super Admin use platform.money.refund; the legacy platform.finance.refund key is no longer authoritative.

create or replace function app_private.request_refund_authoritatively(
  p_obligation_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'app_private', 'auth'
as $function$
declare
  o public.payment_obligations%rowtype;
  a public.payment_attempts%rowtype;
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode='28000';
  end if;

  if not app_private.current_account_has_capability('platform.money.refund') then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select * into o
  from public.payment_obligations
  where id=p_obligation_id
  for update;

  if not found or o.status not in ('funded','partially_refunded') then
    raise exception 'obligation not refundable' using errcode='22023';
  end if;

  if p_amount_minor<=0 or p_amount_minor>o.amount_minor then
    raise exception 'invalid refund amount' using errcode='22023';
  end if;

  select * into a
  from public.payment_attempts
  where obligation_id=o.id and status='succeeded'
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'successful payment attempt required' using errcode='22023';
  end if;

  select id into rid from public.payment_refunds where idempotency_key=p_idempotency_key;
  if rid is not null then return rid; end if;

  insert into public.payment_refunds(
    obligation_id,payment_attempt_id,adapter_key,amount_minor,currency_code,reason,idempotency_key,requested_by_account_id
  )
  values(
    o.id,a.id,a.provider_adapter,p_amount_minor,o.currency_code,nullif(btrim(coalesce(p_reason,'')),''),p_idempotency_key,app_private.current_account_id()
  )
  returning id into rid;

  insert into public.audit_events(
    actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata
  )
  values(
    auth.uid(),'account','PAYMENT_REFUND_REQUESTED','payment_refund',rid,'system_internal',jsonb_build_object('obligation_id',o.id,'amount_minor',p_amount_minor)
  );

  return rid;
end
$function$;
