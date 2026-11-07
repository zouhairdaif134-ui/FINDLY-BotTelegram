-- Arabic-first movie and series synopses.
-- Preserve the source synopsis and keep existing catalog publication states unchanged.

alter table public.movie_titles
  add column if not exists original_overview text,
  add column if not exists overview_language text not null default 'pending',
  add column if not exists overview_source text not null default 'pending';

update public.movie_titles
set original_overview = overview
where original_overview is null
  and overview is not null;

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

comment on column public.movie_titles.original_overview is
  'Original source-language synopsis retained internally; never shown in the public Telegram catalog.';
comment on column public.movie_titles.overview_language is
  'Language of the user-facing overview. ar-SA means Modern Standard Arabic; pending means localization is required.';
comment on column public.movie_titles.overview_source is
  'Origin of the user-facing synopsis: tmdb_ar, ai_translation, existing_arabic, pending, or unavailable.';

create or replace function public.admin_audit_update_movie_synopsis(
  p_actor_id uuid,
  p_movie_id uuid,
  p_overview text,
  p_original_overview text,
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

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  select jsonb_build_object(
    'overview', t.overview,
    'original_overview', t.original_overview,
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

  update public.movie_titles
  set overview = p_overview,
      original_overview = coalesce(original_overview, p_original_overview),
      overview_language = p_overview_language,
      overview_source = p_overview_source
  where id = p_movie_id
  returning jsonb_build_object(
    'id', id,
    'overview', overview,
    'original_overview', original_overview,
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
    jsonb_build_object('changed_fields', jsonb_build_array('overview', 'original_overview', 'overview_language', 'overview_source')),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('record', v_new, 'audit_log_id', v_log_id);
end;
$$;

revoke all on function public.admin_audit_update_movie_synopsis(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_audit_update_movie_synopsis(uuid, uuid, text, text, text, text)
  to service_role;
