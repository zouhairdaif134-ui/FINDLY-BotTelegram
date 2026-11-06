-- FINDLY Monetization Phase 1 controls.
-- Additive extension of the existing monetization foundation.
-- All placements and campaigns remain disabled/draft until explicitly configured.

alter table public.ad_campaigns
  add column if not exists channel text not null default 'telegram',
  add column if not exists format text not null default 'telegram_text',
  add column if not exists creative jsonb not null default '{}'::jsonb,
  add column if not exists targeting jsonb not null default '{}'::jsonb,
  add column if not exists max_deliveries integer,
  add column if not exists priority integer not null default 100;

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_status_check;

alter table public.ad_campaigns
  add constraint ad_campaigns_status_check
  check (status in ('draft','scheduled','active','paused','completed','cancelled','failed'));

alter table public.ad_campaigns
  add constraint ad_campaigns_channel_check
  check (channel in ('website','telegram'));

alter table public.ad_campaigns
  add constraint ad_campaigns_format_check
  check (
    (channel = 'website' and format in ('banner','native','popup','video'))
    or
    (channel = 'telegram' and format in ('telegram_text','telegram_card'))
  );

alter table public.ad_campaigns
  add constraint ad_campaigns_max_deliveries_check
  check (max_deliveries is null or max_deliveries > 0);

create index if not exists ad_campaigns_channel_status_schedule_idx
  on public.ad_campaigns (channel, status, starts_at, ends_at);

create table if not exists public.ad_provider_zones (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ad_providers(id) on delete restrict,
  channel text not null check (channel in ('website','telegram')),
  format text not null,
  external_zone_id text not null,
  site_domain text,
  is_verified boolean not null default false,
  is_active boolean not null default false,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_provider_zones_channel_format_check check (
    (channel = 'website' and format in ('banner','native','popup','video'))
    or
    (channel = 'telegram' and format in ('telegram_text','telegram_card'))
  ),
  constraint ad_provider_zones_external_identity_key
    unique (provider_id, channel, external_zone_id)
);

create index if not exists ad_provider_zones_provider_channel_idx
  on public.ad_provider_zones (provider_id, channel, is_active);

create table if not exists public.ad_placements (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('website','telegram')),
  page_key text not null,
  slot_key text not null,
  position text not null,
  format text not null,
  provider_zone_id uuid references public.ad_provider_zones(id) on delete restrict,
  is_enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 100,
  fallback text not null default 'none' check (fallback in ('none','hide')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_placements_channel_format_check check (
    (channel = 'website' and format in ('banner','native','popup','video'))
    or
    (channel = 'telegram' and format in ('telegram_text','telegram_card'))
  ),
  constraint ad_placements_schedule_check
    check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint ad_placements_slot_identity_key unique (channel, page_key, slot_key)
);

create index if not exists ad_placements_active_lookup_idx
  on public.ad_placements (channel, page_key, is_enabled, priority, starts_at, ends_at);

create index if not exists ad_placements_provider_zone_idx
  on public.ad_placements (provider_zone_id);

create table if not exists public.ad_campaign_placements (
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  placement_id uuid not null references public.ad_placements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, placement_id)
);

create index if not exists ad_campaign_placements_placement_idx
  on public.ad_campaign_placements (placement_id, campaign_id);

create table if not exists public.ad_frequency_policies (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('website','telegram')),
  campaign_id uuid references public.ad_campaigns(id) on delete cascade,
  placement_id uuid references public.ad_placements(id) on delete cascade,
  max_per_user integer not null default 3 check (max_per_user > 0),
  cooldown_seconds integer not null default 3600 check (cooldown_seconds >= 0),
  max_per_session integer not null default 1 check (max_per_session > 0),
  rolling_window_minutes integer not null default 1440 check (rolling_window_minutes > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_frequency_policies_scope_check
    check (campaign_id is null or placement_id is null)
);

create unique index if not exists ad_frequency_policies_campaign_scope_key
  on public.ad_frequency_policies (channel, campaign_id)
  where campaign_id is not null;

create unique index if not exists ad_frequency_policies_placement_scope_key
  on public.ad_frequency_policies (channel, placement_id)
  where placement_id is not null;

create unique index if not exists ad_frequency_policies_channel_default_key
  on public.ad_frequency_policies (channel)
  where campaign_id is null and placement_id is null;

create table if not exists public.ad_delivery_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  campaign_id uuid not null references public.ad_campaigns(id) on delete restrict,
  placement_id uuid references public.ad_placements(id) on delete set null,
  provider_zone_id uuid references public.ad_provider_zones(id) on delete set null,
  user_id uuid references public.telegram_users(id) on delete set null,
  bot_id uuid references public.bots(id) on delete set null,
  channel text not null check (channel in ('website','telegram')),
  event_type text not null check (event_type in ('attempted','sent','failed','impression','click')),
  visitor_key_hash text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ad_delivery_events_campaign_time_idx
  on public.ad_delivery_events (campaign_id, created_at desc);

create index if not exists ad_delivery_events_channel_time_idx
  on public.ad_delivery_events (channel, created_at desc);

create index if not exists ad_delivery_events_user_time_idx
  on public.ad_delivery_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists ad_delivery_events_placement_time_idx
  on public.ad_delivery_events (placement_id, created_at desc)
  where placement_id is not null;

alter table public.ad_provider_zones enable row level security;
alter table public.ad_placements enable row level security;
alter table public.ad_campaign_placements enable row level security;
alter table public.ad_frequency_policies enable row level security;
alter table public.ad_delivery_events enable row level security;

revoke all on table public.ad_provider_zones from public, anon, authenticated;
revoke all on table public.ad_placements from public, anon, authenticated;
revoke all on table public.ad_campaign_placements from public, anon, authenticated;
revoke all on table public.ad_frequency_policies from public, anon, authenticated;
revoke all on table public.ad_delivery_events from public, anon, authenticated;

grant all on table public.ad_provider_zones to service_role;
grant all on table public.ad_placements to service_role;
grant all on table public.ad_campaign_placements to service_role;
grant all on table public.ad_frequency_policies to service_role;
grant all on table public.ad_delivery_events to service_role;
