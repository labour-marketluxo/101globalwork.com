-- Provider workspace: expose only requests the signed-in provider is actually eligible to quote.
-- This is a read model; quote submission remains authoritative in submit_quote_command.
create or replace function public.list_my_provider_opportunities_command(p_limit integer default 25)
returns table(
  provider_id uuid,
  request_id uuid,
  need_text text,
  request_state text,
  market_id uuid,
  service_entity_id uuid,
  location_id uuid,
  request_created_at timestamptz,
  quote_id uuid,
  quote_status text
)
language sql
stable
security definer
set search_path='public','app_private','auth'
as $$
  with me as (
    select a.id as account_id
    from public.accounts a
    where a.auth_user_id=auth.uid() and a.status='active'
    limit 1
  )
  select
    p.id as provider_id,
    r.id as request_id,
    r.need_text,
    r.state::text as request_state,
    r.market_id,
    r.service_entity_id,
    r.location_id,
    r.created_at as request_created_at,
    q.id as quote_id,
    q.status::text as quote_status
  from me
  join public.providers p on p.owner_account_id=me.account_id and p.status='active'
  join public.requests r on r.state in ('submitted','matching','quoted')
    and r.service_entity_id is not null
    and r.location_id is not null
    and r.customer_account_id<>p.owner_account_id
  left join lateral (
    select q0.id,q0.status
    from public.quotes q0
    where q0.request_id=r.id and q0.provider_id=p.id
    order by q0.submitted_at desc nulls last,q0.created_at desc
    limit 1
  ) q on true
  where exists (
    select 1
    from public.find_eligible_providers(r.service_entity_id,r.location_id,50) eligible
    where eligible.provider_id=p.id
  )
  and not exists (
    select 1 from public.assignments a
    where a.request_id=r.id and a.status in ('active','completed')
  )
  order by r.created_at desc,p.id
  limit least(greatest(coalesce(p_limit,25),1),50);
$$;

revoke all on function public.list_my_provider_opportunities_command(integer) from public,anon;
grant execute on function public.list_my_provider_opportunities_command(integer) to authenticated;
