-- Structural, privilege, safe-default and transactional audit verification.
do $$
declare
  v_admin uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_owner_role uuid;
  v_settings jsonb;
  v_failed boolean := false;
  v_master boolean;
  v_owner bigint;
begin
  if to_regclass('public.system_settings') is null then
    raise exception 'system_settings table was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.system_settings'::regclass) then
    raise exception 'system_settings must have RLS enabled';
  end if;

  if has_table_privilege('anon','public.system_settings','SELECT')
     or has_table_privilege('authenticated','public.system_settings','SELECT') then
    raise exception 'End-user roles must not read system_settings';
  end if;

  if not has_table_privilege('service_role','public.system_settings','SELECT')
     or not has_table_privilege('service_role','public.system_settings','UPDATE') then
    raise exception 'service_role must manage system_settings';
  end if;

  if has_function_privilege('anon','public.admin_audit_update_system_settings(uuid,text,text,boolean,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.admin_audit_update_system_settings(uuid,text,text,boolean,boolean)','EXECUTE') then
    raise exception 'System settings audit RPC must not be executable by end-user roles';
  end if;

  select to_jsonb(s) into v_settings from public.system_settings s where id=1;
  if v_settings->>'master_maintenance_enabled' <> 'false'
     or v_settings->>'watch_maintenance_enabled' <> 'false' then
    raise exception 'Both maintenance switches must default to false';
  end if;

  insert into public.admin_profiles(id,display_name,is_active,updated_at)
  values(v_admin,'FINDLY Test Owner',true,now());
  select id into v_owner_role from public.roles where name='owner';
  insert into public.admin_roles(admin_id,role_id) values(v_admin,v_owner_role);

  begin
    perform public.admin_audit_update_system_settings(v_admin,null,'صيانة',true,false);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Maintenance must reject missing owner numeric ID';
  end if;

  v_settings := public.admin_audit_update_system_settings(
    v_admin,'123456789','رسالة الصيانة',true,false
  );
  select master_maintenance_enabled,owner_telegram_user_id
    into v_master,v_owner from public.system_settings where id=1;
  if v_master is distinct from true or v_owner is distinct from 123456789 then
    raise exception 'Valid system settings update was not persisted';
  end if;

  if not exists (
    select 1 from public.admin_audit_logs
    where actor_id=v_admin and action='settings.system.update'
      and entity_type='system_settings' and result='success'
  ) then
    raise exception 'System settings update must be audited atomically';
  end if;
end;
$$;
