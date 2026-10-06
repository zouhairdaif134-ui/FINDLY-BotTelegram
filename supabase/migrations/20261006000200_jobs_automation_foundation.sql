-- FINDLY Jobs Automation Foundation
-- Sources are seeded but disabled until the owner completes source permissions.
-- The Worker uses the Supabase secret key server-side, so RLS can remain closed
-- to public clients while the internal automation layer is being built.

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'json', 'rss', 'html')),
  base_url text,
  feed_url text,
  enabled boolean not null default false,
  auto_sync boolean not null default false,
  sync_interval_minutes integer not null default 1440
    check (sync_interval_minutes between 5 and 10080),
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources(id) on delete restrict,
  source_job_id text,
  fingerprint text not null,
  title text not null,
  company text,
  location_text text,
  city text,
  region text,
  priority_city text,
  target_region text,
  description text,
  employment_type text,
  published_at timestamptz,
  expires_at timestamptz,
  source_url text not null,
  apply_url text,
  status text not null default 'active'
    check (status in ('active', 'expired', 'archived')),
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_job_id),
  unique (fingerprint)
);

create table if not exists public.job_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_job_sources_auto_sync
  on public.job_sources (enabled, auto_sync);

create index if not exists idx_jobs_source
  on public.jobs (source_id);

create index if not exists idx_jobs_status_published
  on public.jobs (status, published_at desc);

create index if not exists idx_jobs_city_region
  on public.jobs (city, region);

create index if not exists idx_jobs_target_region
  on public.jobs (target_region, priority_city);

create index if not exists idx_jobs_expires_at
  on public.jobs (expires_at);

create index if not exists idx_job_sync_runs_source_started
  on public.job_sync_runs (source_id, started_at desc);

alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.job_sync_runs enable row level security;

insert into public.job_sources (
  slug,
  name,
  source_type,
  base_url,
  enabled,
  auto_sync,
  settings
)
values
  (
    'addwork',
    'ADDWORK',
    'manual',
    'https://www.addwork.ma',
    false,
    false,
    '{"connector_status":"awaiting_authorization","priority":1}'::jsonb
  ),
  (
    'anapec',
    'ANAPEC',
    'manual',
    'https://www.anapec.ma',
    false,
    false,
    '{"connector_status":"awaiting_authorization","priority":2}'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  updated_at = now();

create or replace function public.touch_job_automation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_sources_touch_updated_at on public.job_sources;
create trigger job_sources_touch_updated_at
before update on public.job_sources
for each row execute function public.touch_job_automation_updated_at();

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
before update on public.jobs
for each row execute function public.touch_job_automation_updated_at();
