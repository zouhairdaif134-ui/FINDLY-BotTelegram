-- FINDLY system-wide configuration. Maintenance is opt-in and disabled by default.
create table if not exists public.system_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'FINDLY' check (app_name = 'FINDLY'),
  default_language text not null default 'ar' check (default_language = 'ar'),
  timezone text not null default 'Africa/Casablanca' check (timezone = 'Africa/Casablanca'),
  owner_telegram_user_id bigint,
  maintenance_message text not null default 'نعتذر، الخدمة متوقفة مؤقتاً بسبب أعمال الصيانة. يرجى المحاولة لاحقاً.',
  master_maintenance_enabled boolean not null default false,
  watch_maintenance_enabled boolean not null default false,
  updated_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_owner_telegram_id_positive
    check (owner_telegram_user_id is null or owner_telegram_user_id > 0),
  constraint system_settings_maintenance_message_length
    check (length(btrim(maintenance_message)) between 1 and 500)
);

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;
revoke all on table public.system_settings from public, anon, authenticated;
grant select, insert, update on table public.system_settings to service_role;

comment on table public.system_settings is
  'Private singleton configuration for FINDLY. Access only through the authenticated Cloudflare Worker.';
comment on column public.system_settings.owner_telegram_user_id is
  'Telegram numeric user ID used for maintenance bypass; usernames are never accepted.';
comment on column public.system_settings.master_maintenance_enabled is
  'Maintenance switch for the Master Bot only.';
comment on column public.system_settings.watch_maintenance_enabled is
  'Maintenance switch for the Watch Bot only.';

-- Apply settings changes and write their audit record in one database transaction.
create or replace function public.admin_audit_update_system_settings(
  p_actor_id uuid,
  p_owner_telegram_user_id text,
  p_maintenance_message text,
  p_master_maintenance_enabled boolean,
  p_watch_maintenance_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
  v_owner_id bigint;
  v_message text;
  v_old jsonb;
  v_new public.system_settings%rowtype;
  v_audit_id uuid;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Administrator')
    into v_actor_name
  from public.admin_profiles
  where id = p_actor_id and is_active = true;
  if not found then raise exception 'Active administrator actor not found'; end if;

  if nullif(btrim(coalesce(p_owner_telegram_user_id, '')), '') is not null then
    if btrim(p_owner_telegram_user_id) !~ '^[0-9]{1,16}$' then
      raise exception 'Owner Telegram ID must be a positive numeric Telegram user ID';
    end if;
    v_owner_id := btrim(p_owner_telegram_user_id)::bigint;
    if v_owner_id <= 0 or v_owner_id > 9007199254740991 then
      raise exception 'Owner Telegram ID must be a positive numeric Telegram user ID';
    end if;
  else
    v_owner_id := null;
  end if;

  v_message := btrim(coalesce(p_maintenance_message, ''));
  if length(v_message) not between 1 and 500 then
    raise exception 'Maintenance message must contain 1 to 500 characters';
  end if;
  if (coalesce(p_master_maintenance_enabled, false) or coalesce(p_watch_maintenance_enabled, false))
     and v_owner_id is null then
    raise exception 'Set the owner Telegram numeric ID before enabling maintenance';
  end if;

  select to_jsonb(s) into v_old
  from public.system_settings s
  where s.id = 1
  for update;
  if not found then raise exception 'System settings singleton is missing'; end if;

  update public.system_settings
  set owner_telegram_user_id = v_owner_id,
      maintenance_message = v_message,
      master_maintenance_enabled = coalesce(p_master_maintenance_enabled, false),
      watch_maintenance_enabled = coalesce(p_watch_maintenance_enabled, false),
      updated_by = p_actor_id,
      updated_at = now()
  where id = 1
  returning * into v_new;

  insert into public.admin_audit_logs (
    actor_id, actor_name, action, entity_type, entity_id,
    details, old_values, new_values, result
  ) values (
    p_actor_id, v_actor_name, 'settings.system.update', 'system_settings', null,
    jsonb_build_object(
      'changed_fields', jsonb_build_array(
        'owner_telegram_user_id',
        'maintenance_message',
        'master_maintenance_enabled',
        'watch_maintenance_enabled'
      ),
      'master_maintenance_enabled', v_new.master_maintenance_enabled,
      'watch_maintenance_enabled', v_new.watch_maintenance_enabled
    ),
    public.admin_audit_sanitize_jsonb(v_old),
    public.admin_audit_sanitize_jsonb(to_jsonb(v_new)),
    'success'
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'settings', to_jsonb(v_new),
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.admin_audit_update_system_settings(uuid,text,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.admin_audit_update_system_settings(uuid,text,text,boolean,boolean) to service_role;
