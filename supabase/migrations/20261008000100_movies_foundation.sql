-- FINDLY Movies — Infrastructure Foundation
-- Phase 1
--
-- Establishes the core Movies/Series catalog domain.
-- Telegram media assets are intentionally handled by the later media layer.

create extension if not exists pgcrypto;

create table if not exists public.movie_titles (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie', 'series')),
  title text not null,
  original_title text,
  normalized_title text not null,
  overview text,
  release_date date,
  release_year integer check (release_year is null or release_year between 1888 and 2200),
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  rating numeric(3,1) check (rating is null or (rating >= 0 and rating <= 10)),
  poster_path text,
  backdrop_path text,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  metadata_status text not null default 'metadata_only' check (
    metadata_status in (
      'metadata_only',
      'provider_available',
      'authorized_media_available',
      'delivery_blocked'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_type, normalized_title, release_year)
);

create index if not exists movie_titles_type_idx on public.movie_titles (media_type);
create index if not exists movie_titles_status_idx on public.movie_titles (status);
create index if not exists movie_titles_release_date_idx on public.movie_titles (release_date desc);
create index if not exists movie_titles_normalized_title_idx on public.movie_titles (normalized_title);

create table if not exists public.movie_genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  source text not null default 'findly' check (source in ('findly', 'provider')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists movie_genres_name_idx on public.movie_genres (name);

create table if not exists public.movie_title_genres (
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  genre_id uuid not null references public.movie_genres(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (title_id, genre_id)
);

create index if not exists movie_title_genres_genre_idx on public.movie_title_genres (genre_id);

create table if not exists public.movie_external_ids (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  provider text not null,
  external_id text not null,
  external_type text check (external_type is null or external_type in ('movie', 'series')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists movie_external_ids_title_idx on public.movie_external_ids (title_id);
create index if not exists movie_external_ids_provider_idx on public.movie_external_ids (provider, external_id);

create table if not exists public.movie_seasons (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  season_number integer not null check (season_number >= 0),
  name text,
  overview text,
  poster_path text,
  air_date date,
  episode_count integer check (episode_count is null or episode_count >= 0),
  status text not null default 'active' check (status in ('draft', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id, season_number)
);

create index if not exists movie_seasons_title_idx on public.movie_seasons (title_id, season_number);

create table if not exists public.movie_episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.movie_seasons(id) on delete cascade,
  episode_number integer not null check (episode_number >= 1),
  name text,
  overview text,
  air_date date,
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  still_path text,
  status text not null default 'active' check (status in ('draft', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, episode_number)
);

create index if not exists movie_episodes_season_idx on public.movie_episodes (season_id, episode_number);

create table if not exists public.movie_provider_availability (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  provider text not null,
  region_code text not null,
  availability_type text not null check (
    availability_type in ('stream', 'rent', 'buy', 'free', 'subscription')
  ),
  provider_url text,
  available_from date,
  available_until date,
  is_active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id, provider, region_code, availability_type)
);

create index if not exists movie_provider_availability_title_idx on public.movie_provider_availability (title_id);
create index if not exists movie_provider_availability_region_idx on public.movie_provider_availability (region_code);
create index if not exists movie_provider_availability_active_idx on public.movie_provider_availability (is_active);

create table if not exists public.movie_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create index if not exists movie_favorites_title_idx on public.movie_favorites (title_id);

create or replace function public.set_movies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists movie_titles_updated_at on public.movie_titles;
create trigger movie_titles_updated_at before update on public.movie_titles
for each row execute function public.set_movies_updated_at();

drop trigger if exists movie_external_ids_updated_at on public.movie_external_ids;
create trigger movie_external_ids_updated_at before update on public.movie_external_ids
for each row execute function public.set_movies_updated_at();

drop trigger if exists movie_seasons_updated_at on public.movie_seasons;
create trigger movie_seasons_updated_at before update on public.movie_seasons
for each row execute function public.set_movies_updated_at();

drop trigger if exists movie_episodes_updated_at on public.movie_episodes;
create trigger movie_episodes_updated_at before update on public.movie_episodes
for each row execute function public.set_movies_updated_at();

drop trigger if exists movie_provider_availability_updated_at on public.movie_provider_availability;
create trigger movie_provider_availability_updated_at before update on public.movie_provider_availability
for each row execute function public.set_movies_updated_at();

alter table public.movie_titles enable row level security;
alter table public.movie_genres enable row level security;
alter table public.movie_title_genres enable row level security;
alter table public.movie_external_ids enable row level security;
alter table public.movie_seasons enable row level security;
alter table public.movie_episodes enable row level security;
alter table public.movie_provider_availability enable row level security;
alter table public.movie_favorites enable row level security;

create policy "Movies active catalog is publicly readable"
on public.movie_titles for select to anon, authenticated
using (status = 'active');

create policy "Movie genres are publicly readable"
on public.movie_genres for select to anon, authenticated
using (true);

create policy "Movie title genres are publicly readable"
on public.movie_title_genres for select to anon, authenticated
using (
  exists (
    select 1 from public.movie_titles t
    where t.id = movie_title_genres.title_id
      and t.status = 'active'
  )
);

create policy "Movie external IDs are publicly readable for active titles"
on public.movie_external_ids for select to anon, authenticated
using (
  exists (
    select 1 from public.movie_titles t
    where t.id = movie_external_ids.title_id
      and t.status = 'active'
  )
);

create policy "Movie seasons are publicly readable for active series"
on public.movie_seasons for select to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.movie_titles t
    where t.id = movie_seasons.title_id
      and t.media_type = 'series'
      and t.status = 'active'
  )
);

create policy "Movie episodes are publicly readable for active series"
on public.movie_episodes for select to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.movie_seasons s
    join public.movie_titles t on t.id = s.title_id
    where s.id = movie_episodes.season_id
      and s.status = 'active'
      and t.media_type = 'series'
      and t.status = 'active'
  )
);

create policy "Provider availability is publicly readable for active titles"
on public.movie_provider_availability for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.movie_titles t
    where t.id = movie_provider_availability.title_id
      and t.status = 'active'
  )
);

create policy "Users can view their own movie favorites"
on public.movie_favorites for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own movie favorites"
on public.movie_favorites for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own movie favorites"
on public.movie_favorites for delete to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete
on public.movie_titles,
   public.movie_genres,
   public.movie_title_genres,
   public.movie_external_ids,
   public.movie_seasons,
   public.movie_episodes,
   public.movie_provider_availability
from anon, authenticated;

comment on table public.movie_titles is
'FINDLY Movies master catalog for movies and TV series.';

comment on table public.movie_external_ids is
'External provider identifiers. Provider-specific IDs never replace FINDLY internal UUIDs.';

comment on table public.movie_provider_availability is
'Region-specific legitimate provider availability. This table does not store FINDLY media assets.';

comment on table public.movie_favorites is
'Authenticated user favorites for FINDLY Movies.';

comment on column public.movie_titles.metadata_status is
'Separates metadata availability, legal provider availability, authorized FINDLY media, and delivery blocking.';

comment on column public.movie_titles.status is
'Catalog publication state. Draft and inactive titles are hidden from public catalog queries.';
