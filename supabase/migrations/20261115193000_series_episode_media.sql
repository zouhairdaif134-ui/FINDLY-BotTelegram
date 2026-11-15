-- FINDLY series episode media linkage
-- Keeps movie assets unchanged while allowing each series video to target one episode.

alter table public.movie_media_assets
  add column if not exists episode_id uuid
  references public.movie_episodes(id) on delete cascade;

create index if not exists movie_media_assets_episode_active_idx
  on public.movie_media_assets (episode_id, status, created_at desc)
  where episode_id is not null;

comment on column public.movie_media_assets.episode_id is
  'Optional episode target for series media. NULL means the asset belongs to a movie/title-level item.';
