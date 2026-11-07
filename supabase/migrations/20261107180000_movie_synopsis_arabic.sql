-- Arabic-first movie and series synopses.
-- Original source text is stored in a private table, not the publicly readable catalog.

alter table public.movie_titles
  add column if not exists overview_language text not null default 'pending',
  add column if not exists overview_source text not null default 'pending';

create table if not exists public.movie_synopsis_sources (
  title_id uuid primary key references public.movie_titles(id) on delete cascade,
  original_overview text,
  source_language text not null default 'und',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movie_synopsis_sources enable row level security;
revoke all on table public.movie_synopsis_sources from public, anon, authenticated;
grant select, insert, update on table public.movie_synopsis_sources to service_role;

insert into public.movie_synopsis_sources (title_id, original_overview, source_language)
select id, overview, 'und'
from public.movie_titles
where overview is not null and btrim(overview) <> ''
on conflict (title_id) do nothing;

update public.movie_titles
set overview_language = case
      when overview is null or btrim(overview) = '' then 'unavailable'
      else 'pending'
    end,
    overview_source = case
      when overview is null or btrim(overview) = '' then 'unavailable'
      else 'legacy'
    end
where overview_language = 'pending'
  and overview_source = 'pending';

-- Hide legacy public synopses until the batch localizer classifies each source.
-- Both Arabic and non-Arabic originals remain safely preserved in the private table.
update public.movie_titles
set overview = null
where overview_language = 'pending'
  and overview_source = 'legacy';

comment on column public.movie_titles.overview_language is
  'Language of the user-facing overview. ar-SA means Modern Standard Arabic; pending means localization is required.';
comment on column public.movie_titles.overview_source is
  'Origin of the user-facing synopsis: tmdb_ar, ai_translation, existing_arabic, pending, or unavailable.';
comment on table public.movie_synopsis_sources is
  'Private source-language movie and series synopses. Not readable by anon or authenticated roles.';

create or replace function public.set_movie_synopsis_defaults()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $trigger$
begin
  if new.overview_language is null then
    new.overview_language := 'pending';
  end if;
  if new.overview_source is null then
    new.overview_source := 'pending';
  end if;
  return new;
end;
$trigger$;

drop trigger if exists movie_synopsis_defaults on public.movie_titles;
create trigger movie_synopsis_defaults
before insert on public.movie_titles
for each row execute function public.set_movie_synopsis_defaults();

create or replace function public.admin_audit_update_movie_synopsis(
  p_actor_id uuid,
  p_movie_id uuid,
  p_overview text,
  p_original_overview text,
  p_source_language text,
  p_overview_language text,
  p_overview_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_old jsonb;
  v_new jsonb;
  v_log_id uuid;
begin
  if p_actor_id is null or p_movie_id is null then
    raise exception 'Administrator and movie identifiers are required';
  end if;
  if p_overview_language not in ('ar-SA', 'pending', 'unavailable') then
    raise exception 'Invalid synopsis language state';
  end if;
  if p_overview_source not in ('tmdb_ar', 'ai_translation', 'existing_arabic', 'legacy', 'pending', 'unavailable') then
    raise exception 'Invalid synopsis source';
  end if;
  if p_source_language is null or length(p_source_language) > 12 then
    raise exception 'Invalid source language';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  select jsonb_build_object(
    'overview', t.overview,
    'overview_language', t.overview_language,
    'overview_source', t.overview_source
  )
    into v_old
  from public.movie_titles t
  where t.id = p_movie_id
  for update;
  if v_old is null then
    raise exception 'Movie catalog entry not found';
  end if;

  insert into public.movie_synopsis_sources as src (title_id, original_overview, source_language)
  values (p_movie_id, p_original_overview, p_source_language)
  on conflict (title_id) do update
    set original_overview = coalesce(src.original_overview, excluded.original_overview),
        source_language = case
          when src.source_language = 'und' then excluded.source_language
          else src.source_language
        end,
        updated_at = now();

  update public.movie_titles
  set overview = p_overview,
      overview_language = p_overview_language,
      overview_source = p_overview_source
  where id = p_movie_id
  returning jsonb_build_object(
    'id', id,
    'overview', overview,
    'overview_language', overview_language,
    'overview_source', overview_source
  ) into v_new;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id,
    v_actor_name,
    'movie.synopsis_localize',
    'movie',
    p_movie_id,
    jsonb_build_object('changed_fields', jsonb_build_array('overview', 'overview_language', 'overview_source', 'private_source_synopsis')),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('record', v_new, 'audit_log_id', v_log_id);
end;
$$;

revoke all on function public.admin_audit_update_movie_synopsis(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_audit_update_movie_synopsis(uuid, uuid, text, text, text, text, text)
  to service_role;
