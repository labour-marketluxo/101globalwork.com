-- ============================================================================
-- Phase 3 — the public service taxonomy catalog
--
-- WHY THIS EXISTS
--
-- The three canonical taxonomy routes (/{market}/services, /{market}/services/
-- {category}, /{market}/services/{service-slug}) need to read a grouping layer,
-- a URL-handle layer, an ordinary-language layer and a redirect-history layer.
-- None of them is readable by an anonymous visitor today, and none of them can be
-- made readable by loosening a policy:
--
--   taxonomy_entities / entity_names / entity_synonyms   deny-direct to anon
--   taxonomy_links                                       deny-direct to anon
--   public_routes / route_redirects                      deny-direct to anon
--   indexability_policies                                deny-direct to anon
--
-- Those tables hold problems, outcomes, skills, credentials and route metadata
-- that have NOT been curated for publication, so the fix is not "open them up" —
-- it is the pattern this schema already uses for the marketplace itself: a
-- CURATED PUBLIC PROJECTION TABLE per surface (public_market_catalog,
-- public_location_catalog, public_service_catalog), with a public read policy and
-- an explicit column allowlist. This migration adds the taxonomy's.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   * No new entity kind. `entity_kind` has no 'service_category' value, and
--     ADD VALUE cannot be used in the same transaction that first uses it, so a
--     category would have had to be a service (polluting the search filter) or a
--     second taxonomy authority. It is neither: categories are a CURATION layer
--     owned by public_service_category_catalog, which references the canonical
--     service entities by id and never invents one.
--   * No generated copy. Every seeded string is either a name the platform already
--     publishes, a synonym already in entity_synonyms, or platform process text
--     that is already live on /how-it-works, /pricing and /trust-and-safety. No
--     prices, ratings, lead times, guarantees or provider counts are invented.
--   * No indexable routes. The two service routes are registered and then evaluated
--     by app_private.evaluate_route_indexability, which reads the market's own
--     minimum_supply (3) against actual supply (0) and returns 'insufficient_supply'.
--     That is the honest state, and the pages render it out loud.
--
-- SLUGS ARE HANDLES. public_routes.slug is the mutable URL handle for a service;
-- the taxonomy entity id stays the authority. route_redirects is the retirement
-- history for a handle that changes, projected publicly below so the route resolver
-- can answer a retired URL before it 404s. (It is empty today: no handle has been
-- renamed yet. The lookup is implemented and tested regardless, because a redirect
-- history that only starts working after the first rename is a redirect history
-- nobody can trust.)
-- ============================================================================

-- ---------------------------------------------------------------- projection DDL

create table if not exists public.public_service_content_catalog (
  service_entity_id uuid primary key references public.taxonomy_entities(id) on delete cascade,
  summary text not null,
  guidance jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  updated_at timestamptz not null default now()
);
comment on table public.public_service_content_catalog is 'Curated public copy for a service: a plain-language summary and platform guidance. Allowlisted projection — never join private or provider-scoped data into it.';

create table if not exists public.public_service_alias_catalog (
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  language_code text not null,
  phrase text not null,
  updated_at timestamptz not null default now(),
  primary key (service_entity_id, language_code, phrase)
);
comment on table public.public_service_alias_catalog is 'The ordinary phrases a service is known by, projected from entity_synonyms. Each phrase is a usable public search term.';

create table if not exists public.public_service_route_catalog (
  route_id uuid primary key references public.public_routes(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  slug text not null,
  canonical_path text not null,
  indexability public.indexability_state not null,
  minimum_supply integer,
  language_code text not null default 'en',
  updated_at timestamptz not null default now()
);
comment on table public.public_service_route_catalog is 'Allowlisted projection of public_routes for market-level service pages: the URL handle, its canonical path, the policy-evaluated indexability and the market threshold that produced it.';

create table if not exists public.public_service_category_catalog (
  category_id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  canonical_key text not null unique,
  slug text not null,
  display_name text not null,
  definition text not null,
  guidance jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists public_service_category_slug_idx
  on public.public_service_category_catalog(market_id, slug) nulls not distinct;
comment on table public.public_service_category_catalog is 'The curated grouping layer of the service taxonomy. A category references canonical service entities through public_service_category_member_catalog; it is NOT a taxonomy entity itself (entity_kind has no category value).';

create table if not exists public.public_service_category_member_catalog (
  category_id uuid not null references public.public_service_category_catalog(category_id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (category_id, service_entity_id)
);
comment on table public.public_service_category_member_catalog is 'Which canonical services a published category contains. The membership is the category page.';

create table if not exists public.public_route_redirect_catalog (
  from_path text primary key,
  to_path text not null,
  http_status smallint not null default 301 check (http_status in (301, 308)),
  updated_at timestamptz not null default now()
);
comment on table public.public_route_redirect_catalog is 'Allowlisted projection of route_redirects: retired public path -> current canonical path. Read by the taxonomy resolver before it raises a 404.';

-- ------------------------------------------------------------------ RLS + grants
-- Public read, exactly like the other curated catalogs. Every policy is
-- `using (true)` because the CONTENT is the point of the table: nothing in these
-- six projections is provider-scoped, customer-scoped or unpublished.

alter table public.public_service_content_catalog enable row level security;
alter table public.public_service_alias_catalog enable row level security;
alter table public.public_service_route_catalog enable row level security;
alter table public.public_service_category_catalog enable row level security;
alter table public.public_service_category_member_catalog enable row level security;
alter table public.public_route_redirect_catalog enable row level security;

drop policy if exists public_service_content_catalog_read on public.public_service_content_catalog;
create policy public_service_content_catalog_read on public.public_service_content_catalog for select to anon, authenticated using (true);
drop policy if exists public_service_alias_catalog_read on public.public_service_alias_catalog;
create policy public_service_alias_catalog_read on public.public_service_alias_catalog for select to anon, authenticated using (true);
drop policy if exists public_service_route_catalog_read on public.public_service_route_catalog;
create policy public_service_route_catalog_read on public.public_service_route_catalog for select to anon, authenticated using (true);
drop policy if exists public_service_category_catalog_read on public.public_service_category_catalog;
create policy public_service_category_catalog_read on public.public_service_category_catalog for select to anon, authenticated using (true);
drop policy if exists public_service_category_member_catalog_read on public.public_service_category_member_catalog;
create policy public_service_category_member_catalog_read on public.public_service_category_member_catalog for select to anon, authenticated using (true);
drop policy if exists public_route_redirect_catalog_read on public.public_route_redirect_catalog;
create policy public_route_redirect_catalog_read on public.public_route_redirect_catalog for select to anon, authenticated using (true);

revoke all on public.public_service_content_catalog, public.public_service_alias_catalog,
  public.public_service_route_catalog, public.public_service_category_catalog,
  public.public_service_category_member_catalog, public.public_route_redirect_catalog
  from anon, authenticated;
grant select on public.public_service_content_catalog, public.public_service_alias_catalog,
  public.public_service_route_catalog, public.public_service_category_catalog,
  public.public_service_category_member_catalog, public.public_route_redirect_catalog
  to anon, authenticated;

-- ------------------------------------------------------------------ seed: NG
-- The taxonomy today is two services (public_service_catalog holds exactly those
-- two), so the grouping layer has one category per service. That is the sparse
-- case the category page renders explicitly rather than hiding: it is the true
-- shape of the catalog, not a placeholder for a bigger one.

with seed(canonical_key, slug, display_name, definition, guidance, sort_order) as (values
  ('home_property_maintenance','home-property','Home & property maintenance',
   'Work on the fabric of a building and the services that keep it working - water, fittings and the repairs that follow ordinary wear.',
   jsonb_build_array(
     'Start from what is happening rather than from the part you think is broken.',
     'Agree the scope in writing before work starts; a change is re-approved before it is done, not invoiced after it.',
     'Identity is checked before a provider can quote on your request.'),
   10),
  ('apparel_alterations','apparel-alterations','Apparel & alterations',
   'Making, fitting and repairing clothing and other textile goods, from a hem to a made-to-measure piece.',
   jsonb_build_array(
     'Say what the garment has to do afterwards: a fit, a repair, or a made-to-measure piece.',
     'Bring the garment, or exact measurements, to the quote rather than after it.',
     'Payment is held by our payment provider and released only after you approve the finished work.'),
   20)
)
insert into public.public_service_category_catalog(market_id, canonical_key, slug, display_name, definition, guidance, language_code, sort_order)
select m.id, s.canonical_key, s.slug, s.display_name, s.definition, s.guidance, 'en', s.sort_order
from seed s cross join (select id from public.markets where code = 'NG') m
on conflict (canonical_key) do update set
  slug = excluded.slug, display_name = excluded.display_name, definition = excluded.definition,
  guidance = excluded.guidance, language_code = excluded.language_code, sort_order = excluded.sort_order, updated_at = now();

with mapping(category_key, service_key) as (values
  ('home_property_maintenance','plumbing_residential'),
  ('apparel_alterations','tailoring_alterations')
)
insert into public.public_service_category_member_catalog(category_id, service_entity_id, sort_order)
select c.category_id, t.id, case mp.service_key when 'plumbing_residential' then 10 else 20 end
from mapping mp
join public.public_service_category_catalog c on c.canonical_key = mp.category_key
join public.taxonomy_entities t on t.kind = 'service' and t.canonical_key = mp.service_key
on conflict (category_id, service_entity_id) do nothing;

with seed(canonical_key, summary, guidance) as (values
  ('plumbing_residential',
   'Plumbing work in homes and small buildings: leaks, taps and mixers, pipework, drainage and fittings.',
   jsonb_build_array(
     'Describe the symptom rather than the fix you have in mind; water under the sink since Tuesday scopes the work better than a guess at the part.',
     'Ask for an itemized quote and compare it line by line against the same scope.',
     'Payment is held by our payment provider and released only after you approve the finished work.')),
  ('tailoring_alterations',
   'Alterations and tailoring: garments taken in, let out, hemmed and repaired, plus made-to-measure work.',
   jsonb_build_array(
     'Say when you need the garment back - turnaround is part of the scope, not a detail after it.',
     'Bring the garment, or exact measurements, to the quote rather than after it.',
     'Payment is held by our payment provider and released only after you approve the finished work.'))
)
insert into public.public_service_content_catalog(service_entity_id, summary, guidance, language_code)
select t.id, s.summary, s.guidance, 'en'
from seed s join public.taxonomy_entities t on t.kind = 'service' and t.canonical_key = s.canonical_key
on conflict (service_entity_id) do update set
  summary = excluded.summary, guidance = excluded.guidance, language_code = excluded.language_code, updated_at = now();

-- The ordinary-language layer is projected from the real synonym rows. Nothing new
-- is written: if a phrase is not a curated synonym, it is not a public search term.
insert into public.public_service_alias_catalog(service_entity_id, language_code, phrase)
select s.entity_id, s.language_code, s.phrase
from public.entity_synonyms s
join public.taxonomy_entities t on t.id = s.entity_id and t.kind = 'service' and t.is_active
on conflict (service_entity_id, language_code, phrase) do update set updated_at = now();

-- Market-level service routes. These are the URL handles the taxonomy pages serve;
-- `location_id is null` is what makes them market-scoped rather than local (the
-- existing /ng/abuja/gwarinpa/plumbers/ route keeps its own row and stays a
-- location page).
with mapping(canonical_key, slug) as (values
  ('plumbing_residential','plumbing'),
  ('tailoring_alterations','tailoring-alterations')
)
insert into public.public_routes(market_id, entity_kind, entity_id, location_id, slug, canonical_path, indexability, quality_score, metadata)
select m.id, 'service', t.id, null, mp.slug, '/ng/services/' || mp.slug || '/', 'noindex_follow', null,
       jsonb_build_object('seed','phase_3_service_taxonomy')
from mapping mp
join public.taxonomy_entities t on t.kind = 'service' and t.canonical_key = mp.canonical_key
cross join (select id from public.markets where code = 'NG') m
on conflict (canonical_path) do update set
  slug = excluded.slug, entity_kind = excluded.entity_kind, entity_id = excluded.entity_id,
  metadata = excluded.metadata, updated_at = now();

-- SEO documents, from the curated copy, so title/h1/meta/summary/JSON-LD are
-- curation rather than strings composed in JSX. `is_public = true` is what makes
-- them readable; indexability is decided by the evaluator below, not here.
--
-- TWO DETAILS LEARNED FROM THE FIRST FAILED PUSH OF THIS FILE, both kept visible:
--
--   * `public.markets` has NO display_name column. The human-readable market name is
--     a public PROJECTION (public_market_catalog.display_name), which is why every
--     public read goes through that table and this join has to as well.
--   * `digest()` is pgcrypto, and NO migration in this repo creates the extension.
--     It resolved for the phase-1 seed, but a content hash is a change-detection
--     fingerprint, not a security boundary, so `md5()` (built in) removes the
--     extension dependency rather than assuming it is present.
insert into public.public_discovery_documents(route_id, market_id, entity_kind, canonical_path, title, h1, meta_description, summary, structured_data, language_code, indexability, content_hash, published_at, is_public)
select r.id, r.market_id, r.entity_kind, r.canonical_path,
       sc.display_name || ' in ' || mc.display_name,
       sc.display_name || ' in ' || mc.display_name,
       cc.summary,
       cc.summary,
       jsonb_build_object(
         '@context','https://schema.org',
         '@type','Service',
         'name', sc.display_name || ' services in ' || mc.display_name,
         'areaServed', mc.display_name),
       cc.language_code, 'noindex_follow',
       md5('service-route:' || r.canonical_path),
       null, true
from public.public_routes r
join public.markets m on m.id = r.market_id
join public.public_market_catalog mc on mc.market_id = m.id
join public.public_service_catalog sc on sc.service_entity_id = r.entity_id
join public.public_service_content_catalog cc on cc.service_entity_id = r.entity_id
where r.entity_kind = 'service' and r.location_id is null
on conflict (route_id) do update set
  title = excluded.title, h1 = excluded.h1, meta_description = excluded.meta_description,
  summary = excluded.summary, structured_data = excluded.structured_data,
  content_hash = excluded.content_hash, is_public = true, updated_at = now();

-- Policy evaluation. With zero published providers and minimum_supply = 3 for
-- kind 'service', both routes come back 'insufficient_supply' — which is the state
-- the pages then explain to the reader. This call is also what keeps the registry
-- and the projection below in agreement with the policy table rather than with an
-- assumption made in this migration.
select app_private.evaluate_route_indexability(id)
from public.public_routes
where entity_kind = 'service' and location_id is null;

-- Projected AFTER the evaluation so the public catalogue carries the evaluated
-- state, not the placeholder the insert above used.
insert into public.public_service_route_catalog(route_id, market_id, service_entity_id, slug, canonical_path, indexability, minimum_supply, language_code, updated_at)
select r.id, r.market_id, r.entity_id, r.slug, r.canonical_path, r.indexability,
       (select p.minimum_supply from public.indexability_policies p
         where p.is_active and p.entity_kind = r.entity_kind
           and (p.market_id = r.market_id or p.market_id is null)
         order by (p.market_id is not null) desc limit 1),
       coalesce(m.default_language_code, 'en'), now()
from public.public_routes r
join public.markets m on m.id = r.market_id
where r.entity_kind = 'service' and r.location_id is null
on conflict (route_id) do update set
  slug = excluded.slug, canonical_path = excluded.canonical_path, indexability = excluded.indexability,
  minimum_supply = excluded.minimum_supply, language_code = excluded.language_code, updated_at = now();

-- Retirement history. Empty on a fresh database — no handle has been renamed — but
-- projected here so that the resolver's redirect branch reads a public table that
-- is correct the moment a rename is recorded in route_redirects.
insert into public.public_route_redirect_catalog(from_path, to_path, http_status, updated_at)
select rr.from_path, r.canonical_path, rr.http_status, now()
from public.route_redirects rr
join public.public_routes r on r.id = rr.to_route_id
on conflict (from_path) do update set
  to_path = excluded.to_path, http_status = excluded.http_status, updated_at = now();
