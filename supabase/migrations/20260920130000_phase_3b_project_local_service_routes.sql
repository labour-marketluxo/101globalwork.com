-- ============================================================================
-- Phase 3b — project LOCATION-scoped service routes publicly
--
-- WHY
--
-- 20260920120000 projected only market-level service routes (`location_id is
-- null`), because the taxonomy pages only needed those. The local discovery page
-- (/{market}/{region}/{locality}/{service-plural}) needs the other kind: the route
-- the registry already holds for a service IN a place — which is where the URL
-- handle, the canonical path and the policy-evaluated indexability for that exact
-- combination live.
--
-- Without this projection the page would have to guess its own indexability from
-- "does a discovery document happen to exist", which is not the same question and
-- would put the indexing decision in the UI instead of in the policy engine
-- (`indexability_policies` + app_private.evaluate_route_indexability). With it, the
-- page reports the registry's evaluated state, exactly as the market-level service
-- page does.
--
-- WHAT CHANGES
--
--   * one additive column: location_id (nullable — market-level rows keep NULL)
--   * the projection is regenerated for every service route, not only market-level
--   * one index for the (locality, service) lookup the page performs
--   * the evaluator is re-run for location-scoped routes so their indexability is
--     policy-derived rather than whatever the insert happened to write
--
-- Additive and idempotent: existing rows are updated in place by route_id, and the
-- market-level rows the taxonomy pages read keep location_id NULL, which is what
-- they filter on. Nothing here widens access to the canonical tables — the
-- projection stays the only public surface, with the same `using (true)` read
-- policy and the same column allowlist (no metadata, no quality score, no actor).
-- ============================================================================

alter table public.public_service_route_catalog
  add column if not exists location_id uuid references public.locations(id) on delete cascade;

comment on column public.public_service_route_catalog.location_id is
  'The locality a location-scoped service route belongs to. NULL for a market-level service route. Both kinds are projected so a page can find its own URL handle and its own policy-evaluated indexability.';

create index if not exists public_service_route_catalog_local_idx
  on public.public_service_route_catalog(location_id, service_entity_id);

-- Regenerate the whole service-route projection: market-level (location_id NULL) and
-- location-scoped alike.
insert into public.public_service_route_catalog(
  route_id, market_id, service_entity_id, location_id, slug, canonical_path,
  indexability, minimum_supply, language_code, updated_at)
select r.id, r.market_id, r.entity_id, r.location_id, r.slug, r.canonical_path, r.indexability,
       (select p.minimum_supply from public.indexability_policies p
         where p.is_active and p.entity_kind = r.entity_kind
           and (p.market_id = r.market_id or p.market_id is null)
         order by (p.market_id is not null) desc limit 1),
       coalesce(m.default_language_code, 'en'), now()
from public.public_routes r
join public.markets m on m.id = r.market_id
where r.entity_kind = 'service'
on conflict (route_id) do update set
  market_id = excluded.market_id,
  service_entity_id = excluded.service_entity_id,
  location_id = excluded.location_id,
  slug = excluded.slug,
  canonical_path = excluded.canonical_path,
  minimum_supply = excluded.minimum_supply,
  language_code = excluded.language_code,
  updated_at = now();

-- Re-evaluate, then re-project the state it wrote. The evaluator counts eligible
-- providers for the route's own location, so the local route's answer differs from
-- the market route's by construction — which is the whole point of projecting both.
select app_private.evaluate_route_indexability(id)
from public.public_routes
where entity_kind = 'service' and location_id is not null;

update public.public_service_route_catalog c
   set indexability = r.indexability, updated_at = now()
  from public.public_routes r
 where r.id = c.route_id and r.indexability is distinct from c.indexability;
