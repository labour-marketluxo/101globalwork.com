-- The read side of an invitation, and the ability to decline one.
--
-- WHY THIS EXISTS AT ALL: the invitation acceptance page has to answer three questions before it can
-- render anything — is this token real, is it still usable, and whose invitation is it — and until
-- now the database could only answer them by ACCEPTING the invitation
-- (`accept_platform_admin_invitation_command`). A page that has to attempt the write in order to
-- find out whether the link is dead cannot show an expiry warning, cannot say "this was already
-- claimed", and cannot tell the reader who invited them.
--
--
-- ⚠️ THE TOKEN IS HASHED, AND THE MASKED ADDRESS IS MASKED IN HERE, NOT IN THE APPLICATION.
--
-- The token is never stored in plaintext: `platform_admin_invitations.token_hash` holds
-- `encode(digest(token,'sha256'),'hex')`, written by `create_platform_admin_invitation_command`. Every
-- function below hashes the presented token the same way and looks for an exact match, so a leaked
-- table read yields nothing usable.
--
-- The invited address is masked inside SQL rather than returned raw. The read function is callable by
-- `anon` — it has to be, because someone clicking an expired link from an old email is not signed in
-- — and a raw address returned across that boundary is a personal identifier handed to whoever holds
-- a token. Masking here means the plaintext never leaves the database at all.
--
--
-- WHAT THE PROJECTION DELIBERATELY DOES NOT RETURN: the invitation id, the inviter's account id, the
-- role id, the token hash, or anything else an attacker could use to pivot. `role_key` and the
-- capability list are included because the accepting page has to summarise what the invitation
-- grants — that is the entire point of showing it before it is accepted — and both are already
-- disclosed to this recipient by design.

-- Masking helper. Immutable, in app_private, because it is a presentation detail rather than part of
-- the public command surface. The shapes match what the app does for contact addresses elsewhere:
-- `e***l@domain` for an address.
create or replace function app_private.masked_email(p_email text) returns text
language sql immutable as $$
  select case
    when p_email is null or position('@' in p_email) < 2 then '***'
    when length(split_part(p_email, '@', 1)) <= 2
      then left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2)
    else left(split_part(p_email, '@', 1), 1) || '***' ||
         right(split_part(p_email, '@', 1), 1) || '@' || split_part(p_email, '@', 2)
  end
$$;

revoke all on function app_private.masked_email(text) from public;

-- The invitation behind a token, for a reader who may not be signed in at all.
create or replace function public.get_platform_invitation_command(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, extensions
as $$
declare
  invite record;
  caps jsonb;
  effective text;
begin
  -- A token shorter than this cannot be one of ours, and hashing arbitrary input is pointless work.
  if p_token is null or length(btrim(p_token)) < 16 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select i.status::text as status,
         i.expires_at,
         i.email_normalized,
         i.role_id,
         r.display_name as role_name,
         r.role_key,
         coalesce(pr.display_name, 'A platform administrator') as inviter_name,
         (o.owner_account_id is not null) as inviter_is_owner
    into invite
  from public.platform_admin_invitations i
  join public.platform_roles r on r.id = i.role_id
  left join public.accounts ia on ia.id = i.invited_by_account_id
  left join public.profiles pr on pr.account_id = ia.id
  left join public.platform_ownership o on o.owner_account_id = i.invited_by_account_id
  where i.token_hash = encode(digest(btrim(p_token), 'sha256'), 'hex')
  limit 1;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Expiry is REPORTED, not written. A read function that flips rows is a side effect on a GET: two
  -- readers could race, and a prefetching mail client could expire an invitation by looking at it.
  -- The accept command performs the transition for real, and reports 'expired' when it does.
  effective := case
    when invite.status = 'pending' and invite.expires_at <= now() then 'expired'
    else invite.status
  end;

  select coalesce(jsonb_agg(rc.capability order by rc.capability), '[]'::jsonb)
    into caps
  from public.platform_role_capabilities rc
  where rc.role_id = invite.role_id;

  return jsonb_build_object(
    'status', effective,
    'role_name', invite.role_name,
    'role_key', invite.role_key,
    'inviter_name', invite.inviter_name,
    'inviter_is_owner', invite.inviter_is_owner,
    'expires_at', invite.expires_at,
    'email_masked', app_private.masked_email(invite.email_normalized),
    'capabilities', caps
  );
end$$;

-- The invitation waiting for the person who is signed in, if there is one.
--
-- Used by the onboarding page to show "you have an invitation pending" without needing the token —
-- the token only ever exists in the email. Returns null rather than an empty object so the caller has
-- one obvious thing to check.
create or replace function public.get_my_pending_platform_invitation_command()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, extensions
as $$
declare
  me_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite record;
begin
  if me_email = '' then
    return null;
  end if;

  select i.expires_at,
         r.display_name as role_name,
         coalesce(pr.display_name, 'A platform administrator') as inviter_name
    into invite
  from public.platform_admin_invitations i
  join public.platform_roles r on r.id = i.role_id
  left join public.accounts ia on ia.id = i.invited_by_account_id
  left join public.profiles pr on pr.account_id = ia.id
  where i.email_normalized = me_email
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'role_name', invite.role_name,
    'inviter_name', invite.inviter_name,
    'expires_at', invite.expires_at
  );
end$$;

-- Decline. Please stop asking.
--
-- NO SESSION REQUIRED, and that is a deliberate trade-off. The alternative — requiring the invitee to
-- create an account before they are allowed to say no — is worse: an invitation sent to the wrong
-- address would have to be accepted-then-abandoned, and the person with no interest in this platform
-- would have to register with it to refuse. The token is the credential, and possession is what makes
-- the request meaningful.
--
-- The cost is real and small: somebody who reads the email (a shared inbox, a forwarded message) can
-- also decline it. They cannot ACCEPT it — that requires a session whose address matches, enforced in
-- the accept command — so the worst case is a lost invitation, which the inviter can simply resend.
--
-- WHY NOT REUSE 'revoked': revoked means an administrator withdrew it. Declining means the recipient
-- refused. The rows are read by different people for different reasons, and collapsing them would
-- lose the distinction exactly where it matters — an audit.
create or replace function public.decline_platform_admin_invitation_command(p_token text)
returns text
language plpgsql
security definer
set search_path = public, app_private, extensions
as $$
declare
  invite_id uuid;
begin
  if p_token is null or length(btrim(p_token)) < 16 then
    raise exception 'invitation not found';
  end if;

  select i.id into invite_id
  from public.platform_admin_invitations i
  where i.token_hash = encode(digest(btrim(p_token), 'sha256'), 'hex')
    and i.status = 'pending'
  for update;

  if invite_id is null then
    raise exception 'invitation not found';
  end if;

  update public.platform_admin_invitations
     set status = 'declined'
   where id = invite_id;

  return 'declined';
end$$;

-- Function execute grants are PUBLIC by default in Postgres; this project revokes that explicitly
-- (see the earlier revoke_anonymous_admin_rpc_execute migration). The read function MUST stay
-- reachable without a session — an expired link is opened by someone signed out — while the other two
-- are scoped to signed-in callers and the anonymous role respectively.
revoke all on function public.get_platform_invitation_command(text) from public;
revoke all on function public.get_my_pending_platform_invitation_command() from public;
revoke all on function public.decline_platform_admin_invitation_command(text) from public;

grant execute on function public.get_platform_invitation_command(text) to anon, authenticated;
grant execute on function public.get_my_pending_platform_invitation_command() to authenticated;
grant execute on function public.decline_platform_admin_invitation_command(text) to anon, authenticated;
