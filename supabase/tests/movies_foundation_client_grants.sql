-- Read-only verification for explicit Movies Foundation table grants.
-- Run after both Movies Foundation migrations.
-- Expected: all checks return PASS.

with catalog_tables(table_name) as (
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
    'anon can read public catalog tables'::text as check_name,
    not exists (
      select 1 from catalog_tables t
      where not has_table_privilege('anon', format('public.%I', t.table_name), 'SELECT')
    ) as passed

  union all

  select
    'authenticated can read public catalog tables',
    not exists (
      select 1 from catalog_tables t
      where not has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT')
    )

  union all

  select
    'anon cannot write catalog tables',
    not exists (
      select 1 from catalog_tables t
      where has_table_privilege('anon', format('public.%I', t.table_name), 'INSERT')
         or has_table_privilege('anon', format('public.%I', t.table_name), 'UPDATE')
         or has_table_privilege('anon', format('public.%I', t.table_name), 'DELETE')
    )

  union all

  select
    'authenticated cannot write catalog tables',
    not exists (
      select 1 from catalog_tables t
      where has_table_privilege('authenticated', format('public.%I', t.table_name), 'INSERT')
         or has_table_privilege('authenticated', format('public.%I', t.table_name), 'UPDATE')
         or has_table_privilege('authenticated', format('public.%I', t.table_name), 'DELETE')
    )

  union all

  select
    'authenticated can manage own favorites through RLS',
    has_table_privilege('authenticated', 'public.movie_favorites', 'SELECT')
    and has_table_privilege('authenticated', 'public.movie_favorites', 'INSERT')
    and has_table_privilege('authenticated', 'public.movie_favorites', 'DELETE')
    and not has_table_privilege('authenticated', 'public.movie_favorites', 'UPDATE')

  union all

  select
    'anon has no favorites table access',
    not has_table_privilege('anon', 'public.movie_favorites', 'SELECT')
    and not has_table_privilege('anon', 'public.movie_favorites', 'INSERT')
    and not has_table_privilege('anon', 'public.movie_favorites', 'UPDATE')
    and not has_table_privilege('anon', 'public.movie_favorites', 'DELETE')
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result
from checks
order by passed asc, check_name asc;
