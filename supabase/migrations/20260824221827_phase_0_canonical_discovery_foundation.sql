create type public.entity_kind as enum ('service','problem','outcome','skill','credential','location','provider','template');
create type public.data_classification as enum ('public','participant_private','organisation_confidential','regulated_sensitive','system_internal');
create type public.indexability_state as enum ('indexable','noindex_follow','canonical_to_parent','blocked_private','insufficient_content','insufficient_supply','duplicate');

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  default_language_code text not null,
  default_currency_code text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete restrict,
  parent_id uuid references public.locations(id) on delete restrict,
  location_type text not null,
  canonical_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, canonical_code)
);

create table public.taxonomy_entities (
  id uuid primary key default gen_random_uuid(),
  kind public.entity_kind not null,
  canonical_key text not null,
  risk_level smallint not null default 0 check (risk_level between 0 and 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, canonical_key)
);

create table public.entity_names (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  language_code text not null,
  display_name text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (entity_id, language_code, display_name)
);

create table public.entity_synonyms (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  language_code text not null,
  phrase text not null,
  created_at timestamptz not null default now(),
  unique (entity_id, language_code, phrase)
);

create table public.taxonomy_links (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  to_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  relation_type text not null,
  weight numeric(8,5),
  created_at timestamptz not null default now(),
  unique (from_entity_id, to_entity_id, relation_type),
  check (from_entity_id <> to_entity_id)
);

create table public.public_routes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete restrict,
  entity_kind public.entity_kind not null,
  entity_id uuid not null,
  location_id uuid references public.locations(id) on delete restrict,
  slug text not null,
  canonical_path text not null unique,
  indexability public.indexability_state not null default 'noindex_follow',
  canonical_route_id uuid references public.public_routes(id) on delete restrict,
  quality_score numeric(5,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.route_redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_route_id uuid not null references public.public_routes(id) on delete restrict,
  http_status smallint not null default 301 check (http_status in (301,308)),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_type text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  reason_code text,
  data_classification public.data_classification not null default 'system_internal',
  metadata jsonb not null default '{}'::jsonb
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  idempotency_key text not null unique
);

create index idx_locations_market_parent on public.locations(market_id, parent_id);
create index idx_taxonomy_entities_kind_active on public.taxonomy_entities(kind, is_active);
create index idx_entity_names_language_name on public.entity_names(language_code, display_name);
create index idx_entity_synonyms_language_phrase on public.entity_synonyms(language_code, phrase);
create index idx_public_routes_lookup on public.public_routes(market_id, entity_kind, entity_id, location_id);
create index idx_public_routes_indexability on public.public_routes(indexability);
create index idx_audit_resource on public.audit_events(resource_type, resource_id, occurred_at desc);
create index idx_outbox_unpublished on public.outbox_events(occurred_at) where published_at is null;

alter table public.markets enable row level security;
alter table public.locations enable row level security;
alter table public.taxonomy_entities enable row level security;
alter table public.entity_names enable row level security;
alter table public.entity_synonyms enable row level security;
alter table public.taxonomy_links enable row level security;
alter table public.public_routes enable row level security;
alter table public.route_redirects enable row level security;
alter table public.audit_events enable row level security;
alter table public.outbox_events enable row level security;

comment on table public.public_routes is 'SEO/public-discovery routing registry. Slugs and paths are mutable representations; entity IDs remain canonical authority.';
comment on table public.audit_events is 'Append-oriented evidence of consequential actions; not an authoritative business-state table.';
comment on table public.outbox_events is 'Transactional outbox for reliable domain event delivery.';
