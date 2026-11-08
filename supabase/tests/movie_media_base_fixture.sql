-- Disposable PostgreSQL fixture for the Telegram movie media registry migration.
alter table public.movie_titles
  add column if not exists title text,
  add column if not exists release_year integer,
  add column if not exists metadata_status text;

create or replace function public.set_movies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
