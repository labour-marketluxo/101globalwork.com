-- Agreement acceptance, and the step-up that makes it worth something.
--
-- THE BRIEF ASKS FOR "Checkbox + Step-up OTP/PIN verification or e-signature". Here is what each of those
-- can honestly be in this platform:
--
--   * E-SIGNATURE: nothing. There is no e-signature service, no key material and no signing provider wired
--     into this project. Nothing here claims to be one.
--   * PIN: nothing to check it against. No PIN is stored anywhere for a customer, and inventing a column
--     would create a secret the platform is then responsible for — with no rotation, no reset path and no
--     expiry. A "PIN" that is really just a typed number is theatre.
--   * OTP: real, and it already exists — GoTrue sends it. What was missing is the SERVER-SIDE PROOF that
--     the person clicking Accept just authenticated, which is what the helper below supplies.
--
-- ⚠️ THE ASSERTION IS ON `amr`, MEASURED, NOT ASSUMED. A real access token issued by this project carries
-- `amr: [{"method":"otp","timestamp":...}]` and `aal: "aal1"`. The admin side of this platform already
-- gates sensitive changes on `app_private.current_auth_is_aal2()`; that helper is unavailable to customers,
-- who have no second factor to enrol. The equivalent for a passwordless product is freshness: the caller
-- must have authenticated recently, which is exactly what a just-verified email OTP produces. This is the
-- same family of control, expressed in the unit this product actually has.
--
-- ⚠️ WHAT THIS IS NOT: a cryptographic signature over the agreement text. It is a clickwrap — the customer's
-- consent recorded against the exact version of the document they were shown, bound by a content hash so a
-- later edit to the wording is detectable. That is a real control and it is weaker than a signature, and the
-- page says so in those words.

create or replace function app_private.current_auth_verified_within(p_max_age interval)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(max((entry ->> 'timestamp')::double precision), -1)
         > extract(epoch from (now() - p_max_age))
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry;
$function$;

comment on function app_private.current_auth_verified_within(interval) is
  'True when the current token shows an authentication newer than p_max_age. False when amr is absent.';

create or replace function app_private.current_auth_method()
returns text
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select entry ->> 'method'
     from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
     order by (entry ->> 'timestamp')::double precision desc nulls last
     limit 1),
    'unknown');
$function$;

create table public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  customer_account_id uuid not null references public.accounts(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  quote_version_label text not null,
  total_minor bigint not null,
  currency_code text not null,
  agreement_hash text not null,
  consent_version text not null,
  auth_method text not null,
  verified_at timestamptz not null,
  accepted_at timestamptz not null default now(),
  constraint agreement_hash_sha256 check (agreement_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.agreement_acceptances is
  'One row per assignment: the clickwrap record of who accepted which quote version, after which step-up.';
comment on column public.agreement_acceptances.agreement_hash is
  'SHA-256 of the agreement text rendered at acceptance. Recomputed by the page so an edit to the wording is detectable.';

create index agreement_acceptance_request_idx on public.agreement_acceptances(request_id);
create index agreement_acceptance_account_idx on public.agreement_acceptances(customer_account_id, accepted_at desc);

alter table public.agreement_acceptances enable row level security;

create policy agreement_acceptance_customer_read on public.agreement_acceptances
  for select to authenticated
  using (customer_account_id = app_private.current_account_id());

create policy agreement_acceptance_provider_read on public.agreement_acceptances
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = agreement_acceptances.provider_id
        and (
          p.owner_account_id = app_private.current_account_id()
          or (p.organisation_id is not null and app_private.is_active_org_member(p.organisation_id))
        )
    )
  );

grant select on public.agreement_acceptances to authenticated;

create or replace function public.accept_project_agreement_command(
  p_assignment_id uuid,
  p_agreement_hash text,
  p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $function$
declare
  me uuid; a public.assignments%rowtype; r public.requests%rowtype;
  q public.quotes%rowtype; existing_id uuid; consent text; verified timestamptz;
begin
  me := app_private.current_account_id();
  if me is null then raise exception 'not authorized' using errcode = '42501'; end if;

  perform 1 from public.assignments where id = p_assignment_id for update;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'agreement not found' using errcode = 'P0002'; end if;

  select * into r from public.requests where id = a.request_id;
  if r.customer_account_id <> me then raise exception 'not authorized' using errcode = '42501'; end if;

  if a.status <> 'active' then
    raise exception 'this agreement is % and can no longer be accepted', a.status using errcode = '22023';
  end if;

  select * into q from public.quotes where id = a.accepted_quote_id;
  if not found then raise exception 'the accepted quote for this agreement is missing' using errcode = 'P0002'; end if;

  -- The locked version is the authority. If it is not locked something bypassed the accept path, and this
  -- record must not be written against a price that is still open to change.
  if q.status <> 'accepted' or q.locked_at is null then
    raise exception 'the accepted quote version is not locked' using errcode = '22023';
  end if;

  -- An acceptance is a fact, not a state to be toggled: the first one stands.
  select id into existing_id from public.agreement_acceptances where assignment_id = a.id;
  if existing_id is not null then return existing_id; end if;

  -- ⚠️ THE STEP-UP. Reachable only with a token whose `amr` timestamp is inside the window, which means
  -- the customer verified an emailed code moments ago. A stale session is refused with 42501 so the UI can
  -- tell "you need to verify again" apart from "this failed".
  if not app_private.current_auth_verified_within(interval '15 minutes') then
    raise exception 'step-up verification required' using errcode = '42501';
  end if;

  if p_agreement_hash is null or p_agreement_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid agreement reference' using errcode = '22023';
  end if;

  consent := btrim(coalesce(p_consent_version, ''));
  if char_length(consent) < 3 or char_length(consent) > 40 then
    raise exception 'invalid consent reference' using errcode = '22023';
  end if;

  -- The timestamp of that recent authentication, kept on the record so the acceptance can say when the
  -- verification actually happened rather than when the row was written.
  select coalesce(max((entry ->> 'timestamp')::double precision), -1)
  into verified
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry;

  insert into public.agreement_acceptances(
    assignment_id, request_id, quote_id, customer_account_id, provider_id,
    quote_version_label, total_minor, currency_code, agreement_hash, consent_version,
    auth_method, verified_at)
  values (a.id, a.request_id, q.id, me, a.provider_id,
          q.version_label, q.total_minor, q.currency_code, lower(p_agreement_hash), p_consent_version,
          app_private.current_auth_method(), to_timestamp(verified))
  returning id into existing_id;

  insert into public.audit_events (actor_user_id, actor_type, action, resource_type, resource_id, data_classification, metadata)
  values (auth.uid(), 'account', 'AGREEMENT_ACCEPTED', 'assignment', a.id, 'participant_private',
          jsonb_build_object('account_id', me, 'quote_id', q.id, 'quote_version', q.version_label,
                             'auth_method', app_private.current_auth_method(),
                             'agreement_hash', lower(p_agreement_hash)));

  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values ('assignment', a.id, 'AGREEMENT_ACCEPTED',
          jsonb_build_object('assignment_id', a.id, 'request_id', a.request_id, 'quote_id', q.id,
                             'customer_account_id', me),
          'agreement-accepted:' || a.id::text);

  return existing_id;
end
$function$;

revoke all on function public.accept_project_agreement_command(uuid, text, text) from public, anon;
grant execute on function public.accept_project_agreement_command(uuid, text, text) to authenticated;
