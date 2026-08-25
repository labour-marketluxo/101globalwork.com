-- Align provider verification authorization with the canonical platform administration capability model.
-- Trust Admin and Super Admin use platform.trust.verify; the legacy platform.verification.review key is no longer authoritative.

create or replace function app_private.review_provider_verification_authoritatively(
  p_verification_id uuid,
  p_decision public.verification_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'app_private', 'auth'
as $function$
declare
  v public.provider_verifications%rowtype;
begin
  if not app_private.current_account_has_capability('platform.trust.verify') then
    raise exception 'forbidden' using errcode='42501';
  end if;

  if p_decision not in ('verified','rejected') then
    raise exception 'invalid review decision' using errcode='22023';
  end if;

  select * into v
  from public.provider_verifications
  where id=p_verification_id
  for update;

  if not found then
    raise exception 'verification not found' using errcode='P0002';
  end if;

  if v.status <> 'pending' then
    raise exception 'verification is not pending' using errcode='22023';
  end if;

  update public.provider_verifications
  set status=p_decision,
      reviewed_at=now(),
      verified_at=case when p_decision='verified' then now() else null end,
      metadata=metadata||jsonb_build_object('review_note',coalesce(p_note,'')),
      updated_at=now()
  where id=p_verification_id;

  perform app_private.refresh_provider_onboarding(v.provider_id);
  perform app_private.compute_provider_search_readiness(v.provider_id);

  insert into public.audit_events(
    actor_user_id,actor_type,action,resource_type,resource_id,data_classification,metadata
  )
  values(
    auth.uid(),
    'account',
    case when p_decision='verified' then 'PROVIDER_VERIFICATION_APPROVED' else 'PROVIDER_VERIFICATION_REJECTED' end,
    'provider_verification',
    p_verification_id,
    'regulated_sensitive',
    jsonb_build_object('provider_id',v.provider_id,'kind',v.kind,'note',coalesce(p_note,''))
  );
end
$function$;
