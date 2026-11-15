alter table public.system_settings
  drop constraint if exists system_settings_ads_frequency_policy_check;

alter table public.system_settings
  add constraint system_settings_ads_frequency_policy_check
  check (
    jsonb_typeof(ads_frequency_policy) = 'object'
    and coalesce((ads_frequency_policy ->> 'max_per_session')::integer, 0) between 0 and 20
    and coalesce((ads_frequency_policy ->> 'min_interval_minutes')::integer, 0) between 0 and 1440
    and coalesce((ads_frequency_policy ->> 'detail_views_before_interstitial')::integer, 0) between 3 and 20
  );
