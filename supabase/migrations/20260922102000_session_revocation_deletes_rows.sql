-- Session revocation, corrected: the row is deleted, because marking the tokens revoked does not
-- revoke anything in this GoTrue version.
--
-- THE MEASUREMENT THAT CHANGED THIS, so nobody re-tries the tidier-looking approach:
--
--   1. revoke_my_session_command(target) marked every refresh token of the target session
--      `revoked = true` — the same flag GoTrue sets for its own sign-out — and returned cleanly.
--   2. The target device then called POST /auth/v1/token?grant_type=refresh_token with the token
--      that had just been marked revoked, and got **200 with a fresh access token**.
--   3. Re-listing showed the session back in the list, with its `user_agent` rewritten to the UA of
--      that refresh call. GoTrue had rotated the token, written a new live row, and — because it
--      never consulted the revoked flag — handed the device a working session again.
--
-- So the flag is not the gate on the refresh path here. Deleting the session row is: a refresh
-- needs the session it belongs to, and with the row gone the device cannot come back. Verified
-- after the change: the same refresh call returns 400, and the session is absent from the list.
--
-- Refresh tokens are deleted first. Whichever direction the foreign key between auth.refresh_tokens
-- and auth.sessions points, that leaves no token referring to a session that no longer exists.
--
-- IDEMPOTENT ON PURPOSE: a session that is already gone is not an error, because the visitor's
-- intent ("that device should not be signed in") is already true, and two clicks on a slow
-- connection must not produce a failure message. A session that exists and belongs to SOMEONE ELSE
-- is still rejected — that branch is the security-relevant one and it stays loud.

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

  -- Ownership is established here, from the row itself, not taken from the caller's word for it.
  if owner is not null and owner <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  current_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;

  if owner is not null then
    delete from auth.refresh_tokens where session_id = p_session_id;
    delete from auth.sessions where id = p_session_id and user_id = me;
  end if;

  -- RETURNING THIS RATHER THAN RAISING is what makes self-revocation work: the page has to know
  -- that the session it just ended is the one holding the request, so it can sign the caller out
  -- and send them to sign-in instead of re-rendering a list they can no longer use.
  return current_session = p_session_id;
end$$;

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
  -- Without knowing which session is calling, "the others" cannot be computed, and a guess would
  -- sign the caller out of the device they are holding.
  if current_session is null then
    raise exception 'the current session could not be identified' using errcode = '22023';
  end if;

  -- Counted BEFORE deleting, and counted as live sessions rather than as tokens: the page tells the
  -- visitor how many devices were signed out, and a token count would depend on how often those
  -- devices refreshed.
  select count(*)
    into ended
    from auth.sessions s
   where s.user_id = me
     and s.id <> current_session
     and exists (
       select 1 from auth.refresh_tokens rt
       where rt.session_id = s.id and rt.revoked is false
     );

  delete from auth.refresh_tokens rt
   using auth.sessions s
   where rt.session_id = s.id
     and s.user_id = me
     and s.id <> current_session;

  delete from auth.sessions s
   where s.user_id = me
     and s.id <> current_session;

  return ended;
end$$;

revoke all on function public.revoke_my_session_command(uuid) from public;
revoke all on function public.revoke_other_sessions_command() from public;
grant execute on function public.revoke_my_session_command(uuid) to authenticated;
grant execute on function public.revoke_other_sessions_command() to authenticated;
