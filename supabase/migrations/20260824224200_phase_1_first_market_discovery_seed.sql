alter table public.public_discovery_documents add column if not exists is_public boolean not null default false;
drop policy if exists public_discovery_indexable_read on public.public_discovery_documents;
create policy public_discovery_public_read on public.public_discovery_documents for select to anon,authenticated using(is_public=true);

insert into public.markets(code,default_language_code,default_currency_code,is_active) values('NG','en','NGN',true)
on conflict(code) do update set is_active=excluded.is_active;
with m as(select id from public.markets where code='NG') insert into public.locations(market_id,parent_id,location_type,canonical_code) select m.id,null,'country','ng' from m on conflict(market_id,canonical_code) do nothing;
with m as(select id from public.markets where code='NG'), c as(select id from public.locations where canonical_code='ng' and market_id=(select id from m)) insert into public.locations(market_id,parent_id,location_type,canonical_code) select m.id,c.id,'city','abuja' from m,c on conflict(market_id,canonical_code) do nothing;
with m as(select id from public.markets where code='NG'), c as(select id from public.locations where canonical_code='abuja' and market_id=(select id from m)) insert into public.locations(market_id,parent_id,location_type,canonical_code) select m.id,c.id,'locality','gwarinpa' from m,c on conflict(market_id,canonical_code) do nothing;

insert into public.taxonomy_entities(kind,canonical_key,risk_level,is_active) values('service','plumbing_residential',2,true) on conflict(kind,canonical_key) do nothing;
with e as(select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential') insert into public.entity_names(entity_id,language_code,display_name,is_primary) select id,'en','Plumbing',true from e on conflict(entity_id,language_code,display_name) do nothing;
with e as(select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential') insert into public.entity_synonyms(entity_id,language_code,phrase) select id,'en',phrase from e cross join(values('plumber'),('plumbers'),('plumbing repair'),('leaking pipe repair')) s(phrase) on conflict(entity_id,language_code,phrase) do nothing;

with m as(select id from public.markets where code='NG'), loc as(select id from public.locations where canonical_code='gwarinpa' and market_id=(select id from m)), svc as(select id from public.taxonomy_entities where kind='service' and canonical_key='plumbing_residential')
insert into public.public_routes(market_id,entity_kind,entity_id,location_id,slug,canonical_path,indexability,quality_score,metadata)
select m.id,'service',svc.id,loc.id,'plumbers','/ng/abuja/gwarinpa/plumbers/','noindex_follow',78,jsonb_build_object('seed','first_market_vertical_slice') from m,loc,svc
on conflict(canonical_path) do update set quality_score=excluded.quality_score,metadata=excluded.metadata;

with r as(select id,market_id,entity_kind,canonical_path from public.public_routes where canonical_path='/ng/abuja/gwarinpa/plumbers/')
insert into public.public_discovery_documents(route_id,market_id,entity_kind,canonical_path,title,h1,meta_description,summary,structured_data,language_code,indexability,content_hash,published_at,is_public)
select r.id,r.market_id,r.entity_kind,r.canonical_path,'Plumbers in Gwarinpa, Abuja','Plumbers in Gwarinpa, Abuja','Find plumbing services in Gwarinpa, Abuja. Describe what you need done and 101GlobalWork will help route your request safely.','Need plumbing work in Gwarinpa? 101GlobalWork helps you describe the problem, understand what kind of service may be needed, and create a request that can be matched with eligible providers as marketplace supply becomes available.',jsonb_build_object('@context','https://schema.org','@type','Service','name','Plumbing services in Gwarinpa, Abuja','areaServed','Gwarinpa, Abuja, Nigeria'),'en','noindex_follow',encode(digest('plumbing-gwarinpa-v1','sha256'),'hex'),null,true from r
on conflict(route_id) do update set title=excluded.title,h1=excluded.h1,meta_description=excluded.meta_description,summary=excluded.summary,structured_data=excluded.structured_data,content_hash=excluded.content_hash,is_public=true,updated_at=now();

select app_private.evaluate_route_indexability(id) from public.public_routes where canonical_path='/ng/abuja/gwarinpa/plumbers/';

create or replace view public.public_sitemap_entries with(security_invoker=true) as select canonical_path,updated_at,language_code,entity_kind from public.public_discovery_documents where is_public=true and indexability='indexable' and published_at is not null;
grant select on public.public_sitemap_entries to anon,authenticated;
