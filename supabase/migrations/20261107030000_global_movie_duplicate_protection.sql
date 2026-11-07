-- FINDLY global duplicate protection.
-- Production preflight on 2026-11-07 confirmed no duplicate (media_type, normalized_title)
-- groups in either table before creating these indexes.
-- A title remains reserved even after its queue row is published, failed, or rejected.

create unique index if not exists movie_queue_title_global_unique_idx
  on public.movie_queue_items (media_type, normalized_title);

create unique index if not exists movie_titles_type_normalized_global_unique_idx
  on public.movie_titles (media_type, normalized_title);
