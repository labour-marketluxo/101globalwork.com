-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that path,
-- then allow only authenticated callers; each command still performs its own capability/AAL checks.
revoke execute on function public.accept_platform_admin_invitation_command(text) from public, anon;
revoke execute on function public.create_platform_admin_invitation_command(text,text,text,timestamptz) from public, anon;
revoke execute on function public.grant_platform_role_command(uuid,text,text) from public, anon;
revoke execute on function public.revoke_platform_admin_invitation_command(uuid,text) from public, anon;
revoke execute on function public.revoke_platform_role_command(uuid,text,text) from public, anon;
revoke execute on function public.transfer_platform_ownership_command(uuid,text) from public, anon;

grant execute on function public.accept_platform_admin_invitation_command(text) to authenticated;
grant execute on function public.create_platform_admin_invitation_command(text,text,text,timestamptz) to authenticated;
grant execute on function public.grant_platform_role_command(uuid,text,text) to authenticated;
grant execute on function public.revoke_platform_admin_invitation_command(uuid,text) to authenticated;
grant execute on function public.revoke_platform_role_command(uuid,text,text) to authenticated;
grant execute on function public.transfer_platform_ownership_command(uuid,text) to authenticated;
