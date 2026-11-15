create or replace function public.submit_movie_request(
  p_tmdb_id bigint, p_media_type text, p_title text, p_original_title text,
  p_release_year integer, p_rating numeric, p_overview text, p_poster_path text,
  p_backdrop_path text, p_telegram_user_id bigint
)
returns table (request_id uuid, request_count integer, request_status text, is_new_user boolean)
language plpgsql security definer set search_path = public
as $$
declare v_request_id uuid; v_request_count integer; v_status text; v_inserted integer;
begin
  if p_tmdb_id is null or p_tmdb_id <= 0 or p_media_type is null or p_media_type not in ('movie', 'series')
    or p_title is null or length(btrim(p_title)) = 0
    or p_telegram_user_id is null or p_telegram_user_id <= 0 then
    raise exception 'Invalid movie request payload' using errcode = '22023';
  end if;
  insert into public.movie_requests (
    tmdb_id, media_type, title, original_title, release_year, rating,
    overview, poster_path, backdrop_path, tmdb_url
  ) values (
    p_tmdb_id, p_media_type, left(btrim(p_title), 300),
    nullif(left(btrim(coalesce(p_original_title, '')), 300), ''),
    p_release_year, p_rating, nullif(left(coalesce(p_overview, ''), 5000), ''),
    nullif(left(coalesce(p_poster_path, ''), 500), ''),
    nullif(left(coalesce(p_backdrop_path, ''), 500), ''),
    'https://www.themoviedb.org/' || case when p_media_type = 'series' then 'tv/' else 'movie/' end || p_tmdb_id::text
  ) on conflict (tmdb_id, media_type) do nothing;
  select r.id into v_request_id from public.movie_requests r
  where r.tmdb_id = p_tmdb_id and r.media_type = p_media_type;
  insert into public.movie_request_users (request_id, telegram_user_id)
  values (v_request_id, p_telegram_user_id)
  on conflict on constraint movie_request_users_pkey do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.movie_requests r set request_count = r.request_count + 1,
      last_requested_at = now(), updated_at = now()
    where r.id = v_request_id returning r.request_count, r.status into v_request_count, v_status;
  else
    select r.request_count, r.status into v_request_count, v_status
    from public.movie_requests r where r.id = v_request_id;
  end if;
  return query select v_request_id, v_request_count, v_status, (v_inserted = 1);
end;
$$;
revoke all on function public.submit_movie_request(bigint, text, text, text, integer, numeric, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.submit_movie_request(bigint, text, text, text, integer, numeric, text, text, text, bigint) to service_role;
