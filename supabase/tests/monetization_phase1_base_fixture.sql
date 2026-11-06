-- Minimal PostgreSQL 17 fixture for exercising the Phase 1 migration in CI.
-- It mirrors the pre-existing public tables/columns this additive migration depends on.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to service_role;

create table public.bots (
  id uuid primary key default gen_random_uuid()
);

create table public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.admin_profiles (
  id uuid primary key
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.admin_roles (
  admin_id uuid not null references public.admin_profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (admin_id, role_id)
);

create table public.ad_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  provider_type text not null default 'external'
    check (provider_type in ('external','direct')),
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete restrict,
  provider_id uuid references public.ad_providers(id) on delete restrict,
  name text not null,
  campaign_type text not null default 'external'
    check (campaign_type in ('external','direct')),
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','cancelled')),
  target_url text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz,
  budget numeric(12,2),
  currency text not null default 'MAD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_budget_check check (budget is null or budget >= 0)
);

create table public.monetization_events (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references public.bots(id) on delete restrict,
  user_id uuid references public.telegram_users(id) on delete set null,
  subscription_id uuid,
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  revenue_source text not null
    check (revenue_source in ('subscription','direct_ad','external_ad')),
  event_type text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'MAD',
  external_reference text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint monetization_events_amount_check check (amount >= 0)
);

alter table public.ad_providers enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.monetization_events enable row level security;

grant all on public.ad_providers, public.ad_campaigns, public.monetization_events to service_role;

insert into public.roles (name) values ('owner'), ('manager');
insert into public.ad_providers (name, slug, provider_type, is_active)
values
  ('Monetag', 'monetag', 'external', true),
  ('Adsterra', 'adsterra', 'external', true);

insert into public.bots default values;
insert into public.ad_campaigns (bot_id, name, campaign_type, status)
select id, 'Legacy direct campaign', 'direct', 'active'
from public.bots
limit 1;
