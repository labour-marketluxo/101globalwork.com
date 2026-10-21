-- Workforce programmes: the institution, its cohorts, its pool of workers, and the consent that decides
-- whether a person is a name or a pseudonym.
--
-- ── THE IDENTITY RULE, WHICH IS THE WHOLE POINT OF THIS MIGRATION ─────────────────────────────
--
-- A worker in a programme is a PSEUDONYM by default. `programme_workers.legal_name` and `contact_email` are
-- held because somebody has to be able to enrol a person who has no account on this platform yet, and they are
-- never returned by any read unless two independent things are both true:
--
--   1. THE WORKER CONSENTED, for a specific scope — the programme, or one named project allocation.
--   2. THE CALLER IS ENTITLED TO THAT SCOPE. For a project-scoped consent that means the caller is a party to
--      that exact assignment (`app_private.project_role_for`). For a programme-scoped consent it means the
--      caller owns the programme. Neither is satisfied by "is a steward".
--
-- ⚠️ CONSENT IS NOT SOMETHING A STEWARD CAN GRANT FOR SOMEBODY ELSE when that person has an account here. The
-- command refuses it: consent has to come from the worker's own account, or be recorded by platform support as
-- an offline consent with the reason attached. A programme manager who could tick "consented" for the whole
-- pool would make the entire rule decorative.
--
-- ⚠️ THE PSEUDONYM IS PER PROGRAMME, NOT PER PERSON. The same worker enrolled in two programmes has two
-- unrelated pseudonyms, so the two rows cannot be joined by anybody reading either one. That is what makes it
-- pseudonymisation rather than a redacted name.
--
-- ── NO PUBLIC REGISTRY, BY CONSTRUCTION ──────────────────────────────────────────────────────
--
-- There is no anonymous grant on any function here, no `anon` policy on any table, and no public route that
-- reads them. The brief forbids public worker registries by default; the way to forbid something is not to
-- have a switch for it, so there is no flag, no setting and no code path that serves this pool to a request
-- without a session — only a comment saying so, and the absence.
--
-- ── WHAT A STEWARD ROLE MAY DO ───────────────────────────────────────────────────────────────
--
--   owner, manager   everything, including enrolling, allocating and deciding returns
--   verifier         read the pool, verify or reject credentials
--   analyst          read the pool as pseudonyms and read the aggregate dashboards
--   platform         read (support capability); may record an offline consent; never reveals an identity
--
-- The ranks live in one function so "at least verifier" is asked the same way everywhere.

create type public.programme_kind as enum ('workforce_development', 'grant_funded', 'certified_pool');
create type public.programme_status as enum ('draft', 'active', 'paused', 'closed');
create type public.programme_steward_role as enum ('owner', 'manager', 'verifier', 'analyst');
create type public.programme_cohort_status as enum ('planned', 'running', 'completed', 'cancelled');
create type public.programme_worker_state as enum ('invited', 'enrolled', 'active', 'completed', 'withdrawn');
create type public.programme_consent_scope as enum ('programme', 'project');
create type public.programme_credential_state as enum ('pending', 'verified', 'rejected', 'expired');
create type public.programme_credential_kind as enum ('identity', 'trade_licence', 'insurance', 'safety_training', 'certificate');

-- ── 1. The programme and who runs it ──────────────────────────────────────────────────────────

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^PRG-[0-9A-F]{10}$'),
  name text not null check (char_length(btrim(name)) between 4 and 160),
  kind public.programme_kind not null,
  status public.programme_status not null default 'draft',
  owner_organisation_id uuid references public.organisations(id) on delete restrict,
  created_by_account_id uuid not null references public.accounts(id) on delete restrict,
  market_id uuid references public.markets(id) on delete restrict,
  -- A free-text region: a programme covers an area the institution describes, which is not the discovery
  -- catalogue's notion of a locality and must not be forced into it.
  region_label text not null check (char_length(btrim(region_label)) between 2 and 120),
  funding_source text check (funding_source is null or char_length(btrim(funding_source)) between 2 and 200),
  budget_allocation_minor bigint check (budget_allocation_minor is null or budget_allocation_minor > 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  starts_on date,
  ends_on date,
  summary text check (summary is null or char_length(btrim(summary)) between 10 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programmes_dates_chk check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint programmes_budget_currency_chk check ((budget_allocation_minor is null) = (currency_code is null))
);

create index programmes_owner_idx on public.programmes(owner_organisation_id, status);
create index programmes_created_by_idx on public.programmes(created_by_account_id, status);

create table public.programme_stewards (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  role public.programme_steward_role not null,
  granted_by_account_id uuid references public.accounts(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (programme_id, account_id)
);

create index programme_stewards_account_idx on public.programme_stewards(account_id) where revoked_at is null;

create table public.programme_cohorts (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  capacity integer check (capacity is null or capacity between 1 and 100000),
  starts_on date,
  ends_on date,
  status public.programme_cohort_status not null default 'planned',
  created_at timestamptz not null default now(),
  unique (programme_id, name)
);

create index programme_cohorts_programme_idx on public.programme_cohorts(programme_id, starts_on);

create table public.programme_budget_allocations (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 3 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  allocated_on date not null default current_date,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index programme_budget_allocations_programme_idx on public.programme_budget_allocations(programme_id, allocated_on);

/**
 * A project the programme is allowed to place workers on.
 *
 * ⚠️ LINKED BY A PARTY TO THE PROJECT, NOT BY THE PROGRAMME. An institution cannot attach itself to somebody's job
 * and start putting people on it: the customer or the provider on that assignment has to bring the programme in.
 * Without this table the allocation command would need an assignment id from somewhere, and the only sources would
 * be "paste a uuid" or "list every project on the platform" — one unusable, the other a disclosure.
 */
create table public.programme_projects (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  linked_by_account_id uuid not null references public.accounts(id) on delete restrict,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  unique (programme_id, assignment_id)
);

create index programme_projects_programme_idx on public.programme_projects(programme_id) where unlinked_at is null;
create index programme_projects_assignment_idx on public.programme_projects(assignment_id);

-- ── 2. The pool ───────────────────────────────────────────────────────────────────────────────

create table public.programme_workers (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  -- ⚠️ IDENTITY. Never returned without a consent that covers the caller. See the file header.
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 160),
  contact_email text check (contact_email is null or contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  -- Set when the worker already has an account here; null for somebody enrolled on paper before they signed up.
  worker_account_id uuid references public.accounts(id) on delete set null,
  -- ⚠️ PER PROGRAMME. Two enrolments of the same person do not share a pseudonym, so the rows cannot be joined.
  pseudonym text not null check (pseudonym ~ '^WRK-[0-9A-F]{8}$'),
  region_label text not null check (char_length(btrim(region_label)) between 2 and 120),
  skills text[] not null default '{}'::text[],
  state public.programme_worker_state not null default 'enrolled',
  cohort_id uuid references public.programme_cohorts(id) on delete set null,
  state_note text check (state_note is null or char_length(btrim(state_note)) between 1 and 500),
  enrolled_by_account_id uuid references public.accounts(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, pseudonym)
);

-- One enrolment per account per programme: a duplicate row would let a steward compare two pseudonyms and
-- conclude they are the same person.
create unique index programme_workers_account_idx
  on public.programme_workers(programme_id, worker_account_id) where worker_account_id is not null;
create index programme_workers_cohort_idx on public.programme_workers(cohort_id) where cohort_id is not null;
create index programme_workers_programme_idx on public.programme_workers(programme_id, state);

create table public.programme_credentials (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.programme_workers(id) on delete cascade,
  kind public.programme_credential_kind not null,
  reference text check (reference is null or char_length(btrim(reference)) between 2 and 120),
  issued_on date,
  expires_on date,
  state public.programme_credential_state not null default 'pending',
  verified_at timestamptz,
  verified_by_account_id uuid references public.accounts(id) on delete set null,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A decision and a timestamp are one fact, and a rejected or verified credential must say when.
  constraint programme_credentials_decision_shape check ((state = 'pending') = (verified_at is null)),
  constraint programme_credentials_dates_chk check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

-- ⚠️ A UNIQUE INDEX OVER A COALESCED COLUMN, NOT `unique (worker_id, kind, reference)`. In SQL a NULL reference is
-- distinct from every other NULL, so a constraint on the raw column would let the same licence be recorded a
-- hundred times with no reference. The command upserts against this index.
create unique index programme_credentials_identity_idx
  on public.programme_credentials(worker_id, kind, coalesce(reference, ''));

create index programme_credentials_worker_idx on public.programme_credentials(worker_id, kind);
create index programme_credentials_state_idx on public.programme_credentials(state) where state = 'pending';

create table public.programme_allocations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.programme_workers(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  role_label text not null check (char_length(btrim(role_label)) between 2 and 120),
  allocated_by_account_id uuid references public.accounts(id) on delete set null,
  allocated_at timestamptz not null default now(),
  ended_at timestamptz,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  unique (worker_id, assignment_id)
);

create index programme_allocations_assignment_idx on public.programme_allocations(assignment_id);
create index programme_allocations_worker_idx on public.programme_allocations(worker_id, allocated_at desc);

/**
 * Consent, and where it came from.
 *
 * `grant_source` is the honest part: 'worker' when the worker's own account granted it, 'recorded_offline' when
 * platform support recorded a consent given on paper, 'platform' when support revoked or recorded one while
 * acting on a complaint. A programme steward cannot produce a 'worker' row for somebody who has an account.
 */
create table public.programme_worker_consents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.programme_workers(id) on delete cascade,
  scope public.programme_consent_scope not null,
  assignment_id uuid references public.assignments(id) on delete cascade,
  purpose text not null check (char_length(btrim(purpose)) between 4 and 300),
  grant_source text not null check (grant_source in ('worker', 'recorded_offline', 'platform')),
  granted_by_account_id uuid references public.accounts(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts(id) on delete set null,
  -- A project-scoped consent names exactly one project, and a programme-scoped one names none.
  constraint programme_consents_scope_shape check ((scope = 'project') = (assignment_id is not null)),
  constraint programme_consents_revocation_shape check ((revoked_at is null) = (revoked_by_account_id is null))
);

create unique index programme_consents_active_idx
  on public.programme_worker_consents(worker_id, scope, coalesce(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index programme_consents_worker_idx on public.programme_worker_consents(worker_id, granted_at desc);
create index programme_consents_assignment_idx on public.programme_worker_consents(assignment_id) where assignment_id is not null;

alter table public.programmes enable row level security;
alter table public.programme_stewards enable row level security;
alter table public.programme_cohorts enable row level security;
alter table public.programme_budget_allocations enable row level security;
alter table public.programme_projects enable row level security;
alter table public.programme_workers enable row level security;
alter table public.programme_credentials enable row level security;
alter table public.programme_allocations enable row level security;
alter table public.programme_worker_consents enable row level security;

-- Denied through the Data API, every one of them, including for `anon`. There is no public registry and no
-- policy that could become one: the reads are commands that re-derive the caller's role.
create policy programmes_deny_direct on public.programmes for all to anon, authenticated using (false) with check (false);
create policy programme_stewards_deny_direct on public.programme_stewards for all to anon, authenticated using (false) with check (false);
create policy programme_cohorts_deny_direct on public.programme_cohorts for all to anon, authenticated using (false) with check (false);
create policy programme_budget_allocations_deny_direct on public.programme_budget_allocations for all to anon, authenticated using (false) with check (false);
create policy programme_projects_deny_direct on public.programme_projects for all to anon, authenticated using (false) with check (false);
create policy programme_workers_deny_direct on public.programme_workers for all to anon, authenticated using (false) with check (false);
create policy programme_credentials_deny_direct on public.programme_credentials for all to anon, authenticated using (false) with check (false);
create policy programme_allocations_deny_direct on public.programme_allocations for all to anon, authenticated using (false) with check (false);
create policy programme_worker_consents_deny_direct on public.programme_worker_consents for all to anon, authenticated using (false) with check (false);

comment on table public.programme_workers is
  'A programme workforce pool. legal_name and contact_email are identity: no read returns them without an active consent that covers the caller. Every list shows the per-programme pseudonym.';

-- ── 3. The single definition of access ────────────────────────────────────────────────────────

/**
 * The caller's role on a programme: 'owner', 'manager', 'verifier', 'analyst', 'platform', or null.
 *
 * ⚠️ ONE FUNCTION, USED BY EVERY READ AND EVERY COMMAND. Object-level authorisation re-derived in a dozen places
 * is a dozen chances for one of them to be wrong, and this is the file where that matters most: the role decides
 * whether somebody sees a pool of real people.
 *
 * ⚠️ 'platform' IS READ-ONLY BY RANK. Support staff can see that a programme exists and read its aggregates;
 * they are deliberately below the rank that enrols, verifies or reveals. A platform capability that could reveal
 * a worker's identity would be a back door around the consent rule.
 */
create or replace function app_private.programme_role_for(p_programme_id uuid, p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(
    (
      select case when s.role = 'owner' then 'owner' else s.role::text end
        from public.programme_stewards s
       where s.programme_id = p_programme_id
         and s.account_id = p_account_id
         and s.revoked_at is null
       limit 1
    ),
    case
      when p_account_id is not null
       and app_private.current_account_has_platform_capability('platform.support.read')
        then 'platform'
      else null
    end
  );
$$;

/** Ranks the roles so "at least a verifier" is asked the same way in every command. */
create or replace function app_private.programme_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'owner' then 4
    when 'manager' then 3
    when 'verifier' then 2
    when 'analyst' then 1
    when 'platform' then 0
    else -1
  end;
$$;

revoke all on function app_private.programme_role_for(uuid, uuid) from public;
revoke all on function app_private.programme_role_rank(text) from public;

-- ── 4. Reads ──────────────────────────────────────────────────────────────────────────────────

/** The shell's own read: enough to render the header, the tabs and the role, and nothing about people. */
create or replace function public.get_programme_context_command(p_programme_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.programme_role_for(p_programme_id, me);
  p public.programmes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if role is null then
    return jsonb_build_object('allowed', false);
  end if;

  select * into p from public.programmes where id = p_programme_id;
  if not found then
    return jsonb_build_object('allowed', false);
  end if;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'rank', app_private.programme_role_rank(role),
    'programme', jsonb_build_object(
      'id', p.id,
      'reference', p.reference,
      'name', p.name,
      'kind', p.kind,
      'status', p.status,
      'regionLabel', p.region_label,
      'fundingSource', p.funding_source,
      'startsOn', p.starts_on,
      'endsOn', p.ends_on,
      'summary', p.summary,
      'budgetMinor', p.budget_allocation_minor,
      'currencyCode', p.currency_code
    )
  );
end $$;

/**
 * The worker registry.
 *
 * ⚠️ EVERY ROW CARRIES AN IDENTITY OBJECT WITH `revealed` IN IT, INCLUDING WHEN IT IS FALSE. A missing field
 * would make "not revealed" and "no identity recorded" indistinguishable on the page; an explicit decision with
 * a basis makes the rule visible and makes a bug in it obvious.
 */
create or replace function public.get_programme_workers_command(p_programme_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.programme_role_for(p_programme_id, me);
  rank integer := app_private.programme_role_rank(role);
  workers jsonb;
  cohorts jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if role is null then
    return jsonb_build_object('allowed', false);
  end if;

  select coalesce(jsonb_agg(entry order by pseudonym), '[]'::jsonb)
    into workers
    from (
      select jsonb_build_object(
               'id', w.id,
               'pseudonym', w.pseudonym,
               'state', w.state,
               'stateNote', w.state_note,
               'regionLabel', w.region_label,
               'skills', to_jsonb(w.skills),
               'hasAccount', w.worker_account_id is not null,
               'cohortId', w.cohort_id,
               'cohortName', c.name,
               'enrolledAt', w.enrolled_at,
               'identity', case
                 -- Programme-scoped consent, revealed only to the programme owner.
                 when exists (
                   select 1 from public.programme_worker_consents con
                    where con.worker_id = w.id and con.scope = 'programme' and con.revoked_at is null
                 ) and role = 'owner'
                 then jsonb_build_object(
                   'revealed', true,
                   'basis', 'programme_consent',
                   'name', w.legal_name,
                   'email', w.contact_email,
                   'consentedAt', (
                     select con.granted_at from public.programme_worker_consents con
                      where con.worker_id = w.id and con.scope = 'programme' and con.revoked_at is null
                      order by con.granted_at desc limit 1
                   )
                 )
                 -- Project-scoped consent, revealed only to a party of that exact project.
                 when exists (
                   select 1
                     from public.programme_worker_consents con
                     join public.programme_allocations al on al.assignment_id = con.assignment_id
                    where con.worker_id = w.id
                      and con.scope = 'project'
                      and con.revoked_at is null
                      and al.worker_id = w.id
                      and app_private.project_role_for(al.assignment_id) is not null
                 )
                 then jsonb_build_object(
                   'revealed', true,
                   'basis', 'project_consent',
                   'name', w.legal_name,
                   'email', w.contact_email,
                   'consentedAt', (
                     select con.granted_at
                       from public.programme_worker_consents con
                       join public.programme_allocations al on al.assignment_id = con.assignment_id
                      where con.worker_id = w.id and con.scope = 'project' and con.revoked_at is null
                        and al.worker_id = w.id and app_private.project_role_for(al.assignment_id) is not null
                      order by con.granted_at desc limit 1
                   )
                 )
                 else jsonb_build_object(
                   'revealed', false,
                   'basis', null,
                   'name', null,
                   'email', null,
                   'note', case
                     when exists (
                       select 1 from public.programme_worker_consents con
                        where con.worker_id = w.id and con.revoked_at is null
                     ) then 'Consent exists but does not cover you: it is scoped to a project you are not part of, or to a programme role you do not hold.'
                     else 'No consent is recorded for this worker. They are shown by pseudonym.'
                   end
                 )
               end,
               'credentials', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', cr.id,
                          'kind', cr.kind,
                          'reference', cr.reference,
                          'state', cr.state,
                          'issuedOn', cr.issued_on,
                          'expiresOn', cr.expires_on,
                          'verifiedAt', cr.verified_at,
                          'decisionNote', cr.decision_note
                        ) order by cr.kind)
                   from public.programme_credentials cr where cr.worker_id = w.id
               ), '[]'::jsonb),
               -- The allocation list is what a project party needs in order to know why they are seeing a name.
               -- It carries the project's own label and the role the worker took, not the other party's identity.
               'allocations', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'assignmentId', al.assignment_id,
                          'roleLabel', al.role_label,
                          'projectLabel', coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project'),
                          'allocatedAt', al.allocated_at,
                          'endedAt', al.ended_at
                        ) order by al.allocated_at desc)
                   from public.programme_allocations al
                   join public.assignments a on a.id = al.assignment_id
                   join public.requests rq on rq.id = a.request_id
                  where al.worker_id = w.id
               ), '[]'::jsonb),
               'consents', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', con.id,
                          'scope', con.scope,
                          'assignmentId', con.assignment_id,
                          'purpose', con.purpose,
                          'grantSource', con.grant_source,
                          'grantedAt', con.granted_at,
                          'revokedAt', con.revoked_at
                        ) order by con.granted_at desc)
                   from public.programme_worker_consents con where con.worker_id = w.id
               ), '[]'::jsonb)
             ) as entry,
             w.pseudonym
        from public.programme_workers w
        left join public.programme_cohorts c on c.id = w.cohort_id
       where w.programme_id = p_programme_id
    ) listed;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'status', c.status, 'capacity', c.capacity,
           'startsOn', c.starts_on, 'endsOn', c.ends_on)
           order by c.starts_on nulls last, c.name), '[]'::jsonb)
    into cohorts
    from public.programme_cohorts c where c.programme_id = p_programme_id;

  return jsonb_build_object(
    'allowed', true,
    'role', role,
    'rank', rank,
    'canEnrol', rank >= 3,
    'canVerify', rank >= 2,
    'canAssign', rank >= 3,
    'canManageConsent', rank >= 3,
    'workers', workers,
    'cohorts', cohorts,
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'assignmentId', pp.assignment_id,
               'label', coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project'),
               'status', a.status,
               'linkedAt', pp.linked_at
             ) order by coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project')),
             '[]'::jsonb)
        from public.programme_projects pp
        join public.assignments a on a.id = pp.assignment_id
        join public.requests rq on rq.id = a.request_id
       where pp.programme_id = p_programme_id and pp.unlinked_at is null
    ),
    -- ⚠️ THE ONLY SOURCE A LINK FORM COULD SAFELY USE. Projects the CALLER is personally a party to, so nobody is
    -- ever asked to type a project id and no programme can be shown a list of jobs it has no connection to.
    'linkableProjects', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'assignmentId', a.id,
               'label', coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project'),
               'status', a.status
             ) order by coalesce(nullif(btrim(rq.title), ''), nullif(btrim(rq.need_text), ''), 'A project')),
             '[]'::jsonb)
        from public.assignments a
        join public.requests rq on rq.id = a.request_id
       where app_private.project_role_for(a.id) is not null
         and not exists (
           select 1 from public.programme_projects pp
            where pp.programme_id = p_programme_id
              and pp.assignment_id = a.id
              and pp.unlinked_at is null
         )
    ),
    'consentNote', 'A worker is a pseudonym until they consent to be named. Consent is per programme or per project, and a project-scoped consent is only honoured for the parties to that project.'
  );
end $$;

-- ── 5. Writes ─────────────────────────────────────────────────────────────────────────────────

create or replace function app_private.assert_programme_role(p_programme_id uuid, p_minimum_rank integer)
returns text
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  role text := app_private.programme_role_for(p_programme_id, app_private.current_account_id());
begin
  -- ⚠️ A PROGRAMME THE CALLER CANNOT SEE REPORTS AS NOT FOUND, not as forbidden. Whether a programme exists is
  -- information about an institution and the people in it.
  if role is null then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;
  if app_private.programme_role_rank(role) < p_minimum_rank then
    raise exception 'not authorized for this programme' using errcode = '42501';
  end if;
  return role;
end $$;

revoke all on function app_private.assert_programme_role(uuid, integer) from public;

create or replace function public.enrol_programme_worker_command(
  p_programme_id uuid,
  p_legal_name text,
  p_contact_email text default null,
  p_region_label text default null,
  p_skills text[] default '{}',
  p_worker_account_id uuid default null,
  p_cohort_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, extensions
as $$
declare
  me uuid := app_private.current_account_id();
  name text := btrim(coalesce(p_legal_name, ''));
  email text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  region text := nullif(btrim(coalesce(p_region_label, '')), '');
  skills text[];
  pseudonym_code text;
  worker_id uuid;
  programme_region text;
begin
  perform app_private.assert_programme_role(p_programme_id, 3);

  if char_length(name) < 2 or char_length(name) > 160 then
    raise exception 'a name of 2 to 160 characters is required' using errcode = '22023';
  end if;
  if email is not null and email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'that email address is not usable' using errcode = '22023';
  end if;

  -- Skills are the whole basis of the labour-market aggregates, so they are cleaned here rather than trusted:
  -- trimmed, lower-cased, de-duplicated, and capped. A free-text field with 400 variants of "bricklaying" would
  -- make every skill distribution meaningless.
  select coalesce(array_agg(distinct lower(btrim(s))), '{}')
    into skills
    from unnest(coalesce(p_skills, '{}'::text[])) as s
   where btrim(s) <> '';
  if array_length(skills, 1) > 12 then
    raise exception 'at most 12 skills per worker' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(skills) as s where char_length(s) > 60) then
    raise exception 'a skill name must be at most 60 characters' using errcode = '22023';
  end if;

  select region_label into programme_region from public.programmes where id = p_programme_id;

  if p_worker_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = p_worker_account_id and a.status = 'active'
  ) then
    raise exception 'that account cannot be enrolled' using errcode = '22023';
  end if;

  if p_cohort_id is not null and not exists (
    select 1 from public.programme_cohorts c where c.id = p_cohort_id and c.programme_id = p_programme_id
  ) then
    raise exception 'that cohort is not part of this programme' using errcode = '22023';
  end if;

  if p_worker_account_id is not null and exists (
    select 1 from public.programme_workers w
     where w.programme_id = p_programme_id and w.worker_account_id = p_worker_account_id
  ) then
    raise exception 'that account is already enrolled in this programme' using errcode = '23505';
  end if;

  pseudonym_code := 'WRK-' || upper(encode(gen_random_bytes(4), 'hex'));

  insert into public.programme_workers (
    programme_id, legal_name, contact_email, worker_account_id, pseudonym,
    region_label, skills, cohort_id, enrolled_by_account_id
  )
  values (
    p_programme_id, name, email, p_worker_account_id, pseudonym_code,
    coalesce(region, programme_region), skills, p_cohort_id, me
  )
  returning id into worker_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'PROGRAMME_WORKER_ENROLLED', 'programme_worker', worker_id, 'participant_private',
          jsonb_build_object('programme_id', p_programme_id, 'has_account', p_worker_account_id is not null, 'skills', array_length(skills, 1)));

  -- ⚠️ THE PSEUDONYM IS RETURNED AND THE NAME IS NOT ECHOED BACK. The response is the same shape as the registry
  -- read, so a caller cannot use the enrolment response as a way to read an identity out.
  return jsonb_build_object('id', worker_id, 'pseudonym', pseudonym_code, 'state', 'enrolled');
end $$;

create or replace function public.record_programme_credential_command(
  p_programme_id uuid,
  p_worker_id uuid,
  p_kind text,
  p_reference text default null,
  p_issued_on date default null,
  p_expires_on date default null,
  p_decision text default 'pending',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.assert_programme_role(p_programme_id, 2);
  -- Named away from the column for the same reason as the consent locals below: `where kind = kind` would be
  -- ambiguous in this UPDATE, and plpgsql's default is to raise on that rather than quietly pick one.
  credential_kind public.programme_credential_kind;
  decision public.programme_credential_state;
  worker public.programme_workers%rowtype;
  credential_id uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  credential_kind := p_kind::public.programme_credential_kind;
  decision := coalesce(nullif(btrim(coalesce(p_decision, '')), ''), 'pending')::public.programme_credential_state;
  if note is not null and char_length(note) > 500 then
    raise exception 'a note of at most 500 characters' using errcode = '22023';
  end if;

  select * into worker from public.programme_workers w
   where w.id = p_worker_id and w.programme_id = p_programme_id;
  if not found then
    raise exception 'worker not found' using errcode = 'P0002';
  end if;

  -- Somebody who records a decision about a document is not the same as somebody who may read the person's
  -- name. A verifier can do this and still see a pseudonym on every page.
  if decision <> 'pending' and app_private.programme_role_rank(role) < 2 then
    raise exception 'not authorized to decide a credential' using errcode = '42501';
  end if;
  if decision = 'pending' and app_private.programme_role_rank(role) < 3 then
    raise exception 'not authorized to submit a credential' using errcode = '42501';
  end if;

  -- Update first, insert second, rather than ON CONFLICT: the unique index is over `coalesce(reference, '')`,
  -- and inference against an expression index is fragile enough to be worth two statements.
  update public.programme_credentials
     set issued_on = p_issued_on,
         expires_on = p_expires_on,
         state = decision,
         verified_at = case when decision = 'pending' then null else now() end,
         verified_by_account_id = case when decision = 'pending' then null else me end,
         decision_note = note,
         updated_at = now()
   where worker_id = worker.id
     and kind = credential_kind
     and coalesce(reference, '') = coalesce(nullif(btrim(coalesce(p_reference, '')), ''), '')
  returning id into credential_id;

  if credential_id is null then
    insert into public.programme_credentials (worker_id, kind, reference, issued_on, expires_on, state, verified_at, verified_by_account_id, decision_note)
    values (
      worker.id, credential_kind, nullif(btrim(coalesce(p_reference, '')), ''), p_issued_on, p_expires_on,
      decision,
      case when decision = 'pending' then null else now() end,
      case when decision = 'pending' then null else me end,
      note
    )
    returning id into credential_id;
  end if;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'PROGRAMME_CREDENTIAL_RECORDED', 'programme_worker', worker.id, 'participant_private',
          jsonb_build_object('programme_id', p_programme_id, 'kind', credential_kind, 'state', decision));

  return jsonb_build_object('id', credential_id, 'kind', credential_kind, 'state', decision);
end $$;

/**
 * Bring a programme onto a project. Only a party to the project can do it.
 *
 * The check is `app_private.project_role_for`, which resolves the caller from the session — so a customer or a
 * provider on the job can opt in, and a programme manager who is not on the job cannot.
 */
create or replace function public.link_programme_project_command(
  p_programme_id uuid,
  p_assignment_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  -- A steward of the programme gets a readable refusal rather than "programme not found"; everybody else is
  -- checked against the project itself.
  role text := app_private.programme_role_for(p_programme_id, me);
  note text := nullif(btrim(coalesce(p_note, '')), '');
  link_id uuid;
begin
  if me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'a note of at most 500 characters' using errcode = '22023';
  end if;

  if app_private.project_role_for(p_assignment_id) is null then
    raise exception 'only a party to this project can link a programme to it' using errcode = '42501';
  end if;
  if role is null then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;

  insert into public.programme_projects (programme_id, assignment_id, linked_by_account_id, note)
  values (p_programme_id, p_assignment_id, me, note)
  on conflict (programme_id, assignment_id) do update
    set unlinked_at = null,
        linked_by_account_id = excluded.linked_by_account_id,
        linked_at = now(),
        note = excluded.note
  returning id into link_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'PROGRAMME_PROJECT_LINKED', 'programme', p_programme_id, 'participant_private',
          jsonb_build_object('assignment_id', p_assignment_id));

  return jsonb_build_object('id', link_id, 'assignmentId', p_assignment_id);
end $$;

create or replace function public.unlink_programme_project_command(p_programme_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.programme_role_for(p_programme_id, me);
  is_party boolean := app_private.project_role_for(p_assignment_id) is not null;
  ended integer;
begin
  if me is null or role is null then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;
  if not is_party and app_private.programme_role_rank(role) < 3 then
    raise exception 'not authorized for this project' using errcode = '42501';
  end if;

  update public.programme_projects
     set unlinked_at = now()
   where programme_id = p_programme_id and assignment_id = p_assignment_id and unlinked_at is null;

  -- Unlinking does not erase who worked on what: the allocations stay, and the dashboard keeps counting them.
  update public.programme_allocations
     set ended_at = coalesce(ended_at, now())
   where assignment_id = p_assignment_id
     and worker_id in (select w.id from public.programme_workers w where w.programme_id = p_programme_id);

  get diagnostics ended = row_count;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'PROGRAMME_PROJECT_UNLINKED', 'programme', p_programme_id, 'participant_private',
          jsonb_build_object('assignment_id', p_assignment_id, 'allocations_ended', ended));

  return jsonb_build_object('assignmentId', p_assignment_id, 'allocationsEnded', ended);
end $$;

create or replace function public.assign_programme_worker_command(
  p_programme_id uuid,
  p_worker_id uuid,
  p_assignment_id uuid,
  p_role_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  worker public.programme_workers%rowtype;
  role_label text := btrim(coalesce(p_role_label, ''));
  allocation_id uuid;
begin
  perform app_private.assert_programme_role(p_programme_id, 3);

  select * into worker from public.programme_workers w
   where w.id = p_worker_id and w.programme_id = p_programme_id;
  if not found then
    raise exception 'worker not found' using errcode = 'P0002';
  end if;
  -- ⚠️ THE PROJECT HAS TO BE LINKED TO THIS PROGRAMME FIRST, and a link can only be made by a party to the
  -- project. Placing a worker on a job the institution has no connection to is not a thing this platform allows.
  if not exists (
    select 1 from public.programme_projects pp
     where pp.programme_id = p_programme_id
       and pp.assignment_id = p_assignment_id
       and pp.unlinked_at is null
  ) then
    raise exception 'that project is not linked to this programme' using errcode = '22023';
  end if;
  if char_length(role_label) < 2 or char_length(role_label) > 120 then
    raise exception 'a role label of 2 to 120 characters is required' using errcode = '22023';
  end if;

  insert into public.programme_allocations (worker_id, assignment_id, role_label, allocated_by_account_id)
  values (worker.id, p_assignment_id, role_label, me)
  on conflict (worker_id, assignment_id) do update
    set role_label = excluded.role_label,
        ended_at = null,
        allocated_by_account_id = excluded.allocated_by_account_id
  returning id into allocation_id;

  -- An allocation is real work, so the worker stops being merely enrolled.
  update public.programme_workers
     set state = case when state in ('invited', 'enrolled') then 'active' else state end,
         updated_at = now()
   where id = worker.id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user', 'PROGRAMME_WORKER_ALLOCATED', 'programme_worker', worker.id, 'participant_private',
          jsonb_build_object('programme_id', p_programme_id, 'assignment_id', p_assignment_id));

  return jsonb_build_object('allocationId', allocation_id, 'state', 'active');
end $$;

/**
 * Grant or revoke a consent.
 *
 * ⚠️ THE ONE RULE THAT MAKES THE REST OF THIS FILE WORTH ANYTHING: a steward cannot grant consent on behalf of a
 * worker who has an account here. Only that worker's own account can, or platform support recording a consent
 * given on paper — and the platform path is marked as such in the row and in the audit trail, so the two are
 * distinguishable for ever after.
 */
create or replace function public.record_programme_consent_command(
  p_programme_id uuid,
  p_worker_id uuid,
  p_scope text,
  p_assignment_id uuid,
  p_purpose text,
  p_grant boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth
as $$
declare
  me uuid := app_private.current_account_id();
  role text := app_private.assert_programme_role(p_programme_id, 1);
  actor_is_platform boolean := app_private.current_account_has_platform_capability('platform.support.intervene');
  worker public.programme_workers%rowtype;
  -- ⚠️ RENAMED AWAY FROM THE COLUMN NAMES ON PURPOSE. `scope` and `purpose` are both columns of
  -- programme_worker_consents, and a plpgsql variable with a column's name makes `where scope = scope` a
  -- tautology rather than a bug that announces itself. The locals are `target_scope` and `purpose_text` so no
  -- reference in this function is ambiguous.
  target_scope public.programme_consent_scope;
  purpose_text text := btrim(coalesce(p_purpose, ''));
  source text;
  consent_id uuid;
  target_assignment uuid;
begin
  if p_grant is null then
    raise exception 'a decision is required' using errcode = '22023';
  end if;
  target_scope := p_scope::public.programme_consent_scope;
  target_assignment := case when target_scope = 'project' then p_assignment_id else null end;

  select * into worker from public.programme_workers w
   where w.id = p_worker_id and w.programme_id = p_programme_id;
  if not found then
    raise exception 'worker not found' using errcode = 'P0002';
  end if;

  -- Revoking needs no purpose; granting does, because a consent without a stated purpose is not a consent.
  if p_grant and (char_length(purpose_text) < 4 or char_length(purpose_text) > 300) then
    raise exception 'state what the consent is for (4 to 300 characters)' using errcode = '22023';
  end if;
  if target_scope = 'project' and p_assignment_id is null then
    raise exception 'a project consent needs the project it covers' using errcode = '22023';
  end if;
  if target_scope = 'project' and p_assignment_id is not null and not exists (
    select 1 from public.programme_allocations al
     where al.worker_id = worker.id and al.assignment_id = p_assignment_id
  ) then
    raise exception 'that project is not one this worker is allocated to' using errcode = '22023';
  end if;

  -- Who is speaking, and for whom.
  if worker.worker_account_id = me then
    source := 'worker';
  elsif actor_is_platform then
    source := 'platform';
  elsif worker.worker_account_id is not null then
    raise exception 'this worker has an account here: only they can consent, or platform support recording a consent given on paper' using errcode = '42501';
  elsif app_private.programme_role_rank(role) < 3 then
    raise exception 'not authorized to record consent' using errcode = '42501';
  else
    -- A worker with no account cannot consent in the application; this row records that they consented
    -- elsewhere, and says so.
    source := 'recorded_offline';
  end if;

  if p_grant then
    -- An existing active consent for the same scope has its purpose and timestamp refreshed; there is never a
    -- second active row for one scope, which the partial unique index also enforces.
    update public.programme_worker_consents
       set purpose = purpose_text,
           granted_at = now(),
           grant_source = source,
           granted_by_account_id = me
     where worker_id = worker.id
       and scope = target_scope
       and assignment_id is not distinct from target_assignment
       and revoked_at is null
     returning id into consent_id;

    if consent_id is null then
      insert into public.programme_worker_consents (worker_id, scope, assignment_id, purpose, grant_source, granted_by_account_id)
      values (worker.id, target_scope, target_assignment, purpose_text, source, me)
      returning id into consent_id;
    end if;
  else
    update public.programme_worker_consents
       set revoked_at = now(), revoked_by_account_id = me
     where worker_id = worker.id
       and scope = target_scope
       and assignment_id is not distinct from target_assignment
       and revoked_at is null
     returning id into consent_id;

    if consent_id is null then
      raise exception 'there is no active consent to revoke' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'user',
          case when p_grant then 'PROGRAMME_CONSENT_GRANTED' else 'PROGRAMME_CONSENT_REVOKED' end,
          'programme_worker', worker.id, 'participant_private',
          jsonb_build_object('programme_id', p_programme_id, 'scope', target_scope, 'source', source));

  return jsonb_build_object('id', consent_id, 'granted', p_grant, 'source', source, 'scope', target_scope);
end $$;

revoke all on function public.get_programme_context_command(uuid) from public, anon;
revoke all on function public.get_programme_workers_command(uuid) from public, anon;
revoke all on function public.enrol_programme_worker_command(uuid, text, text, text, text[], uuid, uuid) from public, anon;
revoke all on function public.record_programme_credential_command(uuid, uuid, text, text, date, date, text, text) from public, anon;
revoke all on function public.assign_programme_worker_command(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.link_programme_project_command(uuid, uuid, text) from public, anon;
revoke all on function public.unlink_programme_project_command(uuid, uuid) from public, anon;
revoke all on function public.record_programme_consent_command(uuid, uuid, text, uuid, text, boolean) from public, anon;

grant execute on function public.get_programme_context_command(uuid) to authenticated;
grant execute on function public.get_programme_workers_command(uuid) to authenticated;
grant execute on function public.enrol_programme_worker_command(uuid, text, text, text, text[], uuid, uuid) to authenticated;
grant execute on function public.record_programme_credential_command(uuid, uuid, text, text, date, date, text, text) to authenticated;
grant execute on function public.assign_programme_worker_command(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.link_programme_project_command(uuid, uuid, text) to authenticated;
grant execute on function public.unlink_programme_project_command(uuid, uuid) to authenticated;
grant execute on function public.record_programme_consent_command(uuid, uuid, text, uuid, text, boolean) to authenticated;
