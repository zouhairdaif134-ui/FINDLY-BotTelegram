-- Authorized Telegram media assets for FINDLY Movies.
-- Apply only after review; this migration is not executed against Production by this change.
create table if not exists public.movie_media_assets (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  telegram_file_id text not null,
  telegram_file_unique_id text,
  media_kind text not null default 'video' check (media_kind in ('video')),
  quality text,
  rights_status text not null default 'pending' check (rights_status in ('pending','authorized','revoked')),
  rights_reference text,
  is_active boolean not null default true,
  uploaded_by_telegram_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id)
);
create index if not exists movie_media_assets_delivery_idx
  on public.movie_media_assets (title_id, is_active, rights_status);
create trigger movie_media_assets_updated_at
  before update on public.movie_media_assets
  for each row execute function public.set_movies_updated_at();
alter table public.movie_media_assets enable row level security;
revoke all on public.movie_media_assets from anon, authenticated;
grant all on public.movie_media_assets to service_role;
