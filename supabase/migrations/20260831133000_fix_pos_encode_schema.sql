begin;

-- encode(bytea, text) is a PostgreSQL built-in in pg_catalog, not a pgcrypto
-- function in the extensions schema. Repair every POS routine installed by the
-- preceding migrations so setup, login, session proof and offline grants all
-- use the correct fully-qualified function.
do $migration$
declare
  target_function oid;
  repaired_count integer := 0;
begin
  for target_function in
    select routine.oid
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('private', 'public')
      and routine.proname = any(array[
        'pos_pin_digest',
        'resolve_pos_session',
        'verify_pos_operator_pin',
        'step_up_pos_owner',
        'end_pos_operator_session',
        'update_pos_device',
        'resolve_pos_action_actor'
      ])
      and routine.prosrc like '%extensions.encode(%'
  loop
    execute pg_catalog.replace(
      pg_catalog.pg_get_functiondef(target_function),
      'extensions.encode(',
      'pg_catalog.encode('
    );
    repaired_count := repaired_count + 1;
  end loop;

  if repaired_count <> 7 then
    raise exception 'Expected to repair 7 POS functions, repaired %', repaired_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('private', 'public')
      and routine.proname = any(array[
        'pos_pin_digest',
        'resolve_pos_session',
        'verify_pos_operator_pin',
        'step_up_pos_owner',
        'end_pos_operator_session',
        'update_pos_device',
        'resolve_pos_action_actor'
      ])
      and routine.prosrc like '%extensions.encode(%'
  ) then
    raise exception 'One or more POS functions still use extensions.encode';
  end if;
end;
$migration$;

commit;
