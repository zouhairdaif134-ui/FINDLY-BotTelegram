-- Preserve Telegram media references when a catalog title is removed.
-- A title deletion must not silently erase a stored Telegram file reference.
alter table public.movie_media_assets
  drop constraint if exists movie_media_assets_title_id_fkey;

alter table public.movie_media_assets
  add constraint movie_media_assets_title_id_fkey
  foreign key (title_id)
  references public.movie_titles(id)
  on delete restrict;
