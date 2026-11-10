-- Verify private service-role-only Worker error event storage.
do $$
begin
  if to_regclass('public.worker_error_events') is null then
    raise exception 'worker_error_events table was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.worker_error_events'::regclass) then
    raise exception 'worker_error_events must have RLS enabled';
  end if;

  if has_table_privilege('anon','public.worker_error_events','SELECT')
     or has_table_privilege('authenticated','public.worker_error_events','SELECT')
     or has_table_privilege('anon','public.worker_error_events','INSERT')
     or has_table_privilege('authenticated','public.worker_error_events','INSERT') then
    raise exception 'End-user roles must not access Worker error events';
  end if;

  if not has_table_privilege('service_role','public.worker_error_events','SELECT')
     or not has_table_privilege('service_role','public.worker_error_events','INSERT') then
    raise exception 'service_role must read and write Worker error events';
  end if;

  if not has_sequence_privilege('service_role','public.worker_error_events_id_seq','USAGE') then
    raise exception 'service_role must use the Worker error event identity sequence';
  end if;
end;
$$;
