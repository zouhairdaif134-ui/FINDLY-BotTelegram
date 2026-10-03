-- FINDLY Monetization foundation
-- Revenue sources:
-- 1) User subscriptions
-- 2) Direct advertising
-- 3) External ad platforms (Monetag, Adsterra)

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  price numeric(12,2) not null default 0,
  currency text not null default 'MAD',
  billing_interval text not null default 'month',
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_price_check check (price >= 0),
  constraint subscription_plans_billing_interval_check
    check (billing_interval in ('month','year','one_time')),
  constraint subscription_plans_bot_slug_key unique (bot_id, slug)
);

create index if not exists subscription_plans_bot_id_idx
  on public.subscription_plans (bot_id);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.telegram_users(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'pending',
  started_at timestamptz,
  expires_at timestamptz,
  provider text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_check
    check (status in ('pending','active','expired','cancelled','past_due')),
  constraint user_subscriptions_external_key
    unique (provider, external_subscription_id)
);

create index if not exists user_subscriptions_user_id_idx
  on public.user_subscriptions (user_id);

create index if not exists user_subscriptions_plan_id_idx
  on public.user_subscriptions (plan_id);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (status);

create table if not exists public.ad_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  provider_type text not null default 'external',
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_providers_type_check
    check (provider_type in ('external','direct'))
);

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete restrict,
  provider_id uuid references public.ad_providers(id) on delete restrict,
  name text not null,
  campaign_type text not null default 'external',
  status text not null default 'draft',
  target_url text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz,
  budget numeric(12,2),
  currency text not null default 'MAD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_type_check
    check (campaign_type in ('external','direct')),
  constraint ad_campaigns_status_check
    check (status in ('draft','active','paused','completed','cancelled')),
  constraint ad_campaigns_budget_check
    check (budget is null or budget >= 0)
);

create index if not exists ad_campaigns_bot_id_idx
  on public.ad_campaigns (bot_id);

create index if not exists ad_campaigns_provider_id_idx
  on public.ad_campaigns (provider_id);

create index if not exists ad_campaigns_status_idx
  on public.ad_campaigns (status);

create table if not exists public.monetization_events (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references public.bots(id) on delete restrict,
  user_id uuid references public.telegram_users(id) on delete set null,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  revenue_source text not null,
  event_type text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'MAD',
  external_reference text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint monetization_events_source_check
    check (revenue_source in ('subscription','direct_ad','external_ad')),
  constraint monetization_events_amount_check check (amount >= 0)
);

create index if not exists monetization_events_bot_id_idx
  on public.monetization_events (bot_id);

create index if not exists monetization_events_user_id_idx
  on public.monetization_events (user_id);

create index if not exists monetization_events_source_idx
  on public.monetization_events (revenue_source);

create index if not exists monetization_events_occurred_at_idx
  on public.monetization_events (occurred_at desc);

insert into public.ad_providers (name, slug, provider_type)
values
  ('Monetag', 'monetag', 'external'),
  ('Adsterra', 'adsterra', 'external')
on conflict (slug) do update
set name = excluded.name,
    provider_type = excluded.provider_type,
    updated_at = now();

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.ad_providers enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.monetization_events enable row level security;

grant all on table public.subscription_plans to service_role;
grant all on table public.user_subscriptions to service_role;
grant all on table public.ad_providers to service_role;
grant all on table public.ad_campaigns to service_role;
grant all on table public.monetization_events to service_role;
