-- Defense in depth: administrative SECURITY DEFINER RPCs must never be callable by anonymous clients.
revoke execute on function public.accept_platform_admin_invitation_command(text) from anon;
revoke execute on function public.create_platform_admin_invitation_command(text,text,text,timestamptz) from anon;
revoke execute on function public.grant_platform_role_command(uuid,text,text) from anon;
revoke execute on function public.revoke_platform_admin_invitation_command(uuid,text) from anon;
revoke execute on function public.revoke_platform_role_command(uuid,text,text) from anon;
revoke execute on function public.transfer_platform_ownership_command(uuid,text) from anon;
