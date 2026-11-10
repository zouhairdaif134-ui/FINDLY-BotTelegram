do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_media_assets' and column_name = 'video_width'
      and data_type = 'integer'
  ) then raise exception 'video_width column missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_media_assets' and column_name = 'video_height'
      and data_type = 'integer'
  ) then raise exception 'video_height column missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'movie_media_assets' and column_name = 'duration_seconds'
      and data_type = 'integer'
  ) then raise exception 'duration_seconds column missing'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.movie_media_assets'::regclass
      and conname = 'movie_media_assets_video_width_check'
  ) then raise exception 'video_width positive constraint missing'; end if;
end;
$$;

select 'movie media video metadata verification passed' as result;
