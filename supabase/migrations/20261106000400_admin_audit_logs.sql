-- FINDLY append-only administrative audit trail.
-- All business mutations and their success audit rows are committed atomically.

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.admin_profiles(id) on delete restrict,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  old_values jsonb,
  new_values jsonb,
  result text not null check (result in ('success', 'failure')),
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc, id desc);
create index admin_audit_logs_actor_created_idx
  on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_action_created_idx
  on public.admin_audit_logs (action, created_at desc);
create index admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from public, anon, authenticated, service_role;

insert into public.permissions (code, description)
values ('activity.view', 'View the administrative activity audit log')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'owner'
  and p.code = 'activity.view'
on conflict (role_id, permission_id) do nothing;

create or replace function public.admin_audit_sanitize_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if p_value is null then
    return null;
  elsif jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(e.key, public.admin_audit_sanitize_jsonb(e.value)), '{}'::jsonb)
      into v_result
    from jsonb_each(p_value) e
    where e.key !~* '(password|token|secret|api[_-]?key|authorization|credential|private[_-]?key|service[_-]?role)';
    return v_result;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(public.admin_audit_sanitize_jsonb(e.value)), '[]'::jsonb)
      into v_result
    from jsonb_array_elements(p_value) e(value);
    return v_result;
  end if;
  return p_value;
end;
$$;

create or replace function public.admin_audit_mutate(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_table text;
  v_allowed_columns text[];
  v_columns_sql text;
  v_payload jsonb;
  v_old jsonb;
  v_new jsonb;
  v_entity_id uuid;
  v_log_id uuid;
  v_defaults jsonb := '{}'::jsonb;
begin
  if p_actor_id is null or p_action is null or p_action !~ '^[a-z][a-z0-9_.-]{1,79}
    raise exception 'Invalid audit actor or action';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  case p_entity_type
    when 'movie' then
      v_table := 'movie_titles';
      v_allowed_columns := array['media_type','title','original_title','normalized_title','overview','full_plot_summary','release_date','release_year','runtime_minutes','rating','poster_path','backdrop_path','status','metadata_status'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'status', 'draft', 'metadata_status', 'metadata_only', 'created_at', now(), 'updated_at', now());
    when 'bot' then
      v_table := 'bots';
      v_allowed_columns := array['name','slug','bot_type','telegram_username','description','icon','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'bot_type', 'child', 'icon', '🤖', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'category' then
      v_table := 'categories';
      v_allowed_columns := array['name','slug','icon','description','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'icon', '📂', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'content' then
      v_table := 'content_items';
      v_allowed_columns := array['bot_id','category_id','content_type','title','description','image_url','external_url','metadata','is_active','published_at'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'content_type', 'general', 'metadata', '{}'::jsonb, 'is_active', true, 'created_at', now(), 'updated_at', now());
    when 'telegram_user' then
      v_table := 'telegram_users';
      v_allowed_columns := array['is_active'];
    when 'setting' then
      v_table := 'bot_settings';
      v_allowed_columns := array['bot_id','setting_key','setting_value'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'setting_value', '{}'::jsonb, 'updated_at', now());
    else
      raise exception 'Unsupported audit entity type';
  end case;

  if p_operation is null or p_operation not in ('create','update','delete') then
    raise exception 'Unsupported audit operation';
  end if;
  if p_entity_type = 'telegram_user' and p_operation <> 'update' then
    raise exception 'Telegram user audit supports updates only';
  end if;
  if p_operation = 'delete' and p_entity_type not in ('movie','setting') then
    raise exception 'Physical delete is not allowed for this entity';
  end if;

  if p_operation = 'delete' then
    if p_entity_id is null then raise exception 'Entity id is required'; end if;
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t)', v_table)
      into v_old using p_entity_id;
    if v_old is null then raise exception 'Audit target entity not found'; end if;
    v_entity_id := p_entity_id;
  else
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      raise exception 'Mutation payload must be a JSON object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_payload) as keys(key)
      where not (keys.key = any(v_allowed_columns))
    ) then
      raise exception 'Mutation payload contains unsupported fields';
    end if;
    select coalesce(jsonb_object_agg(k, value), '{}'::jsonb)
      into v_payload
    from jsonb_each(p_payload) e(k, value)
    where k = any(v_allowed_columns);

    if jsonb_object_length(v_payload) = 0 then
      raise exception 'Mutation payload is empty';
    end if;

    select string_agg(format('%I', c), ', ' order by ordinality)
      into v_columns_sql
    from unnest(v_allowed_columns) with ordinality as cols(c, ordinality);

    if p_operation = 'create' then
      if p_entity_type = 'telegram_user' then raise exception 'Telegram user creation is not supported'; end if;
      v_payload := v_defaults || v_payload;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* returning to_jsonb(%I.*)',
        v_table, v_table, v_table
      ) into v_new using v_payload;
      v_entity_id := (v_new ->> 'id')::uuid;
    else
      if p_entity_id is null then raise exception 'Entity id is required'; end if;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_old using p_entity_id;
      if v_old is null then raise exception 'Audit target entity not found'; end if;
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(t, $2)) where t.id = $1 returning to_jsonb(t)',
        v_table, v_columns_sql, v_columns_sql
      ) into v_new using p_entity_id, v_payload;
      v_entity_id := p_entity_id;
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, p_action, p_entity_type, v_entity_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('operation', p_operation, 'changed_fields', case when p_payload is null then '[]'::jsonb else coalesce((select jsonb_agg(keys.key) from jsonb_object_keys(p_payload) as keys(key)), '[]'::jsonb) end)),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id', v_entity_id, 'record', public.admin_audit_sanitize_jsonb(coalesce(v_new, v_old)), 'audit_id', v_log_id);
end;
$$;

create or replace function public.admin_audit_update_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text default null,
  p_is_active boolean default null,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_target_active boolean;
  v_old jsonb;
  v_new jsonb;
  v_role_name text;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  select is_active into v_target_active
    from public.admin_profiles where id = p_admin_id for update;
  if not found then raise exception 'Administrator not found'; end if;

  if exists (
    select 1 from public.admin_roles ar join public.roles r on r.id = ar.role_id
    where ar.admin_id = p_admin_id and r.name = 'owner'
  ) then
    raise exception 'The Owner account is protected';
  end if;
  if p_actor_id = p_admin_id and p_is_active = false then
    raise exception 'You cannot deactivate your own administrator account';
  end if;
  if p_display_name is not null and (length(btrim(p_display_name)) not between 1 and 100) then
    raise exception 'Display name must contain 1 to 100 characters';
  end if;
  if p_role_id is not null then
    select name into v_role_name from public.roles where id = p_role_id;
    if v_role_name not in ('manager','content_manager') then
      raise exception 'Only Manager and Content Manager roles can be assigned';
    end if;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_old
  from public.admin_profiles ap where ap.id = p_admin_id;

  update public.admin_profiles
    set display_name = coalesce(btrim(p_display_name), display_name),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_admin_id;

  if p_role_id is not null then
    delete from public.admin_roles where admin_id = p_admin_id;
    insert into public.admin_roles(admin_id, role_id) values (p_admin_id, p_role_id);
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_new
  from public.admin_profiles ap where ap.id = p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.update','admin',p_admin_id,'{}'::jsonb,
    public.admin_audit_sanitize_jsonb(v_old), public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_create_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_role_name text;
  v_name text;
  v_new jsonb;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), 'Administrator');
  if length(v_name) > 100 then raise exception 'Display name must be 100 characters or fewer'; end if;
  select name into v_role_name from public.roles where id = p_role_id;
  if v_role_name not in ('manager','content_manager') then
    raise exception 'Only Manager and Content Manager roles can be assigned';
  end if;

  insert into public.admin_profiles(id,display_name,is_active)
    values (p_admin_id,v_name,true);
  insert into public.admin_roles(admin_id,role_id) values (p_admin_id,p_role_id);

  select jsonb_build_object(
    'profile',to_jsonb(ap),
    'roles',jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name))
  ) into v_new
  from public.admin_profiles ap join public.roles r on r.id=p_role_id
  where ap.id=p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.invite','admin',p_admin_id,'{}'::jsonb,null,
    public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_record_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_.-]{1,79} raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;


create or replace function public.admin_audit_import_movie(
  p_actor_id uuid,
  p_tmdb_id text,
  p_media_type text,
  p_movie jsonb,
  p_genres jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_actor_name text;
  v_title_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_genre jsonb;
  v_genre_id uuid;
  v_log_id uuid;
  v_is_new boolean := false;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_tmdb_id is null or p_tmdb_id !~ '^\\d+
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_import_movie(uuid,text,text,jsonb,jsonb) from public, anon, authenticated;\nrevoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_import_movie(uuid,text,text,jsonb,jsonb) to service_role;\ngrant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then
    raise exception 'Invalid audit actor or action';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  case p_entity_type
    when 'movie' then
      v_table := 'movie_titles';
      v_allowed_columns := array['media_type','title','original_title','normalized_title','overview','full_plot_summary','release_date','release_year','runtime_minutes','rating','poster_path','backdrop_path','status','metadata_status'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'status', 'draft', 'metadata_status', 'metadata_only', 'created_at', now(), 'updated_at', now());
    when 'bot' then
      v_table := 'bots';
      v_allowed_columns := array['name','slug','bot_type','telegram_username','description','icon','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'bot_type', 'child', 'icon', '🤖', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'category' then
      v_table := 'categories';
      v_allowed_columns := array['name','slug','icon','description','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'icon', '📂', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'content' then
      v_table := 'content_items';
      v_allowed_columns := array['bot_id','category_id','content_type','title','description','image_url','external_url','metadata','is_active','published_at'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'content_type', 'general', 'metadata', '{}'::jsonb, 'is_active', true, 'created_at', now(), 'updated_at', now());
    when 'telegram_user' then
      v_table := 'telegram_users';
      v_allowed_columns := array['is_active'];
    when 'setting' then
      v_table := 'bot_settings';
      v_allowed_columns := array['bot_id','setting_key','setting_value'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'setting_value', '{}'::jsonb, 'updated_at', now());
    else
      raise exception 'Unsupported audit entity type';
  end case;

  if p_operation not in ('create','update','delete') then
    raise exception 'Unsupported audit operation';
  end if;
  if p_entity_type = 'telegram_user' and p_operation <> 'update' then
    raise exception 'Telegram user audit supports updates only';
  end if;
  if p_operation = 'delete' and p_entity_type not in ('movie','setting') then
    raise exception 'Physical delete is not allowed for this entity';
  end if;

  if p_operation = 'delete' then
    if p_entity_id is null then raise exception 'Entity id is required'; end if;
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t)', v_table)
      into v_old using p_entity_id;
    if v_old is null then raise exception 'Audit target entity not found'; end if;
    v_entity_id := p_entity_id;
  else
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      raise exception 'Mutation payload must be a JSON object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
      where not (k = any(v_allowed_columns))
    ) then
      raise exception 'Mutation payload contains unsupported fields';
    end if;
    select coalesce(jsonb_object_agg(k, value), '{}'::jsonb)
      into v_payload
    from jsonb_each(p_payload) e(k, value)
    where k = any(v_allowed_columns);

    if jsonb_object_length(v_payload) = 0 then
      raise exception 'Mutation payload is empty';
    end if;

    select string_agg(format('%I', c), ', ' order by ordinality)
      into v_columns_sql
    from unnest(v_allowed_columns) with ordinality as cols(c, ordinality);

    if p_operation = 'create' then
      if p_entity_type = 'telegram_user' then raise exception 'Telegram user creation is not supported'; end if;
      v_payload := v_defaults || v_payload;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* returning to_jsonb(%I.*)',
        v_table, v_table, v_table
      ) into v_new using v_payload;
      v_entity_id := (v_new ->> 'id')::uuid;
    else
      if p_entity_id is null then raise exception 'Entity id is required'; end if;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_old using p_entity_id;
      if v_old is null then raise exception 'Audit target entity not found'; end if;
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(t, $2)) where t.id = $1 returning to_jsonb(t)',
        v_table, v_columns_sql, v_columns_sql
      ) into v_new using p_entity_id, v_payload;
      v_entity_id := p_entity_id;
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, p_action, p_entity_type, v_entity_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('operation', p_operation, 'changed_fields', case when p_payload is null then '[]'::jsonb else coalesce((select jsonb_agg(k) from jsonb_object_keys(p_payload) k), '[]'::jsonb) end)),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id', v_entity_id, 'record', public.admin_audit_sanitize_jsonb(coalesce(v_new, v_old)), 'audit_id', v_log_id);
end;
$$;

create or replace function public.admin_audit_update_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text default null,
  p_is_active boolean default null,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_target_active boolean;
  v_old jsonb;
  v_new jsonb;
  v_role_name text;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  select is_active into v_target_active
    from public.admin_profiles where id = p_admin_id for update;
  if not found then raise exception 'Administrator not found'; end if;

  if exists (
    select 1 from public.admin_roles ar join public.roles r on r.id = ar.role_id
    where ar.admin_id = p_admin_id and r.name = 'owner'
  ) then
    raise exception 'The Owner account is protected';
  end if;
  if p_actor_id = p_admin_id and p_is_active = false then
    raise exception 'You cannot deactivate your own administrator account';
  end if;
  if p_display_name is not null and (length(btrim(p_display_name)) not between 1 and 100) then
    raise exception 'Display name must contain 1 to 100 characters';
  end if;
  if p_role_id is not null then
    select name into v_role_name from public.roles where id = p_role_id;
    if v_role_name not in ('manager','content_manager') then
      raise exception 'Only Manager and Content Manager roles can be assigned';
    end if;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_old
  from public.admin_profiles ap where ap.id = p_admin_id;

  update public.admin_profiles
    set display_name = coalesce(btrim(p_display_name), display_name),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_admin_id;

  if p_role_id is not null then
    delete from public.admin_roles where admin_id = p_admin_id;
    insert into public.admin_roles(admin_id, role_id) values (p_admin_id, p_role_id);
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_new
  from public.admin_profiles ap where ap.id = p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.update','admin',p_admin_id,'{}'::jsonb,
    public.admin_audit_sanitize_jsonb(v_old), public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_create_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_role_name text;
  v_name text;
  v_new jsonb;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), 'Administrator');
  if length(v_name) > 100 then raise exception 'Display name must be 100 characters or fewer'; end if;
  select name into v_role_name from public.roles where id = p_role_id;
  if v_role_name not in ('manager','content_manager') then
    raise exception 'Only Manager and Content Manager roles can be assigned';
  end if;

  insert into public.admin_profiles(id,display_name,is_active)
    values (p_admin_id,v_name,true);
  insert into public.admin_roles(admin_id,role_id) values (p_admin_id,p_role_id);

  select jsonb_build_object(
    'profile',to_jsonb(ap),
    'roles',jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name))
  ) into v_new
  from public.admin_profiles ap join public.roles r on r.id=p_role_id
  where ap.id=p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.invite','admin',p_admin_id,'{}'::jsonb,null,
    public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_record_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then
    raise exception 'Invalid audit actor or action';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  case p_entity_type
    when 'movie' then
      v_table := 'movie_titles';
      v_allowed_columns := array['media_type','title','original_title','normalized_title','overview','full_plot_summary','release_date','release_year','runtime_minutes','rating','poster_path','backdrop_path','status','metadata_status'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'status', 'draft', 'metadata_status', 'metadata_only', 'created_at', now(), 'updated_at', now());
    when 'bot' then
      v_table := 'bots';
      v_allowed_columns := array['name','slug','bot_type','telegram_username','description','icon','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'bot_type', 'child', 'icon', '🤖', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'category' then
      v_table := 'categories';
      v_allowed_columns := array['name','slug','icon','description','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'icon', '📂', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'content' then
      v_table := 'content_items';
      v_allowed_columns := array['bot_id','category_id','content_type','title','description','image_url','external_url','metadata','is_active','published_at'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'content_type', 'general', 'metadata', '{}'::jsonb, 'is_active', true, 'created_at', now(), 'updated_at', now());
    when 'telegram_user' then
      v_table := 'telegram_users';
      v_allowed_columns := array['is_active'];
    when 'setting' then
      v_table := 'bot_settings';
      v_allowed_columns := array['bot_id','setting_key','setting_value'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'setting_value', '{}'::jsonb, 'updated_at', now());
    else
      raise exception 'Unsupported audit entity type';
  end case;

  if p_operation not in ('create','update','delete') then
    raise exception 'Unsupported audit operation';
  end if;
  if p_entity_type = 'telegram_user' and p_operation <> 'update' then
    raise exception 'Telegram user audit supports updates only';
  end if;
  if p_operation = 'delete' and p_entity_type not in ('movie','setting') then
    raise exception 'Physical delete is not allowed for this entity';
  end if;

  if p_operation = 'delete' then
    if p_entity_id is null then raise exception 'Entity id is required'; end if;
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t)', v_table)
      into v_old using p_entity_id;
    if v_old is null then raise exception 'Audit target entity not found'; end if;
    v_entity_id := p_entity_id;
  else
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      raise exception 'Mutation payload must be a JSON object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
      where not (k = any(v_allowed_columns))
    ) then
      raise exception 'Mutation payload contains unsupported fields';
    end if;
    select coalesce(jsonb_object_agg(k, value), '{}'::jsonb)
      into v_payload
    from jsonb_each(p_payload) e(k, value)
    where k = any(v_allowed_columns);

    if jsonb_object_length(v_payload) = 0 then
      raise exception 'Mutation payload is empty';
    end if;

    select string_agg(format('%I', c), ', ' order by ordinality)
      into v_columns_sql
    from unnest(v_allowed_columns) with ordinality as cols(c, ordinality);

    if p_operation = 'create' then
      if p_entity_type = 'telegram_user' then raise exception 'Telegram user creation is not supported'; end if;
      v_payload := v_defaults || v_payload;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* returning to_jsonb(%I.*)',
        v_table, v_table, v_table
      ) into v_new using v_payload;
      v_entity_id := (v_new ->> 'id')::uuid;
    else
      if p_entity_id is null then raise exception 'Entity id is required'; end if;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_old using p_entity_id;
      if v_old is null then raise exception 'Audit target entity not found'; end if;
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(t, $2)) where t.id = $1 returning to_jsonb(t)',
        v_table, v_columns_sql, v_columns_sql
      ) into v_new using p_entity_id, v_payload;
      v_entity_id := p_entity_id;
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, p_action, p_entity_type, v_entity_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('operation', p_operation, 'changed_fields', case when p_payload is null then '[]'::jsonb else coalesce((select jsonb_agg(k) from jsonb_object_keys(p_payload) k), '[]'::jsonb) end)),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id', v_entity_id, 'record', public.admin_audit_sanitize_jsonb(coalesce(v_new, v_old)), 'audit_id', v_log_id);
end;
$$;

create or replace function public.admin_audit_update_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text default null,
  p_is_active boolean default null,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_target_active boolean;
  v_old jsonb;
  v_new jsonb;
  v_role_name text;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  select is_active into v_target_active
    from public.admin_profiles where id = p_admin_id for update;
  if not found then raise exception 'Administrator not found'; end if;

  if exists (
    select 1 from public.admin_roles ar join public.roles r on r.id = ar.role_id
    where ar.admin_id = p_admin_id and r.name = 'owner'
  ) then
    raise exception 'The Owner account is protected';
  end if;
  if p_actor_id = p_admin_id and p_is_active = false then
    raise exception 'You cannot deactivate your own administrator account';
  end if;
  if p_display_name is not null and (length(btrim(p_display_name)) not between 1 and 100) then
    raise exception 'Display name must contain 1 to 100 characters';
  end if;
  if p_role_id is not null then
    select name into v_role_name from public.roles where id = p_role_id;
    if v_role_name not in ('manager','content_manager') then
      raise exception 'Only Manager and Content Manager roles can be assigned';
    end if;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_old
  from public.admin_profiles ap where ap.id = p_admin_id;

  update public.admin_profiles
    set display_name = coalesce(btrim(p_display_name), display_name),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_admin_id;

  if p_role_id is not null then
    delete from public.admin_roles where admin_id = p_admin_id;
    insert into public.admin_roles(admin_id, role_id) values (p_admin_id, p_role_id);
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_new
  from public.admin_profiles ap where ap.id = p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.update','admin',p_admin_id,'{}'::jsonb,
    public.admin_audit_sanitize_jsonb(v_old), public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_create_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_role_name text;
  v_name text;
  v_new jsonb;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), 'Administrator');
  if length(v_name) > 100 then raise exception 'Display name must be 100 characters or fewer'; end if;
  select name into v_role_name from public.roles where id = p_role_id;
  if v_role_name not in ('manager','content_manager') then
    raise exception 'Only Manager and Content Manager roles can be assigned';
  end if;

  insert into public.admin_profiles(id,display_name,is_active)
    values (p_admin_id,v_name,true);
  insert into public.admin_roles(admin_id,role_id) values (p_admin_id,p_role_id);

  select jsonb_build_object(
    'profile',to_jsonb(ap),
    'roles',jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name))
  ) into v_new
  from public.admin_profiles ap join public.roles r on r.id=p_role_id
  where ap.id=p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.invite','admin',p_admin_id,'{}'::jsonb,null,
    public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_record_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then raise exception 'Invalid TMDB id'; end if;
  if p_media_type not in ('movie','series') then raise exception 'Invalid media type'; end if;
  if jsonb_typeof(p_movie) <> 'object' or jsonb_typeof(coalesce(p_genres,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid movie import payload';
  end if;

  select title_id into v_title_id
    from public.movie_external_ids
    where provider='tmdb' and external_id=p_tmdb_id
    limit 1;

  if v_title_id is not null then
    select to_jsonb(t) into v_old from public.movie_titles t where t.id=v_title_id for update;
    if v_old is null then raise exception 'Existing TMDB movie link is invalid'; end if;
    update public.movie_titles
      set media_type=p_media_type,
          title=p_movie->>'title',
          original_title=p_movie->>'original_title',
          normalized_title=p_movie->>'normalized_title',
          overview=p_movie->>'overview',
          release_date=nullif(p_movie->>'release_date','')::date,
          release_year=nullif(p_movie->>'release_year','')::integer,
          runtime_minutes=nullif(p_movie->>'runtime_minutes','')::integer,
          rating=nullif(p_movie->>'rating','')::numeric,
          poster_path=p_movie->>'poster_path',
          backdrop_path=p_movie->>'backdrop_path',
          status='draft',
          metadata_status='metadata_only',
          updated_at=now()
      where id=v_title_id
      returning to_jsonb(movie_titles.*) into v_new;
  else
    insert into public.movie_titles(
      media_type,title,original_title,normalized_title,overview,release_date,
      release_year,runtime_minutes,rating,poster_path,backdrop_path,status,metadata_status
    ) values (
      p_media_type,p_movie->>'title',p_movie->>'original_title',p_movie->>'normalized_title',
      p_movie->>'overview',nullif(p_movie->>'release_date','')::date,
      nullif(p_movie->>'release_year','')::integer,
      nullif(p_movie->>'runtime_minutes','')::integer,
      nullif(p_movie->>'rating','')::numeric,
      p_movie->>'poster_path',p_movie->>'backdrop_path','draft','metadata_only'
    ) returning id,to_jsonb(movie_titles.*) into v_title_id,v_new;
    insert into public.movie_external_ids(title_id,provider,external_id,external_type)
      values(v_title_id,'tmdb',p_tmdb_id,p_media_type);
    v_is_new := true;
  end if;

  for v_genre in select value from jsonb_array_elements(coalesce(p_genres,'[]'::jsonb))
  loop
    if nullif(v_genre->>'name','') is null or nullif(v_genre->>'external_id','') is null then
      raise exception 'Invalid TMDB genre payload';
    end if;
    insert into public.movie_genres(name,slug,source,external_id)
      values(v_genre->>'name',v_genre->>'slug','provider',v_genre->>'external_id')
      on conflict (source,external_id) do update
        set name=excluded.name, slug=excluded.slug
      returning id into v_genre_id;
    insert into public.movie_title_genres(title_id,genre_id)
      values(v_title_id,v_genre_id)
      on conflict (title_id,genre_id) do nothing;
  end loop;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values(
    p_actor_id,v_actor_name,case when v_is_new then 'movie.import_tmdb' else 'movie.refresh_tmdb' end,
    'movie',v_title_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('provider','tmdb','external_id',p_tmdb_id,'genre_count',jsonb_array_length(coalesce(p_genres,'[]'::jsonb)))),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id',v_title_id,'record',public.admin_audit_sanitize_jsonb(v_new),'audit_id',v_log_id);
end;
$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then
    raise exception 'Invalid audit actor or action';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  case p_entity_type
    when 'movie' then
      v_table := 'movie_titles';
      v_allowed_columns := array['media_type','title','original_title','normalized_title','overview','full_plot_summary','release_date','release_year','runtime_minutes','rating','poster_path','backdrop_path','status','metadata_status'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'status', 'draft', 'metadata_status', 'metadata_only', 'created_at', now(), 'updated_at', now());
    when 'bot' then
      v_table := 'bots';
      v_allowed_columns := array['name','slug','bot_type','telegram_username','description','icon','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'bot_type', 'child', 'icon', '🤖', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'category' then
      v_table := 'categories';
      v_allowed_columns := array['name','slug','icon','description','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'icon', '📂', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'content' then
      v_table := 'content_items';
      v_allowed_columns := array['bot_id','category_id','content_type','title','description','image_url','external_url','metadata','is_active','published_at'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'content_type', 'general', 'metadata', '{}'::jsonb, 'is_active', true, 'created_at', now(), 'updated_at', now());
    when 'telegram_user' then
      v_table := 'telegram_users';
      v_allowed_columns := array['is_active'];
    when 'setting' then
      v_table := 'bot_settings';
      v_allowed_columns := array['bot_id','setting_key','setting_value'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'setting_value', '{}'::jsonb, 'updated_at', now());
    else
      raise exception 'Unsupported audit entity type';
  end case;

  if p_operation not in ('create','update','delete') then
    raise exception 'Unsupported audit operation';
  end if;
  if p_entity_type = 'telegram_user' and p_operation <> 'update' then
    raise exception 'Telegram user audit supports updates only';
  end if;
  if p_operation = 'delete' and p_entity_type not in ('movie','setting') then
    raise exception 'Physical delete is not allowed for this entity';
  end if;

  if p_operation = 'delete' then
    if p_entity_id is null then raise exception 'Entity id is required'; end if;
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t)', v_table)
      into v_old using p_entity_id;
    if v_old is null then raise exception 'Audit target entity not found'; end if;
    v_entity_id := p_entity_id;
  else
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      raise exception 'Mutation payload must be a JSON object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
      where not (k = any(v_allowed_columns))
    ) then
      raise exception 'Mutation payload contains unsupported fields';
    end if;
    select coalesce(jsonb_object_agg(k, value), '{}'::jsonb)
      into v_payload
    from jsonb_each(p_payload) e(k, value)
    where k = any(v_allowed_columns);

    if jsonb_object_length(v_payload) = 0 then
      raise exception 'Mutation payload is empty';
    end if;

    select string_agg(format('%I', c), ', ' order by ordinality)
      into v_columns_sql
    from unnest(v_allowed_columns) with ordinality as cols(c, ordinality);

    if p_operation = 'create' then
      if p_entity_type = 'telegram_user' then raise exception 'Telegram user creation is not supported'; end if;
      v_payload := v_defaults || v_payload;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* returning to_jsonb(%I.*)',
        v_table, v_table, v_table
      ) into v_new using v_payload;
      v_entity_id := (v_new ->> 'id')::uuid;
    else
      if p_entity_id is null then raise exception 'Entity id is required'; end if;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_old using p_entity_id;
      if v_old is null then raise exception 'Audit target entity not found'; end if;
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(t, $2)) where t.id = $1 returning to_jsonb(t)',
        v_table, v_columns_sql, v_columns_sql
      ) into v_new using p_entity_id, v_payload;
      v_entity_id := p_entity_id;
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, p_action, p_entity_type, v_entity_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('operation', p_operation, 'changed_fields', case when p_payload is null then '[]'::jsonb else coalesce((select jsonb_agg(k) from jsonb_object_keys(p_payload) k), '[]'::jsonb) end)),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id', v_entity_id, 'record', public.admin_audit_sanitize_jsonb(coalesce(v_new, v_old)), 'audit_id', v_log_id);
end;
$$;

create or replace function public.admin_audit_update_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text default null,
  p_is_active boolean default null,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_target_active boolean;
  v_old jsonb;
  v_new jsonb;
  v_role_name text;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  select is_active into v_target_active
    from public.admin_profiles where id = p_admin_id for update;
  if not found then raise exception 'Administrator not found'; end if;

  if exists (
    select 1 from public.admin_roles ar join public.roles r on r.id = ar.role_id
    where ar.admin_id = p_admin_id and r.name = 'owner'
  ) then
    raise exception 'The Owner account is protected';
  end if;
  if p_actor_id = p_admin_id and p_is_active = false then
    raise exception 'You cannot deactivate your own administrator account';
  end if;
  if p_display_name is not null and (length(btrim(p_display_name)) not between 1 and 100) then
    raise exception 'Display name must contain 1 to 100 characters';
  end if;
  if p_role_id is not null then
    select name into v_role_name from public.roles where id = p_role_id;
    if v_role_name not in ('manager','content_manager') then
      raise exception 'Only Manager and Content Manager roles can be assigned';
    end if;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_old
  from public.admin_profiles ap where ap.id = p_admin_id;

  update public.admin_profiles
    set display_name = coalesce(btrim(p_display_name), display_name),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_admin_id;

  if p_role_id is not null then
    delete from public.admin_roles where admin_id = p_admin_id;
    insert into public.admin_roles(admin_id, role_id) values (p_admin_id, p_role_id);
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_new
  from public.admin_profiles ap where ap.id = p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.update','admin',p_admin_id,'{}'::jsonb,
    public.admin_audit_sanitize_jsonb(v_old), public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_create_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_role_name text;
  v_name text;
  v_new jsonb;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), 'Administrator');
  if length(v_name) > 100 then raise exception 'Display name must be 100 characters or fewer'; end if;
  select name into v_role_name from public.roles where id = p_role_id;
  if v_role_name not in ('manager','content_manager') then
    raise exception 'Only Manager and Content Manager roles can be assigned';
  end if;

  insert into public.admin_profiles(id,display_name,is_active)
    values (p_admin_id,v_name,true);
  insert into public.admin_roles(admin_id,role_id) values (p_admin_id,p_role_id);

  select jsonb_build_object(
    'profile',to_jsonb(ap),
    'roles',jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name))
  ) into v_new
  from public.admin_profiles ap join public.roles r on r.id=p_role_id
  where ap.id=p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.invite','admin',p_admin_id,'{}'::jsonb,null,
    public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_record_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
 then
    raise exception 'Invalid audit actor or action';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then
    raise exception 'Active administrator actor not found';
  end if;

  case p_entity_type
    when 'movie' then
      v_table := 'movie_titles';
      v_allowed_columns := array['media_type','title','original_title','normalized_title','overview','full_plot_summary','release_date','release_year','runtime_minutes','rating','poster_path','backdrop_path','status','metadata_status'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'status', 'draft', 'metadata_status', 'metadata_only', 'created_at', now(), 'updated_at', now());
    when 'bot' then
      v_table := 'bots';
      v_allowed_columns := array['name','slug','bot_type','telegram_username','description','icon','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'bot_type', 'child', 'icon', '🤖', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'category' then
      v_table := 'categories';
      v_allowed_columns := array['name','slug','icon','description','is_active','sort_order','settings'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'icon', '📂', 'is_active', true, 'sort_order', 0, 'settings', '{}'::jsonb, 'created_at', now(), 'updated_at', now());
    when 'content' then
      v_table := 'content_items';
      v_allowed_columns := array['bot_id','category_id','content_type','title','description','image_url','external_url','metadata','is_active','published_at'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'content_type', 'general', 'metadata', '{}'::jsonb, 'is_active', true, 'created_at', now(), 'updated_at', now());
    when 'telegram_user' then
      v_table := 'telegram_users';
      v_allowed_columns := array['is_active'];
    when 'setting' then
      v_table := 'bot_settings';
      v_allowed_columns := array['bot_id','setting_key','setting_value'];
      v_defaults := jsonb_build_object('id', gen_random_uuid(), 'setting_value', '{}'::jsonb, 'updated_at', now());
    else
      raise exception 'Unsupported audit entity type';
  end case;

  if p_operation not in ('create','update','delete') then
    raise exception 'Unsupported audit operation';
  end if;
  if p_entity_type = 'telegram_user' and p_operation <> 'update' then
    raise exception 'Telegram user audit supports updates only';
  end if;
  if p_operation = 'delete' and p_entity_type not in ('movie','setting') then
    raise exception 'Physical delete is not allowed for this entity';
  end if;

  if p_operation = 'delete' then
    if p_entity_id is null then raise exception 'Entity id is required'; end if;
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t)', v_table)
      into v_old using p_entity_id;
    if v_old is null then raise exception 'Audit target entity not found'; end if;
    v_entity_id := p_entity_id;
  else
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      raise exception 'Mutation payload must be a JSON object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
      where not (k = any(v_allowed_columns))
    ) then
      raise exception 'Mutation payload contains unsupported fields';
    end if;
    select coalesce(jsonb_object_agg(k, value), '{}'::jsonb)
      into v_payload
    from jsonb_each(p_payload) e(k, value)
    where k = any(v_allowed_columns);

    if jsonb_object_length(v_payload) = 0 then
      raise exception 'Mutation payload is empty';
    end if;

    select string_agg(format('%I', c), ', ' order by ordinality)
      into v_columns_sql
    from unnest(v_allowed_columns) with ordinality as cols(c, ordinality);

    if p_operation = 'create' then
      if p_entity_type = 'telegram_user' then raise exception 'Telegram user creation is not supported'; end if;
      v_payload := v_defaults || v_payload;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* returning to_jsonb(%I.*)',
        v_table, v_table, v_table
      ) into v_new using v_payload;
      v_entity_id := (v_new ->> 'id')::uuid;
    else
      if p_entity_id is null then raise exception 'Entity id is required'; end if;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_old using p_entity_id;
      if v_old is null then raise exception 'Audit target entity not found'; end if;
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(t, $2)) where t.id = $1 returning to_jsonb(t)',
        v_table, v_columns_sql, v_columns_sql
      ) into v_new using p_entity_id, v_payload;
      v_entity_id := p_entity_id;
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, p_action, p_entity_type, v_entity_id,
    public.admin_audit_sanitize_jsonb(jsonb_build_object('operation', p_operation, 'changed_fields', case when p_payload is null then '[]'::jsonb else coalesce((select jsonb_agg(k) from jsonb_object_keys(p_payload) k), '[]'::jsonb) end)),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(v_new),
    'success'
  ) returning id into v_log_id;

  return jsonb_build_object('entity_id', v_entity_id, 'record', public.admin_audit_sanitize_jsonb(coalesce(v_new, v_old)), 'audit_id', v_log_id);
end;
$$;

create or replace function public.admin_audit_update_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text default null,
  p_is_active boolean default null,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_target_active boolean;
  v_old jsonb;
  v_new jsonb;
  v_role_name text;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  select is_active into v_target_active
    from public.admin_profiles where id = p_admin_id for update;
  if not found then raise exception 'Administrator not found'; end if;

  if exists (
    select 1 from public.admin_roles ar join public.roles r on r.id = ar.role_id
    where ar.admin_id = p_admin_id and r.name = 'owner'
  ) then
    raise exception 'The Owner account is protected';
  end if;
  if p_actor_id = p_admin_id and p_is_active = false then
    raise exception 'You cannot deactivate your own administrator account';
  end if;
  if p_display_name is not null and (length(btrim(p_display_name)) not between 1 and 100) then
    raise exception 'Display name must contain 1 to 100 characters';
  end if;
  if p_role_id is not null then
    select name into v_role_name from public.roles where id = p_role_id;
    if v_role_name not in ('manager','content_manager') then
      raise exception 'Only Manager and Content Manager roles can be assigned';
    end if;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_old
  from public.admin_profiles ap where ap.id = p_admin_id;

  update public.admin_profiles
    set display_name = coalesce(btrim(p_display_name), display_name),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_admin_id;

  if p_role_id is not null then
    delete from public.admin_roles where admin_id = p_admin_id;
    insert into public.admin_roles(admin_id, role_id) values (p_admin_id, p_role_id);
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(ap),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
      from public.admin_roles ar join public.roles r on r.id=ar.role_id where ar.admin_id=ap.id), '[]'::jsonb)
  ) into v_new
  from public.admin_profiles ap where ap.id = p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.update','admin',p_admin_id,'{}'::jsonb,
    public.admin_audit_sanitize_jsonb(v_old), public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_create_admin(
  p_actor_id uuid,
  p_admin_id uuid,
  p_display_name text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_role_name text;
  v_name text;
  v_new jsonb;
  v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), 'Administrator');
  if length(v_name) > 100 then raise exception 'Display name must be 100 characters or fewer'; end if;
  select name into v_role_name from public.roles where id = p_role_id;
  if v_role_name not in ('manager','content_manager') then
    raise exception 'Only Manager and Content Manager roles can be assigned';
  end if;

  insert into public.admin_profiles(id,display_name,is_active)
    values (p_admin_id,v_name,true);
  insert into public.admin_roles(admin_id,role_id) values (p_admin_id,p_role_id);

  select jsonb_build_object(
    'profile',to_jsonb(ap),
    'roles',jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name))
  ) into v_new
  from public.admin_profiles ap join public.roles r on r.id=p_role_id
  where ap.id=p_admin_id;

  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,old_values,new_values,result)
  values (p_actor_id,v_actor_name,'admin.invite','admin',p_admin_id,'{}'::jsonb,null,
    public.admin_audit_sanitize_jsonb(v_new),'success')
  returning id into v_log_id;

  return jsonb_build_object('id',p_admin_id,'audit_id',v_log_id,'record',v_new);
end;
$$;

create or replace function public.admin_audit_record_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'success')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_record_failure(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor_name text; v_log_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name from public.admin_profiles
    where id=p_actor_id and is_active=true;
  if not found then raise exception 'Active administrator actor not found'; end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception 'Invalid audit action'; end if;
  insert into public.admin_audit_logs(actor_id,actor_name,action,entity_type,entity_id,details,result)
  values(p_actor_id,v_actor_name,p_action,p_entity_type,p_entity_id,
    public.admin_audit_sanitize_jsonb(coalesce(p_details,'{}'::jsonb)),'failure')
  returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.admin_audit_list(
  p_limit integer default 50,
  p_offset integer default 0,
  p_actor_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  old_values jsonb,
  new_values jsonb,
  result text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select l.id,l.actor_id,l.actor_name,l.action,l.entity_type,l.entity_id,
    l.details,l.old_values,l.new_values,l.result,l.created_at,
    count(*) over() as total_count
  from public.admin_audit_logs l
  where (p_actor_id is null or l.actor_id=p_actor_id)
    and (p_action is null or l.action=p_action)
    and (p_entity_type is null or l.entity_type=p_entity_type)
    and (p_result is null or l.result=p_result)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.admin_audit_sanitize_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_create_admin(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_audit_mutate(uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.admin_audit_update_admin(uuid,uuid,text,boolean,uuid) to service_role;
grant execute on function public.admin_audit_create_admin(uuid,uuid,text,uuid) to service_role;
grant execute on function public.admin_audit_record_event(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_record_failure(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.admin_audit_list(integer,integer,uuid,text,text,text,timestamptz,timestamptz) to service_role;
