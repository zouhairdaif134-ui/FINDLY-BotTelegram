-- FINDLY Movies: media review, storage-channel configuration and distribution rights.
-- Existing active assets remain active; only newly inserted assets default to pending_review.

alter table public.movie_media_assets
  alter column status set default 'pending_review';

alter table public.movie_media_assets
  drop constraint if exists movie_media_assets_status_check;

alter table public.movie_media_assets
  add constraint movie_media_assets_status_check
  check (status in ('pending_review', 'active', 'inactive', 'rejected'));

alter table public.movie_titles
  add column if not exists distribution_rights_status text not null default 'unverified',
  add column if not exists distribution_rights_reviewed_at timestamptz,
  add column if not exists distribution_rights_reviewed_by uuid references public.admin_profiles(id) on delete set null;

alter table public.movie_titles
  drop constraint if exists movie_titles_distribution_rights_status_check;

alter table public.movie_titles
  add constraint movie_titles_distribution_rights_status_check
  check (distribution_rights_status in ('unverified', 'authorized', 'not_authorized'));

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
  'Media moderation state. pending_review is the default for newly ingested assets; active assets are eligible for review-approved delivery.';
comment on column public.movie_titles.distribution_rights_status is
  'Independent distribution-rights review state. Media ingestion and media approval never set this to authorized.';
comment on table public.movie_media_storage_config is
  'Single active Telegram channel used to ingest new FINDLY Movies media. Existing assets retain their own storage_chat_id.';
