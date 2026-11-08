do $$
declare
  v_rls boolean;
  v_policy_count integer;
begin
  if to_regclass('public.movie_media_assets') is null then
    raise exception 'movie_media_assets table was not created';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'movie_media_assets';
  if v_rls is distinct from true then
    raise exception 'movie_media_assets must have RLS enabled';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'movie_media_assets';
  if v_policy_count <> 0 then
    raise exception 'movie_media_assets must not expose policies to end-user roles';
  end if;

  if not has_table_privilege('service_role', 'public.movie_media_assets', 'SELECT')
     or not has_table_privilege('service_role', 'public.movie_media_assets', 'INSERT')
     or not has_table_privilege('service_role', 'public.movie_media_assets', 'UPDATE')
     or not has_table_privilege('service_role', 'public.movie_media_assets', 'DELETE') then
    raise exception 'service_role must have full access to movie_media_assets';
  end if;
  if has_table_privilege('anon', 'public.movie_media_assets', 'SELECT')
     or has_table_privilege('anon', 'public.movie_media_assets', 'INSERT')
     or has_table_privilege('anon', 'public.movie_media_assets', 'UPDATE')
     or has_table_privilege('anon', 'public.movie_media_assets', 'DELETE') then
    raise exception 'anon must not have access to movie_media_assets';
  end if;
  if has_table_privilege('authenticated', 'public.movie_media_assets', 'SELECT')
     or has_table_privilege('authenticated', 'public.movie_media_assets', 'INSERT')
     or has_table_privilege('authenticated', 'public.movie_media_assets', 'UPDATE')
     or has_table_privilege('authenticated', 'public.movie_media_assets', 'DELETE') then
    raise exception 'authenticated must not have access to movie_media_assets';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.movie_media_assets'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%storage_chat_id, storage_message_id%'
  ) then
    raise exception 'storage chat/message idempotency constraint is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.movie_media_assets'::regclass
      and tgname = 'movie_media_assets_updated_at'
      and not tgisinternal
  ) then
    raise exception 'movie media updated_at trigger is missing';
  end if;
end;
$$;
