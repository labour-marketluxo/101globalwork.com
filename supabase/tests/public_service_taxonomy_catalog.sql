-- ============================================================================
-- Public service taxonomy catalog — authorization + resolution test
--
-- Run against a database with 20260920120000_phase_3_public_service_taxonomy_catalog
-- applied. Everything is inside one transaction that is rolled back, so it can be
-- run on a development database repeatedly.
--
-- WHAT THIS PROVES, and it is only the part that a type check cannot:
--
--   1. An anonymous visitor can read the six curated projections.
--   2. An anonymous visitor still CANNOT read the canonical taxonomy tables the
--      projections were built from (the deny-all policies are the reason the
--      projections exist; a migration that quietly opened the base tables would
--      pass a page smoke test and leak the unpublished half of the taxonomy).
--   3. The service routes are registered with URL handles that differ from their
--      canonical keys, which is the brief's "slug is a handle, not an identifier".
--   4. Indexability is policy-evaluated, not asserted: with supply below the
--      market's minimum, no service route is marked indexable.
--   5. Category membership resolves, including the sparse case (one service).
--   6. The redirect catalogue is readable and empty-but-queryable on a fresh
--      database.
-- ============================================================================

begin;

do $$
declare
  anon_services int;
  anon_categories int;
  anon_members int;
  anon_aliases int;
  anon_content int;
  anon_routes int;
  anon_redirects int;
  leaked_synonyms int;
  leaked_routes int;
  leaked_policies int;
  plumbing_slug text;
  plumbing_key text;
  indexable_routes int;
  plumbing_category text;
begin
  -- ---- 1. anonymous reads of the curated projections -----------------------
  set local role anon;

  select count(*) into anon_services from public.public_service_catalog;
  select count(*) into anon_categories from public.public_service_category_catalog;
  select count(*) into anon_members from public.public_service_category_member_catalog;
  select count(*) into anon_aliases from public.public_service_alias_catalog;
  select count(*) into anon_content from public.public_service_content_catalog;
  select count(*) into anon_routes from public.public_service_route_catalog;
  select count(*) into anon_redirects from public.public_route_redirect_catalog;

  -- ---- 2. the same visitor against the canonical tables --------------------
  -- These return zero rows rather than raising: RLS denies by filtering.
  select count(*) into leaked_synonyms from public.entity_synonyms;
  select count(*) into leaked_routes from public.public_routes;
  select count(*) into leaked_policies from public.indexability_policies;

  reset role;

  if anon_services = 0 then raise exception 'anon cannot read public_service_catalog'; end if;
  if anon_categories = 0 then raise exception 'anon cannot read the category catalog'; end if;
  if anon_members = 0 then raise exception 'anon cannot read category membership'; end if;
  if anon_aliases = 0 then raise exception 'anon cannot read the alias catalog'; end if;
  if anon_content = 0 then raise exception 'anon cannot read the service content catalog'; end if;
  if anon_routes = 0 then raise exception 'anon cannot read the service route catalog'; end if;

  if leaked_synonyms <> 0 then raise exception 'entity_synonyms leaked % rows to anon', leaked_synonyms; end if;
  if leaked_routes <> 0 then raise exception 'public_routes leaked % rows to anon', leaked_routes; end if;
  if leaked_policies <> 0 then raise exception 'indexability_policies leaked % rows to anon', leaked_policies; end if;

  -- ---- 3. handles differ from canonical keys -------------------------------
  select r.slug, t.canonical_key into plumbing_slug, plumbing_key
  from public.public_service_route_catalog r
  join public.taxonomy_entities t on t.id = r.service_entity_id
  where r.canonical_path = '/ng/services/plumbing/';

  if plumbing_slug is null then raise exception 'the plumbing service route is not registered'; end if;
  if plumbing_slug = plumbing_key then raise exception 'the route slug is the canonical key (%)', plumbing_key; end if;

  -- ---- 4. indexability is evaluated, and honest ----------------------------
  select count(*) into indexable_routes
  from public.public_service_route_catalog where indexability = 'indexable';

  if indexable_routes <> 0 then
    raise exception '% service routes are indexable while the market has no published providers', indexable_routes;
  end if;

  -- ---- 5. membership resolves, sparse case included ------------------------
  select c.display_name into plumbing_category
  from public.public_service_category_member_catalog m
  join public.public_service_category_catalog c on c.category_id = m.category_id
  join public.taxonomy_entities t on t.id = m.service_entity_id
  where t.canonical_key = 'plumbing_residential';

  if plumbing_category is null then raise exception 'plumbing_residential belongs to no published category'; end if;

  -- ---- 6. the redirect catalogue is queryable, not merely absent -----------
  if anon_redirects <> 0 then
    raise exception 'expected an empty redirect catalogue on a fresh database, found %', anon_redirects;
  end if;

  raise notice 'public taxonomy ok: % categories, % services, plumbing at /ng/services/%', anon_categories, anon_services, plumbing_slug;
end $$;

rollback;

select 'public_service_taxonomy_catalog_passed' as result;
