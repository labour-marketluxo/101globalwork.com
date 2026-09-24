-- The account protection hub behind /settings/security.
--
-- ── WHAT THIS MIGRATION DOES AND DOES NOT PUT IN THE DATABASE ─────────────────────────────────
--
-- It adds one read: the factors enrolled on this account, projected field by field. Everything else
-- the page shows already has a home —
--
--   password      auth.users.encrypted_password, which nothing here can read or should read
--   factors       auth.mfa_factors, read through the projection below
--   sessions      get_my_sessions_command, built for /settings/security/sessions
--   recovery      auth.users.email_confirmed_at, the address a recovery link goes to
--
-- ── WHY THE FACTORS ARE READ FROM THE PROVIDER'S TABLE ───────────────────────────────────────
--
-- Same probe, same answer as the sessions page. `supabase.auth.mfa.listFactors()` is a CLIENT call: it
-- needs a browser session and returns whatever the provider's version returns. A server-rendered page
-- that has to say "you have one authenticator, enrolled on 3 March" cannot ask the browser for that
-- after it has already sent the HTML. The security-definer function below reads the rows GoTrue keeps,
-- through an explicit allowlist, scoped to `auth.uid()` inside the function.
--
-- ⚠️ `secret` AND `phone` NEVER ENTER THE PROJECTION. Both live on the row. A TOTP shared secret is
-- the factor: anybody holding it can generate valid codes, so sending it to a page that only needs to
-- name the factor would be handing out the thing it is describing.

create or replace function public.get_my_security_overview_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  factors jsonb;
  verified_count integer;
  live_sessions integer;
  other_sessions integer;
  current_level text;
  next_level text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by created_at), '[]'::jsonb)
    into factors
    from (
      select jsonb_build_object(
               'id', f.id,
               'type', f.factor_type,
               'friendlyName', nullif(btrim(f.friendly_name), ''),
               'status', f.status,
               'createdAt', f.created_at
             ) as entry,
             f.created_at
        from auth.mfa_factors f
       where f.user_id = auth.uid()
    ) listed;

  select count(*) filter (where f.status = 'verified') into verified_count
    from auth.mfa_factors f
   where f.user_id = auth.uid();

  select count(*),
         count(*) filter (where s.id <> nullif(auth.jwt() ->> 'session_id', '')::uuid)
    into live_sessions, other_sessions
    from auth.sessions s
   where s.user_id = auth.uid()
     and exists (
       select 1 from auth.refresh_tokens rt
        where rt.session_id = s.id and rt.revoked is false
     );

  -- The same two values the client library reports, derived on the server so the page can decide what
  -- to render before it renders it: whether this session is strong, and whether the account is one that
  -- can be made to prove it.
  current_level := coalesce(auth.jwt() ->> 'aal', 'aal1');
  next_level := case when verified_count > 0 then 'aal2' else 'aal1' end;

  return jsonb_build_object(
    'allowed', true,
    'factors', factors,
    'assurance', jsonb_build_object(
      'currentLevel', current_level,
      'nextLevel', next_level,
      'stepUpRequired', next_level = 'aal2' and current_level <> 'aal2'
    ),
    'sessions', jsonb_build_object(
      'total', live_sessions,
      'others', other_sessions
    )
  );
end $$;

/**
 * The audit trail for the security changes the application performs itself.
 *
 * Factor removal and password change happen against the authentication provider, not against a table
 * of ours, so there is no row insert to hang an audit event off. This command is that insert, with the
 * action names enumerated here rather than accepted from the caller — an audit trail an attacker can
 * write arbitrary entries into is not an audit trail.
 */
create or replace function public.record_my_security_event_command(p_action text, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  allowed_actions constant text[] := array[
    'ACCOUNT_PASSWORD_CHANGED',
    'ACCOUNT_FACTOR_REMOVED',
    'ACCOUNT_FACTOR_ADDED'
  ];
begin
  if app_private.current_account_id() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action is null or not (p_action = any(allowed_actions)) then
    raise exception 'not a recordable security action' using errcode = '22023';
  end if;

  insert into public.audit_events (
    actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata
  )
  values (
    auth.uid(),
    'user',
    p_action,
    'account',
    app_private.current_account_id(),
    'system_internal',
    -- The detail is a fixed, small object from the application — never a free-form blob a caller
    -- controls the size of.
    coalesce(p_detail, '{}'::jsonb)
  );
end $$;

revoke all on function public.get_my_security_overview_command() from public, anon;
revoke all on function public.record_my_security_event_command(text, jsonb) from public, anon;

grant execute on function public.get_my_security_overview_command() to authenticated;
grant execute on function public.record_my_security_event_command(text, jsonb) to authenticated;
