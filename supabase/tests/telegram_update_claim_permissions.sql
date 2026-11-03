-- Read-only security verification for claim_telegram_update.
-- Expected: all three checks return PASS.

select
  'anon cannot execute claim_telegram_update' as check_name,
  case
    when not has_function_privilege(
      'anon',
      'public.claim_telegram_update(uuid,bigint,text,integer)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL'
  end as result

union all

select
  'authenticated cannot execute claim_telegram_update',
  case
    when not has_function_privilege(
      'authenticated',
      'public.claim_telegram_update(uuid,bigint,text,integer)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL'
  end

union all

select
  'service_role can execute claim_telegram_update',
  case
    when has_function_privilege(
      'service_role',
      'public.claim_telegram_update(uuid,bigint,text,integer)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL'
  end;
