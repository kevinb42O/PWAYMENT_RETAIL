do $repair$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.finalize_daily_report(uuid,jsonb)'::regprocedure
  ) into function_definition;
  function_definition := replace(
    function_definition,
    '  select hash into previous_hash from public.daily_reports' || chr(10) ||
    '  where store_id = target_store_id order by report_number desc limit 1;',
    '  select previous_report.hash into previous_hash' || chr(10) ||
    '  from public.daily_reports previous_report' || chr(10) ||
    '  where previous_report.store_id = target_store_id' || chr(10) ||
    '  order by previous_report.report_number desc limit 1;'
  );
  execute function_definition;
end;
$repair$;
