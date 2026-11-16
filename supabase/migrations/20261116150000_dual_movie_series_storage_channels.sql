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
