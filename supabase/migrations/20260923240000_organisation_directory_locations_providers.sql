-- The member directory, site details, and preferred providers.
--
-- ⚠️ LEAST PRIVILEGE IS ENFORCED BY THE COMMANDS, NOT BY HIDING BUTTONS. A member's role and their site scope decide
-- what the platform will accept from them; the pages render what the backend allows, and the commands re-check. Only
-- an owner or administrator of the organisation may change a role, a scope, a site or a preference.
--
-- ⚠️ A PREFERRED PROVIDER IS A NOTE, NOT A KEY. Nothing in this schema lets a preference bypass verification,
-- credential checks or matching eligibility — and nothing added here does either. What a preference does is put a
-- provider in the organisation's own directory; the verification state that decides whether they can be hired at all
-- is read from the provider's own records and shown beside them.
--
-- ⚠️ NO GEOCODING. `locations` has latitude and longitude columns and no row in this database has them set, and the
-- platform has no geocoding service. An address on a site is therefore text somebody typed, validated against the
-- area catalog — never resolved to a coordinate, and the page says so.

alter table public.organisation_members
  add column if not exists status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  -- Empty means every site. A scope is a list of the organisation's own locations, not of the platform's catalog.
  add column if not exists scope_location_ids uuid[] not null default '{}'::uuid[],
  add column if not exists scope_note text;

alter table public.organisation_members
  add constraint organisation_members_status_chk check (status in ('active','suspended'));

alter table public.organisation_locations
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists locality text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists country_code text,
  add column if not exists timezone text,
  add column if not exists site_manager_name text,
  add column if not exists site_manager_phone text,
  add column if not exists access_notes text,
  add column if not exists safety_notes text,
  add column if not exists archived_at timestamptz;

comment on column public.organisation_locations.address_line1 is
  'Free-form address text. Deliberately not a country-specific field set: the platform operates in more than one market and a US-style state/ZIP pair would be wrong in most of them.';

create table public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  role public.organisation_member_role not null,
  scope_location_ids uuid[] not null default '{}'::uuid[],
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by_account_id uuid not null references public.accounts(id),
  expires_at timestamptz not null,
  accepted_by_account_id uuid references public.accounts(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index organisation_invitations_org_idx on public.organisation_invitations(organisation_id, status, created_at desc);

create table public.organisation_preferred_providers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  status text not null default 'preferred' check (status in ('preferred','contract','watch')),
  contract_reference text,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  -- The verification state AT THE TIME IT WAS ADDED. A directory entry that says "verified" today and nothing about
  -- then is a claim nobody can check; this is what the platform saw when the organisation chose them.
  verification_at_add jsonb not null default '{}'::jsonb,
  added_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, provider_id)
);

create index organisation_preferred_providers_idx on public.organisation_preferred_providers(organisation_id, status);

alter table public.organisation_invitations enable row level security;
alter table public.organisation_preferred_providers enable row level security;
create policy organisation_invitations_member_read on public.organisation_invitations
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
create policy organisation_preferred_member_read on public.organisation_preferred_providers
  for select to authenticated using (app_private.is_active_org_member(organisation_id));
revoke all on public.organisation_invitations, public.organisation_preferred_providers from anon;
revoke insert, update, delete on public.organisation_invitations, public.organisation_preferred_providers from authenticated;
grant select on public.organisation_invitations, public.organisation_preferred_providers to authenticated;

-- ── Commands ──────────────────────────────────────────────────────────────────────────────────

/**
 * Change a member's role and site scope.
 *
 * ⚠️ TWO RULES THAT MATTER MORE THAN THE REST: an owner cannot be demoted by another admin (that is how an
 * organisation locks itself out), and nobody may widen their own scope.
 */
create or replace function public.update_organisation_member_command(
  p_organisation_id uuid,
  p_account_id uuid,
  p_role text,
  p_scope_location_ids uuid[] default '{}'::uuid[],
  p_scope_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  target public.organisation_members%rowtype;
  scope uuid[] := coalesce(p_scope_location_ids, '{}'::uuid[]);
  location uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then
    raise exception 'only an owner or administrator changes a member' using errcode = '42501';
  end if;
  if p_role not in ('owner','admin','project_manager','finance_approver','provider_team_member','member') then
    raise exception 'invalid member role' using errcode = '22023';
  end if;

  select * into target from public.organisation_members
  where organisation_id = p_organisation_id and account_id = p_account_id;
  if not found then raise exception 'that account is not a member of this organisation' using errcode = 'P0002'; end if;
  if target.role = 'owner' and p_role <> 'owner' then
    raise exception 'an owner cannot be demoted here: transfer ownership first' using errcode = '22023';
  end if;
  if p_account_id = app_private.current_account_id() and array_length(scope, 1) is not null then
    raise exception 'a member cannot widen or narrow their own site scope' using errcode = '22023';
  end if;
  foreach location in array scope loop
    if not exists (
      select 1 from public.organisation_locations l
      where l.organisation_id = p_organisation_id and l.location_id = location
    ) then
      raise exception 'that site is not one of this organisation''s' using errcode = '22023';
    end if;
  end loop;

  update public.organisation_members
     set role = p_role::public.organisation_member_role,
         scope_location_ids = scope,
         scope_note = nullif(btrim(coalesce(p_scope_note, '')), '')
   where id = target.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_MEMBER_UPDATED', 'organisation', p_organisation_id, 'role_or_scope_change', 'organisation_confidential',
          jsonb_build_object('account_id', p_account_id, 'role', p_role, 'scopes', array_length(scope, 1)));
end $$;

revoke all on function public.update_organisation_member_command(uuid, uuid, text, uuid[], text) from public, anon;
grant execute on function public.update_organisation_member_command(uuid, uuid, text, uuid[], text) to authenticated;

create or replace function public.set_organisation_member_status_command(
  p_organisation_id uuid,
  p_account_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  target public.organisation_members%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator suspends a member' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid member status' using errcode = '22023'; end if;
  select * into target from public.organisation_members
  where organisation_id = p_organisation_id and account_id = p_account_id;
  if not found then raise exception 'that account is not a member' using errcode = 'P0002'; end if;
  if target.role = 'owner' then raise exception 'an owner cannot be suspended' using errcode = '22023'; end if;
  if target.account_id = app_private.current_account_id() then
    raise exception 'a member cannot suspend themselves' using errcode = '22023';
  end if;

  update public.organisation_members
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end
   where id = target.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_MEMBER_' || upper(p_status), 'organisation', p_organisation_id, 'member_status_change', 'organisation_confidential',
          jsonb_build_object('account_id', p_account_id));
end $$;

revoke all on function public.set_organisation_member_status_command(uuid, uuid, text) from public, anon;
grant execute on function public.set_organisation_member_status_command(uuid, uuid, text) to authenticated;

/**
 * Invite somebody.
 *
 * ⚠️ THE PLATFORM SENDS NO EMAIL OF ITS OWN, so the invitation carries a token and the inviter is shown the link to
 * pass on. That is stated on the page rather than implied by a form that would post into a void — the same honesty the
 * sign-up page applies when it says no mail is sent.
 *
 * ⚠️ THE TOKEN IS STORED HASHED, and acceptance checks the signed-in account's email against the invitation's. An
 * invitation is not a password and never becomes one.
 */
create or replace function public.invite_organisation_member_command(
  p_organisation_id uuid,
  p_email text,
  p_role text,
  p_scope_location_ids uuid[] default '{}'::uuid[],
  p_token_hash text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  email_norm text := lower(btrim(coalesce(p_email, '')));
  scope uuid[] := coalesce(p_scope_location_ids, '{}'::uuid[]);
  invite_id uuid;
  location uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator invites a member' using errcode = '42501'; end if;
  if position('@' in email_norm) < 2 then raise exception 'a valid email is required' using errcode = '22023'; end if;
  if p_role not in ('owner','admin','project_manager','finance_approver','provider_team_member','member') then
    raise exception 'invalid member role' using errcode = '22023';
  end if;
  if p_token_hash is null or char_length(p_token_hash) < 32 then
    raise exception 'an invitation token is required' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'an invitation needs a future expiry' using errcode = '22023';
  end if;
  if p_expires_at > now() + interval '30 days' then
    raise exception 'an invitation can last at most 30 days' using errcode = '22023';
  end if;
  foreach location in array scope loop
    if not exists (
      select 1 from public.organisation_locations l
      where l.organisation_id = p_organisation_id and l.location_id = location
    ) then
      raise exception 'that site is not one of this organisation''s' using errcode = '22023';
    end if;
  end loop;

  -- One live invitation per address: a second is a resend, and the resend path replaces this row's token instead.
  update public.organisation_invitations
     set status = 'revoked'
   where organisation_id = p_organisation_id and email_normalized = email_norm and status = 'pending';

  insert into public.organisation_invitations(
    organisation_id, email_normalized, role, scope_location_ids, token_hash, invited_by_account_id, expires_at
  ) values (
    p_organisation_id, email_norm, p_role::public.organisation_member_role, scope, p_token_hash,
    app_private.current_account_id(), p_expires_at
  ) returning id into invite_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_MEMBER_INVITED', 'organisation', p_organisation_id, 'member_invitation', 'organisation_confidential',
          jsonb_build_object('invitation_id', invite_id, 'role', p_role, 'scopes', array_length(scope, 1)));

  return invite_id;
end $$;

revoke all on function public.invite_organisation_member_command(uuid, text, text, uuid[], text, timestamptz) from public, anon;
grant execute on function public.invite_organisation_member_command(uuid, text, text, uuid[], text, timestamptz) to authenticated;

/** Accept an invitation. The signed-in account's own email must match it — the same rule the platform invitations use. */
create or replace function public.accept_organisation_invitation_command(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  invite public.organisation_invitations%rowtype;
  acct uuid := app_private.current_account_id();
  email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into invite from public.organisation_invitations where token_hash = p_token_hash and status = 'pending' for update;
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  if invite.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = invite.id;
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  if email = '' or email <> invite.email_normalized then
    raise exception 'the invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.organisation_members(organisation_id, account_id, role, status, scope_location_ids)
  values (invite.organisation_id, acct, invite.role, 'active', invite.scope_location_ids)
  on conflict (organisation_id, account_id) do update
    set role = excluded.role,
        status = 'active',
        suspended_at = null,
        scope_location_ids = excluded.scope_location_ids,
        removed_at = null;

  update public.organisation_invitations
     set status = 'accepted', accepted_by_account_id = acct, accepted_at = now()
   where id = invite.id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_INVITATION_ACCEPTED', 'organisation', invite.organisation_id, 'member_invitation', 'organisation_confidential',
          jsonb_build_object('invitation_id', invite.id, 'role', invite.role));

  return invite.organisation_id;
end $$;

revoke all on function public.accept_organisation_invitation_command(text) from public, anon;
grant execute on function public.accept_organisation_invitation_command(text) to authenticated;

create or replace function public.update_organisation_location_command(
  p_organisation_id uuid,
  p_location_row_id uuid,
  p_label text,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_locality text default null,
  p_region text default null,
  p_postal_code text default null,
  p_country_code text default null,
  p_timezone text default null,
  p_site_manager_name text default null,
  p_site_manager_phone text default null,
  p_access_notes text default null,
  p_safety_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator edits a site' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.organisation_locations l
    where l.id = p_location_row_id and l.organisation_id = p_organisation_id
  ) then
    raise exception 'that site is not this organisation''s' using errcode = '22023';
  end if;
  if p_country_code is not null and btrim(p_country_code) <> '' and upper(btrim(p_country_code)) !~ '^[A-Z]{2}$' then
    raise exception 'a country code is two letters' using errcode = '22023';
  end if;

  update public.organisation_locations
     set label = nullif(btrim(coalesce(p_label, '')), ''),
         address_line1 = nullif(btrim(coalesce(p_address_line1, '')), ''),
         address_line2 = nullif(btrim(coalesce(p_address_line2, '')), ''),
         locality = nullif(btrim(coalesce(p_locality, '')), ''),
         region = nullif(btrim(coalesce(p_region, '')), ''),
         postal_code = nullif(btrim(coalesce(p_postal_code, '')), ''),
         country_code = nullif(upper(btrim(coalesce(p_country_code, ''))), ''),
         timezone = nullif(btrim(coalesce(p_timezone, '')), ''),
         site_manager_name = nullif(btrim(coalesce(p_site_manager_name, '')), ''),
         site_manager_phone = nullif(btrim(coalesce(p_site_manager_phone, '')), ''),
         access_notes = nullif(btrim(coalesce(p_access_notes, '')), ''),
         safety_notes = nullif(btrim(coalesce(p_safety_notes, '')), '')
   where id = p_location_row_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_LOCATION_UPDATED', 'organisation', p_organisation_id, 'organisation_confidential',
          jsonb_build_object('location_row_id', p_location_row_id));
end $$;

revoke all on function public.update_organisation_location_command(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_organisation_location_command(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

/** Archive a site. Archived sites stay in the directory and stop being offered as a scope for new work. */
create or replace function public.set_organisation_location_archived_command(
  p_organisation_id uuid,
  p_location_row_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator archives a site' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.organisation_locations l
    where l.id = p_location_row_id and l.organisation_id = p_organisation_id
  ) then
    raise exception 'that site is not this organisation''s' using errcode = '22023';
  end if;
  if p_archived and exists (
    select 1 from public.requests r
    join public.organisation_locations l on l.location_id = r.location_id
    where l.id = p_location_row_id and r.state in ('accepted','scheduled','in_progress','submitted_for_approval')
  ) then
    raise exception 'a site with work in progress cannot be archived' using errcode = '22023';
  end if;

  update public.organisation_locations
     set archived_at = case when p_archived then now() else null end
   where id = p_location_row_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', case when p_archived then 'ORGANISATION_LOCATION_ARCHIVED' else 'ORGANISATION_LOCATION_RESTORED' end,
          'organisation', p_organisation_id, 'site_lifecycle', 'organisation_confidential',
          jsonb_build_object('location_row_id', p_location_row_id));
end $$;

revoke all on function public.set_organisation_location_archived_command(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_organisation_location_archived_command(uuid, uuid, boolean) to authenticated;

/**
 * Add a provider to the organisation's directory.
 *
 * ⚠️ THE VERIFICATION STATE IS RECORDED AS IT WAS, and the command refuses nothing on that basis: adding a provider
 * you have not vetted is the organisation's decision, and refusing would imply the platform vets the relationship.
 * What it does is store what the platform saw at the time, so the entry cannot later read as though the provider was
 * verified when they were chosen.
 *
 * ⚠️ A PREFERENCE BYPASSES NOTHING. Matching reads the provider's own services, areas, readiness and identity; this
 * table is not consulted by it at all. The page says so, because "preferred" is a word that sounds like a permission.
 */
create or replace function public.add_preferred_provider_command(
  p_organisation_id uuid,
  p_provider_id uuid,
  p_status text default 'preferred',
  p_contract_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  provider public.providers%rowtype;
  preference_id uuid;
  identity_verified boolean;
  credential_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator manages preferences' using errcode = '42501'; end if;
  if p_status not in ('preferred','contract','watch') then
    raise exception 'invalid preference status' using errcode = '22023';
  end if;
  select * into provider from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;

  select exists (
    select 1 from public.provider_verifications v
    where v.provider_id = p_provider_id and v.kind = 'identity' and v.status = 'verified'
      and (v.expires_at is null or v.expires_at > now())
  ) into identity_verified;
  select count(*)::integer into credential_count
  from public.provider_credentials c
  where c.provider_id = p_provider_id and c.status = 'verified' and (c.expires_at is null or c.expires_at >= current_date);

  insert into public.organisation_preferred_providers(
    organisation_id, provider_id, status, contract_reference, note, verification_at_add, added_by_account_id
  ) values (
    p_organisation_id, p_provider_id, p_status,
    nullif(btrim(coalesce(p_contract_reference, '')), ''), nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object(
      'identity_verified', identity_verified,
      'verified_credentials', credential_count,
      'provider_status', provider.status::text,
      'captured_at', now()
    ),
    app_private.current_account_id()
  )
  on conflict (organisation_id, provider_id) do update
    set status = excluded.status,
        contract_reference = excluded.contract_reference,
        note = excluded.note,
        added_by_account_id = excluded.added_by_account_id
  returning id into preference_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_PREFERRED_PROVIDER_SET', 'organisation', p_organisation_id, 'provider_preference', 'organisation_confidential',
          jsonb_build_object('provider_id', p_provider_id, 'status', p_status, 'identity_verified', identity_verified));

  return preference_id;
end $$;

revoke all on function public.add_preferred_provider_command(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.add_preferred_provider_command(uuid, uuid, text, text, text) to authenticated;

create or replace function public.remove_preferred_provider_command(p_organisation_id uuid, p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role <> 'admin' then raise exception 'only an owner or administrator manages preferences' using errcode = '42501'; end if;
  delete from public.organisation_preferred_providers
   where organisation_id = p_organisation_id and provider_id = p_provider_id;
  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, reason_code, data_classification, metadata)
  values (auth.uid(), 'account', 'ORGANISATION_PREFERRED_PROVIDER_REMOVED', 'organisation', p_organisation_id, 'provider_preference', 'organisation_confidential',
          jsonb_build_object('provider_id', p_provider_id));
end $$;

revoke all on function public.remove_preferred_provider_command(uuid, uuid) from public, anon;
grant execute on function public.remove_preferred_provider_command(uuid, uuid) to authenticated;

/**
 * Members, invitations, sites and preferences in one document.
 *
 * ⚠️ LAST ACTIVITY COMES FROM THE AUDIT LOG. `audit_events.actor_user_id` is an auth user id, so a member's most
 * recent recorded action is a row that already exists; where there is none the page says "no recorded activity"
 * rather than showing a date the platform made up.
 */
create or replace function public.get_organisation_directory_command(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  role text := app_private.organisation_role_for(p_organisation_id);
  members jsonb := '[]'::jsonb;
  invitations jsonb := '[]'::jsonb;
  locations jsonb := '[]'::jsonb;
  providers jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if role is null then return jsonb_build_object('allowed', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', m.account_id,
           'name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = m.account_id limit 1), 'A member'),
           'role', m.role::text,
           'status', m.status,
           'scope_location_ids', m.scope_location_ids,
           'scope_names', (
             select coalesce(jsonb_agg(lc.display_name), '[]'::jsonb)
             from public.organisation_locations l
             join public.public_location_catalog lc on lc.location_id = l.location_id
             where l.organisation_id = m.organisation_id and l.location_id = any(m.scope_location_ids)
           ),
           'scope_note', m.scope_note,
           'joined_at', m.joined_at,
           'suspended_at', m.suspended_at,
           'last_activity_at', (
             select max(e.occurred_at)
             from public.audit_events e
             join public.accounts a on a.auth_user_id = e.actor_user_id
             where a.id = m.account_id
           )
         ) order by m.joined_at), '[]'::jsonb)
    into members
    from public.organisation_members m
   where m.organisation_id = p_organisation_id and m.removed_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'email', i.email_normalized,
           'role', i.role::text,
           'status', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
           'scope_location_ids', i.scope_location_ids,
           'expires_at', i.expires_at,
           'created_at', i.created_at,
           'invited_by_name', coalesce((select pr.display_name from public.profiles pr where pr.account_id = i.invited_by_account_id limit 1), 'A member')
         ) order by i.created_at desc), '[]'::jsonb)
    into invitations
    from public.organisation_invitations i
   where i.organisation_id = p_organisation_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'location_id', l.location_id,
           'name', coalesce(l.label, lc.display_name),
           'area_name', lc.display_name,
           'kind', l.kind,
           'is_primary', l.is_primary,
           'archived', l.archived_at is not null,
           'address_line1', l.address_line1,
           'address_line2', l.address_line2,
           'locality', l.locality,
           'region', l.region,
           'postal_code', l.postal_code,
           'country_code', l.country_code,
           'timezone', l.timezone,
           'site_manager_name', l.site_manager_name,
           'site_manager_phone', l.site_manager_phone,
           'access_notes', l.access_notes,
           'safety_notes', l.safety_notes,
           'active_projects', (
             select count(*)::integer from public.requests r
             where r.organisation_id = p_organisation_id and r.location_id = l.location_id
               and r.state in ('accepted','scheduled','in_progress','submitted_for_approval')
           ),
           'total_projects', (
             select count(*)::integer from public.requests r
             where r.organisation_id = p_organisation_id and r.location_id = l.location_id
           )
         ) order by l.archived_at nulls first, lc.display_name), '[]'::jsonb)
    into locations
    from public.organisation_locations l
    join public.public_location_catalog lc on lc.location_id = l.location_id
   where l.organisation_id = p_organisation_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pref.id,
           'provider_id', pref.provider_id,
           'name', p.display_name,
           'status', pref.status,
           'contract_reference', pref.contract_reference,
           'note', pref.note,
           'added_at', pref.created_at,
           'verification_at_add', pref.verification_at_add,
           'identity_verified', exists (
             select 1 from public.provider_verifications v
             where v.provider_id = pref.provider_id and v.kind = 'identity' and v.status = 'verified'
               and (v.expires_at is null or v.expires_at > now())
           ),
           'verified_credentials', (
             select count(*)::integer from public.provider_credentials c
             where c.provider_id = pref.provider_id and c.status = 'verified'
               and (c.expires_at is null or c.expires_at >= current_date)
           ),
           'provider_status', p.status::text,
           'readiness_score', (select pp.readiness_score from public.provider_public_profiles pp where pp.provider_id = p.id),
           'services', (
             select coalesce(jsonb_agg(sc.display_name order by sc.display_name), '[]'::jsonb)
             from public.provider_services ps
             join public.public_service_catalog sc on sc.service_entity_id = ps.service_entity_id
             where ps.provider_id = p.id and ps.is_active
           ),
           'areas', (
             select coalesce(jsonb_agg(lc.display_name order by lc.display_name), '[]'::jsonb)
             from public.provider_service_areas pa
             join public.public_location_catalog lc on lc.location_id = pa.location_id
             where pa.provider_id = p.id and pa.is_active
           ),
           'jobs_for_us', (
             select count(*)::integer from public.assignments a
             join public.requests r on r.id = a.request_id
             where a.provider_id = p.id and r.organisation_id = p_organisation_id
           )
         ) order by p.display_name), '[]'::jsonb)
    into providers
    from public.organisation_preferred_providers pref
    join public.providers p on p.id = pref.provider_id
   where pref.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'members', members,
    'invitations', invitations,
    'locations', locations,
    'providers', providers
  );
end $$;

revoke all on function public.get_organisation_directory_command(uuid) from public, anon;
grant execute on function public.get_organisation_directory_command(uuid) to authenticated;

comment on function public.get_organisation_directory_command(uuid) is
  'The organisation directory: members with role, site scope and recorded activity, invitations, sites with their project counts, and preferred providers with their live verification state.';
