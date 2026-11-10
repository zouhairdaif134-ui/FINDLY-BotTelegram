-- FINDLY Movies: persist Telegram's declared video dimensions and duration.
-- Codec compatibility remains unknown until media bytes are inspected by FFprobe.

alter table public.movie_media_assets
  add column if not exists video_width integer
    check (video_width is null or video_width > 0),
  add column if not exists video_height integer
    check (video_height is null or video_height > 0),
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds > 0);

comment on column public.movie_media_assets.video_width is
  'Width reported by Telegram in the channel_post video object; not a codec compatibility signal.';
comment on column public.movie_media_assets.video_height is
  'Height reported by Telegram in the channel_post video object; not a codec compatibility signal.';
comment on column public.movie_media_assets.duration_seconds is
  'Duration in seconds reported by Telegram; not a media probe result.';
