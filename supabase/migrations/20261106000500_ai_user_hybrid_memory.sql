-- FINDLY AI hybrid memory foundation.
-- Telegram identity is the canonical user identity; no auth.users mapping is assumed.

create table if not exists public.ai_user_memory_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.telegram_users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  consent_status text not null default 'pending'
    check (consent_status in ('pending', 'granted', 'denied')),
  session_enabled boolean not null default true,
  preferences jsonb not null default '[]'::jsonb
    check (jsonb_typeof(preferences) = 'array'),
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bot_id),
  constraint ai_memory_consent_timestamp_check
    check (
      (consent_status = 'granted' and consented_at is not null)
      or consent_status <> 'granted'
    )
);

create index if not exists ai_user_memory_preferences_bot_idx
  on public.ai_user_memory_preferences (bot_id, consent_status);

create table if not exists public.ai_user_session_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.telegram_users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_user_session_messages_lookup_idx
  on public.ai_user_session_messages (user_id, bot_id, created_at desc);

create index if not exists ai_user_session_messages_expiry_idx
  on public.ai_user_session_messages (expires_at);

create or replace function public.set_ai_memory_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_user_memory_preferences_updated_at
  on public.ai_user_memory_preferences;
create trigger ai_user_memory_preferences_updated_at
before update on public.ai_user_memory_preferences
for each row execute function public.set_ai_memory_updated_at();

alter table public.ai_user_memory_preferences enable row level security;
alter table public.ai_user_session_messages enable row level security;

revoke all on public.ai_user_memory_preferences,
  public.ai_user_session_messages from anon, authenticated;
grant all on public.ai_user_memory_preferences,
  public.ai_user_session_messages to service_role;

comment on table public.ai_user_memory_preferences is
  'Per Telegram user and bot AI memory consent and explicitly confirmed preferences.';
comment on table public.ai_user_session_messages is
  'Short-lived AI conversation context. Messages expire after 30 minutes and are only accessed by the trusted Worker service role.';
