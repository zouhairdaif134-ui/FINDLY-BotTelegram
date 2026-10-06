-- FINDLY Jobs delivery and notification layer
-- The ingestion layer remains source-agnostic.
-- Publication and user alerts are disabled until destinations are configured.

create table if not exists public.job_publications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  destination_type text not null
    check (destination_type in ('channel','user')),
  destination_id text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','failed','skipped')),
  telegram_message_id bigint,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, destination_type, destination_id)
);

create table if not exists public.job_notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.telegram_users(id) on delete cascade,
  enabled boolean not null default true,
  city text,
  region text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_job_publications_status
  on public.job_publications (status, created_at);

create index if not exists idx_job_publications_job
  on public.job_publications (job_id);

create index if not exists idx_job_notification_subscriptions_enabled
  on public.job_notification_subscriptions (enabled);

alter table public.job_publications enable row level security;
alter table public.job_notification_subscriptions enable row level security;

grant all on table public.job_publications to service_role;
grant all on table public.job_notification_subscriptions to service_role;

create or replace function public.touch_job_delivery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_publications_touch_updated_at on public.job_publications;
create trigger job_publications_touch_updated_at
before update on public.job_publications
for each row execute function public.touch_job_delivery_updated_at();

drop trigger if exists job_notification_subscriptions_touch_updated_at on public.job_notification_subscriptions;
create trigger job_notification_subscriptions_touch_updated_at
before update on public.job_notification_subscriptions
for each row execute function public.touch_job_delivery_updated_at();
