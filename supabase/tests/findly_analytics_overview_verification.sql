insert into public.bots (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'findly', 'FINDLY Master'),
  ('10000000-0000-4000-8000-000000000002', 'movies', 'FINDLY Watch');

insert into public.telegram_users (id, first_seen_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-11-10T10:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', '2026-11-20T10:00:00Z');

insert into public.user_bots (user_id, bot_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');

insert into public.analytics_events (user_id, bot_id, event_type, event_data, created_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'message', '{}', '2026-11-22T10:00:00Z'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'miniapp_opened', '{"session_id":"30000000-0000-4000-8000-000000000001"}', '2026-11-22T10:05:00Z'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ad_provider_request', '{"provider":"monetag","attempt_id":"40000000-0000-4000-8000-000000000001","event_id":"50000000-0000-4000-8000-000000000001"}', '2026-11-22T10:06:00Z'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ad_provider_resolved', '{"provider":"adsgram","attempt_id":"40000000-0000-4000-8000-000000000002","event_id":"50000000-0000-4000-8000-000000000002"}', '2026-11-22T10:07:00Z');

do $$
declare
  result jsonb;
begin
  result := public.get_findly_analytics_overview('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z');

  if result #>> '{users,total}' <> '2' then raise exception 'expected 2 unique users: %', result; end if;
  if result #>> '{users,new}' <> '1' then raise exception 'expected 1 new user: %', result; end if;
  if result #>> '{users,active}' <> '1' then raise exception 'expected 1 active user: %', result; end if;
  if result #>> '{users,inactive}' <> '1' then raise exception 'expected 1 inactive user: %', result; end if;
  if result #>> '{users,master}' <> '2' then raise exception 'expected 2 Master users: %', result; end if;
  if result #>> '{users,watch}' <> '1' then raise exception 'expected 1 Watch user: %', result; end if;
  if result #>> '{users,shared}' <> '1' then raise exception 'expected 1 shared user: %', result; end if;
  if result #>> '{miniapp,sessions}' <> '1' then raise exception 'expected 1 Mini App session: %', result; end if;
  if result #>> '{miniapp,unique_visitors}' <> '1' then raise exception 'expected 1 unique Mini App visitor: %', result; end if;
  if result #>> '{revenue,status}' <> 'not_connected' then raise exception 'revenue must remain unconnected until provider reporting is available: %', result; end if;
  if result #>> '{activity,telegram_messages}' <> '1' then raise exception 'expected 1 Telegram message: %', result; end if;

  if has_function_privilege('anon', 'public.get_findly_analytics_overview(timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'anon must not execute analytics overview function';
  end if;
  if not has_function_privilege('service_role', 'public.get_findly_analytics_overview(timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'service_role must execute analytics overview function';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_findly_analytics_overview(timestamptz,timestamptz)'::regprocedure) then
    raise exception 'analytics overview must remain SECURITY INVOKER';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.analytics_events (user_id, bot_id, event_type, event_data)
    values (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'miniapp_opened',
      '{"session_id":"30000000-0000-4000-8000-000000000001"}'
    );
    raise exception 'duplicate Mini App session should have been rejected';
  exception when unique_violation then
    null;
  end;
end;
$$;
