do $$
declare
  v_preferences_rls boolean;
  v_sessions_rls boolean;
begin
  select relrowsecurity into v_preferences_rls
  from pg_class where oid = 'public.ai_user_memory_preferences'::regclass;
  select relrowsecurity into v_sessions_rls
  from pg_class where oid = 'public.ai_user_session_messages'::regclass;

  if v_preferences_rls is distinct from true or v_sessions_rls is distinct from true then
    raise exception 'AI memory tables must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.ai_user_memory_preferences', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_user_memory_preferences', 'SELECT')
     or has_table_privilege('anon', 'public.ai_user_session_messages', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_user_session_messages', 'SELECT') then
    raise exception 'AI memory tables must not be directly readable by client roles';
  end if;

  if not has_table_privilege('service_role', 'public.ai_user_memory_preferences', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.ai_user_session_messages', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Worker service role must have memory table access';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_user_memory_preferences'::regclass
      and contype = 'f'
      and confrelid = 'public.telegram_users'::regclass
  ) then
    raise exception 'Persistent memory must reference telegram_users';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_user_memory_preferences'::regclass
      and contype = 'f'
      and confrelid = 'public.bots'::regclass
  ) then
    raise exception 'Persistent memory must be scoped to a bot';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'ai_user_session_messages_expiry_idx'
  ) then
    raise exception 'Session expiry index is missing';
  end if;
end $$;
