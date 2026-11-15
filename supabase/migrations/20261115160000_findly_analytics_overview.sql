-- FINDLY analytics overview: unified user metrics and client telemetry.
-- All timestamps are stored as timestamptz and filtered in UTC instants.

create unique index if not exists analytics_events_miniapp_session_unique_idx
  on public.analytics_events ((event_data ->> 'session_id'))
  where event_type = 'miniapp_opened'
    and event_data ? 'session_id';

create unique index if not exists analytics_events_client_event_unique_idx
  on public.analytics_events ((event_data ->> 'event_id'))
  where event_type in (
    'miniapp_search',
    'miniapp_title_viewed',
    'miniapp_watch_clicked',
    'ad_provider_request',
    'ad_provider_resolved',
    'ad_provider_failed'
  )
    and event_data ? 'event_id';

create or replace function public.get_findly_analytics_overview(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with bounds as (
    select
      coalesce(p_from, now() - interval '30 days') as from_at,
      coalesce(p_to, now()) as to_at
  ),
  active_users as (
    select distinct ae.user_id
    from public.analytics_events ae, bounds b
    where ae.user_id is not null
      and ae.created_at >= b.from_at
      and ae.created_at < b.to_at
  ),
  bot_members as (
    select
      b.slug,
      b.name,
      count(distinct ub.user_id)::bigint as total_users
    from public.bots b
    left join public.user_bots ub on ub.bot_id = b.id
    where b.slug in ('findly', 'movies')
    group by b.id, b.slug, b.name
  ),
  bot_activity as (
    select
      b.slug,
      count(distinct ae.user_id) filter (where ae.user_id is not null) as active_users,
      count(ae.id)::bigint as events
    from public.bots b
    left join public.analytics_events ae
      on ae.bot_id = b.id
     and ae.created_at >= (select from_at from bounds)
     and ae.created_at < (select to_at from bounds)
    where b.slug in ('findly', 'movies')
    group by b.id, b.slug
  ),
  membership as (
    select
      count(*) filter (where b.slug = 'findly') as master_users,
      count(*) filter (where b.slug = 'movies') as watch_users
    from (
      select distinct ub.user_id, bot.slug
      from public.user_bots ub
      join public.bots bot on bot.id = ub.bot_id
      where bot.slug in ('findly', 'movies')
    ) b
  ),
  shared_members as (
    select count(*)::bigint as total
    from (
      select ub.user_id
      from public.user_bots ub
      join public.bots bot on bot.id = ub.bot_id
      where bot.slug in ('findly', 'movies')
      group by ub.user_id
      having count(distinct bot.slug) = 2
    ) shared
  ),
  miniapp_stats as (
    select
      count(*)::bigint as sessions,
      count(distinct ae.user_id)::bigint as unique_visitors
    from public.analytics_events ae, bounds b
    where ae.event_type = 'miniapp_opened'
      and ae.created_at >= b.from_at
      and ae.created_at < b.to_at
  ),
  provider_stats as (
    select
      provider.provider,
      count(ae.id) filter (where ae.event_type = 'ad_provider_request') as requests,
      count(ae.id) filter (where ae.event_type = 'ad_provider_resolved') as resolved,
      count(ae.id) filter (where ae.event_type = 'ad_provider_failed') as failed
    from (values ('monetag'::text), ('adsgram'::text)) as provider(provider)
    left join public.analytics_events ae
      on ae.event_data ->> 'provider' = provider.provider
     and ae.event_type in ('ad_provider_request', 'ad_provider_resolved', 'ad_provider_failed')
     and ae.created_at >= (select from_at from bounds)
     and ae.created_at < (select to_at from bounds)
    group by provider.provider
  ),
  activity_stats as (
    select
      count(*) filter (where ae.event_type = 'message') as telegram_messages,
      count(*) filter (where ae.event_type = 'callback_query') as telegram_callbacks,
      count(*) filter (where ae.event_type = 'master_menu_viewed') as master_menu_views,
      count(*) filter (where ae.event_type = 'menu_item_clicked') as menu_item_clicks,
      count(*) filter (
        where ae.event_type = 'miniapp_search'
          or (ae.event_type = 'callback_query' and coalesce(ae.event_data ->> 'action', '') like 'movies:search%')
      ) as movie_searches,
      count(*) filter (
        where ae.event_type = 'miniapp_title_viewed'
          or (ae.event_type = 'callback_query' and coalesce(ae.event_data ->> 'action', '') like 'movies:title:%')
      ) as movie_detail_views,
      count(*) filter (
        where ae.event_type = 'miniapp_watch_clicked'
          or (ae.event_type = 'callback_query' and coalesce(ae.event_data ->> 'action', '') like 'movies:watch:%')
      ) as movie_watch_clicks,
      count(*) filter (where ae.event_type = 'movie_share') as movie_shares
    from public.analytics_events ae, bounds b
    where ae.created_at >= b.from_at
      and ae.created_at < b.to_at
  ),
  user_stats as (
    select
      count(*)::bigint as total,
      count(*) filter (
        where tu.first_seen_at >= b.from_at
          and tu.first_seen_at < b.to_at
      )::bigint as new_users,
      (select count(*)::bigint from active_users) as active
    from public.telegram_users tu, bounds b
  )
  select jsonb_build_object(
    'generated_at', now(),
    'period', jsonb_build_object(
      'from', (select from_at from bounds),
      'to', (select to_at from bounds)
    ),
    'users', jsonb_build_object(
      'total', us.total,
      'new', us.new_users,
      'active', us.active,
      'inactive', greatest(us.total - us.active, 0),
      'master', coalesce((select master_users from membership), 0),
      'watch', coalesce((select watch_users from membership), 0),
      'shared', coalesce((select total from shared_members), 0)
    ),
    'bots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', bm.slug,
        'name', bm.name,
        'total_users', bm.total_users,
        'active_users', coalesce(ba.active_users, 0),
        'events', coalesce(ba.events, 0)
      ) order by case bm.slug when 'findly' then 1 else 2 end)
      from bot_members bm
      left join bot_activity ba on ba.slug = bm.slug
    ), '[]'::jsonb),
    'miniapp', jsonb_build_object(
      'sessions', (select sessions from miniapp_stats),
      'unique_visitors', (select unique_visitors from miniapp_stats)
    ),
    'activity', (select to_jsonb(activity_stats) from activity_stats),
    'ad_providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', ps.provider,
        'requests', ps.requests,
        'resolved', ps.resolved,
        'failed', ps.failed
      ) order by ps.provider)
      from provider_stats ps
    ), '[]'::jsonb),
    'revenue', jsonb_build_object(
      'status', 'not_connected',
      'amount', null,
      'currency', null
    )
  )
  from user_stats us;
$function$;

revoke execute on function public.get_findly_analytics_overview(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_findly_analytics_overview(timestamptz, timestamptz)
  to service_role;
