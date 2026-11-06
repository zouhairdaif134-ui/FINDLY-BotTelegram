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
  alter column status set default 'draft';

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


-- MAU eligibility: retain the Telegram Bot API's bot flag and allow Owner-managed
-- explicit exclusions for administrator and test accounts.
alter table public.telegram_users
  add column if not exists is_bot boolean not null default false;

create table if not exists public.monetization_user_exclusions (
  user_id uuid primary key references public.telegram_users(id) on delete cascade,
  reason text not null check (reason in ('admin','test','manual')),
  note text,
  created_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monetization_user_exclusions enable row level security;
revoke all on table public.monetization_user_exclusions from public, anon, authenticated;
grant all on table public.monetization_user_exclusions to service_role;


-- Rolling 30-day active users. last_seen_at is updated for every incoming
-- Telegram message/callback before the bot dispatches the user's request.
-- This function returns only an aggregate count and runs with invoker rights.
create or replace function public.get_monetization_mau(
  p_since timestamptz default (now() - interval '30 days')
)
returns bigint
language sql
stable
set search_path = pg_catalog, public
as $$
  select count(distinct u.telegram_user_id)::bigint
  from public.telegram_users u
  where u.is_active = true
    and u.is_bot = false
    and u.last_seen_at >= p_since
    and u.last_seen_at <= now()
    and not exists (
      select 1
      from public.monetization_user_exclusions e
      where e.user_id = u.id
    );
$$;

revoke all on function public.get_monetization_mau(timestamptz) from public, anon, authenticated;
grant execute on function public.get_monetization_mau(timestamptz) to service_role;


-- Revenue events retain their source and reconciliation provenance. Corrections
-- are new debit entries linked to the original event; historical rows are immutable.
alter table public.monetization_events
  add column if not exists provenance text not null default 'provider_reported',
  add column if not exists entry_type text not null default 'revenue',
  add column if not exists direction text not null default 'credit',
  add column if not exists reverses_event_id uuid references public.monetization_events(id) on delete restrict,
  add column if not exists reconciliation_status text not null default 'unreconciled';

alter table public.monetization_events
  add constraint monetization_events_provenance_check
    check (provenance in ('provider_reported','manual','estimated')),
  add constraint monetization_events_entry_type_check
    check (entry_type in ('revenue','adjustment','reversal')),
  add constraint monetization_events_direction_check
    check (direction in ('credit','debit')),
  add constraint monetization_events_reconciliation_check
    check (reconciliation_status in ('unreconciled','reconciled','disputed')),
  add constraint monetization_events_reversal_shape_check
    check (
      (entry_type = 'reversal' and reverses_event_id is not null and direction = 'debit')
      or
      (entry_type <> 'reversal' and reverses_event_id is null)
    );

create unique index if not exists monetization_events_single_reversal_idx
  on public.monetization_events (reverses_event_id)
  where reverses_event_id is not null;

create index if not exists monetization_events_provenance_status_idx
  on public.monetization_events (provenance, reconciliation_status, occurred_at desc);

-- Delivery and financial events are append-only. State changes are represented
-- by additional events rather than destructive updates.
revoke update, delete on table public.monetization_events from public, anon, authenticated, service_role;
grant select, insert on table public.monetization_events to service_role;

revoke update, delete on table public.ad_delivery_events from public, anon, authenticated, service_role;
grant select, insert on table public.ad_delivery_events to service_role;


-- Aggregate revenue independently from ad delivery events. Debits represent
-- reversals/adjustments and are subtracted from credits.
create or replace function public.get_monetization_revenue_summary(
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  currency text,
  revenue_source text,
  provenance text,
  net_amount numeric,
  entry_count bigint
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    e.currency,
    e.revenue_source,
    e.provenance,
    sum(case e.direction when 'credit' then e.amount else -e.amount end)::numeric as net_amount,
    count(*)::bigint as entry_count
  from public.monetization_events e
  where e.occurred_at >= p_since
    and e.occurred_at <= now()
  group by e.currency, e.revenue_source, e.provenance
  order by e.currency, e.revenue_source, e.provenance;
$$;

revoke all on function public.get_monetization_revenue_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.get_monetization_revenue_summary(timestamptz) to service_role;


create index if not exists telegram_users_mau_eligibility_idx
  on public.telegram_users (last_seen_at, telegram_user_id)
  where is_active = true and is_bot = false;


alter table public.ad_provider_zones
  add column if not exists verified_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists verification_method text;

alter table public.ad_provider_zones
  add constraint ad_provider_zones_verification_method_check
    check (verification_method is null or verification_method in ('owner_test_confirmation','provider_api')),
  add constraint ad_provider_zones_verification_evidence_check
    check (
      is_verified = false
      or (verified_at is not null and verified_by is not null and verification_method is not null)
    ),
  add constraint ad_provider_zones_active_requires_verified_check
    check (is_active = false or is_verified = true);


-- Granular access: Owner receives all Monetization permissions. Manager and
-- Content Manager receive none by default; the Owner may grant selected codes.
insert into public.permissions (code, description)
values
  ('monetization.view', 'View Monetization overview and reports'),
  ('monetization.providers.manage', 'Manage advertising providers and zones'),
  ('monetization.providers.verify', 'Confirm provider-zone verification after testing'),
  ('monetization.placements.manage', 'Manage website and Telegram ad placements'),
  ('monetization.campaigns.manage', 'Manage and control advertising campaigns'),
  ('monetization.transactions.view', 'View monetization transactions and revenue reports'),
  ('monetization.transactions.manage', 'Record and reverse monetization revenue events'),
  ('monetization.users.manage', 'Manage excluded admin and test accounts for MAU')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'owner'
  and p.code in (
    'monetization.view',
    'monetization.providers.manage',
    'monetization.providers.verify',
    'monetization.placements.manage',
    'monetization.campaigns.manage',
    'monetization.transactions.view',
    'monetization.transactions.manage',
    'monetization.users.manage'
  )
on conflict (role_id, permission_id) do nothing;


-- The foundation migration seeded provider rows as active. No verified zones
-- or live campaigns exist yet, so explicitly turn both networks OFF for Phase 1.
update public.ad_providers
set is_active = false,
    updated_at = now()
where slug in ('monetag','adsterra');
