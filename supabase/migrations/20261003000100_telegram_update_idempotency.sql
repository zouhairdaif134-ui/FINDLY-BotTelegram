-- FINDLY Telegram update idempotency
-- Prevent duplicate processing of the same Telegram update per bot.

create table if not exists public.telegram_updates (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete restrict,
  update_id bigint not null,
  update_type text not null default 'unknown',
  status text not null default 'processing',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint telegram_updates_bot_update_id_key
    unique (bot_id, update_id),

  constraint telegram_updates_status_check
    check (status in ('processing', 'processed', 'failed')),

  constraint telegram_updates_processed_at_check
    check (
      (status = 'processed' and processed_at is not null)
      or
      (status in ('processing', 'failed'))
    )
);

create index if not exists telegram_updates_bot_id_idx
  on public.telegram_updates (bot_id);

create index if not exists telegram_updates_status_idx
  on public.telegram_updates (status);

create index if not exists telegram_updates_received_at_idx
  on public.telegram_updates (received_at desc);

alter table public.telegram_updates enable row level security;

grant all on table public.telegram_updates to service_role;

comment on table public.telegram_updates is
  'Telegram webhook update ledger used to provide per-bot update idempotency.';
