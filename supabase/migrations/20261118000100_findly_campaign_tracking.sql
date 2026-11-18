-- FINDLY campaign attribution reuses analytics_events to avoid exposing a new public table.
-- A visit is created by /go/:campaign and linked to a Telegram user after /start.

create unique index if not exists analytics_events_campaign_visit_token_unique_idx
  on public.analytics_events ((event_data ->> 'visit_token'))
  where event_type = 'campaign_visit' and event_data ? 'visit_token';

create index if not exists analytics_events_campaign_visit_slug_time_idx
  on public.analytics_events ((event_data ->> 'campaign_slug'), created_at desc)
  where event_type = 'campaign_visit';

create index if not exists analytics_events_campaign_visit_user_time_idx
  on public.analytics_events (user_id, created_at desc)
  where event_type = 'campaign_visit' and user_id is not null;

create or replace function public.get_campaign_analytics(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns table (
  campaign_slug text,
  source text,
  visits bigint,
  unique_visitors bigint,
  crawler_visits bigint,
  starts bigint,
  unique_starters bigint,
  start_rate numeric,
  post_start_telegram_messages bigint,
  post_start_button_interactions bigint,
  post_start_searches bigint,
  post_start_movie_detail_views bigint,
  post_start_watch_clicks bigint,
  post_start_miniapp_opens bigint,
  post_start_movie_shares bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with bounds as (
    select coalesce(p_from, now() - interval '30 days') as from_at,
           coalesce(p_to, now()) as to_at
  ),
  campaign_visits as (
    select ae.id, ae.user_id,
           ae.event_data ->> 'campaign_slug' as campaign_slug,
           ae.event_data ->> 'source' as source,
           coalesce((ae.event_data ->> 'is_bot')::boolean, false) as is_bot,
           ae.event_data ->> 'visitor_hash' as visitor_hash,
           nullif(ae.event_data ->> 'started_at', '')::timestamptz as started_at
    from public.analytics_events ae
    cross join bounds b
    where ae.event_type = 'campaign_visit'
      and ae.created_at >= b.from_at
      and ae.created_at < b.to_at
  ),
  campaign_stats as (
    select cv.campaign_slug, cv.source,
           count(*) filter (where not cv.is_bot)::bigint as visits,
           count(distinct cv.visitor_hash) filter (where not cv.is_bot and cv.visitor_hash is not null)::bigint as unique_visitors,
           count(*) filter (where cv.is_bot)::bigint as crawler_visits,
           count(*) filter (where not cv.is_bot and cv.started_at >= b.from_at and cv.started_at < b.to_at)::bigint as starts,
           count(distinct cv.user_id) filter (where not cv.is_bot and cv.started_at >= b.from_at and cv.started_at < b.to_at and cv.user_id is not null)::bigint as unique_starters,
           coalesce(round(
             100.0 * count(*) filter (where not cv.is_bot and cv.started_at is not null)
             / nullif(count(*) filter (where not cv.is_bot), 0), 1
           ), 0) as start_rate
    from campaign_visits cv
    where cv.campaign_slug is not null
    group by cv.campaign_slug, cv.source
  ),
  last_touch as (
    select distinct on (cv.user_id) cv.user_id, cv.campaign_slug, cv.started_at
    from campaign_visits cv
    cross join bounds b
    where not cv.is_bot and cv.user_id is not null
      and cv.started_at >= b.from_at and cv.started_at < b.to_at
    order by cv.user_id, cv.started_at desc
  ),
  engagement as (
    select lt.campaign_slug,
           count(ae.id) filter (where ae.event_type = 'message')::bigint as post_start_telegram_messages,
           count(ae.id) filter (where ae.event_type = 'callback_query')::bigint as post_start_button_interactions,
           count(ae.id) filter (
             where ae.event_type = 'miniapp_search'
               or (ae.event_type = 'callback_query' and coalesce(ae.event_data ->> 'action', '') like 'movies:search%')
           )::bigint as post_start_searches,
           count(ae.id) filter (
             where ae.event_type = 'miniapp_title_viewed'
               or (ae.event_type = 'callback_query' and coalesce(ae.event_data ->> 'action', '') like 'movies:title:%')
           )::bigint as post_start_movie_detail_views,
           count(ae.id) filter (
             where ae.event_type in ('miniapp_watch_clicked', 'movie_watch_started')
               or (ae.event_type = 'callback_query' and (
                 coalesce(ae.event_data ->> 'action', '') like 'movies:watch:%'
                 or coalesce(ae.event_data ->> 'action', '') like 'movies:episode:%'
               ))
           )::bigint as post_start_watch_clicks,
           count(ae.id) filter (where ae.event_type = 'miniapp_opened')::bigint as post_start_miniapp_opens,
           count(ae.id) filter (where ae.event_type = 'movie_share')::bigint as post_start_movie_shares
    from last_touch lt
    join public.analytics_events ae
      on ae.user_id = lt.user_id
     and ae.created_at > lt.started_at
     and ae.created_at < (select to_at from bounds)
    group by lt.campaign_slug
  )
  select cs.campaign_slug, cs.source, cs.visits, cs.unique_visitors, cs.crawler_visits,
         cs.starts, cs.unique_starters, cs.start_rate,
         coalesce(en.post_start_telegram_messages, 0),
         coalesce(en.post_start_button_interactions, 0),
         coalesce(en.post_start_searches, 0),
         coalesce(en.post_start_movie_detail_views, 0),
         coalesce(en.post_start_watch_clicks, 0),
         coalesce(en.post_start_miniapp_opens, 0),
         coalesce(en.post_start_movie_shares, 0)
  from campaign_stats cs
  left join engagement en on en.campaign_slug = cs.campaign_slug
  order by cs.visits desc, cs.campaign_slug asc;
$function$;

revoke all on function public.get_campaign_analytics(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_campaign_analytics(timestamptz, timestamptz)
  to service_role;
