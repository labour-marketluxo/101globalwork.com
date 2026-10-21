-- Every public command that could never run, restored to a security posture that works.
--
-- ⚠️ THE BUG THIS FIXES, FOUND BY CALLING THE API INSTEAD OF THE DATABASE. These commands are thin public
-- wrappers around an `app_private.*_authoritatively` function, and each was written as SECURITY INVOKER —
-- so the CALLER needs EXECUTE on the private function. The migration that created each pair then revoked
-- exactly that privilege, a few lines later:
--
--     create or replace function public.accept_quote_command(p_quote_id uuid) returns uuid
--       language sql set search_path='app_private' as $$
--         select app_private.accept_quote_authoritatively(p_quote_id) $$;
--     grant execute on function public.accept_quote_command(uuid) to authenticated;
--     revoke all on function app_private.accept_quote_authoritatively(uuid) from public, anon, authenticated;
--
-- Both statements are right on their own and fatal together. The result: an authenticated caller gets
-- `403 permission denied for function accept_quote_authoritatively`, for every one of these commands,
-- since the day each was written.
--
-- WHY NOTHING CAUGHT IT. The e2e SQL tests in supabase/tests/ run as the database owner, which bypasses
-- EXECUTE checks entirely, so they pass. Nothing in the app's own test surface calls these RPCs over HTTP
-- as a signed-in user until a customer flow does — which is what a browser run of the quote comparison
-- did, and why this migration exists.
--
-- WHAT IT ALSO EXPLAINS. `providers` and `quotes` are EMPTY in this database: no provider could complete
-- onboarding (`create_provider_command`, `set_provider_service_command`, …) and no provider could submit a
-- quote (`submit_quote_command`). The customer side worked only because the newer customer commands
-- (`save_customer_request_draft_command`, and the ones added today) were written SECURITY DEFINER from the
-- start.
--
-- THE FIX IS THE HOUSE PATTERN, NOT A LOOSENING: the wrapper becomes SECURITY DEFINER with a frozen
-- search_path and the private function stays unreachable from the API. The wrapper grants nothing the
-- private function did not already decide for itself — every one of them re-derives the caller from
-- `auth.uid()` and asserts ownership inside. Verified after applying by calling each one over HTTP as a
-- real user and reading which error comes back: a domain error means the body ran; `permission denied`
-- would mean it did not.

-- ── The customer money path ──────────────────────────────────────────────────────────────────────────
create or replace function public.accept_quote_command(p_quote_id uuid)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.accept_quote_authoritatively(p_quote_id) $$;

-- ── Provider onboarding and publishing ───────────────────────────────────────────────────────────────
create or replace function public.create_provider_command(p_display_name text, p_market_id uuid, p_slug text, p_description text default null)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.create_provider_authoritatively(p_display_name, p_market_id, p_slug, p_description) $$;

create or replace function public.set_provider_service_command(p_provider_id uuid, p_service_entity_id uuid, p_is_primary boolean default false)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.set_provider_service_authoritatively(p_provider_id, p_service_entity_id, p_is_primary) $$;

create or replace function public.set_provider_service_area_command(p_provider_id uuid, p_location_id uuid, p_is_primary boolean default false)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.set_provider_service_area_authoritatively(p_provider_id, p_location_id, p_is_primary) $$;

create or replace function public.submit_provider_verification_command(p_provider_id uuid, p_kind public.verification_kind, p_jurisdiction_code text default null, p_reference_label text default null)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.submit_provider_verification_authoritatively(p_provider_id, p_kind, p_jurisdiction_code, p_reference_label) $$;

create or replace function public.update_provider_profile_command(p_provider_id uuid, p_headline text, p_description text, p_years_experience smallint default null, p_accepts_new_work boolean default true)
returns void
language sql
security definer
set search_path = public, app_private
as $$ select app_private.update_provider_profile_authoritatively(p_provider_id, p_headline, p_description, p_years_experience, p_accepts_new_work) $$;

create or replace function public.publish_provider_profile_command(p_provider_id uuid)
returns void
language sql
security definer
set search_path = public, app_private
as $$ select app_private.publish_provider_profile_authoritatively(p_provider_id) $$;

-- ── The provider quote path ──────────────────────────────────────────────────────────────────────────
create or replace function public.submit_quote_command(
  p_request_id uuid,
  p_provider_id uuid,
  p_currency_code text,
  p_total_minor bigint,
  p_summary text default null,
  p_scope_snapshot jsonb default '{}'::jsonb,
  p_valid_until timestamptz default null,
  p_idempotency_key text default null
)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.submit_quote_authoritatively(p_request_id, p_provider_id, p_currency_code, p_total_minor, p_summary, p_scope_snapshot, p_valid_until, p_idempotency_key) $$;

create or replace function public.get_provider_quote_opportunity(p_request_id uuid, p_provider_id uuid)
returns table(request_id uuid, need_text text, request_state public.request_state, service_entity_id uuid, location_id uuid, market_id uuid)
language sql
security definer
set search_path = public, app_private
as $$ select * from app_private.get_provider_quote_opportunity_authoritatively(p_request_id, p_provider_id) $$;

-- ── The request form that predates the guided intake ─────────────────────────────────────────────────
-- `app/(app)/requests/new/page.tsx` now redirects into the wizard, so nothing calls this any more; it is
-- repaired rather than deleted so that the class of bug is closed and a revert of that redirect does not
-- resurrect a dead button.
create or replace function public.create_request_command(
  p_market_id uuid,
  p_need_text text,
  p_idempotency_key text,
  p_location_id uuid default null,
  p_service_entity_id uuid default null,
  p_problem_entity_id uuid default null,
  p_outcome_entity_id uuid default null,
  p_locale text default null,
  p_timezone text default null
)
returns uuid
language sql
security definer
set search_path = public, app_private
as $$ select app_private.create_request_authoritatively(p_market_id, p_need_text, p_idempotency_key, p_location_id, p_service_entity_id, p_problem_entity_id, p_outcome_entity_id, p_locale, p_timezone) $$;

-- ── Platform-admin verification review ───────────────────────────────────────────────────────────────
-- Still admin-gated: the private function asserts the capability itself, and this wrapper adds none.
create or replace function public.review_provider_verification_command(p_verification_id uuid, p_decision public.verification_status, p_note text default null)
returns void
language sql
security definer
set search_path = public, app_private
as $$ select app_private.review_provider_verification_authoritatively(p_verification_id, p_decision, p_note) $$;

-- ⚠️ ANON IS REVOKED ON EVERY ONE OF THESE, AND THAT IS PART OF THE FIX RATHER THAN TIDYING. These
-- functions now run as their owner. Leaving a PUBLIC (or anon) grant in place would hand an unauthenticated
-- caller the owner's privileges for whatever the body decides to do before it checks `auth.uid()`.
revoke all on function public.accept_quote_command(uuid) from public, anon;
revoke all on function public.create_provider_command(text, uuid, text, text) from public, anon;
revoke all on function public.set_provider_service_command(uuid, uuid, boolean) from public, anon;
revoke all on function public.set_provider_service_area_command(uuid, uuid, boolean) from public, anon;
revoke all on function public.submit_provider_verification_command(uuid, public.verification_kind, text, text) from public, anon;
revoke all on function public.update_provider_profile_command(uuid, text, text, smallint, boolean) from public, anon;
revoke all on function public.publish_provider_profile_command(uuid) from public, anon;
revoke all on function public.submit_quote_command(uuid, uuid, text, bigint, text, jsonb, timestamptz, text) from public, anon;
revoke all on function public.get_provider_quote_opportunity(uuid, uuid) from public, anon;
revoke all on function public.create_request_command(uuid, text, text, uuid, uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.review_provider_verification_command(uuid, public.verification_status, text) from public, anon;

grant execute on function public.accept_quote_command(uuid) to authenticated;
grant execute on function public.create_provider_command(text, uuid, text, text) to authenticated;
grant execute on function public.set_provider_service_command(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_provider_service_area_command(uuid, uuid, boolean) to authenticated;
grant execute on function public.submit_provider_verification_command(uuid, public.verification_kind, text, text) to authenticated;
grant execute on function public.update_provider_profile_command(uuid, text, text, smallint, boolean) to authenticated;
grant execute on function public.publish_provider_profile_command(uuid) to authenticated;
grant execute on function public.submit_quote_command(uuid, uuid, text, bigint, text, jsonb, timestamptz, text) to authenticated;
grant execute on function public.get_provider_quote_opportunity(uuid, uuid) to authenticated;
grant execute on function public.create_request_command(uuid, text, text, uuid, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.review_provider_verification_command(uuid, public.verification_status, text) to authenticated;
