-- Provider profile detail, credentials, portfolio and field progress.
--
-- The storage behind the provider workspace's Profile editor, Verification centre, Credentials
-- manager and the quick status buttons on /provider. Every table here answers one product question
-- — "what does the provider say about their own business, and can they prove it?" — and every one of
-- them is written only by the account that owns the provider. Keeping them in one migration means
-- one reviewable definition of that ownership rule instead of four copies of it.
--
-- ── WHAT IS PUBLIC AND WHAT IS NOT ─────────────────────────────────────────────────────────────
--
-- This is the classification the Profile editor has to enforce, decided here rather than in the UI,
-- because a field that is public in the database cannot be made private by a component.
--
--   PUBLIC    the columns provider_public_profiles already had, plus operating hours, languages and
--             a coverage RADIUS. A radius is a distance and not a place: "I travel about 25km from
--             my base" cannot be reverse-engineered into an address the platform never held.
--
--   PRIVATE   credentials in full. A licence number, an issuing body and an expiry date are read by
--             the owner and by a platform reviewer; the public projection exposes a COUNT of
--             verified ones and nothing else. Publishing "Lagos State Electrician Licence #A-1123"
--             puts a document number on a public page, and that is the detail impersonation is
--             built from.
--
--   PRIVATE   portfolio items, each carrying its own `is_public` flag. The provider decides whether
--             a job is shown; the projection reads only the public ones, and only caption and link.
--
-- ⚠️ `document_reference` IS A REFERENCE, NOT A FILE. No storage bucket is wired up in this project
-- — the assignment evidence form passes `storage_object_path` as null for the same reason — so an
-- upload is recorded as the reference the provider supplies (a scan reference, a registry URL, a
-- document number) and the UI says so, rather than rendering a file control that would discard the
-- file. When storage is connected this column becomes the object path and nothing else changes.

-- ── 1. Profile detail the provider can publish ────────────────────────────────────────────────

alter table public.provider_public_profiles
  add column if not exists operating_hours jsonb not null default '{}'::jsonb,
  add column if not exists languages text[] not null default '{}'::text[],
  add column if not exists coverage_radius_km integer;

alter table public.provider_public_profiles
  add constraint provider_public_profiles_coverage_radius_check
  check (coverage_radius_km is null or coverage_radius_km between 1 and 500);

comment on column public.provider_public_profiles.coverage_radius_km is
  'Approximate travel radius in kilometres. Deliberately a distance: the platform holds no street address to publish.';

-- ── 2. Credentials ────────────────────────────────────────────────────────────────────────────

create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  credential_type text not null check (credential_type in ('licence','certification','insurance','trade_registration','other')),
  issuing_body text not null check (char_length(btrim(issuing_body)) between 2 and 160),
  jurisdiction_code text,
  reference_label text,
  expires_at date,
  -- The service categories this credential covers. Empty means "the whole business", which is how
  -- most trade licences work and is not the same as "no services".
  service_entity_ids uuid[] not null default '{}'::uuid[],
  document_reference text,
  status public.verification_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per credential: re-uploading a renewal updates it rather than filing a second copy that
  -- would then disagree with the first about the expiry date.
  unique (provider_id, credential_type, issuing_body)
);

create index provider_credentials_provider_idx on public.provider_credentials(provider_id, status);
create index provider_credentials_expiry_idx on public.provider_credentials(expires_at) where expires_at is not null;

alter table public.provider_credentials enable row level security;

create policy provider_credentials_owner_read on public.provider_credentials for select to authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_id
      and (p.owner_account_id = app_private.current_account_id()
           or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
  )
);

create policy provider_credentials_reviewer_read on public.provider_credentials for select to authenticated
using (app_private.current_account_has_platform_capability('platform.verification.review'));

revoke all on public.provider_credentials from anon;
revoke insert, update, delete on public.provider_credentials from authenticated;
grant select on public.provider_credentials to authenticated;

comment on table public.provider_credentials is
  'Licences, certifications and insurance the provider holds. Private to the owner and to platform verification reviewers.';

-- ── 3. Portfolio (proof of work the provider chooses to show) ─────────────────────────────────

create table public.provider_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(btrim(description)) between 10 and 600),
  link_url text,
  service_entity_id uuid references public.taxonomy_entities(id),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index provider_portfolio_provider_idx on public.provider_portfolio_items(provider_id, is_public, created_at desc);

alter table public.provider_portfolio_items enable row level security;

create policy provider_portfolio_owner_read on public.provider_portfolio_items for select to authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_id
      and (p.owner_account_id = app_private.current_account_id()
           or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
  )
);

revoke all on public.provider_portfolio_items from anon;
revoke insert, update, delete on public.provider_portfolio_items from authenticated;
grant select on public.provider_portfolio_items to authenticated;

-- ── 4. Field progress (the quick status buttons) ──────────────────────────────────────────────
--
-- "On my way", "Arrived at site" and "Job started" are operational checkpoints, not work states:
-- `requests.state` stays authoritative and only `start_assignment_command` may move it, because that
-- is the transition with a payment gate in front of it. This table records what the provider told
-- the platform on the day, so the workspace can show a job's current field status and so the
-- schedule is not the only evidence that somebody turned up.
--
-- ONE ROW PER ASSIGNMENT, upserted: a job has a current field status, not a history of taps. The
-- audit trail of the taps is in audit_events.

create type public.field_progress_state as enum ('en_route','on_site','work_started');

create table public.assignment_field_progress (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  state public.field_progress_state not null,
  recorded_by_account_id uuid not null references public.accounts(id),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignment_field_progress_provider_idx on public.assignment_field_progress(provider_id, state);

alter table public.assignment_field_progress enable row level security;

-- The provider's own record. A customer is not shown this yet: nothing on the customer side renders
-- it, and a policy nobody reads is a policy nobody notices is wrong. Widen this when the booking page
-- starts showing "your provider is on the way".
create policy assignment_field_progress_owner_read on public.assignment_field_progress for select to authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_id
      and (p.owner_account_id = app_private.current_account_id()
           or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
  )
);

revoke all on public.assignment_field_progress from anon;
revoke insert, update, delete on public.assignment_field_progress from authenticated;
grant select on public.assignment_field_progress to authenticated;

-- ── 5. Commands ───────────────────────────────────────────────────────────────────────────────

/**
 * Availability, as a one-column write.
 *
 * ⚠️ IT DOES NOT GO THROUGH update_provider_profile_command, and that is the whole reason it exists.
 * That command requires an 80-character public description because it is the profile editor's save;
 * routing "go offline" through it would mean a provider who has not written their description cannot
 * stop receiving work — a security-adjacent outcome produced by a validation rule that has nothing
 * to do with availability.
 */
create or replace function public.set_my_provider_availability_command(p_provider_id uuid, p_accepts_new_work boolean)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  updated integer;
  result boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.provider_public_profiles
     set accepts_new_work = coalesce(p_accepts_new_work, accepts_new_work),
         updated_at = now()
   where provider_id = p_provider_id;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'public profile required' using errcode = 'P0002'; end if;

  -- The stored value is returned rather than the argument: a caller that passed null asked for no
  -- change, and telling it "false" would describe a state the row is not in.
  select accepts_new_work into result from public.provider_public_profiles where provider_id = p_provider_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_AVAILABILITY_CHANGED', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('accepts_new_work', result));

  return coalesce(result, false);
end $$;

revoke all on function public.set_my_provider_availability_command(uuid, boolean) from public, anon;
grant execute on function public.set_my_provider_availability_command(uuid, boolean) to authenticated;

/** The profile editor's second half: the fields that are not the description. */
create or replace function public.update_my_provider_profile_detail_command(
  p_provider_id uuid,
  p_operating_hours jsonb,
  p_languages text[],
  p_coverage_radius_km integer
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  hours jsonb := coalesce(p_operating_hours, '{}'::jsonb);
  langs text[] := coalesce(p_languages, '{}'::text[]);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if jsonb_typeof(hours) <> 'object' then
    raise exception 'operating hours must be an object keyed by weekday' using errcode = '22023';
  end if;
  -- `window` is a reserved word in Postgres, so the alias is spelled out rather than quoted.
  if exists (
    select 1 from jsonb_each(hours) as e(day, hours_window)
    where e.day not in ('mon','tue','wed','thu','fri','sat','sun')
       or jsonb_typeof(e.hours_window) not in ('null','object')
       or (jsonb_typeof(e.hours_window) = 'object' and (
             (e.hours_window ->> 'open') is null
             or (e.hours_window ->> 'close') is null
             or (e.hours_window ->> 'open') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
             or (e.hours_window ->> 'close') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           ))
  ) then
    raise exception 'operating hours are not valid' using errcode = '22023';
  end if;

  if array_length(langs, 1) > 12 then
    raise exception 'too many languages' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(langs) as l where char_length(btrim(l)) not between 2 and 40) then
    raise exception 'a language name is not valid' using errcode = '22023';
  end if;

  if p_coverage_radius_km is not null and (p_coverage_radius_km < 1 or p_coverage_radius_km > 500) then
    raise exception 'coverage radius is out of range' using errcode = '22023';
  end if;

  update public.provider_public_profiles
     set operating_hours = hours,
         languages = (select coalesce(array_agg(btrim(l) order by btrim(l)), '{}'::text[]) from unnest(langs) as l where btrim(l) <> ''),
         coverage_radius_km = p_coverage_radius_km,
         updated_at = now()
   where provider_id = p_provider_id;

  perform app_private.compute_provider_search_readiness(p_provider_id);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_PROFILE_DETAIL_UPDATED', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('languages', array_length(langs, 1), 'coverage_radius_km', p_coverage_radius_km));
end $$;

revoke all on function public.update_my_provider_profile_detail_command(uuid, jsonb, text[], integer) from public, anon;
grant execute on function public.update_my_provider_profile_detail_command(uuid, jsonb, text[], integer) to authenticated;

/**
 * Add a credential, or replace the document on one already on file.
 *
 * ONE COMMAND FOR BOTH because the two are the same write with a different `p_credential_id`: a
 * renewal is the credential's document and expiry changing, and giving it its own command would mean
 * two places that decide what a valid expiry date is.
 *
 * ⚠️ A RE-UPLOAD RESETS THE REVIEW. A verified credential whose document has just been replaced is
 * not verified any more — the thing that was verified is gone. The status goes back to 'pending'
 * (or 'expired' when the new expiry is already past) so a stale badge cannot outlive its evidence.
 */
create or replace function public.save_my_provider_credential_command(
  p_provider_id uuid,
  p_credential_id uuid,
  p_credential_type text,
  p_issuing_body text,
  p_jurisdiction_code text,
  p_reference_label text,
  p_expires_at date,
  p_service_entity_ids uuid[],
  p_document_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  credential_id uuid;
  next_status public.verification_status;
  body text := btrim(coalesce(p_issuing_body, ''));
  services uuid[] := coalesce(p_service_entity_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_credential_type not in ('licence','certification','insurance','trade_registration','other') then
    raise exception 'invalid credential type' using errcode = '22023';
  end if;
  if char_length(body) < 2 then
    raise exception 'issuing body is required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(services) as s where not exists (select 1 from public.taxonomy_entities t where t.id = s and t.kind = 'service')) then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  -- An expiry in the past is written, not refused: a provider whose licence lapsed yesterday is
  -- exactly who needs to record it, and refusing the row would leave them with a credential that the
  -- platform believes is still valid.
  next_status := case when p_expires_at is not null and p_expires_at < current_date then 'expired' else 'pending' end;

  if p_credential_id is null then
    insert into public.provider_credentials(
      provider_id, credential_type, issuing_body, jurisdiction_code, reference_label, expires_at,
      service_entity_ids, document_reference, status, submitted_at, reviewed_at, review_note, updated_at
    ) values (
      p_provider_id, p_credential_type, body,
      nullif(btrim(coalesce(p_jurisdiction_code, '')), ''),
      nullif(btrim(coalesce(p_reference_label, '')), ''),
      p_expires_at, services,
      nullif(btrim(coalesce(p_document_reference, '')), ''),
      next_status, now(), null, null, now()
    ) returning id into credential_id;
  else
    update public.provider_credentials
       set credential_type = p_credential_type,
           issuing_body = body,
           jurisdiction_code = nullif(btrim(coalesce(p_jurisdiction_code, '')), ''),
           reference_label = nullif(btrim(coalesce(p_reference_label, '')), ''),
           expires_at = p_expires_at,
           service_entity_ids = services,
           document_reference = nullif(btrim(coalesce(p_document_reference, '')), ''),
           status = next_status,
           submitted_at = now(),
           reviewed_at = null,
           review_note = null,
           updated_at = now()
     where id = p_credential_id and provider_id = p_provider_id
    returning id into credential_id;

    if credential_id is null then
      raise exception 'credential not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_CREDENTIAL_SAVED', 'provider_credential', credential_id, 'regulated_sensitive',
          jsonb_build_object('provider_id', p_provider_id, 'credential_type', p_credential_type, 'renewal', p_credential_id is not null));

  perform app_private.compute_provider_search_readiness(p_provider_id);
  return credential_id;
end $$;

revoke all on function public.save_my_provider_credential_command(uuid, uuid, text, text, text, text, date, uuid[], text) from public, anon;
grant execute on function public.save_my_provider_credential_command(uuid, uuid, text, text, text, text, date, uuid[], text) to authenticated;

create or replace function public.add_my_provider_portfolio_item_command(
  p_provider_id uuid,
  p_title text,
  p_description text,
  p_link_url text,
  p_service_entity_id uuid,
  p_is_public boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  item_id uuid;
  link text := nullif(btrim(coalesce(p_link_url, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if link is not null and link !~ '^https://' then
    raise exception 'portfolio links must use https' using errcode = '22023';
  end if;
  if p_service_entity_id is not null and not exists (select 1 from public.taxonomy_entities t where t.id = p_service_entity_id and t.kind = 'service') then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  insert into public.provider_portfolio_items(provider_id, title, description, link_url, service_entity_id, is_public)
  values (
    p_provider_id,
    btrim(coalesce(p_title, '')),
    nullif(btrim(coalesce(p_description, '')), ''),
    link,
    p_service_entity_id,
    coalesce(p_is_public, true)
  ) returning id into item_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_PORTFOLIO_ITEM_ADDED', 'provider_portfolio_item', item_id, 'participant_private',
          jsonb_build_object('provider_id', p_provider_id, 'is_public', coalesce(p_is_public, true)));

  return item_id;
end $$;

revoke all on function public.add_my_provider_portfolio_item_command(uuid, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.add_my_provider_portfolio_item_command(uuid, text, text, text, uuid, boolean) to authenticated;

create or replace function public.remove_my_provider_portfolio_item_command(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  item public.provider_portfolio_items%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into item from public.provider_portfolio_items where id = p_item_id;
  if not found then raise exception 'portfolio item not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.providers p
    where p.id = item.provider_id
      and (p.owner_account_id = acct or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.provider_portfolio_items where id = p_item_id;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_PORTFOLIO_ITEM_REMOVED', 'provider_portfolio_item', p_item_id, 'participant_private',
          jsonb_build_object('provider_id', item.provider_id));
end $$;

revoke all on function public.remove_my_provider_portfolio_item_command(uuid) from public, anon;
grant execute on function public.remove_my_provider_portfolio_item_command(uuid) to authenticated;

/**
 * Re-submit a verification that was rejected, expired, or is still waiting on a document.
 *
 * ⚠️ IT RESETS THE REVIEW RATHER THAN INSERTING A SECOND ROW, and there are two reasons. The obvious
 * one is `unique(provider_id, kind, jurisdiction_code)`: a second submission of the same kind in the
 * same jurisdiction is a constraint violation, which would have surfaced to the provider as a raw
 * database error on a form they filled in honestly. The second is the one that matters more: a
 * verification is a claim about the provider NOW, and two live rows for one kind would let a
 * reviewer approve one while the page showed the other.
 *
 * The document reference is the provider's own pointer to the evidence (a scan reference, a registry
 * URL, a document number). See the note at the top of this migration for why it is not a file.
 */
create or replace function public.resubmit_my_verification_command(
  p_verification_id uuid,
  p_reference_label text,
  p_document_reference text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  v public.provider_verifications%rowtype;
  prov public.providers%rowtype;
  reference text := nullif(btrim(coalesce(p_document_reference, '')), '');
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;

  select * into v from public.provider_verifications where id = p_verification_id;
  if not found then raise exception 'verification not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = v.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- A verified or in-review claim is not re-submittable through this path: the first would discard a
  -- decision somebody made, and the second would replace evidence a reviewer is currently reading.
  if v.status not in ('rejected','expired') then
    raise exception 'verification cannot be resubmitted from its current status' using errcode = '22023';
  end if;
  if reference is null then
    raise exception 'a document reference is required' using errcode = '22023';
  end if;
  if char_length(reference) > 300 then
    raise exception 'document reference is too long' using errcode = '22023';
  end if;

  update public.provider_verifications
     set status = 'pending',
         reference_label = nullif(btrim(coalesce(p_reference_label, '')), ''),
         reviewed_at = null,
         verified_at = null,
         metadata = (coalesce(metadata, '{}'::jsonb) - 'review_note')
                    || jsonb_build_object('document_reference', reference, 'document_attached_at', now()),
         updated_at = now()
   where id = p_verification_id;

  perform app_private.refresh_provider_onboarding(v.provider_id);
  perform app_private.compute_provider_search_readiness(v.provider_id);

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'VERIFICATION_RESUBMITTED', 'provider_verification', p_verification_id, 'regulated_sensitive',
          jsonb_build_object('provider_id', v.provider_id, 'kind', v.kind));
end $$;

revoke all on function public.resubmit_my_verification_command(uuid, text, text) from public, anon;
grant execute on function public.resubmit_my_verification_command(uuid, text, text) to authenticated;

/**
 * Withdraw a service, or an area, without deleting the row.
 *
 * ⚠️ DEACTIVATES RATHER THAN DELETES, and that is the same choice the schema already makes: the row
 * is what an old quote was written against, and deleting it would leave quotes and matching rows
 * pointing at a service the provider no longer offers. `is_active = false` is the state the
 * readiness and matching rules already read.
 *
 * ⚠️ IT CAN WITHDRAW THE LAST SERVICE, which makes the provider un-matchable and un-publishable.
 * That is refused nowhere here for a reason: a provider who has stopped offering a trade must be
 * able to say so, and the workspace then shows the publication checklist telling them what changed.
 * The confirm copy in the UI is where the consequence is stated.
 */
create or replace function public.deactivate_my_provider_service_command(p_provider_id uuid, p_service_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  updated integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.provider_services
     set is_active = false, is_primary = false
   where provider_id = p_provider_id and service_entity_id = p_service_entity_id and is_active;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'service is not active on this provider' using errcode = 'P0002'; end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_SERVICE_WITHDRAWN', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('service_entity_id', p_service_entity_id));

  perform app_private.refresh_provider_onboarding(p_provider_id);
  perform app_private.compute_provider_search_readiness(p_provider_id);
end $$;

revoke all on function public.deactivate_my_provider_service_command(uuid, uuid) from public, anon;
grant execute on function public.deactivate_my_provider_service_command(uuid, uuid) to authenticated;

create or replace function public.deactivate_my_provider_service_area_command(p_provider_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  prov public.providers%rowtype;
  updated integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  select * into prov from public.providers where id = p_provider_id;
  if not found then raise exception 'provider not found' using errcode = 'P0002'; end if;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.provider_service_areas
     set is_active = false, is_primary = false
   where provider_id = p_provider_id and location_id = p_location_id and is_active;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'area is not active on this provider' using errcode = 'P0002'; end if;

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_SERVICE_AREA_WITHDRAWN', 'provider', p_provider_id, 'participant_private',
          jsonb_build_object('location_id', p_location_id));

  perform app_private.refresh_provider_onboarding(p_provider_id);
  perform app_private.compute_provider_search_readiness(p_provider_id);
end $$;

revoke all on function public.deactivate_my_provider_service_area_command(uuid, uuid) from public, anon;
grant execute on function public.deactivate_my_provider_service_area_command(uuid, uuid) to authenticated;

/**
 * The field checkpoint behind "On my way" / "Arrived at site" / "Job started".
 *
 * IT DELIBERATELY DOES NOT MOVE `requests.state`. Only start_assignment_command may do that, because
 * that transition sits behind the payment gate and this one must not become a second way through it.
 * A provider may record that they are on their way to a job whose payment has not landed yet — that
 * is simply true — and the job still cannot start.
 */
create or replace function public.record_assignment_field_progress_command(p_assignment_id uuid, p_state text)
returns text
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  acct uuid := app_private.current_account_id();
  a public.assignments%rowtype;
  prov public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if acct is null then raise exception 'active account required' using errcode = '28000'; end if;
  if p_state not in ('en_route','on_site','work_started') then
    raise exception 'invalid field progress state' using errcode = '22023';
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into prov from public.providers where id = a.provider_id;
  if not (prov.owner_account_id = acct or (prov.organisation_id is not null and app_private.is_active_org_member(prov.organisation_id))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if a.status <> 'active' then
    raise exception 'active assignment required' using errcode = '22023';
  end if;

  insert into public.assignment_field_progress(assignment_id, provider_id, state, recorded_by_account_id, recorded_at, updated_at)
  values (a.id, a.provider_id, p_state::public.field_progress_state, acct, now(), now())
  on conflict (assignment_id) do update
    set state = excluded.state,
        recorded_by_account_id = excluded.recorded_by_account_id,
        recorded_at = excluded.recorded_at,
        updated_at = now();

  insert into public.audit_events(actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'PROVIDER_FIELD_PROGRESS_RECORDED', 'assignment', a.id, 'participant_private',
          jsonb_build_object('provider_id', a.provider_id, 'state', p_state));

  return p_state;
end $$;

revoke all on function public.record_assignment_field_progress_command(uuid, text) from public, anon;
grant execute on function public.record_assignment_field_progress_command(uuid, text) to authenticated;

-- ── 6. The public projection, extended by the same allowlist ──────────────────────────────────
--
-- ⚠️ DROPPED AND RECREATED, because Postgres cannot change a function's return type in place and the
-- point of a projection is that it is one definition. `lib/providers/public-profile.ts` and the
-- provider workspace's own Preview page both read THIS command, so the preview cannot drift from
-- what a customer sees: they are the same query.
--
-- CREDENTIALS APPEAR AS A COUNT AND NOTHING ELSE. Issuing body, jurisdiction, reference and expiry
-- stay private; "3 verified credentials" is a trust signal, "Lagos State Licence #A-1123" is a
-- document number on a public page.

drop function if exists public.get_public_provider_profile_command(text);

create function public.get_public_provider_profile_command(p_slug text)
returns table(
  provider_id uuid,
  slug text,
  headline text,
  public_description text,
  years_experience smallint,
  accepts_new_work boolean,
  verification_summary jsonb,
  trust_score numeric,
  readiness_score numeric,
  service_entity_id uuid,
  service_name text,
  location_id uuid,
  location_name text,
  operating_hours jsonb,
  languages text[],
  coverage_radius_km integer,
  verified_credential_count integer,
  portfolio jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    pp.provider_id,
    pp.slug,
    pp.headline,
    pp.public_description,
    pp.years_experience,
    pp.accepts_new_work,
    pp.verification_summary,
    pp.trust_score,
    pp.readiness_score,
    ps.service_entity_id,
    sc.display_name as service_name,
    pa.location_id,
    lc.display_name as location_name,
    pp.operating_hours,
    pp.languages,
    pp.coverage_radius_km,
    (
      select count(*)::integer
      from public.provider_credentials c
      where c.provider_id = pp.provider_id
        and c.status = 'verified'
        and (c.expires_at is null or c.expires_at >= current_date)
    ) as verified_credential_count,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', i.id,
                   'title', i.title,
                   'description', i.description,
                   'link_url', i.link_url,
                   'service_name', psc.display_name
                 )
                 order by i.created_at desc
               )
        from public.provider_portfolio_items i
        left join public.public_service_catalog psc on psc.service_entity_id = i.service_entity_id
        where i.provider_id = pp.provider_id and i.is_public
      ),
      '[]'::jsonb
    ) as portfolio
  from public.provider_public_profiles pp
  join public.providers p on p.id = pp.provider_id and p.status = 'active'
  left join lateral (
    select s.service_entity_id
    from public.provider_services s
    where s.provider_id = pp.provider_id and s.is_active
    order by s.is_primary desc, s.created_at asc
    limit 1
  ) ps on true
  left join public.public_service_catalog sc on sc.service_entity_id = ps.service_entity_id
  left join lateral (
    select a.location_id
    from public.provider_service_areas a
    where a.provider_id = pp.provider_id and a.is_active
    order by a.is_primary desc, a.created_at asc
    limit 1
  ) pa on true
  left join public.public_location_catalog lc on lc.location_id = pa.location_id
  where pp.slug = p_slug
    and pp.is_public
    and pp.published_at is not null
  limit 1
$function$;

grant execute on function public.get_public_provider_profile_command(text) to anon, authenticated;

comment on function public.get_public_provider_profile_command(text) is
  'The allowlisted public view of one published provider. Read by the public profile page AND by the provider''s own Preview, so the two cannot disagree.';
