-- Account session management — the read and revoke paths behind
-- /settings/security/sessions.
--
-- ⚠️ THIS READS auth.sessions, WHICH IS NOT A CASUAL THING TO DO, SO HERE IS WHY.
--
-- The page has to answer two questions the auth service will not answer for it: "which devices are
-- signed in to this account", and "end that one". Neither has an API. Probed against this project
-- with a real user and the service role:
--
--   GET    /auth/v1/admin/users/{id}/sessions          -> 404 page not found
--   DELETE /auth/v1/admin/users/{id}/sessions/{id}     -> 404 page not found
--   DELETE /auth/v1/admin/users/{id}/sessions          -> 404 page not found
--
-- and the JS client exposes exactly one session method, signOut(jwt, scope), whose `others` scope
-- covers "sign out everywhere else" and nothing finer than that.
--
-- A note for anyone re-running that probe, because it cost me half an hour: an UNKNOWN user id
-- answers `{"error_code":"user_not_found"}` on those paths while a REAL user id answers
-- `404 page not found`. That looks like proof the route exists and rejects only missing users. It
-- is the opposite — GoTrue resolves the user before routing the sub-path, so a missing user never
-- reaches the router and a present one falls through to it.
--
-- That leaves two honest options: offer only the one action the platform can really perform ("sign
-- out all other devices"), or read the session table GoTrue already keeps. The brief asks for the
-- list and the per-device revoke, so this does the second, as narrowly as it can:
--
--   * READ is `to_jsonb(s)`, not a column list. GoTrue owns this schema and has added columns to it
--     across versions (user_agent, ip, refreshed_at). Naming them would make this migration fail on
--     a project running a different version, and the page would rather see a field missing than a
--     500 — so it reads whatever the row has and the app takes what it recognises.
--   * REVOKE marks refresh tokens revoked, which is the same operation GoTrue performs for its own
--     logout, rather than deleting session rows out from under it.
--   * Every function is scoped to auth.uid() INSIDE the function. A caller cannot name another
--     account's session, ownership is re-checked rather than trusted, and the application never
--     holds a database credential that could reach these tables directly.
--   * Grants are `authenticated` only. There is nothing here for an anonymous caller.
--
-- WHAT THIS DOES NOT DO: kill an access token that has already been issued. A revoked session
-- cannot refresh, so the device is signed out the next time it needs a token (within the hour) or
-- the next time the middleware refreshes it — but a bearer token already in flight stays valid
-- until its own expiry. That is a property of stateless JWTs, not of this implementation, and the
-- page says so rather than implying instant termination.

-- ── Which devices are signed in ────────────────────────────────────────────────────────────────

create or replace function public.get_my_sessions_command()
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(
           jsonb_agg(entry order by (entry ->> 'created_at') desc nulls last),
           '[]'::jsonb
         )
  from (
    select to_jsonb(s)
             -- Never needed by the client: the caller owns every row this returns.
             - 'user_id'
             -- Enrolment internals with no meaning outside GoTrue's own bookkeeping.
             - 'factor_id'
             - 'tag'
             || jsonb_build_object(
                  'is_current',
                  coalesce(s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid, false)
                )
           as entry
    from auth.sessions s
    -- A session with no live refresh token cannot come back, so it is not an active session.
    -- GoTrue marks tokens revoked both on sign-out AND on rotation, and the newest token of a
    -- rotating session is always live — so this drops ended sessions without hiding in-use ones.
    -- Without it the list would show devices that were signed out weeks ago.
    where s.user_id = auth.uid()
      and exists (
        select 1
        from auth.refresh_tokens rt
        where rt.session_id = s.id
          and rt.revoked is false
      )
  ) listed;
$$;

-- ── Ending one device ──────────────────────────────────────────────────────────────────────────

create or replace function public.revoke_my_session_command(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  current_session uuid;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'a session id is required' using errcode = '22023';
  end if;

  select s.user_id into owner from auth.sessions s where s.id = p_session_id;
  if owner is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  -- Ownership is established here, not taken from the caller's word for it.
  if owner <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update auth.refresh_tokens
     set revoked = true,
         updated_at = now()
   where session_id = p_session_id
     and revoked is false;

  current_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;

  -- RETURNING THIS RATHER THAN RAISING is what makes self-revocation work: the page has to know
  -- that the session it just ended is the one holding the request, so it can sign the caller out
  -- and send them to sign-in instead of re-rendering a list they can no longer use.
  return current_session = p_session_id;
end$$;

-- ── Ending every other device ──────────────────────────────────────────────────────────────────

create or replace function public.revoke_other_sessions_command()
returns integer
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  me uuid := auth.uid();
  current_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  ended integer;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Without knowing which session is calling, "the others" cannot be computed, and guessing would
  -- sign the caller out of the device they are holding.
  if current_session is null then
    raise exception 'the current session could not be identified' using errcode = '22023';
  end if;

  -- Counted BEFORE the update, and counted as live sessions rather than as tokens: the page tells
  -- the visitor how many devices were signed out, and the token count would be a number that
  -- depends on how often those devices refreshed.
  select count(*)
    into ended
    from auth.sessions s
   where s.user_id = me
     and s.id <> current_session
     and exists (
       select 1 from auth.refresh_tokens rt
       where rt.session_id = s.id and rt.revoked is false
     );

  update auth.refresh_tokens rt
     set revoked = true,
         updated_at = now()
   where rt.revoked is false
     and rt.session_id in (
       select s.id from auth.sessions s
       where s.user_id = me and s.id <> current_session
     );

  return ended;
end$$;

-- Function execute grants are PUBLIC by default in Postgres, and this project revokes that
-- explicitly everywhere else. All three of these act on the calling account only, so none of them
-- belongs to an anonymous caller.
revoke all on function public.get_my_sessions_command() from public;
revoke all on function public.revoke_my_session_command(uuid) from public;
revoke all on function public.revoke_other_sessions_command() from public;

grant execute on function public.get_my_sessions_command() to authenticated;
grant execute on function public.revoke_my_session_command(uuid) to authenticated;
grant execute on function public.revoke_other_sessions_command() to authenticated;
