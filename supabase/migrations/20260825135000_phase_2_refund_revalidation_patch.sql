create or replace function app_private.refresh_payout_eligibility(p_obligation_id uuid)
returns uuid
language plpgsql security definer
set search_path='public','app_private'
as $$
declare
  o public.payment_obligations%rowtype;
  r public.requests%rowtype;
  payout_id uuid;
  net_amount bigint;
begin
  select * into o from public.payment_obligations where id=p_obligation_id;
  if not found or o.status not in ('funded','partially_refunded') then return null; end if;

  select * into r from public.requests where id=o.request_id;
  if not found or r.state<>'completed' then return null; end if;

  if exists(select 1 from public.payment_refunds f where f.obligation_id=o.id and f.status in ('requested','submitted','processing','needs_attention')) then return null; end if;
  if exists(select 1 from public.payment_disputes d where d.obligation_id=o.id and coalesce(d.resolution,'')<>'cleared_for_payout') then return null; end if;

  net_amount:=app_private.net_provider_payable_amount(o.id);
  if coalesce(net_amount,0)<=0 then
    update public.payouts set status='cancelled',block_reason='fully_refunded',last_validated_at=now(),updated_at=now()
    where obligation_id=o.id and status not in ('processing','paid');
    return null;
  end if;

  insert into public.payouts(obligation_id,provider_id,currency_code,amount_minor,status,idempotency_key,last_validated_at)
  values(o.id,o.provider_id,o.currency_code,net_amount,'eligible','payout-eligibility:'||o.id::text,now())
  on conflict(obligation_id) do update
  set amount_minor=case when public.payouts.status in ('eligible','failed','blocked') then excluded.amount_minor else public.payouts.amount_minor end,
      status=case
        when public.payouts.status='eligible' then 'eligible'::public.payout_status
        when public.payouts.status='failed' and public.payouts.block_reason='transfer_failed' then 'eligible'::public.payout_status
        when public.payouts.status='blocked' and public.payouts.block_reason in ('refund_pending','refund_processing','refund_completed_revalidate','dispute_open') then 'eligible'::public.payout_status
        else public.payouts.status
      end,
      block_reason=case
        when public.payouts.status='eligible' then null
        when public.payouts.status='failed' and public.payouts.block_reason='transfer_failed' then null
        when public.payouts.status='blocked' and public.payouts.block_reason in ('refund_pending','refund_processing','refund_completed_revalidate','dispute_open') then null
        else public.payouts.block_reason
      end,
      last_validated_at=now(),updated_at=now()
  returning id into payout_id;
  return payout_id;
end$$;
