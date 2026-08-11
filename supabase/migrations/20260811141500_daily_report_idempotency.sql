create unique index if not exists daily_reports_store_hash_unique
  on public.daily_reports (store_id, hash);

do $repair$
declare
  function_definition text;
  marker text :=
    '  perform pg_catalog.pg_advisory_xact_lock(' || chr(10) ||
    '    pg_catalog.hashtextextended(target_store_id::text || '':daily-report'', 0)' || chr(10) ||
    '  );';
  addition text :=
    '  perform pg_catalog.pg_advisory_xact_lock(' || chr(10) ||
    '    pg_catalog.hashtextextended(target_store_id::text || '':daily-report'', 0)' || chr(10) ||
    '  );' || chr(10) ||
    '  select existing_report.id, existing_report.report_number' || chr(10) ||
    '  into report_id, report_number' || chr(10) ||
    '  from public.daily_reports existing_report' || chr(10) ||
    '  where existing_report.store_id = target_store_id' || chr(10) ||
    '    and existing_report.hash = report_hash;' || chr(10) ||
    '  if report_id is not null then' || chr(10) ||
    '    return pg_catalog.jsonb_build_object(' || chr(10) ||
    '      ''daily_report_id'', report_id,' || chr(10) ||
    '      ''report_number'', report_number,' || chr(10) ||
    '      ''duplicate'', true' || chr(10) ||
    '    );' || chr(10) ||
    '  end if;';
begin
  select pg_catalog.pg_get_functiondef(
    'public.finalize_daily_report(uuid,jsonb)'::regprocedure
  ) into function_definition;
  function_definition := replace(function_definition, marker, addition);
  execute function_definition;
end;
$repair$;
