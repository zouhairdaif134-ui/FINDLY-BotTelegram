-- FINDLY Movies: activate newly uploaded storage-channel media immediately.
-- Distribution rights remain independent and are never granted by an upload.

alter table public.movie_media_assets
  alter column status set default 'active';

update public.movie_media_assets
set status = 'active'
where status = 'pending_review';

comment on column public.movie_media_assets.status is
  'Media availability state. New storage-channel uploads are activated immediately; distribution remains gated independently by movie_distribution_rights.status.';
