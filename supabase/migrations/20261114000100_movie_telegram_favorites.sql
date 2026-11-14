-- Telegram Mini App favorites are keyed by the verified Telegram identity.
-- The existing movie_favorites table remains auth.users-scoped and unchanged.
begin;

create table if not exists public.movie_telegram_favorites (
  telegram_user_id bigint not null references public.telegram_users(telegram_user_id) on delete cascade,
  title_id uuid not null references public.movie_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (telegram_user_id, title_id)
);

create index if not exists movie_telegram_favorites_title_idx
  on public.movie_telegram_favorites (title_id);

alter table public.movie_telegram_favorites enable row level security;
revoke all on table public.movie_telegram_favorites from anon, authenticated;
grant all privileges on table public.movie_telegram_favorites to service_role;

comment on table public.movie_telegram_favorites is
  'Favorites created by Telegram Mini App users after server-side Telegram initData verification; accessible only through the Cloudflare Worker service role.';

commit;
