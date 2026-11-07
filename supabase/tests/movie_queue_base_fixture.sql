-- Minimal existing-schema fixture required by the additive movie queue migration.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
create table if not exists public.movie_titles (
  id uuid primary key default gen_random_uuid()
);
