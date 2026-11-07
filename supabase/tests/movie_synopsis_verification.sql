-- Assertions for the Arabic synopsis migration on disposable PostgreSQL.
do $$
declare
  v_source text;
  v_public_overview text;
  v_language text;
  v_log_count integer;
  v_function_signature text := 'public.admin_audit_update_movie_synopsis(uuid,uuid,text,text,text,text,text)';
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'movie_synopsis_sources' and c.relrowsecurity
  ) then
    raise exception 'Private synopsis source table must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.movie_synopsis_sources', 'SELECT')
     or has_table_privilege('authenticated', 'public.movie_synopsis_sources', 'SELECT') then
    raise exception 'Public roles must not read private source synopses';
  end if;
  if not has_table_privilege('service_role', 'public.movie_synopsis_sources', 'SELECT') then
    raise exception 'Worker service role must read private source synopses';
  end if;

  if has_function_privilege('anon', v_function_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_function_signature, 'EXECUTE') then
    raise exception 'Public roles must not execute the privileged synopsis update RPC';
  end if;
  if not has_function_privilege('service_role', v_function_signature, 'EXECUTE') then
    raise exception 'Worker service role must execute the synopsis update RPC';
  end if;

  select original_overview into v_source
  from public.movie_synopsis_sources
  where title_id = '11111111-1111-4111-8111-111111111111';
  if v_source is distinct from 'An English synopsis that must be preserved privately.' then
    raise exception 'Legacy English source synopsis was not preserved';
  end if;

  select overview into v_public_overview
  from public.movie_titles
  where id = '11111111-1111-4111-8111-111111111111';
  if v_public_overview is not null then
    raise exception 'Legacy English synopsis must be hidden until localized';
  end if;

  select original_overview into v_source
  from public.movie_synopsis_sources
  where title_id = '22222222-2222-4222-8222-222222222222';
  if v_source is distinct from 'ملخص عربي قديم يجب أن يبقى ظاهراً.' then
    raise exception 'Legacy Arabic source synopsis was not preserved privately';
  end if;

  select overview into v_public_overview
  from public.movie_titles
  where id = '22222222-2222-4222-8222-222222222222';
  if v_public_overview is not null then
    raise exception 'Legacy Arabic synopsis must wait for the localization batch before public display';
  end if;

  insert into public.movie_titles (id, media_type, normalized_title, overview, overview_language, overview_source)
  values ('33333333-3333-4333-8333-333333333333', 'movie', 'new-title', 'New source synopsis.', null, null);
  select overview_language into v_language
  from public.movie_titles
  where id = '33333333-3333-4333-8333-333333333333';
  if v_language is distinct from 'pending' then
    raise exception 'New movie rows must receive pending synopsis defaults even when the audit insert explicitly supplies null';
  end if;

  perform public.admin_audit_update_movie_synopsis(
    '99999999-9999-4999-8999-999999999999',
    '11111111-1111-4111-8111-111111111111',
    'ملخص مترجم إلى العربية الفصحى.',
    'This replacement must not overwrite the preserved source.',
    'en',
    'ar-SA',
    'ai_translation'
  );

  select overview, overview_language into v_public_overview, v_language
  from public.movie_titles
  where id = '11111111-1111-4111-8111-111111111111';
  if v_public_overview is distinct from 'ملخص مترجم إلى العربية الفصحى.' or v_language is distinct from 'ar-SA' then
    raise exception 'Audited synopsis update did not write the Arabic public synopsis';
  end if;

  select original_overview into v_source
  from public.movie_synopsis_sources
  where title_id = '11111111-1111-4111-8111-111111111111';
  if v_source is distinct from 'An English synopsis that must be preserved privately.' then
    raise exception 'Audited update overwrote the private source synopsis';
  end if;

  perform public.admin_audit_update_movie_synopsis(
    '99999999-9999-4999-8999-999999999999',
    '22222222-2222-4222-8222-222222222222',
    'ملخص عربي قديم يجب أن يبقى ظاهراً.',
    'ملخص عربي قديم يجب أن يبقى ظاهراً.',
    'und',
    'ar-SA',
    'existing_arabic'
  );

  select overview, overview_language into v_public_overview, v_language
  from public.movie_titles
  where id = '22222222-2222-4222-8222-222222222222';
  if v_public_overview is distinct from 'ملخص عربي قديم يجب أن يبقى ظاهراً.' or v_language is distinct from 'ar-SA' then
    raise exception 'Existing Arabic synopsis was not restored by localization';
  end if;

  select count(*) into v_log_count
  from public.admin_audit_logs
  where action = 'movie.synopsis_localize'
    and entity_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
    and result = 'success';
  if v_log_count <> 2 then
    raise exception 'Each synopsis update must create an audit log row';
  end if;
end;
$$;
