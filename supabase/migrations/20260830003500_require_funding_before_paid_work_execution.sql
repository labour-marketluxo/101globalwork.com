-- Paid assignments must not enter execution/completion before verified financial funding.
-- Assignments without a payment obligation remain possible for explicitly unpaid workflows.
create or replace function app_private.start_assignment_authoritatively(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private', 'auth'
as $function$
declare
  a public.assignments%rowtype;
  r public.requests%rowtype;
  p public.providers%rowtype;
  actor_account uuid;
  obligation_status public.payment_obligation_status;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  actor_account:=app_private.current_account_id();
  select * into a from public.assignments where id=p_assignment_id for update;
  if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
  select * into r from public.requests where id=a.request_id for update;
  select * into p from public.providers where id=a.provider_id;
  if not (p.owner_account_id=actor_account or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
  if r.state<>'scheduled' then raise exception 'request must be scheduled before work starts' using errcode='22023'; end if;

  select po.status into obligation_status from public.payment_obligations po where po.assignment_id=a.id for update;
  if found and obligation_status <> 'funded' then
    raise exception 'customer payment must be funded before paid work starts' using errcode='22023';
  end if;

  update public.requests set state='in_progress',updated_at=now() where id=r.id;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','ASSIGNMENT_STARTED','assignment',a.id,'participant_private',jsonb_build_object('payment_status',coalesce(obligation_status::text,'not_required')));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('assignment',a.id,'ASSIGNMENT_STARTED',jsonb_build_object('request_id',r.id),'assignment-started:'||a.id::text)
  on conflict (idempotency_key) do nothing;
end
$function$;

create or replace function app_private.approve_assignment_completion_authoritatively(p_assignment_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private', 'auth'
as $function$
declare
  a public.assignments%rowtype;
  r public.requests%rowtype;
  actor_account uuid;
  approval_id uuid;
  obligation_id uuid;
  obligation_status public.payment_obligation_status;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
  actor_account:=app_private.current_account_id();
  select * into a from public.assignments where id=p_assignment_id for update;
  if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
  select * into r from public.requests where id=a.request_id for update;
  if r.customer_account_id<>actor_account then raise exception 'forbidden' using errcode='42501'; end if;
  if r.state<>'submitted_for_approval' then raise exception 'work must be submitted for approval' using errcode='22023'; end if;
  if not exists(select 1 from public.work_evidence where assignment_id=a.id) then raise exception 'completion evidence required' using errcode='22023'; end if;

  select po.id,po.status into obligation_id,obligation_status from public.payment_obligations po where po.assignment_id=a.id for update;
  if found and obligation_status <> 'funded' then
    raise exception 'customer payment must be funded before paid work is approved complete' using errcode='22023';
  end if;

  insert into public.completion_approvals(assignment_id,request_id,customer_account_id,note)
  values(a.id,r.id,actor_account,nullif(btrim(coalesce(p_note,'')),'')) returning id into approval_id;
  update public.assignments set status='completed',ended_at=now() where id=a.id;
  update public.requests set state='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=r.id;
  if obligation_id is not null then perform app_private.refresh_payout_eligibility(obligation_id); end if;
  insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata)
  values(auth.uid(),'account','ASSIGNMENT_COMPLETION_APPROVED','assignment',a.id,'participant_private',jsonb_build_object('approval_id',approval_id,'payment_status',coalesce(obligation_status::text,'not_required')));
  insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values('assignment',a.id,'ASSIGNMENT_COMPLETION_APPROVED',jsonb_build_object('request_id',r.id,'approval_id',approval_id),'assignment-completed:'||a.id::text)
  on conflict (idempotency_key) do nothing;
  return approval_id;
end
$function$;
