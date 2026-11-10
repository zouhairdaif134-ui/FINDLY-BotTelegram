-- FINDLY Movies: media review, storage-channel configuration and private distribution-rights review.
-- Existing active assets remain active; only newly inserted assets default to pending_review.

alter table public.movie_media_assets
  alter column status set default 'pending_review';

alter table public.movie_media_assets
  drop constraint if exists movie_media_assets_status_check;

alter table public.movie_media_assets
  add constraint movie_media_assets_status_check
  check (status in ('pending_review', 'active', 'inactive', 'rejected'));

create table if not exists public.movie_distribution_rights (
  title_id uuid primary key references public.movie_titles(id) on delete cascade,
  status text not null default 'unverified'
    check (status in ('unverified', 'authorized', 'not_authorized')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists movie_distribution_rights_updated_at on public.movie_distribution_rights;
create trigger movie_distribution_rights_updated_at
before update on public.movie_distribution_rights
for each row execute function public.set_movies_updated_at();

alter table public.movie_distribution_rights enable row level security;
revoke all on table public.movie_distribution_rights from public, anon, authenticated;
grant select, insert, update, delete on table public.movie_distribution_rights to service_role;

-- Every existing title starts as unverified. No media upload or media approval
-- can silently grant distribution rights.
insert into public.movie_distribution_rights (title_id)
select id from public.movie_titles
on conflict (title_id) do nothing;

create or replace function public.ensure_movie_distribution_rights()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.movie_distribution_rights (title_id)
  values (new.id)
  on conflict (title_id) do nothing;
  return new;
end;
$$;

drop trigger if exists movie_distribution_rights_on_movie_insert on public.movie_titles;
create trigger movie_distribution_rights_on_movie_insert
after insert on public.movie_titles
for each row execute function public.ensure_movie_distribution_rights();

create table if not exists public.movie_media_storage_config (
  id smallint primary key default 1 check (id = 1),
  active_storage_chat_id text,
  active_channel_title text,
  updated_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists movie_media_storage_config_updated_at on public.movie_media_storage_config;
create trigger movie_media_storage_config_updated_at
before update on public.movie_media_storage_config
for each row execute function public.set_movies_updated_at();

alter table public.movie_media_storage_config enable row level security;
revoke all on table public.movie_media_storage_config from public, anon, authenticated;
grant select, insert, update, delete on table public.movie_media_storage_config to service_role;

-- Preserve the currently used channel only when every existing media reference
-- points to the same channel. Never guess when historical assets span channels.
insert into public.movie_media_storage_config (id, active_storage_chat_id)
select 1, min(storage_chat_id)
from public.movie_media_assets
having count(distinct storage_chat_id) = 1
on conflict (id) do nothing;

insert into public.permissions (code, description)
values ('media.manage', 'Review Telegram media assets and manage the active media storage channel and distribution-rights status')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'media.manage'
where r.name = 'owner'
on conflict (role_id, permission_id) do nothing;

comment on column public.movie_media_assets.status is
  'Media moderation state. pending_review is the default for newly ingested assets; active assets are eligible for media-approved delivery.';
comment on table public.movie_distribution_rights is
  'Private per-title distribution-rights review. Media existence and media approval never set status to authorized.';
comment on table public.movie_media_storage_config is
  'Single active Telegram channel used to ingest new FINDLY Movies media. Existing assets retain their own storage_chat_id.';
