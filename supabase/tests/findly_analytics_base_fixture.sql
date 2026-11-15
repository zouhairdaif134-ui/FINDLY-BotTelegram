create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.bots (
  id uuid primary key,
  slug text not null unique,
  name text not null
);

create table public.telegram_users (
  id uuid primary key,
  first_seen_at timestamptz not null
);

create table public.user_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.telegram_users(id),
  bot_id uuid not null references public.bots(id),
  unique (user_id, bot_id)
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.telegram_users(id),
  bot_id uuid references public.bots(id),
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
