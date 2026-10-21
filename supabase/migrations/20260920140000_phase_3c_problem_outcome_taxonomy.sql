-- ============================================================================
-- Phase 3c — problem and outcome taxonomy, publicly projected
--
-- WHY
--
-- `entity_kind` has carried 'problem' and 'outcome' since phase 0, and both kinds
-- have been empty ever since. Meanwhile the public site has been growing
-- symptom-shaped and goal-shaped pages out of the service catalog alone, which is
-- why the service page has to explain that "the phrases people actually type" live
-- in entity_synonyms rather than in entities of their own.
--
-- This migration gives those two kinds their first rows: the problems people
-- describe ("a dripping tap", "low water pressure") and the outcomes they want
-- ("the leak stopped"), each linked to the canonical services that address it. The
-- routes at /{market}/problems/{slug} and /{market}/solutions/{slug} read them
-- through four curated projections, because the canonical tables stay deny-direct to
-- anonymous visitors — the same arrangement as public_service_catalog and the
-- phase-3 taxonomy projections.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   * No prices, durations or "typical cost" ranges. FEE_POLICY.published is false
--     (see features/pricing/fee-policy.ts) and nothing in this database prices a job,
--     so both routes state that rather than inventing a range per problem.
--   * No 'emergency' severity. The platform is explicitly not an emergency service
--     (see /how-it-works and /trust-and-safety), so severity stops at 'time-sensitive'
--     and carries a note explaining what that means instead of a siren.
--   * No problem or outcome that this catalog cannot serve. Every link goes to one of
--     the two services that actually exist, which is why outcome pages resolve to a
--     single bundled service today and say so.
--   * No public_routes rows for these pages. `indexability_policies` holds a policy
--     for kind='service' only, so there is no gate for a problem or outcome page to
--     pass; they are served `noindex, follow` with a self-canonical until an operator
--     adds a policy AND a registry row. Registering them without a policy would make
--     the evaluator answer 'no_policy' — correct, but it would also imply a gate
--     exists. The route headers carry the same note.
-- ============================================================================

-- ---------------------------------------------------------------- taxonomy rows

insert into public.taxonomy_entities(kind, canonical_key, risk_level, is_active) values
  ('problem','dripping_tap',1,true),
  ('problem','leaking_pipe',2,true),
  ('problem','blocked_drain',1,true),
  ('problem','low_water_pressure',1,true),
  ('problem','ill_fitting_garment',1,true),
  ('problem','damaged_clothing',1,true),
  ('outcome','stop_a_leak',2,true),
  ('outcome','usable_water_pressure',1,true),
  ('outcome','garment_altered_to_fit',1,true)
on conflict(kind,canonical_key) do update set is_active=true;

with seed(kind, canonical_key, display_name) as (values
  ('problem','dripping_tap','A dripping or running tap'),
  ('problem','leaking_pipe','A leaking pipe or joint'),
  ('problem','blocked_drain','A blocked or slow drain'),
  ('problem','low_water_pressure','Low or intermittent water pressure'),
  ('problem','ill_fitting_garment','A garment that does not fit'),
  ('problem','damaged_clothing','A tear, split seam or broken fastening'),
  ('outcome','stop_a_leak','The leak found and stopped'),
  ('outcome','usable_water_pressure','Water that arrives with usable pressure'),
  ('outcome','garment_altered_to_fit','A garment that fits'))
insert into public.entity_names(entity_id, language_code, display_name, is_primary)
select t.id, 'en', s.display_name, true
from seed s join public.taxonomy_entities t on t.kind = s.kind::public.entity_kind and t.canonical_key = s.canonical_key
on conflict(entity_id,language_code,display_name) do nothing;

-- The words a customer actually uses for the same thing. These become the "also
-- described as" chips and the free-text searches the problem page offers.
with seed(kind, canonical_key, phrase) as (values
  ('problem','dripping_tap','dripping tap'),
  ('problem','dripping_tap','tap will not close'),
  ('problem','dripping_tap','leaking tap'),
  ('problem','leaking_pipe','water under the sink'),
  ('problem','leaking_pipe','pipe burst'),
  ('problem','blocked_drain','sink will not drain'),
  ('problem','blocked_drain','drain smells'),
  ('problem','low_water_pressure','weak shower pressure'),
  ('problem','low_water_pressure','taps splutter'),
  ('problem','ill_fitting_garment','trousers too long'),
  ('problem','ill_fitting_garment','shirt too tight'),
  ('problem','damaged_clothing','split seam'),
  ('problem','damaged_clothing','broken zip'),
  ('outcome','stop_a_leak','no more leaks'),
  ('outcome','usable_water_pressure','water pressure fixed'),
  ('outcome','garment_altered_to_fit','clothes that fit'))
insert into public.entity_synonyms(entity_id, language_code, phrase)
select t.id, 'en', s.phrase
from seed s join public.taxonomy_entities t on t.kind = s.kind::public.entity_kind and t.canonical_key = s.canonical_key
on conflict(entity_id,language_code,phrase) do nothing;

-- Service ↔ problem ("solves") and service ↔ outcome ("delivers"). Direction is
-- from the service, because the service is what does the work.
with seed(service_key, relation_type, target_kind, target_key) as (values
  ('plumbing_residential','solves','problem','dripping_tap'),
  ('plumbing_residential','solves','problem','leaking_pipe'),
  ('plumbing_residential','solves','problem','blocked_drain'),
  ('plumbing_residential','solves','problem','low_water_pressure'),
  ('tailoring_alterations','solves','problem','ill_fitting_garment'),
  ('tailoring_alterations','solves','problem','damaged_clothing'),
  ('plumbing_residential','delivers','outcome','stop_a_leak'),
  ('plumbing_residential','delivers','outcome','usable_water_pressure'),
  ('tailoring_alterations','delivers','outcome','garment_altered_to_fit'))
insert into public.taxonomy_links(from_entity_id, to_entity_id, relation_type)
select s.id, t.id, seed.relation_type
from seed
join public.taxonomy_entities s on s.kind = 'service' and s.canonical_key = seed.service_key
join public.taxonomy_entities t on t.kind = seed.target_kind::public.entity_kind and t.canonical_key = seed.target_key
on conflict(from_entity_id,to_entity_id,relation_type) do nothing;

-- ---------------------------------------------------------------- projections

create table if not exists public.public_problem_catalog (
  problem_entity_id uuid primary key references public.taxonomy_entities(id) on delete cascade,
  market_id uuid references public.markets(id) on delete cascade,
  canonical_key text not null unique,
  slug text not null,
  display_name text not null,
  definition text not null,
  severity text not null check (severity in ('routine','time-sensitive','safety-relevant')),
  severity_note text,
  guidance jsonb not null default '[]'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.public_problem_catalog is 'Curated public copy for a problem (a symptom a customer describes). Allowlisted projection: no provider, customer or quote data may ever be joined into it.';

create table if not exists public.public_problem_service_catalog (
  problem_entity_id uuid not null references public.public_problem_catalog(problem_entity_id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (problem_entity_id, service_entity_id)
);
comment on table public.public_problem_service_catalog is 'Which canonical services address a published problem.';

create table if not exists public.public_outcome_catalog (
  outcome_entity_id uuid primary key references public.taxonomy_entities(id) on delete cascade,
  market_id uuid references public.markets(id) on delete cascade,
  canonical_key text not null unique,
  slug text not null,
  display_name text not null,
  definition text not null,
  planning_steps jsonb not null default '[]'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.public_outcome_catalog is 'Curated public copy for an outcome (a goal a customer wants). planning_steps are platform process steps, never a schedule or a promise of duration.';

create table if not exists public.public_outcome_service_catalog (
  outcome_entity_id uuid not null references public.public_outcome_catalog(outcome_entity_id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (outcome_entity_id, service_entity_id)
);
comment on table public.public_outcome_service_catalog is 'The services bundled to reach a published outcome. One entry today, because one service can deliver the seeded outcomes.';

-- ------------------------------------------------------------------ RLS + grants

alter table public.public_problem_catalog enable row level security;
alter table public.public_problem_service_catalog enable row level security;
alter table public.public_outcome_catalog enable row level security;
alter table public.public_outcome_service_catalog enable row level security;

drop policy if exists public_problem_catalog_read on public.public_problem_catalog;
create policy public_problem_catalog_read on public.public_problem_catalog for select to anon, authenticated using (true);
drop policy if exists public_problem_service_catalog_read on public.public_problem_service_catalog;
create policy public_problem_service_catalog_read on public.public_problem_service_catalog for select to anon, authenticated using (true);
drop policy if exists public_outcome_catalog_read on public.public_outcome_catalog;
create policy public_outcome_catalog_read on public.public_outcome_catalog for select to anon, authenticated using (true);
drop policy if exists public_outcome_service_catalog_read on public.public_outcome_service_catalog;
create policy public_outcome_service_catalog_read on public.public_outcome_service_catalog for select to anon, authenticated using (true);

revoke all on public.public_problem_catalog, public.public_problem_service_catalog,
  public.public_outcome_catalog, public.public_outcome_service_catalog from anon, authenticated;
grant select on public.public_problem_catalog, public.public_problem_service_catalog,
  public.public_outcome_catalog, public.public_outcome_service_catalog to anon, authenticated;

-- ------------------------------------------------------------------ seed: copy

with seed(canonical_key, slug, display_name, definition, severity, severity_note, guidance, sort_order) as (values
  ('dripping_tap','dripping-tap','A dripping or running tap',
   'Water escaping from a tap or mixer — a slow drip, or a flow that will not shut off.',
   'routine', null,
   jsonb_build_array(
     'Say whether it leaks constantly or only while the tap is used; that changes which part is at fault.',
     'Note whether the water is hot, cold, or both.'),
   10),
  ('leaking_pipe','leaking-pipe','A leaking pipe or joint',
   'Water escaping from pipework or a connection: under a sink, at a fitting, or inside a wall or ceiling.',
   'time-sensitive', 'Water damage spreads: what is a damp patch today can be a ceiling tomorrow. It is still not an emergency the platform responds to — see the safety note.',
   jsonb_build_array(
     'If water is anywhere near wiring, sockets or a light fitting, keep clear and isolate the supply at the stop valve.',
     'Photograph what you can see, including anything already damaged, before work starts.',
     'Tell the provider where the stop valve is, or that you cannot find it.'),
   20),
  ('blocked_drain','blocked-drain','A blocked or slow drain',
   'A sink, bath, shower or outside drain that empties slowly, backs up, or does not empty at all.',
   'routine', null,
   jsonb_build_array(
     'Stop running water into the fixture while it is blocked.',
     'Say whether more than one outlet is affected: a single slow sink and a backing-up bathroom are different jobs.'),
   30),
  ('low_water_pressure','low-water-pressure','Low or intermittent water pressure',
   'Water arriving weakly, unevenly, or stopping and starting — at one outlet or throughout the property.',
   'routine', null,
   jsonb_build_array(
     'Check whether one outlet is affected or all of them.',
     'Note whether it changed suddenly or has always been like that.'),
   40),
  ('ill_fitting_garment','ill-fitting-garment','A garment that does not fit',
   'A piece that is too long, too loose or too tight, and could be altered to fit properly.',
   'routine', null,
   jsonb_build_array(
     'Try the garment on and pin where it should sit before asking for a quote.',
     'Say whether it has been worn or washed since it was bought.'),
   50),
  ('damaged_clothing','damaged-clothing','A tear, split seam or broken fastening',
   'Damage that needs repairing rather than remaking: a tear, an open seam, a broken zip or a missing fastening.',
   'routine', null,
   jsonb_build_array(
     'Say whether the repair has to be invisible from the outside.',
     'Photograph the damage, including the inside where a lining is involved.'),
   60))
insert into public.public_problem_catalog(
  problem_entity_id, market_id, canonical_key, slug, display_name, definition,
  severity, severity_note, guidance, aliases, language_code, sort_order)
select t.id, null, s.canonical_key, s.slug, s.display_name, s.definition,
       s.severity, s.severity_note, s.guidance,
       coalesce((
         select jsonb_agg(syn.phrase order by syn.phrase)
         from public.entity_synonyms syn
         where syn.entity_id = t.id and syn.language_code = 'en'
       ), '[]'::jsonb),
       'en', s.sort_order
from seed s join public.taxonomy_entities t on t.kind = 'problem' and t.canonical_key = s.canonical_key
on conflict (canonical_key) do update set
  slug = excluded.slug, display_name = excluded.display_name, definition = excluded.definition,
  severity = excluded.severity, severity_note = excluded.severity_note, guidance = excluded.guidance,
  aliases = excluded.aliases, sort_order = excluded.sort_order, is_active = true, updated_at = now();

with seed(outcome_key, slug, display_name, definition, planning_steps, sort_order) as (values
  ('stop_a_leak','stop-a-leak','The leak found and stopped',
   'Water loss stopped, the cause identified rather than patched, and the affected section left in working order.',
   jsonb_build_array(
     jsonb_build_object('title','Describe what you want to end up with','body','Say where the water is and what you have already tried. You do not need to know which part is at fault.'),
     jsonb_build_object('title','Get the scope agreed and quoted','body','Eligible providers quote against the same scope, so the numbers you compare are answers to the same question.'),
     jsonb_build_object('title','Approve before the work happens','body','Nothing is carried out and then invoiced: a change to the scope is re-approved first.'),
     jsonb_build_object('title','The work is done','body','The agreed scope is the document both sides work from, including what is excluded.'),
     jsonb_build_object('title','Approve it, then the payment is released','body','Payment is held by our payment provider and released only after you approve the finished work.')),
   10),
  ('usable_water_pressure','usable-water-pressure','Water that arrives with usable pressure',
   'Pressure restored at the outlets that matter, whether the cause is a fitting, a blockage or the supply into the building.',
   jsonb_build_array(
     jsonb_build_object('title','Say which outlets are affected','body','One tap and a whole property point at different causes, and the scope follows from that.'),
     jsonb_build_object('title','Get the scope agreed and quoted','body','The quote states what will be investigated, not only what will be replaced.'),
     jsonb_build_object('title','Approve the scope before work starts','body','If the cause turns out to be different from the quote, that is a change to approve first — not a surprise on the invoice.'),
     jsonb_build_object('title','The work is done','body','Includes making good anything opened up to reach the pipework, if that is in the agreed scope.'),
     jsonb_build_object('title','Approve it, then the payment is released','body','Payment is held by our payment provider and released only after you approve the finished work.')),
   20),
  ('garment_altered_to_fit','garment-altered-to-fit','A garment that fits',
   'The piece altered or repaired so it can be worn again, with the fit agreed before the work starts.',
   jsonb_build_array(
     jsonb_build_object('title','Say how it should fit','body','Bring the garment, or exact measurements, and pin where it should sit.'),
     jsonb_build_object('title','Agree the alteration and the turnaround','body','When a garment is needed changes what is possible, so it belongs in the scope rather than in a follow-up message.'),
     jsonb_build_object('title','Approve before the work happens','body','Agreed pins and measurements are the scope; a further change is re-approved first.'),
     jsonb_build_object('title','The work is done','body','Collect only once you are satisfied with the fit, not on the strength of a description.'),
     jsonb_build_object('title','Approve it, then the payment is released','body','Payment is held by our payment provider and released only after you approve the finished work.')),
   30))
insert into public.public_outcome_catalog(
  outcome_entity_id, market_id, canonical_key, slug, display_name, definition,
  planning_steps, aliases, language_code, sort_order)
select t.id, null, s.outcome_key, s.slug, s.display_name, s.definition, s.planning_steps,
       coalesce((
         select jsonb_agg(syn.phrase order by syn.phrase)
         from public.entity_synonyms syn
         where syn.entity_id = t.id and syn.language_code = 'en'
       ), '[]'::jsonb),
       'en', s.sort_order
from seed s join public.taxonomy_entities t on t.kind = 'outcome' and t.canonical_key = s.outcome_key
on conflict (canonical_key) do update set
  slug = excluded.slug, display_name = excluded.display_name, definition = excluded.definition,
  planning_steps = excluded.planning_steps, aliases = excluded.aliases,
  sort_order = excluded.sort_order, is_active = true, updated_at = now();

-- Membership, projected from the links written above.
insert into public.public_problem_service_catalog(problem_entity_id, service_entity_id, sort_order)
select p.problem_entity_id, l.from_entity_id, 10
from public.public_problem_catalog p
join public.taxonomy_links l on l.to_entity_id = p.problem_entity_id and l.relation_type = 'solves'
on conflict (problem_entity_id, service_entity_id) do nothing;

insert into public.public_outcome_service_catalog(outcome_entity_id, service_entity_id, sort_order)
select o.outcome_entity_id, l.from_entity_id, 10
from public.public_outcome_catalog o
join public.taxonomy_links l on l.to_entity_id = o.outcome_entity_id and l.relation_type = 'delivers'
on conflict (outcome_entity_id, service_entity_id) do nothing;
