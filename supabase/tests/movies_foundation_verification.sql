-- FINDLY Movies Phase 1 — read-only schema and RLS verification
-- Run this in the Supabase SQL Editor AFTER applying
-- supabase/migrations/20261008000100_movies_foundation.sql.
-- This script does not modify data or schema.

with expected_tables(table_name) as (
  values
    ('movie_titles'),
    ('movie_genres'),
    ('movie_title_genres'),
    ('movie_external_ids'),
    ('movie_seasons'),
    ('movie_episodes'),
    ('movie_provider_availability'),
    ('movie_favorites')
),
catalog_tables(table_name) as (
  values
    ('movie_titles'),
    ('movie_genres'),
    ('movie_title_genres'),
    ('movie_external_ids'),
    ('movie_seasons'),
    ('movie_episodes'),
    ('movie_provider_availability')
),
checks as (
  select
    'All 8 Movies tables exist'::text as check_name,
    (select count(*) = 8
     from expected_tables e
     join information_schema.tables t
       on t.table_schema = 'public'
      and t.table_name = e.table_name) as passed,
    'Expected: 8 tables in public schema'::text as details

  union all

  select
    'RLS enabled on all 8 Movies tables',
    (select count(*) = 8
     from expected_tables e
     join pg_class c on c.relname = e.table_name
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity),
    'Every table must have row-level security enabled'

  union all

  select
    'All 10 expected policies exist',
    (select count(*) = 10
     from pg_policies
     where schemaname = 'public'
       and policyname in (
         'Movies active catalog is publicly readable',
         'Movie genres are publicly readable',
         'Movie title genres are publicly readable',
         'Movie external IDs are publicly readable for active titles',
         'Movie seasons are publicly readable for active series',
         'Movie episodes are publicly readable for active series',
         'Provider availability is publicly readable for active titles',
         'Users can view their own movie favorites',
         'Users can create their own movie favorites',
         'Users can delete their own movie favorites'
       )),
    'Expected: 7 catalog read policies + 3 owner-scoped favorite policies'

  union all

  select
    'Catalog tables reject direct client writes',
    not exists (
      select 1
      from catalog_tables c
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      where has_table_privilege(roles.role_name, format('public.%I', c.table_name), 'INSERT')
         or has_table_privilege(roles.role_name, format('public.%I', c.table_name), 'UPDATE')
         or has_table_privilege(roles.role_name, format('public.%I', c.table_name), 'DELETE')
    ),
    'anon/authenticated must not have direct INSERT, UPDATE, or DELETE privileges'

  union all

  select
    'Favorites have owner-scoped policies',
    (select count(*) = 3
     from pg_policies
     where schemaname = 'public'
       and tablename = 'movie_favorites'
       and policyname in (
         'Users can view their own movie favorites',
         'Users can create their own movie favorites',
         'Users can delete their own movie favorites'
       )
       and roles @> array['authenticated']::name[]),
    'Favorites SELECT/INSERT/DELETE policies must be restricted to authenticated users'

  union all

  select
    'Updated-at triggers exist on all 5 mutable catalog tables',
    (select count(*) = 5
     from information_schema.triggers
     where trigger_schema = 'public'
       and trigger_name in (
         'movie_titles_updated_at',
         'movie_external_ids_updated_at',
         'movie_seasons_updated_at',
         'movie_episodes_updated_at',
         'movie_provider_availability_updated_at'
       )),
    'Expected: 5 BEFORE UPDATE triggers'

  union all

  select
    'External provider identifiers have a unique provider/id constraint',
    exists (
      select 1
      from pg_constraint con
      join pg_class tbl on tbl.oid = con.conrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      where ns.nspname = 'public'
        and tbl.relname = 'movie_external_ids'
        and con.contype = 'u'
        and pg_get_constraintdef(con.oid) like '%(provider, external_id)%'
    ),
    'Prevents the same external identifier being linked more than once per provider'

  union all

  select
    'No Telegram media storage columns in catalog foundation',
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (
          'movie_titles',
          'movie_genres',
          'movie_title_genres',
          'movie_external_ids',
          'movie_seasons',
          'movie_episodes',
          'movie_provider_availability',
          'movie_favorites'
        )
        and column_name in (
          'telegram_file_id',
          'telegram_message_id',
          'telegram_chat_id',
          'video_bytes',
          'media_blob'
        )
    ),
    'Telegram media storage belongs to the later authorized-media phase'
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result,
  details
from checks
order by passed asc, check_name asc;
