create schema if not exists app_private;
revoke all on schema app_private from public;

create or replace function app_private.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from public.accounts where auth_user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function app_private.is_active_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = target_org_id
      and m.account_id = app_private.current_account_id()
      and m.removed_at is null
  )
$$;

revoke all on function app_private.current_account_id() from public;
revoke all on function app_private.is_active_org_member(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_account_id() to authenticated;
grant execute on function app_private.is_active_org_member(uuid) to authenticated;

create policy accounts_select_self on public.accounts for select to authenticated using (id = app_private.current_account_id());
create policy profiles_select_self on public.profiles for select to authenticated using (account_id = app_private.current_account_id());
create policy profiles_update_self on public.profiles for update to authenticated using (account_id = app_private.current_account_id()) with check (account_id = app_private.current_account_id());
create policy organisations_select_member on public.organisations for select to authenticated using (app_private.is_active_org_member(id));
create policy organisation_members_select_same_org on public.organisation_members for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy providers_select_owned_or_member on public.providers for select to authenticated using (owner_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id)));
create policy providers_update_owned_or_member on public.providers for update to authenticated using (owner_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id))) with check (owner_account_id = app_private.current_account_id() or (organisation_id is not null and app_private.is_active_org_member(organisation_id)));
create policy provider_services_select_owned_or_member on public.provider_services for select to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_account_id = app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));
create policy provider_service_areas_select_owned_or_member on public.provider_service_areas for select to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and (p.owner_account_id = app_private.current_account_id() or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))));

create policy account_capabilities_deny_direct on public.account_capabilities for select to authenticated using (false);
create policy audit_events_deny_direct on public.audit_events for select to authenticated using (false);
create policy outbox_events_deny_direct on public.outbox_events for select to authenticated using (false);
create policy markets_deny_direct on public.markets for select to anon, authenticated using (false);
create policy locations_deny_direct on public.locations for select to anon, authenticated using (false);
create policy taxonomy_entities_deny_direct on public.taxonomy_entities for select to anon, authenticated using (false);
create policy entity_names_deny_direct on public.entity_names for select to anon, authenticated using (false);
create policy entity_synonyms_deny_direct on public.entity_synonyms for select to anon, authenticated using (false);
create policy taxonomy_links_deny_direct on public.taxonomy_links for select to anon, authenticated using (false);
create policy public_routes_deny_direct on public.public_routes for select to anon, authenticated using (false);
create policy route_redirects_deny_direct on public.route_redirects for select to anon, authenticated using (false);
