-- Restrict the Worker service role to the operations used by Mini App telemetry.
revoke all on table public.miniapp_ad_events from service_role;
grant select, insert on table public.miniapp_ad_events to service_role;
