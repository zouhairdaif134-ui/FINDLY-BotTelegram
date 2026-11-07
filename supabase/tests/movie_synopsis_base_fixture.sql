-- Disposable PostgreSQL fixture for the Arabic synopsis migration.
-- The movie queue fixture creates the minimal movie_titles table and Supabase roles.

alter table public.movie_titles
  add column if not exists overview text;

create table if not exists public.admin_profiles (
  id uuid primary key,
  display_name text,
  is_active boolean not null default true
);

alter table public.admin_profiles
  add column if not exists display_name text,
  add column if not exists is_active boolean not null default true;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  old_values jsonb,
  new_values jsonb,
  result text not null
);

create or replace function public.admin_audit_sanitize_jsonb(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select p_value;
$$;

insert into public.admin_profiles (id, display_name, is_active)
values ('99999999-9999-4999-8999-999999999999', 'Synopsis Test Admin', true);

insert into public.movie_titles (id, media_type, normalized_title, overview)
values
  ('11111111-1111-4111-8111-111111111111', 'movie', 'legacy-english', 'An English synopsis that must be preserved privately.'),
  ('22222222-2222-4222-8222-222222222222', 'series', 'legacy-arabic', 'ملخص عربي قديم يجب أن يبقى ظاهراً.');
