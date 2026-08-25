-- Make checkout resumable and prevent concurrent payable attempts for the same obligation.
-- The authorization URL is provider session metadata; it is never financial truth.

alter table public.payment_attempts
  add column if not exists checkout_authorization_url text;

create unique index if not exists payment_attempts_one_active_per_obligation_idx
  on public.payment_attempts(obligation_id)
  where status in ('created','pending_provider');

create or replace function app_private.bind_payment_attempt_checkout_session_authoritatively(
  p_attempt_id uuid,
  p_adapter text,
  p_checkout_reference text,
  p_authorization_url text
)
returns void
language plpgsql
security definer
set search_path='public','app_private','auth'
as $function$
declare
  a public.payment_attempts%rowtype;
  o public.payment_obligations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode='28000';
  end if;

  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found then raise exception 'payment attempt not found' using errcode='P0002'; end if;

  select * into o from public.payment_obligations where id=a.obligation_id;
  if o.customer_account_id<>app_private.current_account_id() then
    raise exception 'forbidden' using errcode='42501';
  end if;

  if lower(btrim(p_adapter))<>a.provider_adapter then
    raise exception 'adapter mismatch' using errcode='22023';
  end if;
  if a.status not in ('created','pending_provider') then
    raise exception 'payment attempt is not active' using errcode='22023';
  end if;
  if nullif(btrim(p_checkout_reference),'') is null then
    raise exception 'checkout reference required' using errcode='22023';
  end if;
  if nullif(btrim(p_authorization_url),'') is null then
    raise exception 'authorization url required' using errcode='22023';
  end if;
  if p_authorization_url !~ '^https://[^[:space:]]+$' then
    raise exception 'authorization url must use https' using errcode='22023';
  end if;
  if exists(
    select 1 from public.payment_attempts
    where provider_adapter=a.provider_adapter
      and checkout_reference=p_checkout_reference
      and id<>a.id
  ) then
    raise exception 'checkout reference already used' using errcode='23505';
  end if;

  update public.payment_attempts
  set checkout_reference=p_checkout_reference,
      checkout_authorization_url=p_authorization_url,
      status='pending_provider',
      updated_at=now()
  where id=a.id;

  update public.payment_obligations
  set status='funding',updated_at=now()
  where id=o.id and status='pending';
end
$function$;

create or replace function public.bind_payment_attempt_checkout_session_command(
  p_attempt_id uuid,
  p_adapter text,
  p_checkout_reference text,
  p_authorization_url text
)
returns void
language sql
security invoker
set search_path='app_private'
as $function$
  select app_private.bind_payment_attempt_checkout_session_authoritatively(
    p_attempt_id,p_adapter,p_checkout_reference,p_authorization_url
  )
$function$;

revoke execute on function public.bind_payment_attempt_checkout_session_command(uuid,text,text,text) from anon,public;
grant execute on function public.bind_payment_attempt_checkout_session_command(uuid,text,text,text) to authenticated;
grant execute on function app_private.bind_payment_attempt_checkout_session_authoritatively(uuid,text,text,text) to authenticated;
