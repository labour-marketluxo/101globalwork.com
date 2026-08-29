-- Expand the first Nigeria marketplace slice only enough to let provider setup
-- record the actual service/location demonstrated in current E2E testing.
-- This does NOT create public SEO routes or make either surface indexable.

insert into public.taxonomy_entities(kind,canonical_key,risk_level,is_active)
values('service','tailoring_alterations',1,true)
on conflict(kind,canonical_key) do update set is_active=true;

with e as (
  select id from public.taxonomy_entities where kind='service' and canonical_key='tailoring_alterations'
)
insert into public.entity_names(entity_id,language_code,display_name,is_primary)
select id,'en','Tailoring & alterations',true from e
on conflict(entity_id,language_code,display_name) do nothing;

with e as (
  select id from public.taxonomy_entities where kind='service' and canonical_key='tailoring_alterations'
)
insert into public.entity_synonyms(entity_id,language_code,phrase)
select id,'en',phrase from e
cross join(values('tailor'),('tailoring'),('clothing alterations'),('dressmaking'),('garment alterations')) s(phrase)
on conflict(entity_id,language_code,phrase) do nothing;

with e as (
  select id,risk_level from public.taxonomy_entities where kind='service' and canonical_key='tailoring_alterations'
)
insert into public.public_service_catalog(service_entity_id,canonical_key,display_name,risk_level)
select id,'tailoring_alterations','Tailoring & alterations',risk_level from e
on conflict(service_entity_id) do update set
  canonical_key=excluded.canonical_key,
  display_name=excluded.display_name,
  risk_level=excluded.risk_level;

with m as (select id from public.markets where code='NG'),
country as (select id from public.locations where market_id=(select id from m) and canonical_code='ng')
insert into public.locations(market_id,parent_id,location_type,canonical_code,is_active)
select m.id,country.id,'region','niger-state',true from m,country
on conflict(market_id,canonical_code) do update set is_active=true;

with m as (select id from public.markets where code='NG'),
region as (select id from public.locations where market_id=(select id from m) and canonical_code='niger-state')
insert into public.locations(market_id,parent_id,location_type,canonical_code,is_active)
select m.id,region.id,'city','minna',true from m,region
on conflict(market_id,canonical_code) do update set is_active=true;

with l as (
  select id,market_id,parent_id,location_type,canonical_code from public.locations
  where canonical_code='niger-state' and market_id=(select id from public.markets where code='NG')
)
insert into public.public_location_catalog(location_id,market_id,parent_id,location_type,display_name,canonical_code)
select id,market_id,parent_id,location_type,'Niger State',canonical_code from l
on conflict(location_id) do update set
  parent_id=excluded.parent_id,
  location_type=excluded.location_type,
  display_name=excluded.display_name,
  canonical_code=excluded.canonical_code;

with l as (
  select id,market_id,parent_id,location_type,canonical_code from public.locations
  where canonical_code='minna' and market_id=(select id from public.markets where code='NG')
)
insert into public.public_location_catalog(location_id,market_id,parent_id,location_type,display_name,canonical_code)
select id,market_id,parent_id,location_type,'Minna',canonical_code from l
on conflict(location_id) do update set
  parent_id=excluded.parent_id,
  location_type=excluded.location_type,
  display_name=excluded.display_name,
  canonical_code=excluded.canonical_code;
