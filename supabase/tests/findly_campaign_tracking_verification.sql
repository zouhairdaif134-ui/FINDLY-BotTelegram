insert into public.analytics_events (user_id, bot_id, event_type, event_data, created_at) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','campaign_visit','{"campaign_slug":"facebook_launch","source":"facebook","visit_token":"aaaaaaaaaaaaaaaaaaaaaaaa","visitor_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","is_bot":false,"started_at":"2026-11-22T10:02:00Z","start_bot_slug":"findly"}','2026-11-22T10:01:00Z'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','campaign_visit','{"campaign_slug":"facebook_launch","source":"facebook","visit_token":"bbbbbbbbbbbbbbbbbbbbbbbb","visitor_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","is_bot":false}','2026-11-22T10:03:00Z'),
(null,'10000000-0000-4000-8000-000000000001','campaign_visit','{"campaign_slug":"facebook_launch","source":"facebook","visit_token":"cccccccccccccccccccccccc","visitor_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","is_bot":true,"crawler_name":"facebook"}','2026-11-22T10:04:00Z');

insert into public.analytics_events (user_id, bot_id, event_type, event_data, created_at) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','message','{"command":"/search"}','2026-11-22T10:02:30Z'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','callback_query','{"action":"movies:new:1"}','2026-11-22T10:02:45Z'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','miniapp_search','{"query":"Dune"}','2026-11-22T10:03:00Z'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','miniapp_title_viewed','{"title_id":"60000000-0000-4000-8000-000000000001"}','2026-11-22T10:03:30Z');

do $$
declare result record;
begin
  select * into result from public.get_campaign_analytics('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z')
  where campaign_slug = 'facebook_launch';
  if result.visits <> 2 then raise exception 'expected 2 human visits: %', row_to_json(result); end if;
  if result.unique_visitors <> 2 then raise exception 'expected 2 unique visitors: %', row_to_json(result); end if;
  if result.crawler_visits <> 1 then raise exception 'expected 1 crawler visit: %', row_to_json(result); end if;
  if result.starts <> 1 then raise exception 'expected 1 Start: %', row_to_json(result); end if;
  if result.unique_starters <> 1 then raise exception 'expected 1 unique starter: %', row_to_json(result); end if;
  if result.start_rate <> 50.0 then raise exception 'expected 50 percent conversion: %', row_to_json(result); end if;
  if result.post_start_telegram_messages <> 1 then raise exception 'expected 1 post-start Telegram message: %', row_to_json(result); end if;
  if result.post_start_button_interactions <> 1 then raise exception 'expected 1 post-start button interaction: %', row_to_json(result); end if;
  if result.post_start_searches <> 1 then raise exception 'expected 1 post-start search: %', row_to_json(result); end if;
  if result.post_start_movie_detail_views <> 1 then raise exception 'expected 1 post-start movie detail: %', row_to_json(result); end if;
  if result.post_start_watch_clicks <> 1 then raise exception 'expected 1 post-start watch click: %', row_to_json(result); end if;
  if result.post_start_miniapp_opens <> 1 then raise exception 'expected 1 post-start Mini App open: %', row_to_json(result); end if;
  if has_function_privilege('anon','public.get_campaign_analytics(timestamptz,timestamptz)','EXECUTE') then
    raise exception 'anon must not execute campaign analytics';
  end if;
  if not has_function_privilege('service_role','public.get_campaign_analytics(timestamptz,timestamptz)','EXECUTE') then
    raise exception 'service_role must execute campaign analytics';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_campaign_analytics(timestamptz,timestamptz)'::regprocedure) then
    raise exception 'campaign analytics must remain SECURITY INVOKER';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.analytics_events (user_id, bot_id, event_type, event_data)
    values (null,'10000000-0000-4000-8000-000000000001','campaign_visit',
      '{"campaign_slug":"facebook_launch","source":"facebook","visit_token":"aaaaaaaaaaaaaaaaaaaaaaaa","visitor_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","is_bot":false}');
    raise exception 'duplicate campaign visit token should have been rejected';
  exception when unique_violation then null;
  end;
end;
$$;
