create or replace function public.get_movie_referral_analytics()
returns table (
  title_id uuid,
  title text,
  media_type text,
  release_year integer,
  facebook_starts bigint,
  facebook_unique_users bigint,
  instagram_starts bigint,
  instagram_unique_users bigint,
  total_starts bigint,
  total_unique_users bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with referral_stats as (
    select
      (ae.event_data ->> 'title_id')::uuid as title_id,
      count(*) filter (where ae.event_data ->> 'source' = 'facebook') as facebook_starts,
      count(distinct ae.user_id) filter (where ae.event_data ->> 'source' = 'facebook') as facebook_unique_users,
      count(*) filter (where ae.event_data ->> 'source' = 'instagram') as instagram_starts,
      count(distinct ae.user_id) filter (where ae.event_data ->> 'source' = 'instagram') as instagram_unique_users,
      count(*) as total_starts,
      count(distinct ae.user_id) as total_unique_users
    from public.analytics_events ae
    where ae.event_type = 'movie_referral_start'
      and ae.event_data ? 'title_id'
      and ae.event_data ->> 'source' in ('facebook', 'instagram')
    group by (ae.event_data ->> 'title_id')::uuid
  )
  select
    mt.id,
    mt.title,
    mt.media_type,
    mt.release_year,
    coalesce(rs.facebook_starts, 0),
    coalesce(rs.facebook_unique_users, 0),
    coalesce(rs.instagram_starts, 0),
    coalesce(rs.instagram_unique_users, 0),
    coalesce(rs.total_starts, 0),
    coalesce(rs.total_unique_users, 0)
  from public.movie_titles mt
  left join referral_stats rs on rs.title_id = mt.id
  order by coalesce(rs.total_starts, 0) desc, mt.created_at desc;
$$;

revoke all on function public.get_movie_referral_analytics() from public;
revoke all on function public.get_movie_referral_analytics() from anon;
revoke all on function public.get_movie_referral_analytics() from authenticated;
grant execute on function public.get_movie_referral_analytics() to service_role;
