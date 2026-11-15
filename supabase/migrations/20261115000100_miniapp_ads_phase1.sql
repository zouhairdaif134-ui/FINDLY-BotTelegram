-- Phase 1 Mini App ad control plane. All ad delivery remains disabled by default.
alter table public.system_settings
  add column if not exists ads_enabled boolean not null default false,
  add column if not exists ads_provider_order text[] not null default array['monetag', 'adsgram']::text[],
  add column if not exists ads_frequency_policy jsonb not null default
    '{"max_per_session":1,"min_interval_minutes":10,"detail_views_before_interstitial":3}'::jsonb;

alter table public.system_settings
  drop constraint if exists system_settings_ads_provider_order_check;
alter table public.system_settings
  add constraint system_settings_ads_provider_order_check
  check (
    cardinality(ads_provider_order) between 1 and 2
    and ads_provider_order <@ array['monetag', 'adsgram']::text[]
  );

alter table public.system_settings
  drop constraint if exists system_settings_ads_frequency_policy_check;
alter table public.system_settings
  add constraint system_settings_ads_frequency_policy_check
  check (
    jsonb_typeof(ads_frequency_policy) = 'object'
    and coalesce((ads_frequency_policy->>'max_per_session')::integer, 0) = 1
    and coalesce((ads_frequency_policy->>'min_interval_minutes')::integer, 0) between 10 and 1440
    and coalesce((ads_frequency_policy->>'detail_views_before_interstitial')::integer, 0) between 3 and 20
  );

create table if not exists public.miniapp_ad_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  user_id uuid references public.telegram_users(id) on delete set null,
  title_id uuid references public.movie_titles(id) on delete set null,
  provider text not null check (provider in ('monetag', 'adsgram')),
  slot_key text not null check (slot_key in ('catalog_after_sixth', 'details_banner')),
  event_type text not null check (event_type in ('impression', 'click')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists miniapp_ad_events_occurred_at_idx
  on public.miniapp_ad_events (occurred_at desc);
create index if not exists miniapp_ad_events_provider_slot_idx
  on public.miniapp_ad_events (provider, slot_key, event_type, occurred_at desc);

alter table public.miniapp_ad_events enable row level security;
revoke all on table public.miniapp_ad_events from public, anon, authenticated;
grant select, insert on table public.miniapp_ad_events to service_role;

comment on table public.miniapp_ad_events is
  'Private, server-written impression and click telemetry for Mini App ad slots. No provider SDK is enabled in Phase 1.';
comment on column public.system_settings.ads_enabled is
  'Global Mini App ad kill switch. Must remain false until TMDB commercial licensing is approved.';
comment on column public.system_settings.ads_provider_order is
  'Allow-listed server-side provider waterfall order; Monetag and AdsGram only.';
