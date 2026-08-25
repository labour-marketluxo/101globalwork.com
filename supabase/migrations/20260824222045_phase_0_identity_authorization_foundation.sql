create type public.account_status as enum ('active','suspended','closed');
create type public.organisation_type as enum ('service_company','business_customer','merchant','institution');
create type public.organisation_member_role as enum ('owner','admin','project_manager','finance_approver','provider_team_member','member');
create type public.provider_status as enum ('draft','active','suspended','closed');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  status public.account_status not null default 'active',
  primary_market_id uuid references public.markets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  display_name text,
  preferred_language_code text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_capabilities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  capability text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(account_id, capability)
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  organisation_type public.organisation_type not null,
  legal_name text,
  display_name text not null,
  primary_market_id uuid references public.markets(id),
  created_by_account_id uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  role public.organisation_member_role not null,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique(organisation_id, account_id)
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid references public.accounts(id),
  organisation_id uuid references public.organisations(id),
  status public.provider_status not null default 'draft',
  display_name text not null,
  public_description text,
  primary_market_id uuid references public.markets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_owner_xor_org check ((owner_account_id is not null) <> (organisation_id is not null))
);

create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_entity_id uuid not null references public.taxonomy_entities(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(provider_id, service_entity_id)
);

create table public.provider_service_areas (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(provider_id, location_id)
);

create index accounts_auth_user_idx on public.accounts(auth_user_id);
create index org_members_account_idx on public.organisation_members(account_id) where removed_at is null;
create index provider_services_service_idx on public.provider_services(service_entity_id) where is_active;
create index provider_service_areas_location_idx on public.provider_service_areas(location_id) where is_active;

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.account_capabilities enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.providers enable row level security;
alter table public.provider_services enable row level security;
alter table public.provider_service_areas enable row level security;
