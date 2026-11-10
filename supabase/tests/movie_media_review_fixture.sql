-- Seed one pre-existing active asset so the review migration can prove
-- that existing records stay active and the current channel is preserved.
insert into public.movie_titles (
  id, media_type, normalized_title, title, release_year, metadata_status
)
values (
  '11111111-1111-4111-8111-111111111111',
  'movie',
  'fixture-movie',
  'Fixture Movie',
  2025,
  'metadata_only'
)
on conflict (id) do nothing;

insert into public.movie_media_assets (
  title_id, storage_chat_id, storage_message_id, media_type,
  file_id, file_unique_id, status
)
values (
  '11111111-1111-4111-8111-111111111111',
  '-1001111111111',
  101,
  'video',
  'fixture-file-1',
  'fixture-unique-1',
  'active'
)
on conflict (storage_chat_id, storage_message_id) do nothing;
