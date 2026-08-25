create or replace function app_private.current_auth_is_aal2()
returns boolean
language sql
stable
set search_path=pg_catalog,auth
as $$ select coalesce(auth.jwt()->>'aal','aal1')='aal2'; $$;
