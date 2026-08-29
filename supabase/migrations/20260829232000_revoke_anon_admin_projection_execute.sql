-- Supabase may provision explicit API-role grants on newly created public functions.
-- These admin projections are authenticated-only and additionally enforce platform capabilities internally.
revoke execute on function public.admin_user_directory_command(integer) from anon;
revoke execute on function public.admin_user_detail_command(uuid) from anon;
revoke execute on function public.admin_verification_records_command(integer) from anon;
