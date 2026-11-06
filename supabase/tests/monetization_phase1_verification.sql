-- Run after applying 20261106000500_monetization_controls.sql in a staging database.
-- This is a read-only structural/security verification; it creates no data.

do $$
declare
  v_owner_role_id uuid;
  v_non_owner_grants integer;
  v_format_constraint text;
begin
  if to_regclass('public.ad_provider_zones') is null
     or to_regclass('public.ad_placements') is null
     or to_regclass('public.ad_frequency_policies') is null
     or to_regclass('public.ad_delivery_events') is null
     or to_regclass('public.monetization_user_exclusions') is null then
    raise exception 'Monetization Phase 1 tables are missing';
  end if;

  if not exists (
    select 1 from pg_class c
    where c.oid = 'public.ad_delivery_events'::regclass and c.relrowsecurity
  ) then
    raise exception 'ad_delivery_events must have RLS enabled';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_monetization_ad_delivery(text,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.claim_monetization_ad_delivery(text,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Telegram delivery reservation RPC grants are incorrect';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_monetization_website_ad_delivery(text,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.claim_monetization_website_ad_delivery(text,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Website delivery reservation RPC grants are incorrect';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.get_monetization_campaign_delivery_summary(timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Campaign delivery summary RPC is not available to service_role';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'telegram_users'
      and column_name = 'is_bot'
  ) then
    raise exception 'telegram_users.is_bot is missing; MAU cannot reliably exclude bot accounts';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'ad_placements_unique_website_zone_per_page_idx'
  ) then
    raise exception 'Duplicate website provider zones are not prevented';
  end if;

  if not exists (
    select 1 from public.ad_providers
    where slug = 'direct' and provider_type = 'direct' and is_active = false
  ) then
    raise exception 'Direct Advertisers must exist but remain inactive in Phase 1';
  end if;

  if not exists (
    select 1 from public.ad_frequency_policies
    where channel = 'website' and campaign_id is null and placement_id is null
      and is_enabled = true
  ) or not exists (
    select 1 from public.ad_frequency_policies
    where channel = 'telegram' and campaign_id is null and placement_id is null
      and is_enabled = true
  ) then
    raise exception 'Website and Telegram default frequency policies are required';
  end if;

  if exists (
    select 1 from public.ad_providers
    where slug in ('monetag','adsterra') and is_active = true
  ) then
    raise exception 'Publisher networks must remain OFF by default';
  end if;

  if exists (
    select 1 from public.ad_campaigns
    where campaign_type = 'direct' and status in ('active','scheduled')
  ) then
    raise exception 'Legacy direct-advertiser campaigns must be paused in Phase 1';
  end if;

  select pg_get_constraintdef(oid) into v_format_constraint
  from pg_constraint
  where conrelid = 'public.ad_campaigns'::regclass
    and conname = 'ad_campaigns_format_check';
  if v_format_constraint is null or v_format_constraint ilike '%video%' then
    raise exception 'Video campaigns must remain unavailable until player support is verified';
  end if;

  select id into v_owner_role_id from public.roles where name = 'owner' limit 1;
  if v_owner_role_id is null then
    raise exception 'Owner role is missing';
  end if;

  select count(*) into v_non_owner_grants
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where p.code like 'monetization.%' and r.name <> 'owner';

  if v_non_owner_grants > 0 then
    raise exception 'Monetization permissions must not be granted to non-Owner roles by default';
  end if;

  if not exists (
    select 1 from public.permissions p
    join public.role_permissions rp on rp.permission_id = p.id
    where p.code = 'monetization.providers.verify'
      and rp.role_id = v_owner_role_id
  ) then
    raise exception 'Owner is missing provider verification permission';
  end if;
end;
$$;
