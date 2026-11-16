-- Dual private Telegram storage channels. Preserve the existing movie channel and every asset reference.
alter table public.movie_media_storage_config
  add column if not exists series_storage_chat_id text,
  add column if not exists series_channel_title text;

comment on column public.movie_media_storage_config.active_storage_chat_id is
  'Private Telegram channel used for movie media ingestion. Existing value and assets are preserved.';
comment on column public.movie_media_storage_config.series_storage_chat_id is
  'Private Telegram channel used for series episode media ingestion.';

comment on table public.movie_media_storage_config is
  'Private Telegram storage routing: active_storage_chat_id for movies, series_storage_chat_id for series episodes. Existing asset storage_chat_id values remain unchanged.';

-- Private candidate registry lets the owner identify a private channel ID after
-- the Watch Bot receives any channel_post, including a harmless text test post.
create table if not exists public.telegram_storage_channel_candidates (
  chat_id text primary key,
  channel_title text,
  bot_id uuid not null references public.bots(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.telegram_storage_channel_candidates enable row level security;
revoke all on table public.telegram_storage_channel_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_storage_channel_candidates to service_role;

comment on table public.telegram_storage_channel_candidates is
  'Private registry of Telegram channels where the Watch Bot receives channel posts; used to identify and explicitly configure movie/series storage channels.';
