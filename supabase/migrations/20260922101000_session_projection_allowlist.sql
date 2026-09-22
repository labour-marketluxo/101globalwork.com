-- Session projection: an allowlist, not a denylist.
--
-- The first version of get_my_sessions_command returned `to_jsonb(s)` minus three keys it happened
-- to know it did not need. Testing it against a real session showed what a real row actually holds:
--
--   id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip,
--   tag, oauth_client_id, scopes, refresh_token_counter, refresh_token_hmac_key
--
-- Two of those are material this page has no business sending to a browser at all:
-- `refresh_token_hmac_key` (the key GoTrue uses to verify the account's refresh tokens) and
-- `refresh_token_counter`. A denylist would have shipped both and would keep shipping whatever
-- GoTrue adds next — the same mistake the provider profile work avoided by making the projection an
-- explicit list of what may be published, rather than a list of what may not.
--
-- So the row is now BUILT UP FIELD BY FIELD. The optional fields are read through `to_jsonb(s) ->`,
-- which keeps the version tolerance the denylist was there for: a column this project's GoTrue does
-- not have yields NULL instead of failing the whole query, and the page falls back honestly. `id`
-- and `created_at` are referenced directly because every version has them and the ordering needs
-- them.
--
-- Everything else the row contains — the HMAC key, the counter, `scopes`, `oauth_client_id`,
-- `user_id`, `factor_id`, `tag` — simply never enters the projection.

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
    select jsonb_strip_nulls(
             jsonb_build_object(
               'id', s.id,
               'created_at', s.created_at,
               -- Present only when GoTrue has refreshed the session at least once. `created_at`
               -- says when a device signed in; this says when it was last known to be in use, which
               -- is a different claim and the page labels them differently.
               'refreshed_at', row_data -> 'refreshed_at',
               'updated_at', row_data -> 'updated_at',
               'not_after', row_data -> 'not_after',
               -- The only two fields that identify a device to a human.
               'user_agent', row_data -> 'user_agent',
               'ip', row_data -> 'ip',
               -- Which factors that session cleared, so the page can say whether a device is
               -- password-only or has passed a second factor.
               'aal', row_data -> 'aal',
               'is_current', coalesce(s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid, false)
             )
           ) as entry
    from auth.sessions s
    cross join lateral (select to_jsonb(s) as row_data) packed
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

revoke all on function public.get_my_sessions_command() from public;
grant execute on function public.get_my_sessions_command() to authenticated;
