-- Quote versions, and the lock that makes an accepted version authoritative.
--
-- WHY THIS EXISTS. The brief asks for a "single authoritative versioned quote" with a version badge, a
-- change-history log, and accepted versions visually locked. None of that had anywhere to live: this
-- table had exactly one row per offer, no version, and no way to tell a superseded offer from a live
-- one. `quotes` is INSERT-only from the application (there is one writer, and no UPDATE path), so a
-- provider who re-prices the work simply inserts a second row — which is a new version in fact and
-- previously invisible as one.
--
-- ⚠️ THE VERSION IS COMPUTED IN THE DATABASE, NOT IN THE CALLER. `version_major` counts the versions
-- that already exist for the same provider and request, so it is correct for any writer — including the
-- provider quote command that knows nothing about versions, and including any future import. A version
-- number assigned by application code is a number two writers can disagree about.
--
-- ⚠️ `version_revision` IS ALWAYS 0 TODAY, AND THAT IS SAID OUT LOUD rather than hidden. It exists for an
-- amendment to the SAME version (the `.1` in the brief's `v2.1`) — which needs a provider-side "amend
-- this quote" action that does not exist yet. Every label therefore reads `v1.0`, `v2.0`, … and the
-- column is rendered, not reserved silently.

alter table public.quotes
  add column if not exists version_major integer not null default 1,
  add column if not exists version_revision integer not null default 0,
  add column if not exists locked_at timestamptz;

alter table public.quotes
  add column if not exists version_label text
  generated always as ('v' || version_major::text || '.' || version_revision::text) stored;

comment on column public.quotes.version_major is
  'Offer number from this provider for this request. 1 = first offer, 2 = a re-price that supersedes it.';
comment on column public.quotes.version_revision is
  'Amendment to the same offer. Always 0 until a provider-side amend action exists.';
comment on column public.quotes.locked_at is
  'Set when the quote is accepted. A locked version is the document the assignment and its payment obligation point at, and it can no longer be modified.';

-- The comparison page groups by provider and takes the highest version; the history log walks down.
create index if not exists quotes_version_idx
  on public.quotes(request_id, provider_id, version_major desc, version_revision desc);

-- ── Numbering ────────────────────────────────────────────────────────────────────────────────────────
create or replace function app_private.assign_quote_version()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- The label is a GENERATED column, so it is never assigned: Postgres computes it from the row after
  -- this BEFORE trigger has set the two numbers. Numbering therefore has exactly one writer, in one
  -- direction, and no caller can pin a version number by supplying a label.
  new.version_major := (
    select coalesce(count(*), 0) + 1
    from public.quotes q
    where q.request_id = new.request_id
      and q.provider_id = new.provider_id
  );
  new.version_revision := 0;
  return new;
end
$function$;

drop trigger if exists quotes_assign_version on public.quotes;
create trigger quotes_assign_version
  before insert on public.quotes
  for each row execute function app_private.assign_quote_version();

-- ── Locking ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function app_private.enforce_quote_version_lock()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- 1. Accepting locks the version. Done first so the accept itself is not refused by rule 2.
  if new.status = 'accepted' and old.status <> 'accepted' then
    new.locked_at := coalesce(old.locked_at, now());
  end if;

  -- 2. A locked version is frozen. RAISING IS THE POINT: a silent no-op would let a writer believe it
  --    had changed a price the customer already agreed to, and the assignment and its payment
  --    obligation both point at this exact row.
  if old.locked_at is not null then
    raise exception 'quote version %.% is locked: an accepted offer cannot be modified',
      old.version_major, old.version_revision using errcode = '22023';
  end if;

  -- 3. A SUPERSEDED VERSION CANNOT BE ACCEPTED. Nothing else would stop this: the accept command
  --    checks the request and the quote's status, and knows nothing about versions, so a customer could
  --    otherwise come back and accept an older price that the provider had already replaced. Enforced
  --    here rather than in the accept command so that every writer of `status='accepted'` is covered,
  --    including ones that do not exist yet.
  if new.status = 'accepted' and old.status <> 'accepted' and exists (
    select 1 from public.quotes later
    where later.request_id = old.request_id
      and later.provider_id = old.provider_id
      and (later.version_major, later.version_revision) > (old.version_major, old.version_revision)
      and later.status in ('submitted', 'accepted')
  ) then
    raise exception 'quote version %.% is superseded by a later version; accept the current one',
      old.version_major, old.version_revision using errcode = '22023';
  end if;

  return new;
end
$function$;

drop trigger if exists quotes_enforce_version_lock on public.quotes;
create trigger quotes_enforce_version_lock
  before update on public.quotes
  for each row execute function app_private.enforce_quote_version_lock();

-- Existing rows: number them retroactively in submission order, so the history a customer sees for an
-- older request is the same shape as the history for a new one.
with numbered as (
  select id,
         row_number() over (partition by request_id, provider_id order by submitted_at, created_at) as major
  from public.quotes
)
update public.quotes q
set version_major = n.major
from numbered n
where q.id = n.id and q.version_major <> n.major;
