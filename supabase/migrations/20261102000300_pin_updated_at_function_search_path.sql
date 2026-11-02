-- Pin trigger function search paths to pg_catalog.
-- These functions only update NEW.updated_at and do not need public-schema lookup.

begin;

alter function public.set_updated_at()
  set search_path = pg_catalog;

alter function public.set_movies_updated_at()
  set search_path = pg_catalog;

commit;
