-- Identity: display name, language, timezone, avatar, and the verified contacts behind
-- /settings/profile.
--
-- ── THE SIGN-IN ADDRESS IS NOT OURS, AND IS NOT COPIED HERE ───────────────────────────────────
--
-- The address and number an account signs in with belong to the authentication provider
-- (`auth.users.email` / `auth.users.phone`, with their own `*_confirmed_at`). This migration reads
-- them through an allowlisted projection and never writes them: changing a sign-in address has to go
-- through the provider's own confirmation flow, and a second copy in a table of ours would be a value
-- that can disagree with the one that actually lets somebody in.
--
-- ── ADDITIONAL CONTACTS ARE OURS, AND ARE VERIFIED OR THEY ARE NOTHING ────────────────────────
--
-- `account_contact_methods` holds the addresses and numbers an account wants to be *reached* on —
-- an alert address that is not a sign-in identity, a number for a time-critical update. They start
-- `verified_at is null` and stay unusable until a code comes back. A code is stored as a bcrypt hash,
-- not a plain digest: a six-digit code has only a million possibilities, so a fast hash is a hash an
-- offline reader of the table can finish.
--
-- ── THE MESSAGE IS QUEUED, NOT SENT, AND THE PAGE IS TOLD WHICH ───────────────────────────────
--
-- Verification codes are written to `outbox_events`, the same queue every other outward message in
-- this platform uses. There is no SMTP or SMS transport configured in this deployment, so the page
-- reads the queue row back and reports whether anything has actually tried to deliver it — the same
-- honesty the admin operations page applies to its own outbox: "we queued it" and "you should have
-- received it" are different claims, and this platform can only make the first one.

create type public.contact_method_kind as enum ('email', 'phone');

-- ── 1. What the profile editor can offer ──────────────────────────────────────────────────────

create table public.supported_languages (
  code text primary key check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  label text not null,
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  is_active boolean not null default true
);

alter table public.supported_languages enable row level security;

-- Reference data with nothing personal in it: readable, not writable, through the Data API.
create policy supported_languages_public_read on public.supported_languages
  for select to anon, authenticated using (is_active);

insert into public.supported_languages (code, label, direction) values
  ('en', 'English', 'ltr'),
  ('en-GB', 'English (United Kingdom)', 'ltr'),
  ('fr', 'Français', 'ltr'),
  ('pt', 'Português', 'ltr'),
  ('es', 'Español', 'ltr'),
  ('ar', 'العربية', 'rtl'),
  ('ha', 'Hausa', 'ltr'),
  ('ig', 'Igbo', 'ltr'),
  ('yo', 'Yorùbá', 'ltr'),
  ('sw', 'Kiswahili', 'ltr')
on conflict (code) do update
  set label = excluded.label,
      direction = excluded.direction,
      is_active = true;

-- The avatar lives in object storage; the row records only which object is current and when it
-- changed, so the route that serves it can answer "is there one?" without a storage round trip.
alter table public.profiles
  add column if not exists avatar_object_path text,
  add column if not exists avatar_content_type text,
  add column if not exists avatar_updated_at timestamptz;

-- ── 2. Additional contacts ────────────────────────────────────────────────────────────────────

create table public.account_contact_methods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind public.contact_method_kind not null,
  -- As the account typed it, for display. `normalized_value` is what uniqueness and lookup use.
  value text not null check (char_length(btrim(value)) between 3 and 254),
  normalized_value text not null check (char_length(btrim(normalized_value)) between 3 and 254),
  is_primary boolean not null default false,
  verified_at timestamptz,
  verification_hash text,
  verification_sent_at timestamptz,
  verification_expires_at timestamptz,
  verification_attempts integer not null default 0 check (verification_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, kind, normalized_value),
  -- A pending row must carry everything the check needs, and a verified row must carry none of it.
  constraint account_contact_methods_pending_shape check (
    (verified_at is not null and verification_hash is null)
    or (verified_at is null and verification_hash is not null and verification_expires_at is not null)
  )
);

create index account_contact_methods_account_idx
  on public.account_contact_methods(account_id, kind, created_at);
-- One primary per kind per account. There is no "the" contact otherwise, and the page has to say
-- which address an account is reached on first.
create unique index account_contact_methods_one_primary_idx
  on public.account_contact_methods(account_id, kind) where is_primary;

alter table public.account_contact_methods enable row level security;

-- Denied directly. Every read and write goes through a command, so the ownership check and the
-- verification rules cannot be bypassed by a client that talks to the table instead of the page.
create policy account_contact_methods_deny_direct on public.account_contact_methods
  for all to authenticated using (false) with check (false);

comment on table public.account_contact_methods is
  'Addresses and numbers the account can be reached on that are not its sign-in identity. Unverified rows cannot be used and are pruned by the account, not by a timer.';

-- ── 3. The avatar bucket ──────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-avatars',
  'account-avatars',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One object per account, in a folder named by the account id, and only that account may touch it.
-- `public = false` means an avatar is unreachable without a signed request, even if the path leaks —
-- the profile route serves it from the owner's own session.
drop policy if exists account_avatars_objects_owner on storage.objects;
create policy account_avatars_objects_owner on storage.objects
  for all to authenticated
  using (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = app_private.current_account_id()::text
  )
  with check (
    bucket_id = 'account-avatars'
    and (storage.foldername(name))[1] = app_private.current_account_id()::text
  );

-- ── 4. Reads ──────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_identity_command()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  profile_row public.profiles%rowtype;
  auth_row record;
  contacts jsonb;
  workspaces jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if me is null then
    return jsonb_build_object('allowed', false);
  end if;

  select * into profile_row from public.profiles where account_id = me;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at, u.created_at
    into auth_row
    from auth.users u
   where u.id = auth.uid();

  -- The value is returned in full, not masked: this is the account's own data, behind its own
  -- session, and an edit form that cannot show you what you are editing is a guessing game. The mask
  -- exists for the places the platform speaks about a contact to somebody who is not its owner.
  select coalesce(jsonb_agg(entry order by (entry ->> 'createdAt')), '[]'::jsonb)
    into contacts
    from (
      select jsonb_build_object(
               'id', c.id,
               'kind', c.kind,
               'value', c.value,
               'maskedValue', case c.kind
                 when 'email' then app_private.mask_email(c.value)
                 else app_private.mask_phone(c.value)
               end,
               'isPrimary', c.is_primary,
               'verified', c.verified_at is not null,
               'verifiedAt', c.verified_at,
               'sentAt', c.verification_sent_at,
               'expiresAt', c.verification_expires_at,
               'attempts', c.verification_attempts,
               -- What actually happened to the queue row this code was written to. `attempts` and
               -- `published` are what let the page say "queued, nothing has tried to deliver it yet"
               -- instead of "check your inbox".
               'delivery', jsonb_build_object(
                 'published', coalesce(o.published_at is not null, false),
                 'attempts', coalesce(o.attempt_count, 0),
                 'failed', coalesce(o.attempt_count > 0 and o.published_at is null, false)
               ),
               'createdAt', c.created_at
             ) as entry
        from public.account_contact_methods c
        left join public.outbox_events o
               on o.idempotency_key = 'contact_verification:' || c.id
       where c.account_id = me
    ) listed;

  -- The role/workspace switcher. Nothing is stored: the list IS the set of places this account can
  -- act, derived from ownership and membership, which is the same set every other page authorises
  -- against.
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
    into workspaces
    from (
      select jsonb_build_object(
               'kind', 'personal',
               'id', me,
               'label', coalesce(nullif(btrim(profile_row.display_name), ''), 'Personal workspace'),
               'role', 'Customer',
               'href', '/work'
             ) as entry
      union all
      select jsonb_build_object(
               'kind', 'provider',
               'id', p.id,
               'label', p.display_name,
               'role', case when p.organisation_id is null then 'Owner' else 'Team member' end,
               'href', '/provider'
             )
        from public.providers p
       where p.status <> 'closed'
         and (p.owner_account_id = me
              or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id)))
      union all
      select jsonb_build_object(
               'kind', 'organisation',
               'id', o.id,
               'label', o.display_name,
               'role', initcap(replace(m.role::text, '_', ' ')),
               'href', '/org/' || o.id
             )
        from public.organisation_members m
        join public.organisations o on o.id = m.organisation_id
       where m.account_id = me and m.removed_at is null
    ) listed;

  return jsonb_build_object(
    'allowed', true,
    'profile', jsonb_build_object(
      'displayName', coalesce(profile_row.display_name, ''),
      'languageCode', coalesce(profile_row.preferred_language_code, 'en'),
      'timezone', coalesce(profile_row.timezone, 'UTC'),
      'hasAvatar', profile_row.avatar_object_path is not null,
      'avatarUpdatedAt', profile_row.avatar_updated_at
    ),
    'signInContact', jsonb_build_object(
      'email', auth_row.email,
      'emailVerified', auth_row.email_confirmed_at is not null,
      'phone', auth_row.phone,
      'phoneVerified', auth_row.phone_confirmed_at is not null,
      'memberSince', auth_row.created_at
    ),
    'contacts', contacts,
    'workspaces', workspaces,
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('code', l.code, 'label', l.label, 'direction', l.direction) order by l.label)
        from public.supported_languages l where l.is_active
    ), '[]'::jsonb),
    -- Straight from the database's own timezone database rather than a hand-written list that drifts
    -- every time a government changes its mind. Legacy aliases and the posix/, right/ and SystemV/
    -- duplicate trees are dropped; Etc/* is dropped because UTC and the classic fixed offsets are
    -- offered explicitly instead.
    'timezones', coalesce((
      select jsonb_agg(z.name order by z.name)
        from (
          select name from pg_timezone_names
           where name like '%/%'
             and name not like 'posix/%'
             and name not like 'right/%'
             and name not like 'SystemV/%'
             and name not like 'Etc/%'
          union all
          select 'UTC'
        ) z
    ), '[]'::jsonb)
  );
end $$;

-- ── 5. Profile writes ─────────────────────────────────────────────────────────────────────────

create or replace function public.update_my_profile_command(
  p_display_name text,
  p_language_code text,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  name text := btrim(coalesce(p_display_name, ''));
  language text := nullif(btrim(coalesce(p_language_code, '')), '');
  zone text := nullif(btrim(coalesce(p_timezone, '')), '');
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(name) < 1 or char_length(name) > 80 then
    raise exception 'a display name of 1 to 80 characters is required' using errcode = '22023';
  end if;
  if language is not null and not exists (
    select 1 from public.supported_languages l where l.code = language and l.is_active
  ) then
    raise exception 'unsupported language' using errcode = '22023';
  end if;
  -- Validated against the server's own timezone database, so the value stored is one the platform can
  -- actually format a date with.
  if zone is not null and not exists (
    select 1 from pg_timezone_names z where z.name = zone
  ) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;

  insert into public.profiles (account_id, display_name, preferred_language_code, timezone)
  values (me, name, coalesce(language, 'en'), coalesce(zone, 'UTC'))
  on conflict (account_id) do update
    set display_name = excluded.display_name,
        preferred_language_code = excluded.preferred_language_code,
        timezone = excluded.timezone,
        updated_at = now();

  return jsonb_build_object('displayName', name, 'languageCode', coalesce(language, 'en'), 'timezone', coalesce(zone, 'UTC'));
end $$;

create or replace function public.set_my_avatar_command(p_object_path text, p_content_type text)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  expected text := me::text || '/avatar';
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- The path is not taken from the browser's word for it: the only object this command will point a
  -- profile at is the one in the caller's own folder, which is also the only path the storage policy
  -- lets them write.
  if p_object_path is distinct from expected then
    raise exception 'unexpected avatar path' using errcode = '22023';
  end if;
  if p_content_type is not null and p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported image type' using errcode = '22023';
  end if;

  insert into public.profiles (account_id, avatar_object_path, avatar_content_type, avatar_updated_at)
  values (me, expected, p_content_type, now())
  on conflict (account_id) do update
    set avatar_object_path = excluded.avatar_object_path,
        avatar_content_type = excluded.avatar_content_type,
        avatar_updated_at = excluded.avatar_updated_at,
        updated_at = now();
end $$;

create or replace function public.clear_my_avatar_command()
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.profiles
     set avatar_object_path = null,
         avatar_content_type = null,
         avatar_updated_at = null,
         updated_at = now()
   where account_id = me;
end $$;

-- ── 6. Contact writes ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise, then decide whether the value is usable at all.
 *
 * Deliberately strict and deliberately small: an email is "something@something.tld" with no spaces,
 * and a phone is E.164 with a leading +. Neither claim is verification — verification is the code —
 * but a value that cannot be normalised cannot be de-duplicated either, and without de-duplication the
 * same address could sit in the list twice, one verified and one not.
 */
create or replace function app_private.normalize_contact(p_kind public.contact_method_kind, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  raw text := btrim(coalesce(p_value, ''));
  email_shape constant text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
  phone_shape constant text := '^\+[1-9][0-9]{7,14}$';
begin
  if p_kind = 'email' then
    if raw !~ email_shape then
      raise exception 'a valid email address is required' using errcode = '22023';
    end if;
    return lower(raw);
  end if;

  -- The spaces, dashes and brackets people write numbers with are stripped before the shape check, so
  -- "+234 803 123 4567" is accepted and stored as "+2348031234567".
  raw := regexp_replace(raw, '[^+0-9]', '', 'g');
  if raw !~ phone_shape then
    raise exception 'a phone number in international format is required' using errcode = '22023';
  end if;
  return raw;
end $$;

create or replace function public.add_my_contact_method_command(p_kind text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  kind public.contact_method_kind;
  normalized text;
  display text := btrim(coalesce(p_value, ''));
  code text;
  pending_count integer;
  new_id uuid;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  kind := p_kind::public.contact_method_kind;
  normalized := app_private.normalize_contact(kind, p_value);

  -- An unverified row is a claim, and claims are capped. Without this, an authenticated account could
  -- use the platform as a free email-delivery oracle against addresses it does not own.
  select count(*) into pending_count
    from public.account_contact_methods c
   where c.account_id = me and c.verified_at is null;
  if pending_count >= 5 then
    raise exception 'too many unverified contacts' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.account_contact_methods c
     where c.account_id = me and c.kind = kind and c.normalized_value = normalized
  ) then
    raise exception 'that contact is already on the account' using errcode = '23505';
  end if;

  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');

  insert into public.account_contact_methods (
    account_id, kind, value, normalized_value, verification_hash,
    verification_sent_at, verification_expires_at
  )
  values (
    me, kind, display, normalized, crypt(code, gen_salt('bf', 8)),
    now(), now() + interval '15 minutes'
  )
  returning id into new_id;

  -- The queue row is written with the code it belongs to, so the page can look up what has happened to
  -- it. Written even when the deployment has no transport: a queued-and-not-delivered message is a
  -- state the account is entitled to see, and dropping it would make "nothing was sent" and "we never
  -- tried" indistinguishable.
  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values (
    'account_contact_method',
    new_id,
    'account.contact_verification',
    jsonb_build_object('contact_id', new_id, 'kind', kind, 'code', code, 'expires_at', now() + interval '15 minutes'),
    'contact_verification:' || new_id
  );

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'CONTACT_METHOD_ADDED', 'account_contact_method', new_id, 'system_internal',
          jsonb_build_object('kind', kind));

  return jsonb_build_object(
    'id', new_id,
    'kind', kind,
    'maskedValue', case kind when 'email' then app_private.mask_email(display) else app_private.mask_phone(display) end,
    'expiresAt', now() + interval '15 minutes'
  );
end $$;

create or replace function public.resend_my_contact_verification_command(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  row_owner uuid;
  already_verified timestamptz;
  last_sent timestamptz;
  code text;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select c.account_id, c.verified_at, c.verification_sent_at
    into row_owner, already_verified, last_sent
    from public.account_contact_methods c
   where c.id = p_id;
  if row_owner is null then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if row_owner <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if already_verified is not null then
    raise exception 'that contact is already verified' using errcode = '22023';
  end if;
  -- The cooldown is enforced here, not by a disabled button: the button's countdown and this rule are
  -- two expressions of one policy, and the server's is the one that counts.
  if last_sent is not null and last_sent > now() - interval '60 seconds' then
    raise exception 'please wait before requesting another code' using errcode = '22023';
  end if;

  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');

  update public.account_contact_methods
     set verification_hash = crypt(code, gen_salt('bf', 8)),
         verification_sent_at = now(),
         verification_expires_at = now() + interval '15 minutes',
         verification_attempts = 0,
         updated_at = now()
   where id = p_id;

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values (
    'account_contact_method',
    p_id,
    'account.contact_verification',
    jsonb_build_object('contact_id', p_id, 'code', code, 'expires_at', now() + interval '15 minutes'),
    'contact_verification:' || p_id || ':' || extract(epoch from now())::bigint
  );

  return jsonb_build_object('sentAt', now(), 'expiresAt', now() + interval '15 minutes');
end $$;

create or replace function public.verify_my_contact_method_command(p_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  method_row public.account_contact_methods%rowtype;
  submitted text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  made_primary boolean;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(submitted) <> 6 then
    raise exception 'a six-digit code is required' using errcode = '22023';
  end if;

  -- Locked for update: two submissions of the same code arriving together must not both pass.
  select * into method_row
    from public.account_contact_methods c
   where c.id = p_id
   for update;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if method_row.account_id <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if method_row.verified_at is not null then
    return jsonb_build_object('verified', true, 'alreadyVerified', true);
  end if;
  if method_row.verification_attempts >= 5 then
    raise exception 'too many attempts; request a new code' using errcode = '22023';
  end if;
  if method_row.verification_expires_at is null or method_row.verification_expires_at < now() then
    raise exception 'that code has expired; request a new one' using errcode = '22023';
  end if;

  if method_row.verification_hash <> crypt(submitted, method_row.verification_hash) then
    update public.account_contact_methods
       set verification_attempts = verification_attempts + 1, updated_at = now()
     where id = p_id;
    raise exception 'that code is not correct' using errcode = '22023';
  end if;

  update public.account_contact_methods
     set verified_at = now(),
         verification_hash = null,
         verification_expires_at = null,
         verification_attempts = 0,
         updated_at = now()
   where id = p_id;

  -- The first verified contact of its kind becomes the primary one, so the account always has an
  -- address to be reached on without having to make a second decision it was not asked about.
  if not exists (
    select 1 from public.account_contact_methods c
     where c.account_id = me and c.kind = method_row.kind and c.is_primary
  ) then
    update public.account_contact_methods set is_primary = true, updated_at = now() where id = p_id;
    made_primary := true;
  else
    made_primary := false;
  end if;

  -- The code has done its job. The queue row keeps the code it carried, which is a real exposure, so
  -- the payload is emptied in the same transaction that retires it.
  update public.outbox_events
     set payload = payload - 'code'
   where idempotency_key like 'contact_verification:' || p_id || '%';

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'CONTACT_METHOD_VERIFIED', 'account_contact_method', p_id, 'system_internal',
          jsonb_build_object('kind', method_row.kind, 'primary', made_primary));

  return jsonb_build_object(
    'verified', true,
    'alreadyVerified', false,
    'isPrimary', made_primary or method_row.is_primary
  );
end $$;

create or replace function public.set_my_primary_contact_method_command(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  method_row public.account_contact_methods%rowtype;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into method_row from public.account_contact_methods c where c.id = p_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if method_row.account_id <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- An unverified address cannot be the one the platform reaches somebody on: the account has not
  -- proved it can read it.
  if method_row.verified_at is null then
    raise exception 'verify that contact first' using errcode = '22023';
  end if;

  update public.account_contact_methods
     set is_primary = false, updated_at = now()
   where account_id = me and kind = method_row.kind and is_primary;

  update public.account_contact_methods
     set is_primary = true, updated_at = now()
   where id = p_id;
end $$;

create or replace function public.remove_my_contact_method_command(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  method_row public.account_contact_methods%rowtype;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into method_row from public.account_contact_methods c where c.id = p_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if method_row.account_id <> me then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.account_contact_methods where id = p_id;
  delete from public.outbox_events where idempotency_key like 'contact_verification:' || p_id || '%';
end $$;

revoke all on function app_private.normalize_contact(public.contact_method_kind, text) from public;
revoke all on function public.get_my_identity_command() from public, anon;
revoke all on function public.update_my_profile_command(text, text, text) from public, anon;
revoke all on function public.set_my_avatar_command(text, text) from public, anon;
revoke all on function public.clear_my_avatar_command() from public, anon;
revoke all on function public.add_my_contact_method_command(text, text) from public, anon;
revoke all on function public.resend_my_contact_verification_command(uuid) from public, anon;
revoke all on function public.verify_my_contact_method_command(uuid, text) from public, anon;
revoke all on function public.set_my_primary_contact_method_command(uuid) from public, anon;
revoke all on function public.remove_my_contact_method_command(uuid) from public, anon;

grant execute on function public.get_my_identity_command() to authenticated;
grant execute on function public.update_my_profile_command(text, text, text) to authenticated;
grant execute on function public.set_my_avatar_command(text, text) to authenticated;
grant execute on function public.clear_my_avatar_command() to authenticated;
grant execute on function public.add_my_contact_method_command(text, text) to authenticated;
grant execute on function public.resend_my_contact_verification_command(uuid) to authenticated;
grant execute on function public.verify_my_contact_method_command(uuid, text) to authenticated;
grant execute on function public.set_my_primary_contact_method_command(uuid) to authenticated;
grant execute on function public.remove_my_contact_method_command(uuid) to authenticated;
