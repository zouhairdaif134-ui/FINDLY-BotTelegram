-- Structural, privilege, and hourly idempotency checks for the movie queue migration.
do $$
declare
  v_first_count integer;
  v_duplicate_count integer;
  v_next_hour_count integer;
  v_first_id uuid;
  v_second_id uuid;
  v_review_id uuid;
  v_review_claim_count integer;
  v_duplicate_rejected boolean := false;
  v_slot timestamptz := date_trunc('hour', now());
begin
  delete from public.movie_queue_slots;
  delete from public.movie_queue_items;

  if not (select relrowsecurity from pg_class where oid = 'public.movie_queue_items'::regclass) then
    raise exception 'movie_queue_items must have RLS enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.movie_queue_slots'::regclass) then
    raise exception 'movie_queue_slots must have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.movie_queue_items', 'select') then
    raise exception 'anon must not read movie_queue_items';
  end if;
  if has_table_privilege('authenticated', 'public.movie_queue_items', 'insert') then
    raise exception 'authenticated must not insert movie_queue_items directly';
  end if;
  if not has_table_privilege('service_role', 'public.movie_queue_items', 'insert') then
    raise exception 'service_role must be able to insert movie_queue_items';
  end if;
  if not has_function_privilege('service_role', 'public.claim_next_movie_queue_item(timestamptz,timestamptz)', 'execute') then
    raise exception 'service_role must execute the atomic claim function';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.claim_next_movie_queue_item(timestamptz,timestamptz)'::regprocedure) then
    raise exception 'atomic claim function must remain SECURITY INVOKER';
  end if;
  if has_function_privilege('anon', 'public.claim_next_movie_queue_item(timestamptz,timestamptz)', 'execute') then
    raise exception 'anon must not execute the atomic claim function';
  end if;
  if not has_function_privilege('service_role', 'public.claim_movie_queue_resolution(uuid,timestamptz)', 'execute') then
    raise exception 'service_role must execute the atomic match-resolution claim function';
  end if;
  if has_function_privilege('authenticated', 'public.claim_movie_queue_resolution(uuid,timestamptz)', 'execute') then
    raise exception 'authenticated must not execute the atomic match-resolution claim function';
  end if;

  insert into public.movie_queue_items(submitted_title, normalized_title, media_type)
  values ('Duplicate Queue Test', 'duplicate queue test', 'movie');
  begin
    insert into public.movie_queue_items(submitted_title, normalized_title, media_type)
    values ('Duplicate Queue Test Copy', 'duplicate queue test', 'movie');
  exception when unique_violation then
    v_duplicate_rejected := true;
  end;
  if not v_duplicate_rejected then
    raise exception 'active duplicate titles must be rejected by the unique index';
  end if;
  update public.movie_queue_items
    set status = 'failed'
    where normalized_title = 'duplicate queue test';
  insert into public.movie_queue_items(submitted_title, normalized_title, media_type)
  values ('Duplicate Queue Test Retry', 'duplicate queue test', 'movie');
  delete from public.movie_queue_items where normalized_title = 'duplicate queue test';

  insert into public.movie_queue_items(submitted_title, normalized_title, media_type)
  values ('Queue Test One', 'queue test one', 'movie')
  returning id into v_first_id;

  insert into public.movie_queue_items(submitted_title, normalized_title, media_type)
  values ('Queue Test Two', 'queue test two', 'movie')
  returning id into v_second_id;

  select count(*) into v_first_count
  from public.claim_next_movie_queue_item(v_slot, v_slot + interval '10 minutes');

  select count(*) into v_duplicate_count
  from public.claim_next_movie_queue_item(v_slot, v_slot + interval '10 minutes');

  select count(*) into v_next_hour_count
  from public.claim_next_movie_queue_item(v_slot + interval '1 hour', v_slot + interval '70 minutes');

  if v_first_count <> 1 then
    raise exception 'first hourly slot must claim exactly one item; got %', v_first_count;
  end if;
  if v_duplicate_count <> 0 then
    raise exception 'same hourly slot must not claim a second item; got %', v_duplicate_count;
  end if;
  if v_next_hour_count <> 1 then
    raise exception 'next hourly slot must claim one remaining item; got %', v_next_hour_count;
  end if;

  if (select count(*) from public.movie_queue_items where status = 'processing' and attempt_count = 1) <> 2 then
    raise exception 'claimed items must enter processing with one attempt';
  end if;

  insert into public.movie_queue_items(submitted_title, normalized_title, media_type, status)
  values ('Resolution Review Test', 'resolution review test', 'movie', 'needs_review')
  returning id into v_review_id;
  select count(*) into v_review_claim_count
  from public.claim_movie_queue_resolution(v_review_id, now() + interval '10 minutes');
  if v_review_claim_count <> 1 then
    raise exception 'first manual resolver must claim the needs_review item';
  end if;
  select count(*) into v_review_claim_count
  from public.claim_movie_queue_resolution(v_review_id, now() + interval '10 minutes');
  if v_review_claim_count <> 0 then
    raise exception 'second manual resolver must not claim an already-processing item';
  end if;
end;
$$;
