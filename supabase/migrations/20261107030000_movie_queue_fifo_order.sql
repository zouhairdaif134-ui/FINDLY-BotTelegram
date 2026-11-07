-- Preserve strict FIFO order when multiple mixed-media items share a timestamp.
create index if not exists movie_queue_fifo_order_idx
  on public.movie_queue_items(created_at asc, id asc)
  where status = 'pending';

create or replace function public.claim_next_movie_queue_item(
  p_slot_start timestamptz,
  p_lease_expires_at timestamptz
)
returns setof public.movie_queue_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer;
  v_item public.movie_queue_items%rowtype;
begin
  insert into public.movie_queue_slots(slot_start, queue_item_id)
  values (p_slot_start, null)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  select * into v_item
  from public.movie_queue_items
  where status = 'pending'
    and next_attempt_at <= now()
  order by created_at asc, id asc
  for update skip locked
  limit 1;

  if not found then
    delete from public.movie_queue_slots where slot_start = p_slot_start;
    return;
  end if;

  update public.movie_queue_items
  set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_expires_at = p_lease_expires_at,
      lease_token = gen_random_uuid(),
      last_slot_start = p_slot_start,
      last_error_code = null,
      last_error_message = null,
      updated_at = now()
  where id = v_item.id
  returning * into v_item;

  update public.movie_queue_slots
  set queue_item_id = v_item.id
  where slot_start = p_slot_start;

  return next v_item;
end;
$$;

revoke all on function public.claim_next_movie_queue_item(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_next_movie_queue_item(timestamptz, timestamptz) to service_role;
