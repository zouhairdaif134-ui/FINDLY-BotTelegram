-- FINDLY Movies: Telegram channel media registry
-- The video bytes remain in Telegram; this table stores only message references and metadata.

create table if not exists public.movie_media_assets (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  storage_chat_id text not null,
  storage_message_id bigint not null,
  media_type text not null check (media_type in ('video', 'document', 'audio', 'animation')),
  file_id text not null,
  file_unique_id text not null,
  file_size bigint check (file_size is null or file_size >= 0),
  file_name text,
  mime_type text,
  quality_label text not null default 'Original',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_chat_id, storage_message_id)
);

create index if not exists movie_media_assets_title_status_idx
  on public.movie_media_assets (title_id, status, created_at desc);

drop trigger if exists movie_media_assets_updated_at on public.movie_media_assets;
create trigger movie_media_assets_updated_at
before update on public.movie_media_assets
for each row execute function public.set_movies_updated_at();

alter table public.movie_media_assets enable row level security;
revoke all on table public.movie_media_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.movie_media_assets to service_role;

comment on table public.movie_media_assets is
'Private registry of Telegram channel message references for FINDLY Movies media delivery. Media bytes remain stored by Telegram.';
