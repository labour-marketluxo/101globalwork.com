create table public.public_discovery_documents (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null unique references public.public_routes(id) on delete cascade,
  market_id uuid not null references public.markets(id),
  entity_kind public.entity_kind not null,
  canonical_path text not null unique,
  title text not null,
  h1 text not null,
  meta_description text,
  summary text,
  structured_data jsonb not null default '{}'::jsonb,
  language_code text not null,
  indexability public.indexability_state not null default 'noindex_follow',
  content_hash text not null,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint public_discovery_indexable_publish_check check (indexability <> 'indexable' or published_at is not null)
);

comment on table public.public_discovery_documents is 'Explicit allowlisted public SEO projection. Private project/customer records must never be joined into this table.';

create index public_discovery_market_kind_idx on public.public_discovery_documents(market_id, entity_kind);
create index public_discovery_indexability_idx on public.public_discovery_documents(indexability, updated_at desc);

alter table public.public_discovery_documents enable row level security;

create policy public_discovery_indexable_read on public.public_discovery_documents
for select to anon, authenticated
using (indexability = 'indexable' and published_at is not null);

revoke all on public.public_discovery_documents from anon, authenticated;
grant select on public.public_discovery_documents to anon, authenticated;

create or replace view public.public_sitemap_entries
with (security_invoker = true)
as
select canonical_path, updated_at, language_code, entity_kind
from public.public_discovery_documents
where indexability = 'indexable' and published_at is not null;

grant select on public.public_sitemap_entries to anon, authenticated;
