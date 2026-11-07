-- FINDLY hourly movie queue. Apply only after review in a non-production database.
create table if not exists public.movie_queue_items (
  id uuid primary key default gen_random_uuid(),
  submitted_title text not null check (char_length(submitted_title) between 1 and 200),
  normalized_title text not null,
  media_type text not null check (media_type in ('movie', 'series')),
  status text not null default 'pending' check (status in (
    'pending','processing','needs_review','ready_for_review','failed','rejected','published'
  )),
  tmdb_id bigint,
  tmdb_candidates jsonb not null default '[]'::jsonb,
  catalog_title_id uuid references public.movie_titles(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_slot_start timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists movie_queue_status_due_idx
  on public.movie_queue_items(status, next_attempt_at, created_at);
create index if not exists movie_queue_created_idx
  on public.movie_queue_items(created_at desc);
create index if not exists movie_queue_catalog_title_idx
  on public.movie_queue_items(catalog_title_id);

create table if not exists public.movie_queue_slots (
  slot_start timestamptz primary key,
  queue_item_id uuid unique references public.movie_queue_items(id) on delete set null,
  created_at timestamptz not null default now()
);

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
  order by created_at asc
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

create or replace function public.set_movie_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists movie_queue_items_updated_at on public.movie_queue_items;
create trigger movie_queue_items_updated_at
before update on public.movie_queue_items
for each row execute function public.set_movie_queue_updated_at();

alter table public.movie_queue_items enable row level security;
alter table public.movie_queue_slots enable row level security;
revoke all on public.movie_queue_items, public.movie_queue_slots from anon, authenticated;
grant select, insert, update, delete on public.movie_queue_items, public.movie_queue_slots to service_role;

comment on table public.movie_queue_items is
'Admin-only queue for staged movie metadata imports. Queue completion never publishes a title.';
comment on table public.movie_queue_slots is
'Unique hourly processing slots; at most one queue item can be claimed per UTC hour.';
