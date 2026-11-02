-- Read-only verification: both updated_at trigger functions must use pg_catalog only.
select
  p.proname as function_name,
  case
    when coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=pg_catalog%'
    then 'PASS' else 'FAIL'
  end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'set_movies_updated_at')
order by p.proname;
