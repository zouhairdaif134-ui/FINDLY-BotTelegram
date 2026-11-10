do $$
declare
  v_status text;
  v_rights text;
  v_channel text;
  v_rls boolean;
begin
  if to_regclass('public.movie_media_storage_config') is null then
    raise exception 'movie_media_storage_config table was not created';
  end if;
  if to_regclass('public.movie_distribution_rights') is null then
    raise exception 'movie_distribution_rights table was not created';
  end if;

  select status into v_status
  from public.movie_media_assets
  where storage_chat_id = '-1001111111111' and storage_message_id = 101;
  if v_status is distinct from 'active' then
    raise exception 'Existing active media must remain active after migration';
  end if;

  insert into public.movie_media_assets (
    title_id, storage_chat_id, storage_message_id, media_type,
    file_id, file_unique_id
  )
  values (
    '11111111-1111-4111-8111-111111111111', '-1001111111111', 102,
    'video', 'fixture-file-2', 'fixture-unique-2'
  )
  returning status into v_status;
  if v_status is distinct from 'pending_review' then
    raise exception 'New media must default to pending_review';
  end if;

  select status into v_rights
  from public.movie_distribution_rights
  where title_id = '11111111-1111-4111-8111-111111111111';
  if v_rights is distinct from 'unverified' then
    raise exception 'Existing titles must default to unverified distribution rights';
  end if;

  insert into public.movie_titles (
    id, media_type, normalized_title, title, release_year, metadata_status
  )
  values (
    '33333333-3333-4333-8333-333333333333',
    'movie',
    'new-fixture-movie',
    'New Fixture Movie',
    2026,
    'metadata_only'
  );

  select status into v_rights
  from public.movie_distribution_rights
  where title_id = '33333333-3333-4333-8333-333333333333';
  if v_rights is distinct from 'unverified' then
    raise exception 'New titles must receive an unverified rights record automatically';
  end if;

  select active_storage_chat_id into v_channel
  from public.movie_media_storage_config
  where id = 1;
  if v_channel is distinct from '-1001111111111' then
    raise exception 'The existing single storage channel must be preserved';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='movie_media_storage_config';
  if v_rls is distinct from true then
    raise exception 'Storage config must have RLS enabled';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='movie_distribution_rights';
  if v_rls is distinct from true then
    raise exception 'Distribution rights must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.movie_media_storage_config', 'SELECT')
     or has_table_privilege('authenticated', 'public.movie_media_storage_config', 'SELECT')
     or has_table_privilege('anon', 'public.movie_distribution_rights', 'SELECT')
     or has_table_privilege('authenticated', 'public.movie_distribution_rights', 'SELECT') then
    raise exception 'Private media configuration and rights must not be readable by end-user roles';
  end if;

  if not has_table_privilege('service_role', 'public.movie_media_storage_config', 'SELECT')
     or not has_table_privilege('service_role', 'public.movie_media_storage_config', 'UPDATE')
     or not has_table_privilege('service_role', 'public.movie_distribution_rights', 'SELECT')
     or not has_table_privilege('service_role', 'public.movie_distribution_rights', 'UPDATE') then
    raise exception 'service_role must manage private media configuration and rights';
  end if;

  if not exists (
    select 1
    from public.permissions p
    join public.role_permissions rp on rp.permission_id=p.id
    join public.roles r on r.id=rp.role_id
    where p.code='media.manage' and r.name='owner'
  ) then
    raise exception 'media.manage must be granted to owner';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.movie_media_storage_config'::regclass
      and tgname='movie_media_storage_config_updated_at'
      and not tgisinternal
  ) then
    raise exception 'Storage config updated_at trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.movie_titles'::regclass
      and tgname='movie_distribution_rights_on_movie_insert'
      and not tgisinternal
  ) then
    raise exception 'Automatic distribution-rights default trigger is missing';
  end if;
end;
$$;
