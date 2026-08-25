create type public.evidence_kind as enum ('note','photo','document','link');

create table public.assignment_schedules (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  timezone text not null,
  note text,
  scheduled_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_schedule_window_chk check (scheduled_end is null or scheduled_end > scheduled_start)
);
create unique index assignment_schedules_one_current_idx on public.assignment_schedules(assignment_id);

create table public.work_evidence (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  provider_id uuid not null references public.providers(id),
  kind public.evidence_kind not null,
  note text,
  storage_object_path text,
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  submitted_by_account_id uuid not null references public.accounts(id),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint work_evidence_payload_chk check (nullif(btrim(coalesce(note,'')),'') is not null or nullif(btrim(coalesce(storage_object_path,'')),'') is not null or nullif(btrim(coalesce(external_url,'')),'') is not null)
);
create index work_evidence_assignment_idx on public.work_evidence(assignment_id,submitted_at desc);

create table public.completion_approvals (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  customer_account_id uuid not null references public.accounts(id),
  approved_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

alter table public.assignment_schedules enable row level security;
alter table public.work_evidence enable row level security;
alter table public.completion_approvals enable row level security;

create policy assignment_schedules_participant_select on public.assignment_schedules for select to authenticated using (exists (select 1 from public.assignments a join public.requests r on r.id=a.request_id join public.providers p on p.id=a.provider_id where a.id=assignment_schedules.assignment_id and (r.customer_account_id=app_private.current_account_id() or p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
create policy work_evidence_participant_select on public.work_evidence for select to authenticated using (exists (select 1 from public.assignments a join public.requests r on r.id=a.request_id join public.providers p on p.id=a.provider_id where a.id=work_evidence.assignment_id and (r.customer_account_id=app_private.current_account_id() or p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
create policy completion_approvals_participant_select on public.completion_approvals for select to authenticated using (exists (select 1 from public.assignments a join public.requests r on r.id=a.request_id join public.providers p on p.id=a.provider_id where a.id=completion_approvals.assignment_id and (r.customer_account_id=app_private.current_account_id() or p.owner_account_id=app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));

create or replace function app_private.schedule_assignment_authoritatively(p_assignment_id uuid,p_scheduled_start timestamptz,p_scheduled_end timestamptz,p_timezone text,p_note text default null) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; p public.providers%rowtype; schedule_id uuid; actor_account uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 actor_account:=app_private.current_account_id(); if actor_account is null then raise exception 'active account required' using errcode='42501'; end if;
 select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
 select * into r from public.requests where id=a.request_id for update; select * into p from public.providers where id=a.provider_id;
 if not (p.owner_account_id=actor_account or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 if r.state<>'accepted' then raise exception 'request must be accepted before scheduling' using errcode='22023'; end if;
 if p_scheduled_start <= now() - interval '5 minutes' then raise exception 'scheduled start must not be in the past' using errcode='22023'; end if;
 if p_scheduled_end is not null and p_scheduled_end<=p_scheduled_start then raise exception 'invalid schedule window' using errcode='22023'; end if;
 if nullif(btrim(coalesce(p_timezone,'')),'') is null then raise exception 'timezone required' using errcode='22023'; end if;
 insert into public.assignment_schedules(assignment_id,scheduled_start,scheduled_end,timezone,note,scheduled_by_account_id) values(a.id,p_scheduled_start,p_scheduled_end,btrim(p_timezone),nullif(btrim(coalesce(p_note,'')),''),actor_account) on conflict(assignment_id) do update set scheduled_start=excluded.scheduled_start,scheduled_end=excluded.scheduled_end,timezone=excluded.timezone,note=excluded.note,scheduled_by_account_id=excluded.scheduled_by_account_id,updated_at=now() returning id into schedule_id;
 update public.requests set state='scheduled' where id=r.id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','ASSIGNMENT_SCHEDULED','assignment',a.id,'participant_private',jsonb_build_object('scheduled_start',p_scheduled_start,'timezone',p_timezone));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'ASSIGNMENT_SCHEDULED',jsonb_build_object('request_id',r.id,'scheduled_start',p_scheduled_start,'timezone',p_timezone),'assignment-scheduled:'||a.id::text||':'||schedule_id::text);
 return schedule_id;
end $$;

create or replace function app_private.start_assignment_authoritatively(p_assignment_id uuid) returns void language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; p public.providers%rowtype; actor_account uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if; actor_account:=app_private.current_account_id();
 select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
 select * into r from public.requests where id=a.request_id for update; select * into p from public.providers where id=a.provider_id;
 if not (p.owner_account_id=actor_account or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 if r.state<>'scheduled' then raise exception 'request must be scheduled before work starts' using errcode='22023'; end if;
 update public.requests set state='in_progress' where id=r.id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','ASSIGNMENT_STARTED','assignment',a.id,'participant_private','{}');
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'ASSIGNMENT_STARTED',jsonb_build_object('request_id',r.id),'assignment-started:'||a.id::text);
end $$;

create or replace function app_private.submit_work_evidence_authoritatively(p_assignment_id uuid,p_kind public.evidence_kind,p_note text default null,p_storage_object_path text default null,p_external_url text default null,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; p public.providers%rowtype; actor_account uuid; evidence_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if; actor_account:=app_private.current_account_id();
 select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
 select * into r from public.requests where id=a.request_id for update; select * into p from public.providers where id=a.provider_id;
 if not (p.owner_account_id=actor_account or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))) then raise exception 'forbidden' using errcode='42501'; end if;
 if r.state<>'in_progress' then raise exception 'work must be in progress before evidence submission' using errcode='22023'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null and nullif(btrim(coalesce(p_storage_object_path,'')),'') is null and nullif(btrim(coalesce(p_external_url,'')),'') is null then raise exception 'evidence payload required' using errcode='22023'; end if;
 if p_idempotency_key is not null then select (payload->>'evidence_id')::uuid into evidence_id from public.outbox_events where idempotency_key=p_idempotency_key and event_type='WORK_EVIDENCE_SUBMITTED' limit 1; if evidence_id is not null then return evidence_id; end if; end if;
 insert into public.work_evidence(assignment_id,provider_id,kind,note,storage_object_path,external_url,submitted_by_account_id) values(a.id,a.provider_id,p_kind,nullif(btrim(coalesce(p_note,'')),''),nullif(btrim(coalesce(p_storage_object_path,'')),''),nullif(btrim(coalesce(p_external_url,'')),''),actor_account) returning id into evidence_id;
 update public.requests set state='submitted_for_approval' where id=r.id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','WORK_EVIDENCE_SUBMITTED','assignment',a.id,'participant_private',jsonb_build_object('evidence_id',evidence_id,'kind',p_kind));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'WORK_EVIDENCE_SUBMITTED',jsonb_build_object('request_id',r.id,'evidence_id',evidence_id,'kind',p_kind),coalesce(nullif(p_idempotency_key,''),'work-evidence:'||evidence_id::text));
 return evidence_id;
end $$;

create or replace function app_private.approve_assignment_completion_authoritatively(p_assignment_id uuid,p_note text default null) returns uuid language plpgsql security definer set search_path='public','app_private','auth' as $$
declare a public.assignments%rowtype; r public.requests%rowtype; actor_account uuid; approval_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if; actor_account:=app_private.current_account_id();
 select * into a from public.assignments where id=p_assignment_id for update; if not found or a.status<>'active' then raise exception 'active assignment required' using errcode='22023'; end if;
 select * into r from public.requests where id=a.request_id for update; if r.customer_account_id<>actor_account then raise exception 'forbidden' using errcode='42501'; end if;
 if r.state<>'submitted_for_approval' then raise exception 'work must be submitted for approval' using errcode='22023'; end if;
 if not exists(select 1 from public.work_evidence where assignment_id=a.id) then raise exception 'completion evidence required' using errcode='22023'; end if;
 insert into public.completion_approvals(assignment_id,request_id,customer_account_id,note) values(a.id,r.id,actor_account,nullif(btrim(coalesce(p_note,'')),'')) returning id into approval_id;
 update public.assignments set status='completed',ended_at=now() where id=a.id; update public.requests set state='completed' where id=r.id;
 insert into public.audit_events(actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata) values(auth.uid(),'account','ASSIGNMENT_COMPLETION_APPROVED','assignment',a.id,'participant_private',jsonb_build_object('approval_id',approval_id));
 insert into public.outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key) values('assignment',a.id,'ASSIGNMENT_COMPLETION_APPROVED',jsonb_build_object('request_id',r.id,'approval_id',approval_id),'assignment-completed:'||a.id::text);
 return approval_id;
end $$;

create function public.schedule_assignment_command(p_assignment_id uuid,p_scheduled_start timestamptz,p_scheduled_end timestamptz,p_timezone text,p_note text default null) returns uuid language sql security invoker set search_path='app_private' as $$ select app_private.schedule_assignment_authoritatively(p_assignment_id,p_scheduled_start,p_scheduled_end,p_timezone,p_note) $$;
create function public.start_assignment_command(p_assignment_id uuid) returns void language sql security invoker set search_path='app_private' as $$ select app_private.start_assignment_authoritatively(p_assignment_id) $$;
create function public.submit_work_evidence_command(p_assignment_id uuid,p_kind public.evidence_kind,p_note text default null,p_storage_object_path text default null,p_external_url text default null,p_idempotency_key text default null) returns uuid language sql security invoker set search_path='app_private' as $$ select app_private.submit_work_evidence_authoritatively(p_assignment_id,p_kind,p_note,p_storage_object_path,p_external_url,p_idempotency_key) $$;
create function public.approve_assignment_completion_command(p_assignment_id uuid,p_note text default null) returns uuid language sql security invoker set search_path='app_private' as $$ select app_private.approve_assignment_completion_authoritatively(p_assignment_id,p_note) $$;

revoke all on function public.schedule_assignment_command(uuid,timestamptz,timestamptz,text,text) from public,anon;
revoke all on function public.start_assignment_command(uuid) from public,anon;
revoke all on function public.submit_work_evidence_command(uuid,public.evidence_kind,text,text,text,text) from public,anon;
revoke all on function public.approve_assignment_completion_command(uuid,text) from public,anon;
grant execute on function public.schedule_assignment_command(uuid,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.start_assignment_command(uuid) to authenticated;
grant execute on function public.submit_work_evidence_command(uuid,public.evidence_kind,text,text,text,text) to authenticated;
grant execute on function public.approve_assignment_completion_command(uuid,text) to authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.schedule_assignment_authoritatively(uuid,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function app_private.start_assignment_authoritatively(uuid) to authenticated;
grant execute on function app_private.submit_work_evidence_authoritatively(uuid,public.evidence_kind,text,text,text,text) to authenticated;
grant execute on function app_private.approve_assignment_completion_authoritatively(uuid,text) to authenticated;
