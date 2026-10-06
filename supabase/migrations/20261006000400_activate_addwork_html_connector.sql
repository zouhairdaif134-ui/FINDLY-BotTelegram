update public.job_sources
set
  source_type = 'html',
  base_url = 'https://www.addwork.ma/nos-opportunites',
  feed_url = 'https://www.addwork.ma/nos-opportunites',
  enabled = true,
  auto_sync = true,
  sync_interval_minutes = 60,
  settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'connector', 'addwork-html-v1',
    'connector_status', 'active',
    'authorized', true
  )
where slug = 'addwork';
