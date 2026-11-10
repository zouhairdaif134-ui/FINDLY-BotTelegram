-- FINDLY system-wide configuration. Maintenance is opt-in and disabled by default.
create table if not exists public.system_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'FINDLY' check (app_name = 'FINDLY'),
  default_language text not null default 'ar' check (default_language = 'ar'),
  timezone text not null default 'Africa/Casablanca' check (timezone = 'Africa/Casablanca'),
  owner_telegram_user_id bigint,
  maintenance_message text not null default 'نعتذر، الخدمة متوقفة مؤقتاً بسبب أعمال الصيانة. يرجى المحاولة لاحقاً.',
  master_maintenance_enabled boolean not null default false,
  watch_maintenance_enabled boolean not null default false,
  updated_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_owner_telegram_id_positive
    check (owner_telegram_user_id is null or owner_telegram_user_id > 0),
  constraint system_settings_maintenance_message_length
    check (length(btrim(maintenance_message)) between 1 and 500)
);

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;
revoke all on table public.system_settings from public, anon, authenticated;
grant select, insert, update on table public.system_settings to service_role;

comment on table public.system_settings is
  'Private singleton configuration for FINDLY. Access only through the authenticated Cloudflare Worker.';
comment on column public.system_settings.owner_telegram_user_id is
  'Telegram numeric user ID used for maintenance bypass; usernames are never accepted.';
comment on column public.system_settings.master_maintenance_enabled is
  'Maintenance switch for the Master Bot only.';
comment on column public.system_settings.watch_maintenance_enabled is
  'Maintenance switch for the Watch Bot only.';
