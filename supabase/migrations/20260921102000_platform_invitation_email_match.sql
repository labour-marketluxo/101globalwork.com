-- Adds `email_matches_signed_in` to the invitation projection.
--
-- WHY THIS IS A SEPARATE MIGRATION rather than an edit to the one five minutes older: an applied
-- migration is history. Supabase records the version and will never re-run the file, so editing it in
-- place would leave the database and the repository describing different functions — the exact
-- divergence that makes a later `db push` on a fresh database behave unlike production. A correction
-- is a new file.
--
-- WHY THE COMPARISON BELONGS IN SQL. The accepting page has to say, before anything is clicked,
-- whether this invitation is addressed to the account that is signed in. The projection deliberately
-- returns a MASKED address and never the raw one, so the only ways to answer are: compare the signed-in
-- address against the masked string in the application (which means a second implementation of the
-- masking rule, in a different language, that must agree with this one forever), or compare the two
-- real addresses here and return a boolean. The boolean is smaller, carries no personal data, and
-- cannot drift.
--
-- `auth.jwt()->>'email'` is null for the anonymous role, so a signed-out visitor sees `false` and the
-- page shows the sign-in prompt rather than a mismatch warning.

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
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
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
    'email_matches_signed_in',
      caller_email <> '' and caller_email = invite.email_normalized,
    'capabilities', caps
  );
end$$;

revoke all on function public.get_platform_invitation_command(text) from public;
grant execute on function public.get_platform_invitation_command(text) to anon, authenticated;
