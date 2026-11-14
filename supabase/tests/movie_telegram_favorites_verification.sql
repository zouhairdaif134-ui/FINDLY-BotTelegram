-- Verification for the Telegram Mini App favorites table.
begin;

do $$
begin
  if to_regclass('public.movie_telegram_favorites') is null then
    raise exception 'movie_telegram_favorites table is missing';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'movie_telegram_favorites'
      and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on movie_telegram_favorites';
  end if;
  if has_table_privilege('anon', 'public.movie_telegram_favorites', 'SELECT')
     or has_table_privilege('authenticated', 'public.movie_telegram_favorites', 'SELECT') then
    raise exception 'Client roles must not read Telegram favorites directly';
  end if;
  if not (
    has_table_privilege('service_role', 'public.movie_telegram_favorites', 'SELECT')
    and has_table_privilege('service_role', 'public.movie_telegram_favorites', 'INSERT')
    and has_table_privilege('service_role', 'public.movie_telegram_favorites', 'UPDATE')
    and has_table_privilege('service_role', 'public.movie_telegram_favorites', 'DELETE')
  ) then
    raise exception 'service_role must have access to Telegram favorites';
  end if;
end;
$$;

rollback;
