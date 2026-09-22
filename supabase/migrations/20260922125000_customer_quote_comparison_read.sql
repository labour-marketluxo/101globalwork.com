-- One read function for the customer's own quotes: the comparison table, the version history and the
-- quote detail page all read from this.
--
-- WHY A FUNCTION RATHER THAN A JOIN. `providers` has exactly two policies — select/update for the owner
-- or an active organisation member — and NO customer-facing read policy. So a customer cannot join the
-- provider's display name onto their own quote; the rows simply come back empty, which is a silent wrong
-- answer rather than an error. The provider's public projection does not carry a display name either.
--
-- The alternative to this function was to show a quote attributed to nobody, or to widen the policy on
-- `providers` so every signed-in account could read every provider row. A definer function that returns
-- ONLY the columns a customer needs, for ONLY their own request, is the narrower of the two.
--
-- ⚠️ THE OWNERSHIP ASSERTION IS THE WHOLE SECURITY MODEL HERE. A definer function bypasses RLS, so if it
-- returned rows for any request id it would be a provider-directory leak keyed by guessable uuid. It
-- asserts `r.customer_account_id = current_account_id()` before returning anything, like
-- `find_eligible_providers_for_request` does.

create or replace function public.get_customer_quote_comparison(p_request_id uuid)
returns table(
  quote_id uuid,
  provider_id uuid,
  provider_display_name text,
  provider_slug text,
  provider_headline text,
  provider_identity_verified boolean,
  readiness_score integer,
  trust_score integer,
  version_label text,
  version_major integer,
  version_revision integer,
  status public.quote_status,
  total_minor bigint,
  currency_code text,
  summary text,
  valid_until timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  locked_at timestamptz,
  is_latest boolean,
  superseded_by_version text,
  open_change_requests integer
)
language sql
security definer
set search_path = public, app_private
as $function$
  with mine as (
    select r.id
    from public.requests r
    where r.id = p_request_id
      and r.customer_account_id = app_private.current_account_id()
  ),
  ranked as (
    select q.*,
           row_number() over (
             partition by q.provider_id
             order by q.version_major desc, q.version_revision desc, q.submitted_at desc
           ) as recency,
           first_value(q.version_label) over (
             partition by q.provider_id
             order by q.version_major desc, q.version_revision desc, q.submitted_at desc
           ) as highest_label
    from public.quotes q
    join mine on mine.id = q.request_id
  )
  select
    q.id,
    q.provider_id,
    p.display_name,
    pp.slug,
    pp.headline,
    -- A missing public profile is not a failed verification; it is a provider with nothing published, so
    -- the flag is false rather than the row being dropped.
    coalesce((pp.verification_summary ->> 'verified')::boolean, false),
    pp.readiness_score,
    pp.trust_score,
    q.version_label,
    q.version_major,
    q.version_revision,
    q.status,
    q.total_minor,
    q.currency_code,
    q.summary,
    q.valid_until,
    q.submitted_at,
    q.accepted_at,
    q.locked_at,
    (q.recency = 1),
    -- Which version replaced this one, so a history row can say so instead of leaving the reader to work
    -- it out from the ordering.
    case when q.recency = 1 then null else q.highest_label end,
    (
      select count(*)::integer
      from public.quote_change_requests c
      where c.quote_id = q.id and c.status = 'open'
    )
  from ranked q
  join public.providers p on p.id = q.provider_id
  left join public.provider_public_profiles pp on pp.provider_id = q.provider_id
  order by q.provider_id, q.version_major desc, q.version_revision desc, q.submitted_at desc;
$function$;

comment on function public.get_customer_quote_comparison(uuid) is
  'Every quote version on one of the caller''s own requests, with the provider identity the customer cannot read directly.';

revoke all on function public.get_customer_quote_comparison(uuid) from public, anon;
grant execute on function public.get_customer_quote_comparison(uuid) to authenticated;
