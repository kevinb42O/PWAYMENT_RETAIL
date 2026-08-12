-- Use the same tenant lock as checkout/refund before taking the report lock.
-- This establishes a precise close boundary: a concurrent sale is either
-- fully included in this Z-report or waits and starts the next shift.
do $migration$
declare
  function_definition text;
  updated_definition text;
  report_lock text := $needle$  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':daily-report', 0)
  );$needle$;
  serialized_locks text := $replacement$  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':checkout', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':daily-report', 0)
  );$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.finalize_daily_report(uuid,jsonb)'::regprocedure
  ) into strict function_definition;

  if position(':checkout' in function_definition) > 0 then
    return;
  end if;

  updated_definition := replace(
    function_definition,
    report_lock,
    serialized_locks
  );
  if updated_definition = function_definition then
    raise exception 'Could not locate the Z-report advisory lock.';
  end if;

  execute updated_definition;
end;
$migration$;
