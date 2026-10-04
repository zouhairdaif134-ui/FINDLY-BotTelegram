-- FINDLY Telegram update claim recovery
-- Atomically claims new, failed, or stale-processing Telegram updates.
-- Prevents a crashed Worker from permanently locking an update.

create or replace function public.claim_telegram_update(
  p_bot_id uuid,
  p_update_id bigint,
  p_update_type text,
  p_stale_after_seconds integer default 120
)
returns table (
  record_id uuid,
  claimed boolean,
  duplicate boolean,
  in_progress boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.telegram_updates%rowtype;
  v_now timestamptz := now();
  v_stale_before timestamptz;
begin
  if p_bot_id is null then
    raise exception 'bot_id is required';
  end if;

  if p_update_id is null or p_update_id < 0 then
    raise exception 'update_id is required';
  end if;

  if p_stale_after_seconds is null or p_stale_after_seconds < 30 then
    raise exception 'stale_after_seconds must be at least 30';
  end if;

  v_stale_before :=
    v_now - make_interval(secs => p_stale_after_seconds);

  insert into public.telegram_updates (
    bot_id,
    update_id,
    update_type,
    status,
    error_message,
    processed_at,
    received_at,
    updated_at
  )
  values (
    p_bot_id,
    p_update_id,
    coalesce(nullif(trim(p_update_type), ''), 'unknown'),
    'processing',
    null,
    null,
    v_now,
    v_now
  )
  on conflict (bot_id, update_id) do nothing;

  select *
    into v_record
  from public.telegram_updates
  where bot_id = p_bot_id
    and update_id = p_update_id
  for update;

  if not found then
    raise exception 'Telegram update claim could not be verified';
  end if;

  if v_record.status = 'processed' then
    return query
    select v_record.id, false, true, false;
    return;
  end if;

  if v_record.status = 'failed' then
    update public.telegram_updates
    set
      status = 'processing',
      error_message = null,
      processed_at = null,
      updated_at = v_now
    where id = v_record.id;

    return query
    select v_record.id, true, false, false;
    return;
  end if;

  if v_record.status = 'processing' then
    if v_record.updated_at <= v_stale_before then
      update public.telegram_updates
      set
        status = 'processing',
        error_message = null,
        processed_at = null,
        updated_at = v_now
      where id = v_record.id;

      return query
      select v_record.id, true, false, false;
      return;
    end if;

    return query
    select v_record.id, false, false, true;
    return;
  end if;

  return query
  select v_record.id, false, true, false;
end;
$$;

revoke all on function public.claim_telegram_update(
  uuid,
  bigint,
  text,
  integer
) from public;

grant execute on function public.claim_telegram_update(
  uuid,
  bigint,
  text,
  integer
) to service_role;

comment on function public.claim_telegram_update(
  uuid,
  bigint,
  text,
  integer
) is
  'Atomically claims Telegram updates and safely recovers stale processing rows.';
