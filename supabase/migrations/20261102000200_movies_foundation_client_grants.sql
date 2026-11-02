-- Explicit client grants for the Movies Foundation.
-- RLS policies in 20261008000100_movies_foundation.sql remain the row-level gate.
-- This migration grants read-only access to the public catalog and owner-scoped
-- favorite operations to authenticated users. Administrative writes stay Worker-only.

begin;

revoke all on table
  public.movie_titles,
  public.movie_genres,
  public.movie_title_genres,
  public.movie_external_ids,
  public.movie_seasons,
  public.movie_episodes,
  public.movie_provider_availability,
  public.movie_favorites
from anon, authenticated;

grant select on table
  public.movie_titles,
  public.movie_genres,
  public.movie_title_genres,
  public.movie_external_ids,
  public.movie_seasons,
  public.movie_episodes,
  public.movie_provider_availability
to anon, authenticated;

grant select, insert, delete
on table public.movie_favorites
to authenticated;

grant all privileges on table
  public.movie_titles,
  public.movie_genres,
  public.movie_title_genres,
  public.movie_external_ids,
  public.movie_seasons,
  public.movie_episodes,
  public.movie_provider_availability,
  public.movie_favorites
to service_role;

commit;
