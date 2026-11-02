-- Restrict the SECURITY DEFINER Telegram update-claim RPC to the trusted Worker role.
-- The Cloudflare Worker uses the Supabase service-role key for webhook processing.
-- Public browser roles must never be able to claim or mutate Telegram update state.

begin;

revoke all
on function public.claim_telegram_update(uuid, bigint, text, integer)
from public;

revoke all
on function public.claim_telegram_update(uuid, bigint, text, integer)
from anon, authenticated;

grant execute
on function public.claim_telegram_update(uuid, bigint, text, integer)
to service_role;

comment on function public.claim_telegram_update(uuid, bigint, text, integer) is
'Internal FINDLY Telegram webhook idempotency RPC. Execute permission is restricted to service_role; never expose to anon or authenticated clients.';

commit;
